import {
  GetObjectCommand,
  HeadObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
import { withOperationalTimeout } from "./upstream-fetch.mjs";

let storage = null;

export function getMagicBookStorageConfig(env = process.env) {
  return {
    bucket: String(env.BOOK_R2_BUCKET || "").trim(),
    accountId: String(env.BOOK_R2_ACCOUNT_ID || "").trim(),
    accessKeyId: String(env.BOOK_R2_ACCESS_KEY_ID || "").trim(),
    secretAccessKey: String(env.BOOK_R2_SECRET_ACCESS_KEY || "").trim()
  };
}

export function isMagicBookStorageConfigured(env = process.env) {
  const config = getMagicBookStorageConfig(env);
  return Boolean(
    config.bucket
    && config.accountId
    && config.accessKeyId
    && config.secretAccessKey
  );
}

function getMagicBookStorage() {
  const config = getMagicBookStorageConfig();
  if (!isMagicBookStorageConfigured()) {
    const error = new Error("private_book_storage_not_configured");
    error.statusCode = 503;
    throw error;
  }

  if (!storage) {
    storage = new S3Client({
      region: "auto",
      forcePathStyle: true,
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey
      }
    });
  }

  return { client: storage, bucket: config.bucket };
}

export function isMissingMagicBookObject(error) {
  const code = String(error?.name || error?.Code || error?.code || "").toLowerCase();
  const status = Number(error?.$metadata?.httpStatusCode || error?.statusCode || 0);
  return status === 404 || code === "nosuchkey" || code === "notfound";
}

async function objectBodyToBuffer(body) {
  if (!body) throw new Error("private_book_body_missing");
  if (typeof body.transformToByteArray === "function") {
    return Buffer.from(await body.transformToByteArray());
  }
  if (typeof body.arrayBuffer === "function") {
    return Buffer.from(await body.arrayBuffer());
  }
  if (Symbol.asyncIterator in Object(body)) {
    const chunks = [];
    for await (const chunk of body) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks);
  }
  throw new Error("private_book_body_unsupported");
}

export async function readMagicBookObject(key) {
  const { client, bucket } = getMagicBookStorage();
  const object = await withOperationalTimeout(
    client.send(new GetObjectCommand({ Bucket: bucket, Key: key })),
    { service: "private_book_storage", timeoutMs: 12_000 }
  );
  const buffer = await objectBodyToBuffer(object.Body);
  if (!buffer.byteLength) throw new Error("private_book_empty_file");
  return {
    buffer,
    contentType: String(object.ContentType || "application/octet-stream")
  };
}

export async function headMagicBookObject(key) {
  const { client, bucket } = getMagicBookStorage();
  return withOperationalTimeout(
    client.send(new HeadObjectCommand({ Bucket: bucket, Key: key })),
    { service: "private_book_storage", timeoutMs: 8_000 }
  );
}

export function setPrivateBookResponseHeaders(res) {
  res.setHeader("Cache-Control", "private, no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0");
  res.setHeader("CDN-Cache-Control", "no-store");
  res.setHeader("Vercel-CDN-Cache-Control", "no-store");
  res.setHeader("Surrogate-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive, noimageindex");
  res.setHeader("Content-Disposition", "inline");
}
