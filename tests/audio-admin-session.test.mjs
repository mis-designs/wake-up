import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const client = readFileSync(new URL("../aggiungi-spiegazioni.js", import.meta.url), "utf8");
const page = readFileSync(new URL("../aggiungi-spiegazioni.html", import.meta.url), "utf8");

test("the audio admin renews its short session without logout", () => {
  assert.match(client, /ACCESS_TOKEN_REFRESH_SKEW_MS\s*=\s*5 \* 60 \* 1000/u);
  assert.match(client, /ACCESS_VALIDATION_API\s*=\s*"\/api\/getPages"/u);
  assert.match(client, /action:\s*"validate"/u);
  assert.match(client, /await ensureFreshAccessToken\(\)/u);
  assert.match(client, /ensureFreshAccessToken\(\{ force: true \}\)/u);
  assert.match(client, /\["token_expired", "unauthorized", "admin_forbidden"\]/u);
  assert.match(page, /aggiungi-spiegazioni\.js\?v=18-shared-gif-loader/u);
});
