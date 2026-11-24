import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";

const secret = "all-quiz-local-fixture";
Object.assign(process.env, { SESSION_SECRET: secret, GAS_ACCESS_URL: "https://access.invalid/", GAS_SECRET: "fixture" });
const { default: handler } = await import("../api/quiz.js");
const rows = JSON.parse(readFileSync(new URL("../api/_video-gallery-allbooks.json", import.meta.url)));
const phone = "393330001234", deviceId = "sample-device";
const payload = Buffer.from(JSON.stringify({ purpose:"access", role:"user", phone, deviceId, exp:Date.now()+900000 })).toString("base64url");
const access = payload + "." + createHmac("sha256",secret).update(payload).digest("base64url");
async function call(method, attrs, session = "") {
  const req = { method, headers: { authorization:"Bearer "+access, "x-quiz-session":session },
    [method === "GET" ? "query":"body"]:{phone,deviceId,...attrs} };
  const res = { statusCode:200, setHeader(){}, status(code){this.statusCode=code;return this;}, json(body){this.body=body;return this;} };
  await handler(req,res);
  return res;
}
test("paid catalogue draws and grades the issued questions in every selection mode", async t => {
  let enabled = 0;
  t.mock.method(globalThis, "fetch", async url => {
    assert.equal(new URL(url).host,"access.invalid");
    return Response.json({success:true, Quiz_bank:1, All_quiz:enabled});
  });
  const draw = chapters => call("GET",{action:"getQuiz",mode:"allquiz",chapters});
  assert.equal((await draw("")).statusCode,403);
  enabled = 1;
  for (const chapters of ["","2","2,5,21"]) {
    const {statusCode,body} = await draw(chapters);
    assert.equal(statusCode,200);
    assert.equal(new Set(body.quiz.map(row=>row.id)).size,30);
    assert.ok(body.quiz.every(row=>(!chapters || chapters.split(",").includes(row.chapter)) && !("correct" in row)));
    const answers = body.quiz.map(({id})=>({id,answer:Number(rows.find(row=>row.id===id).correct)}));
    const grade = answers => call("POST",{action:"checkQuiz",answers},body.quizSessionToken);
    assert.equal((await grade(answers)).body.correct,30);
    assert.equal((await grade([...answers.slice(1), answers[1]])).statusCode,400);
    const refreshed = await call("POST",{action:"refreshQuizSession", mode:"allquiz"},body.quizSessionToken);
    assert.equal(refreshed.statusCode,200);
    assert.equal((await call("POST",{action:"checkQuiz",answers},refreshed.body.quizSessionToken)).body.correct,30);
  }
  assert.equal((await draw("26")).statusCode,400);
  assert.equal((await call("POST",{action:"refreshQuizSession",mode:"allquiz"})).statusCode,401);
});
