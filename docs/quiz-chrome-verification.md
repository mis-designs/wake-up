# Shared quiz chrome verification — 2026-10-31

The owner requests the same cleaner header in every live quiz: outlined rounded squares, dark numbers, calmer typography/timer, one thinner scroll line and mobile Back confirmation.

## Scope and owners

quiz-chrome.css is the shared route variant loaded after the platform theme. quiz.js retains the question/answer, timer and dialog owners; its existing same-document Back guard now covers browsers too. Failed history setup leaves the explicit exit visible. Mobile hides that control only after setup; desktop retains a ghost exit. No changes to API requests, permissions, grading, storage or audio flows. The timer presentation changes spacing only (20:00); Admin overtime remains explicit.

## Verified

- Actual local fixture browser at320/390px and1440px; native-marked375px exam80 route. Question targets and A-/A+ are44px; no horizontal page overflow. Native overrides cannot restore circular number art or Norwester chrome. Current and answered states remain independent.
- Native-marked exam loads80 questions with50-minute countdown. QuizBank loads30 with20 minutes. Number30 navigation and back to1 work; the strip scrolls to the active question. Chromium scrollbar computes2px; Firefox uses its thin fallback. No duplicate upper divider.
- A+ updates115%; selecting Vero records the response. Browser Back opens the existing confirmation; Resta qui preserves the answer. Desktop exit confirmation uses route-neutral text and Esci returns to the original QuizBank sheet28.
-56 focused tests passed plus22 platform/storage checks. Final full suite1074 cases:1046 passes,28 existing failures, no new failures compared with the preceding29-failure baseline. The stale Admin timer asset expectation was corrected. CSS build, strict premium audit and DESIGN lint pass.
- Screenshots and reports are in the chat workspace outputs/quizbank-sheet: chrome-final-mobile.jpg, chrome-desktop.jpg, chrome-native.jpg, chrome-final-tests.xml and chrome-audit.json.

Tests use synthetic questions and a loopback server. Physical iPhone/Android OS gestures have not been exercised; browser history/confirmation and the installed-app presentation marker were verified locally.
