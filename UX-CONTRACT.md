# Magic Book learning insights UX contract

## Canonical UI map

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
| --- | --- | --- | --- | --- |
| Form | Login and dormant Promo access forms | `index.html` `#login .login-form`, `#promoAccessCard` + shared login helpers | Phone access; server-requested admin password; feature-switched promo conversion landing | Login behavior and browser keyboard/failure checks |
| Scrollbar | Learning screen root | `src/learning-insights.css` | Browser forced-colors only | No nested horizontal scroller; no page overflow at 320px |
| Statistics workspace | `src/learning-insights.js` | Authenticated learning model | Empty, insufficient, ready, cached, refreshing | Data-state tests and 320–1920 browser verification |
| Error recovery | `src/learning-insights.js` | Authenticated errors and plan | Five categories; empty/populated master-detail; recovered section | URL, interaction, focus, and responsive verification |
| Shared controls | Learning JS/CSS + local daisyUI build | `d-btn` primitives with scoped geometry | Labelled refresh on wider screens; icon-only on narrow screens | Keyboard and 320/375/430/768/1024/1280/1440/1920 checks |
| Quiz correction translations | `quiz.js` + `quiz-help.js` data service | `mystyle.css` visual owner; synchronized help and catalog data | One exclusive accordion across all viewports; the active desktop panel may sit beside its row | Dedicated result/help tests plus keyboard and responsive browser verification |
| Live quiz bilingual help | `quiz-help.js`, `quiz-help.css`, `italian-display.js`, `#quiz-help-workspace` | Synchronized help resolver and authenticated quiz question | One dialog card; translation and keywords are two dot-selected panels; keyword cards precede uppercase context tags | Swipe, keyboard tabs, focus trap, display-case, content-order, narrow viewport, and reduced-motion tests |
| Admin quiz answer marker | `api/quiz.js`, `api/local-quiz-bank.mjs`, `quiz.js`, `mystyle.css` | Signed Admin role and private local answer bank | Green under Vero or red under Falso according to the correct value | Authorization, public-payload, client-visibility, and contrast tests |
| Quiz timer | `quiz.js`, `#timer` | Signed Admin role returned by `api/quiz.js` | Normal countdown; Admin elapsed overtime | Boundary, authorization, elapsed-time, and cache-version tests |
| Global connectivity alert | `offline-notice.js`, `offline-notice.css` | `navigator.onLine` plus browser `online` and `offline` events | Initial offline; connection lost; automatic recovery | Shared static test plus browser offline/online verification |
| Loading indicator | `loading-ui.css`, `icons/loading.gif` | Shared async-state contract | Page, panel, inline status, busy control; static reduced-motion fallback | Asset/cache, busy-state, layout-stability, and reduced-motion tests |
| Explanation audio player | `audio-player-ui.css` + owning playback JS | Shared Quiz/Studia quiz transparent emerald pill using only the approved play/pause SVG pair | Idle, playing, loading, unavailable/error | No legacy pseudo-icon/black background, SVG state, alignment, ARIA label, keyboard, reduced-motion, forced-colors, and cache tests |
| WhatsApp group dialog | `script.js`, `style.css` | Authenticated Home invitation state | Bangla default; Italian alternate; join or defer | Focus trap/restoration, locale, responsive, reduced-motion, and cache tests |

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
| Shared loading feedback | `loading-ui.css`, `icons/loading.gif` | User-visible initial loads, panel requests, and button operations use the same GIF with truthful Italian status copy and `aria-busy`. Busy mutations disable duplicate activation without changing control dimensions. Background refresh preserves current content and uses its existing subtle status instead of a blocking overlay. Reduced-motion replaces the animated image with a static system-operable mark. |
| Quiz blocking loading | `quiz.html`, `quiz.js`, `mystyle.css` | Initial quiz load and result checking use a seamless white full-viewport state with only the centered shared GIF visible. Status text remains available to assistive technology. Failure closes the loader and presents plain Italian recovery copy without backend details. |
| WhatsApp group invitation | `script.js`, `style.css`, local Bengali font assets | Home may show one modal invitation after authentication and outside other blocking overlays. Bangla is the default; the learner can switch to Italian, join, defer for seven days, close with Escape/backdrop, and receive trigger-focus restoration. Background content is inert while the dialog is open. |
| UI assets | Repository images/SVGs + authenticated figure endpoint | No Unicode glyphs as UI icons. Decorative CSS marks remain hidden from assistive technology. |
| Font library | `libreria-font.html`, `libreria-font.css`, `assets/fonts/magicbook-bangla-fonts.css` | Admin links to `/libreria-font`; the static page compares the three locally hosted Bengali faces with identical live text and returns to `/admin`. |
| Promo conversion | `#promoAccessNextStep` + `openPromoPackages()` | A previous promo or a full campaign produces persistent inline guidance; the user chooses when to open `/join`, which focuses the packages heading. |
| Promo login availability | `PROMO_LOGIN_ENABLED` in `script.js` | The default `false` state keeps `#promoAccessCard` hidden before paint, skips promo setup/status requests, rejects promo-card activation, and routes logged-out welcome traffic to `/login`. Setting only the switch to `true` restores the preserved promo flow. |
| Quiz correction translations | `quiz.js`, `quiz-help.js`, `mystyle.css` | Each correction row owns one on-demand translation disclosure. `quiz-help.js` owns data resolution and caching; `quiz.js` owns row state and interaction; `mystyle.css` owns responsive presentation. |
| Quiz correction audio | `quiz.js`, `mystyle.css`, `audio-player-ui.css`, `icons/explain_quiz.svg` | Every correct, wrong, and unanswered row exposes the same labelled person-artwork audio control. Audio is fetched only after activation, only one review audio plays at a time, and missing audio uses the established unavailable message. The shared player keeps centred play/pause geometry and updates its accessible action label. |
| Live quiz bilingual help | `quiz-help.js`, `quiz-help.css`, `italian-display.js` | Clicking the current Italian question opens one modal card. Translation and keywords share the same frame and switch through dot tabs, touch swipe, or tab keyboard navigation. Keyword cards precede chapter/topic context, context tags are uppercase, and ordinary Italian labels begin with an uppercase letter. The dialog traps focus, closes with Escape/backdrop/close, and restores focus to the question. |
| Admin correct-answer cue | `api/quiz.js`, `api/local-quiz-bank.mjs`, `quiz.js`, `mystyle.css` | The server attaches `admin_correct_answer` only after signed Admin authorization. The client renders exactly one low marker under the matching Vero/Falso control, exposes a text equivalent, and leaves no marker space for ordinary users. |
| Admin quiz overtime | `api/quiz.js`, `quiz.js`, `#timer` | Only the server-returned signed Admin role enables overtime. At the normal limit the display changes from `0:00` to `+0:00`, counts upward, and never auto-submits; ordinary users still finish automatically. Manual Admin completion reports the full elapsed time. |
| Study explanation audio | `study-quiz.js`, `study-quiz.css`, `audio-player-ui.css`, `icons/explain_quiz.svg` | Each available explanation keeps the supplied artwork beside the shared player. The artwork is decorative, reserves stable geometry, mirrors play/pause state, and shrinks without displacing the controls on narrow screens. |
| Study figure presentation | `study-quiz.js`, `study-quiz.css` | The learner-facing Studia quiz masks the catalog number printed in the upper-left of figure assets. The stored image and Admin-facing asset remain unchanged; image failure removes the complete figure frame without leaving empty space. |
| Admin user loading | `script.js`, `api/admin.js` | Opening Admin requests only the 10 newest users. Phone search uses the authenticated server action after a 300 ms debounce and ignores stale results. The complete list is requested only through `Carica tutti gli utenti`; Promo and Duplicati explain that they require that complete scope. Dataset filters expose tab state and support Left/Right/Home/End keyboard movement. |
| Global connectivity alert | `offline-notice.js`, `offline-notice.css` | Every HTML entry loads one shared alertdialog. It blocks interaction only while `navigator.onLine` is false, keeps the background inert, restores prior focus on reconnect, and never uses browser-native alerts. |

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

