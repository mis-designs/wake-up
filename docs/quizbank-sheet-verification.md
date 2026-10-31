# QuizBank sheet study and practice — 2026-10-30

Owner clarification: study always shows the correct answer; practice is a separate explicit action on the same sheet. No Home navigation entry or access-policy change.

## Changes

- Desktop sheet rows align figure, question/actions and marked V/F solution. Mobile stacks the same information. Existing green/white Study tokens, crimson QuizBank identity and shared fonts remain.
- `quizbank-sheet.js` allows three individual figure flips per visit, at least24 seconds apart. It respects visibility, reduced motion, forced colors, native pause and active media/recording; it does not refetch images.
- The CTA opens the existing quiz engine for the exact30 ordered questions. Private server grading validates original IDs, answer values and the content revision. Correct solutions stay hidden until submission. Return leads to the same sheet. Results are transient and do not enter Magic Book statistics.
- Audio/help retain their shared owners. QuizBank occurrence IDs cannot resolve through numeric Magic Book ID fallbacks. Admin addition remains missing-only, uses the shared recorder and sends one bounded direct save.

## Verification

### Practice actions and bilingual help — 2026-10-31

- Top practice CTA is white with a crimson QuizBank outline and the existing quiz artwork. A text-only green QUIZ action sits between the previous/next buttons, links to the current sheet, and pulses for three cycles when first scrolled into view. Leaving the sheet disconnects its observer and removes animation state; reduced-motion and forced-colors disable it.
- QuizBank help reads বাংলা · Keywords with Hadi Rounded and separate language spans; existing disclosure and shared Magic Book behavior remain intact.
- Local fixture browser checks at375px,320px and1440px: no horizontal overflow, centered bottom action, top white/crimson computed colors, visibility-triggered finite animation, correct current-sheet links after5→6 navigation, bottom action opening the30-question sheet05 quiz, and help expanding with the intended font. Screenshots: actions-mobile-top.jpg, actions-mobile-bottom.jpg and actions-desktop.jpg in the chat output folder.
-36 focused tests pass. Full suite1073 cases/1044 passes retains the same29 baseline failures, with no new failures. CSS build, strict premium audit and DESIGN lint pass. No authorization, recording, grading or network service changes.

### Catalog and explicit search release — 2026-10-30

- Centered catalog identity with tracked lettering; sheet identity remains centered. Archive counts replace the role badge. Catalog descriptions precede their right-aligned numbers; the centered section heading groups the01–50 range. UI sans-serif invitation replaces repeated sheet/kicker text, and the help/admin instruction line is removed.
- Same-sheet practice keeps its route and uses the existing mix_quiz.gif, loaded lazily with rounded corners, plus a finite three-cycle green gradient pulse. Reduced motion uses do_quiz.svg and disables the pulse. GIF remains excluded from global precaching.
- Explicit local search accepts multiple words in any order. Browser test: typing 'sicurezza distanza' retains30 rows and input focus without changing the URL; Enter returns10 matching fixture rows and commits q. Clear restores30 and focus. Unmatched terms show the existing recovery message. Unit tests cover draft preservation, composition/IME, submit, Clear and multiword filtering.
- Local browser verification at1440px and320px: centered header, no clipped sheet number, no horizontal overflow, all50 cards and right-side numerals, catalog↔sheet navigation, same-sheet quiz URL and search-button/Enter behavior. Artifacts in the chat workspace: `outputs/quizbank-sheet/catalog-refresh.jpg`, `catalog-mobile-final.jpg`, `study-refresh-final.jpg`.
-35 focused tests pass; full suite1072 cases/1043 passes with the same29 baseline failures and no new failures. CSS build, strict premium audit and DESIGN lint pass. Only QuizBank UI/search and versioned assets change; authorization, grading and recording services remain unchanged. User explicitly requested production publication.

### Custom-arrow and header correction — 2026-10-30

- Reused existing `icons/back.png`/`icons/next.png` assets from the quiz player, replacing the generic inline SVG arrows. Both loaded successfully in the local browser; decorative images retain Italian button names. The sticky header is now one72px row with QuizBank beside the current sheet number, and no repeated subtitle. Catalog reads QuizBank / Studia.
- Verified1440px desktop and320px phone: no overflow or clipped title, sheet5→6 updates the header and restores reader focus, Back returns to the catalog.28 focused tests, CSS build, strict premium audit and DESIGN lint passed. Desktop proof is `outputs/quizbank-sheet/custom-arrows-header.jpg` in the chat workspace. No production requests or deployment.

### Owner visual refinement — 2026-10-30

- Added crimson previous/next buttons with decorative directional SVG arrows and complete hover/focus/pressed/disabled states. Strengthened worksheet rules to2px, including both desktop column boundaries; compact numeric markers replace repeated DOMANDA, and the visible Soluzione caption is removed while accessible answer descriptions remain.
- Local mocked browser verification:1440px desktop,375px phone and320px reflow without horizontal overflow. Forward5→6 and backward50→49 restore title focus; previous is disabled at1 and next at50. Both arrows remain visible; narrow labels wrap within50px-or-taller targets. Empty search and Clear restore all30 rows and input focus. Screenshots: `outputs/quizbank-sheet/polish-desktop.jpg` and `polish-mobile.jpg` in the chat workspace.
-28 focused tests passed. Full run:1070 cases,1041 passed, the same29 failures as the pre-refinement baseline (26 existing app failures and3 environment Git-permission failures); no new failures. CSS build, strict premium audit, DESIGN lint and whitespace validation passed. No network/auth/audio/practice behavior was changed. No production calls or deployment.

- 29 new behavioral tests pass: sheet presentation/motion, server attempt validation and client practice/auth/audio/help behavior.
- Full repository suite:1070 cases,1041 passing. The26 preceding failures remain; three additional Git-ignore tests cannot initialize temporary repositories because this environment denies writing their `.git/config`. No new application-test failures.
- CSS build passes. Premium strict audit and DESIGN.md lint report zero findings.
- Actual browser inspection through the local fixture server:1440px desktop and375/320px phone, always-visible true/false marks, no answer controls in Study, no horizontal overflow, empty search/clear, Bangla help, recorder open/close/focus and separated spacing, learner/admin visibility, exact-sheet launch, answer selection, missing-answer confirmation, result review including unanswered solutions, same-sheet return, submission failure preserving answers, and denied media clearing private quiz content.
- One observed practice attempt sent one `getQuiz` and one `checkQuiz`; audio availability remained lazy. Fixtures blocked external services. Existing recorder regression tests cover capture/save/cancellation; no real microphone or production account was used this turn.

Local browser fixture: `node scripts/quizbank-sheet-preview.mjs` (loopback only, synthetic questions and API responses). Production deployment and real-device/audio-storage acceptance have not been performed. Physical iPhone playback is not established by these checks.
