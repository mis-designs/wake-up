import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  getMagicBookStorageConfig,
  isMagicBookStorageConfigured,
  setPrivateBookResponseHeaders
} from "../api/magicbook-storage.mjs";

const read = relativePath => readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
const bookApi = read("api/getPages.js");
const trialBookApi = read("api/trialBook.js");
const assetApi = read("api/asset.js");
const storage = read("api/magicbook-storage.mjs");
const client = read("script.js");

test("book pages fail closed unless dedicated private R2 credentials exist", () => {
  assert.equal(isMagicBookStorageConfigured({ R2_BASE_URL: "https://public.example" }), false);
  assert.equal(isMagicBookStorageConfigured({
    BOOK_R2_BUCKET: "private-books",
    BOOK_R2_ACCOUNT_ID: "account",
    BOOK_R2_ACCESS_KEY_ID: "key",
    BOOK_R2_SECRET_ACCESS_KEY: "secret"
  }), true);
  assert.deepEqual(getMagicBookStorageConfig({}), {
    bucket: "",
    accountId: "",
    accessKeyId: "",
    secretAccessKey: ""
  });
  assert.match(storage, /S3Client/u);
  assert.match(storage, /GetObjectCommand/u);
  assert.doesNotMatch(bookApi, /R2_BASE_URL|new URL\(path/u);
  assert.doesNotMatch(trialBookApi, /R2_BASE_URL|new URL\(path/u);
  assert.doesNotMatch(assetApi, /R2_BASE_URL|new URL\(candidate\.path/u);
  assert.match(assetApi, /readMagicBookObject\(candidate\.path\)/u);
});

test("book responses cannot be cached, embedded cross-origin or indexed", () => {
  const headers = new Map();
  setPrivateBookResponseHeaders({ setHeader: (name, value) => headers.set(name, value) });
  assert.match(headers.get("Cache-Control"), /private[\s\S]*no-store[\s\S]*no-cache/u);
  assert.equal(headers.get("CDN-Cache-Control"), "no-store");
  assert.equal(headers.get("Vercel-CDN-Cache-Control"), "no-store");
  assert.equal(headers.get("Cross-Origin-Resource-Policy"), "same-origin");
  assert.match(headers.get("X-Robots-Tag"), /noimageindex/u);
  assert.match(bookApi, /setPrivateBookResponseHeaders\(res\)/u);
  assert.match(trialBookApi, /setPrivateBookResponseHeaders\(res\)/u);
});

test("trial credentials stay out of URLs and browser logs never expose book tokens", () => {
  const fetchPageStart = client.indexOf("async function fetchMagicBookPage");
  const fetchPageEnd = client.indexOf("function cleanupMagicBookViewer", fetchPageStart);
  const fetchPageSource = client.slice(fetchPageStart, fetchPageEnd);
  assert.notEqual(fetchPageStart, -1);
  assert.notEqual(fetchPageEnd, -1);
  assert.match(trialBookApi, /req\.method !== "POST"/u);
  assert.doesNotMatch(trialBookApi, /req\.query/u);
  assert.match(client, /fetch\("\/api\/trialBook",\s*\{[\s\S]*?method: "POST"/u);
  assert.doesNotMatch(client, /\/api\/trialBook\?/u);
  assert.doesNotMatch(client, /request:\s*body/u);
  assert.match(client, /cache: "no-store"[\s\S]*?body: JSON\.stringify\(body\)/u);
  assert.match(fetchPageSource, /"Authorization": `Bearer \$\{getCurrentAccessToken\(\)\}`/u);
  assert.doesNotMatch(fetchPageSource, /accessToken:\s*getCurrentAccessToken/u);
  assert.match(bookApi, /getBearerToken\(req\)/u);
  assert.match(bookApi, /chapterNumber > MAX_MAGIC_BOOK_CHAPTER/u);
});