## Correzione quiz

- Every correction row can reveal the full Bangla translation of the Italian question, exactly two Italian context tags for chapter and topic, and keyword pairs with Italian and Bangla labels.
- On the learner-facing Studia quiz page, keyword pairs and their optional detail appear before chapter/topic tags. The same reading order is preserved in correction surfaces. Both context tags are uppercase; Italian words, locutions, and explanatory copy begin with an uppercase letter unless the source is an intentional special form.
- Keyword selection is owned by the shared All Books glossary resolver: isolated articles, prepositions, conjunctions, and auxiliary forms never render as teaching chips, while the same tokens remain valid inside a useful multi-word technical phrase. Phrase components are absorbed unless the central glossary explicitly marks a words-only exception. Magicph applies the same policy again at both V3 and V2 rendering boundaries.
- Help resolves in this order: synchronized V3 data, catalog translation, then the protected automatic fallback only when no usable Bangla translation exists. Contextual Bangla copy is never substituted for the full question translation.
- The shared static catalog may prewarm once while the browser is idle. Per-question resolution and any protected automatic fallback start only after the learner opens that row; opening the correction must not fan out help requests across all 30 rows. Resolved and in-flight work is cached or deduplicated, and stale results cannot update a closed or different row.
- Opening one translation closes the previously expanded row on every viewport. The active desktop panel may sit beside its row when width permits without changing semantic reading order.
- The disclosure stays inside its correction row, preserves stable media and action geometry, and never hides the fixed result actions.
- Correct, wrong, and unanswered rows all keep the explanation-audio button visible. Activating it lazily requests that question's signed audio; changing row or closing the result stops the previous explanation, and unavailable audio is reported without removing the correction content.

