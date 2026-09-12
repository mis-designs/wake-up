import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const source = read("script.js");
const native = read("android-mode-screens.js");
const extract = name => source.match(new RegExp(`function ${name}\\([^]*?\\n\\}`))[0];

test("ordinary browser initialization performs no native DOM mutation", () => {
  const window = { document: { documentElement: { classList: { contains: () => false } } } };
  vm.runInNewContext(native, { window });
  assert.equal(window.MagicBookModeScreens, undefined);
  assert.ok(read("index.html").indexOf('android-mode-screens.js?v=2-thumb') < read("index.html").indexOf('script.js?v=74-quiz-thumb'));
});

test("native mode URLs are recognizable only when the presentation owner is active", () => {
  const sandbox = { window: {}, normalizeRoutePath: () => "/scegli-quiz" };
  vm.createContext(sandbox);
  vm.runInContext(extract("getRouteStateFromLocation"), sandbox);
  assert.equal(sandbox.getRouteStateFromLocation().screen, "welcome");
  sandbox.window.MagicBookModeScreens = {};
  assert.equal(sandbox.getRouteStateFromLocation().screen, "quizMode");
  sandbox.normalizeRoutePath = () => "/scegli-exam";
  assert.equal(sandbox.getRouteStateFromLocation().screen, "examMode");
});

test("full-page routes have canonical titles and deployment rewrites", () => {
  const sandbox = { APP_TITLE: "MagicBook" };
  vm.createContext(sandbox);
  vm.runInContext(extract("getAppRoute") + extract("getRouteTitle"), sandbox);
  for (const [screen, path, title] of [["quizMode", "/scegli-quiz", "Scegli il quiz"], ["examMode", "/scegli-exam", "Scegli Exam"]]) {
    assert.equal(sandbox.getAppRoute({screen}), path);
    assert.equal(sandbox.getRouteTitle({screen}), `MagicBook | ${title}`);
    assert.ok(JSON.parse(read("vercel.json")).rewrites.some(r => r.source === path && r.destination === "/"));
    assert.ok(read("_redirects").includes(`${path} /index.html 200`));
  }
});

function launchHarness(options = {}) {
  const calls = [];
  const sandbox = {
    window: { location: { href: "" } }, trialGuestMode: false, qmsCapSelected: null, qmsMultiSelected: new Set(),
    isFreeTrialChapter: n => [1,3].includes(Number(n)),
    openTrialPaywall: reason => calls.push({paywall:reason}),
    closeQuizModeScreen: options => calls.push({close:"quiz",options}),
    closeExamModeScreen: options => calls.push({close:"exam",options}),
    openMagicBookPages: options => calls.push({pdf:options}),
    scheduleExclusiveAppNavigation: (name,before,navigate) => { calls.push({name}); before(); navigate(); },
    ...options
  };
  vm.createContext(sandbox);
  for (const name of ["getQuizPath","startMixQuiz","startCapQuiz","startMultiQuiz","startExamQuiz","startExamPdf","startStudyQuiz"]) vm.runInContext(extract(name), sandbox);
  return {sandbox,calls};
}

test("chapter and multi launch keep their existing minimum and destinations", () => {
  const {sandbox:h,calls} = launchHarness();
  h.startCapQuiz(); h.startMultiQuiz(); assert.equal(calls.length,0);
  h.qmsCapSelected=14; h.startCapQuiz();
  assert.equal(h.window.location.href,"/quiz/capitolo-14");
  assert.equal(calls[1].options.forNavigation,true);
  h.qmsMultiSelected=new Set([25]); h.startMultiQuiz(); assert.equal(calls.length,2);
  h.qmsMultiSelected.add(3); h.startMultiQuiz();
  assert.equal(h.window.location.href,"/quiz/multi?chapters=3%2C25");
});

test("Mix, both Exam modes, PDF and dedicated Study use canonical launches", () => {
  const {sandbox:h,calls} = launchHarness();
  h.startMixQuiz(); assert.equal(h.window.location.href,"/quiz");
  h.startExamQuiz("exam80"); assert.equal(h.window.location.href,"/quiz/esame-80");
  h.startExamQuiz("exam30"); assert.equal(h.window.location.href,"/quiz/esame-30");
  const count=calls.length; h.startExamQuiz("invalid"); assert.equal(calls.length,count);
  h.startExamPdf(); assert.equal(calls.at(-1).pdf.type,"exam");
  h.startStudyQuiz(); assert.equal(h.window.location.href,"/studia-quiz");
});

test("native presentation does not weaken guest chapter or Multi guards", () => {
  const {sandbox:h,calls} = launchHarness({trialGuestMode:true,qmsCapSelected:14,qmsMultiSelected:new Set([1,3])});
  h.startCapQuiz(); h.startMultiQuiz();
  assert.ok(calls.every(c=>c.paywall));
  assert.equal(h.window.location.href,"");
  h.qmsCapSelected=3; h.startCapQuiz(); assert.equal(h.window.location.href,"/quiz/prova-gratis?chapter=3");
});

test("native styles preserve the bounded grid, fallback, motion and ARIA contracts", () => {
  const css=read("android-mode-screens.css");
  assert.match(css, /repeat\(5,minmax\(44px,1fr\)\)/);
  assert.match(css, /font-variant-numeric: tabular-nums/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /forced-colors: active/);
  assert.match(css, /is-selected::before[^}]*background: var\(--mode-blue\)/);
  assert.match(native, /setAttribute\("aria-pressed"/);
  assert.match(native, /event\.persisted/);
  assert.match(native, /disabledBeforeLaunch\.clear\(\)/);
  assert.match(source, /function openRouteState[^]*?appActionGate.cancel\(\);\s*window.MagicBookModeScreens\?\.reset\(\)/);
  for (const asset of ["android-mode-screens.css?v=2-thumb","android-mode-screens.js?v=2-thumb","icons/native-chapter-clover.svg"]) assert.ok(read("service-worker.js").includes(asset));
  assert.doesNotMatch(native, /\b(?:fetch|alert|confirm|prompt)\s*\(|\.innerHTML\s*=|localStorage/);
});

test("native guest history resumes only an already validated in-document trial", () => {
  const historySource=source.slice(source.indexOf('window.addEventListener("popstate",'),source.indexOf('function openExamFromMenu()'));
  const run=({trial=true,native=true,path="/prova-gratis",screen="welcome"}={})=>{
    const calls=[];let listener;
    const sandbox={window:{MagicBookModeScreens:native?{}:undefined,addEventListener:(_,fn)=>{listener=fn;}},trialGuestMode:trial,
      getRouteStateFromLocation:()=>({screen}),normalizeRoutePath:()=>path,openRouteState:state=>calls.push(state.screen),
      readStoredSession:()=>null,Storage:{get:()=>null},KEYS:{loggedIn:"loggedIn"},showLandingScreen:()=>calls.push("landing")};
    vm.runInNewContext(historySource,sandbox);listener();return calls;
  };
  assert.deepEqual(run(),["trialHub"]);
  assert.deepEqual(run({path:"/scegli-quiz",screen:"quizMode"}),["quizMode"]);
  assert.deepEqual(run({trial:false,path:"/scegli-quiz",screen:"quizMode"}),["landing"]);
  assert.deepEqual(run({native:false}),["landing"]);
  assert.deepEqual(run({path:"/scegli-exam",screen:"examMode"}),["landing"]);
});
