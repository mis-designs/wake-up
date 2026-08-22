# Magic Book learning insights UX contract

## Canonical UI map

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
| --- | --- | --- | --- | --- |
| Form | Login form | `index.html` `#login .login-form` + login helpers | Phone access; server-requested admin password | Login behavior and browser keyboard/failure checks |
| Scrollbar | Learning screen root | `src/learning-insights.css` | Browser forced-colors only | No nested horizontal scroller; no page overflow at 320px |
| Statistics workspace | `src/learning-insights.js` | Authenticated learning model | Empty, insufficient, ready, cached, refreshing | Data-state tests and 320–1920 browser verification |
| Error recovery | `src/learning-insights.js` | Authenticated errors and plan | Five categories; empty/populated master-detail; recovered section | URL, interaction, focus, and responsive verification |
| Shared controls | Learning JS/CSS + local daisyUI build | `d-btn` primitives with scoped geometry | Labelled refresh on wider screens; icon-only on narrow screens | Keyboard and 320/375/430/768/1024/1280/1440/1920 checks |

## Feature ownership

| Concern | Owner | Contract |
| --- | --- | --- |
| Learning shell | `src/learning-insights.js`, `src/learning-insights.css`, `src/daisyui.css` | Back, refresh, routes, primary/secondary actions, category tabs, and pagination use local `d-`-prefixed daisyUI. Legacy fixed chrome is hidden while the workspace is active. |
| Learning routes | `script.js` | `/statistiche` and `/errori`; the Errori lens is stored in `tipo`. |
| Learning data | `src/learning-insights.js` | User-scoped cached rendering plus one abortable request per visible route; stale requests cannot replace newer state. |
| Server aggregation | `api/learning-insights.mjs` | Authenticated, device-bound, no-store response; server grading and catalog mapping remain authoritative. |
| Chapter disclosure | `src/learning-insights.js` | One selected matrix cell; detail appears beside the matrix on wide screens, sequentially on tablet, and as a closable bottom sheet on phones. Trigger uses `aria-expanded` and `aria-controls`. |
| Error master/detail | `src/learning-insights.js` | At most one selected item per category. The master trigger controls the matching detail and focus remains recoverable after rerender. |
| Pagination | `src/learning-insights.js` | Eight initial items; `Mostra altri` appends without losing stable focus. |
| Async status | `#learningInsightsStatus` | Polite live region for refresh, offline cache, and retry results. |
| UI assets | Repository images/SVGs + authenticated figure endpoint | No Unicode glyphs as UI icons. Decorative CSS marks remain hidden from assistive technology. |

## Statistiche

- The first viewport answers `Come stai andando?` with real recent/cumulative results and one immediate action.
- The summary reports observed totals only: correct/total answers, distinct quizzes, chapters started, active review items, recent-window accuracy, and recovered count.
- Comparison copy uses simple thresholds (`stai migliorando`, `più errori del solito`, `stabile`) and never invents an answer sequence.
- Empty history offers the first quiz. Insufficient history states how many answers are still useful. Ready history uses the first real plan item or a positive continue action.
- Two compact groups show up to three chapters going well and three to review.
- All 25 chapters appear in one matrix. Each cell contains number, title, explicit simple status, and optional review count.
- Chapter detail retains existing quiz and book destinations and reports attempts, quiz coverage, correct answers, recent result, active review items, and recoveries.

## Errori

- The heading is plain `Errori` and summarizes items to review, improving chapters, and recovered items.
- `Da controllare` contains at most three real active items and opens the matching category/detail.
- Figure, Quiz, Parole, Argomenti, and Capitoli form a compact five-tab grid with visible counts.
- `Capitoli` is derived client-side from `model.chapters`; it does not extend the API.
- Recovered items are not a tab. They remain visible in a separate positive section capped at three.
- Detail uses count-based observational copy. It never exposes backend causal/diagnostic phrasing.
- Figure items load the real authenticated media lazily; word items keep the dictionary action; related quiz and chapter actions reuse existing destinations.
- `Il tuo ripasso` contains at most three actions, shows total minutes, and moves before category exploration on mobile.

## Responsive behavior

- 1280–1920: wide grouped surfaces use the viewport; Statistics is overview/action, chapter matrix/detail; Errori is explorer/plan with master-detail.
- 768–1024: major regions stack only when necessary; chapter detail becomes sequential; no control is compressed below a usable target.
- 320–430: one vertical flow, two-column chapter matrix, three-column category grid wrapping to two rows, sequential detail, plan before categories.
- Reading order is valid without CSS. Italian and Bangla copy wraps, actions remain visible, and page-level horizontal scrolling is forbidden.

## Navigation, async, and failure behavior

- Home entries and the Statistics/Errori switcher push real routes. Lens selection replaces only `tipo`; invalid values fall back to `figure` and normalize the URL.
- Initial load renders a skeleton matching the overview/action/matrix geometry.
- Valid cached data appears immediately with its update time while a background refresh runs online.
- Pending local answers are sent only to the authenticated Vercel endpoint, validated, and merged by event ID.
- Offline with cache keeps the screen usable; offline without cache, expired access, 14-second timeout, and generic failure have separate recovery copy.
- Retry is idempotent and disabled while a request is active. No backend implementation detail is shown to the learner.

## Accessibility

- Route entry focuses the screen heading; background refresh does not steal focus.
- Category tabs implement Left/Right/Home/End and link selected tab to its tabpanel.
- Expanded chapter/error controls expose `aria-expanded` and `aria-controls`; rerender restores focus to a stable trigger or pane.
- Status is always textual as well as colored. Icon-only controls have accessible names; decorative images use empty alternatives.
- Reduced-motion removes spin/pulse duration, forced-colors preserves selected state, and touch targets remain at least 40–44px.