## Aiuto bilingue durante il quiz

- Translation and keywords occupy one stable bottom-centred dialog card on every viewport; the application never opens two independent floating cards.
- The card starts on the full Bangla translation. Two dot tabs expose `aria-selected` and deterministic tabpanel relationships; Left/Right/Home/End and direct activation provide the non-drag alternative.
- A horizontal touch or pen swipe of at least 48px switches panels only when horizontal intent exceeds vertical movement, so keyword scrolling remains usable.
- Opening the card makes the quiz surface inert, moves focus to the close control, traps Tab inside, and supports Escape, backdrop close, and focus restoration to the Italian question.
- Only a signed Admin quiz response may contain the correct answer. The low green/red marker is absent for learners and cannot be inferred from empty reserved layout space.
- Only a signed Admin quiz response may continue beyond the normal timer limit. At zero the timer exposes a textual `Tempo supplementare Admin` state and counts upward from `+0:00`; all other roles keep the existing automatic finish.

## Responsive behavior

- Public access: while Promo Code is disabled, logged-out welcome traffic opens the personal login directly. When promo access is enabled, from 1024px its pass uses two columns — campaign title and timer on the left, labelled phone/code form on the right — with Login/Join/About in one compact row below; narrower viewports retain the semantic vertical order.
- 1280–1920: wide grouped surfaces use the viewport; Statistics is overview/action, chapter matrix/detail; Errori is explorer/plan with master-detail.
- 768–1024: major regions stack only when necessary; chapter detail becomes sequential; no control is compressed below a usable target.
- 320–430: one vertical flow, two-column chapter matrix, three-column category grid wrapping to two rows, sequential detail, plan before categories.
- Quiz correction: translations use one exclusive accordion on every viewport. From 768px, the single active panel may use the adjacent column when space permits. Italian tags, Bangla copy, and keyword pairs wrap without clipping or page-level horizontal overflow.
- Reading order is valid without CSS. Italian and Bangla copy wraps, actions remain visible, and page-level horizontal scrolling is forbidden.

## Navigation, async, and failure behavior

- Home entries and the Statistics/Errori switcher push real routes. Lens selection replaces only `tipo`; invalid values fall back to `figure` and normalize the URL.
- The Admin utility row links to `/libreria-font`. The font library has its own localized document title, a real back link to `/admin`, a clean static route, and a dedicated offline fallback page.
- Admin entry, refresh, search clearing, and successful mutations preserve an explicit data scope: recent, searched, or complete. Promo metadata is lazy and is never fetched during the initial recent-user load.
- Initial load renders a skeleton matching the overview/action/matrix geometry.
- Valid cached data appears immediately with its update time while a background refresh runs online.
- Pending local answers are sent only to the authenticated Vercel endpoint, validated, and merged by event ID.
- Offline with cache keeps the screen usable; offline without cache, expired access, 14-second timeout, and generic failure have separate recovery copy.
- A global connection-loss alert appears immediately when the app opens offline or loses connectivity. It remains stable without repeated toasts, disappears automatically on `online`, and restores the prior focus. The cached page remains rendered underneath and is revalidated by its owning workflow after reconnection.
- Retry is idempotent and disabled while a request is active. No backend implementation detail is shown to the learner.

## Accessibility

- Route entry focuses the screen heading; background refresh does not steal focus.
- Category tabs implement Left/Right/Home/End and link selected tab to its tabpanel.
- Expanded chapter/error controls expose `aria-expanded` and `aria-controls`; rerender restores focus to a stable trigger or pane.
- Each quiz-correction translation uses a native button with `aria-expanded` and `aria-controls`; opening or closing it does not move focus, and its touch target is at least 44px. Bangla content declares `lang="bn"` and remains readable at zoom.
- The live bilingual-help dots are 44px buttons with textual accessible names; swipe is optional, and keyboard selection exposes the same two panels. The modal keeps focus contained and restores it to the question trigger.
- Status is always textual as well as colored. Icon-only controls have accessible names; decorative images use empty alternatives.
- Reduced-motion removes spin/pulse duration, forced-colors preserves selected state, and touch targets remain at least 40–44px.
