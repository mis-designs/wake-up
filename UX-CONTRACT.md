# Magic Book learning insights UX contract

## Canonical UI Map

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
| --- | --- | --- | --- | --- |
| Form | Login form | `index.html` `#login .login-form` + `script.js` login helpers | Phone access; server-requested admin password | Login style/behavior tests + browser keyboard and failure states |
| Scrollbar | Application root | `src/learning-insights.css` global `html` rules | Browser forced-colors only | Computed root style and unclassed horizontal lens scroller |
| Statistics Roadbook | `src/learning-insights.js` | Authenticated learning model | Empty, insufficient, ready, cached, refreshing | Data-state tests plus desktop/tablet/mobile browser verification |
| Error Recovery | `src/learning-insights.js` | Authenticated errors and recovery plan | Six categories; empty or populated master/detail; recovered evidence | Interaction, URL, focus, and responsive browser verification |

## Feature ownership

| Concern | Owner | Contract |
| --- | --- | --- |
| Login UI | `index.html`, `style.css`, `src/daisyui.css` | Phone-only access uses locally compiled, `d-`-prefixed daisyUI primitives scoped to `#login`; no CDN or global reset. |
| Login behavior | `script.js` | Preserve phone input after remote errors; mask admin password; prevent duplicate submit; expose inline generic recovery without raw backend details. |
| Learning routes | `script.js` | `/statistiche` and `/errori`; error lens is the `tipo` query parameter. |
| Learning data | `src/learning-insights.js` | Local-first, user-scoped cached rendering plus one abortable request per visible route; prior requests are ignored when the route changes. |
| Server aggregation | `api/learning-insights.mjs` | Authenticated, device-bound, no-store response; server grading and catalog mapping are authoritative. |
| Chapter disclosure | `src/learning-insights.js` | One selected checkpoint; its detail renders inline within the same one of five stages. The trigger exposes `aria-expanded` and `aria-controls`. |
| Error master/detail | `src/learning-insights.js` | At most one selected item per category. The master trigger controls the matching detail pane and focus remains recoverable after rerender. |
| Pagination | `src/learning-insights.js` | Eight initial items; `Mostra altri` appends without losing focus or scroll position. |
| Async status | `#learningInsightsStatus` | Polite live region for load completion, offline cache, and retry results. |
| UI iconography | `src/learning-insights.js` and repository assets | Interactive icons use existing PNG/SVG assets, never Unicode glyphs. Decorative CSS marks remain hidden from assistive technology. |

## Screen composition

### Statistiche

- The first viewport contains a compact snapshot, the current evidence threshold, and one primary next move.
- The snapshot reports only observed totals, precision, recent performance, and catalog coverage; it never claims exam readiness.
- A signal board shows no more than three evidence-backed signals.
- The chapter map always contains five ordered stages with five checkpoints each, for all 25 chapters.
- Selecting a checkpoint opens its chapter detail inside the same stage and retains the quiz and book actions.

### Errori

- The recovery-center heading summarizes active signals, actions currently in the plan, and recent recoveries.
- `Cosa sta emergendo` shows no more than three ranked signals and selecting one opens its category and matching detail.
- Figure, Quiz, Parole, Argomenti, Capitoli, and Recuperati are a stable six-category tab grid.
- `Capitoli` is derived client-side from `model.chapters`; it does not add or alter an API field.
- The explorer is master/detail: the list remains the navigation surface while the selected explanation, related quiz, media, and actions occupy the detail pane.
- The recovery plan contains no more than three ordered actions and reuses existing quiz, book, figure, and dictionary destinations.
- Recent recovered items remain visible in a separate section, capped at three.

## Responsive behavior

- Desktop presents paired Statistics summary/next-move regions and a wide Errori master/detail workspace with a separate plan rail.
- Tablet preserves paired content where it remains readable, otherwise stacks major regions in semantic order without shrinking touch targets.
- Mobile is one vertical reading flow. The six category controls remain a usable grid, master/detail becomes sequential, and stage detail stays adjacent to its selected stage.
- No layout introduces horizontal page scrolling at 320px; long Italian and Bangla content wraps without hiding actions.

## Navigation and URL state

- Home entries push a route.
- Statistics/Errori navigation pushes a route.
- Selecting an Errori lens replaces the `tipo` query without adding a history entry for every tab change.
- Browser Back returns through actual screen history; the in-app back control returns to Home.
- Invalid `tipo` values fall back to `figure` and normalize the URL.

## Async and failure behavior

- Initial load renders a stable skeleton matching the final layout.
- A valid cached model renders immediately, marked with its last update time, while a background refresh runs online.
- Local pending answer events are sent only to the authenticated Vercel endpoint, validated and merged by event ID.
- An offline refresh keeps cached data visible. With no cache, it renders an offline empty state and a retry action.
- The configured 14-second request timeout renders a dedicated timeout state and recovery copy; it is not collapsed into the generic network failure.
- A 401 response renders the access-expired state and never leaks cached data from another authenticated identity.
- Retry actions are idempotent and disabled while their request is active.

## Accessibility

- Login uses `novalidate`, visible labels, field-linked help/error text, `aria-invalid` only for invalid fields, and a stable `aria-busy` submit action.
- Focus is moved to the screen heading only on route entry, not after background refresh.
- Lens tabs implement Left/Right/Home/End keys; the selected tab's `aria-controls` resolves to the active tabpanel and the panel is labelled by that tab.
- Expanded chapter and error triggers expose `aria-expanded` plus `aria-controls` for the visible detail. Closing or rerendering restores focus to a stable trigger or pane.
- Status is never color-only: every chapter and error item includes a text label.
- Navigation/action icons use repository image assets with accessible names where interactive; Unicode glyphs are not used as UI icons.
- Reduced-motion users receive no ribbon or skeleton animation.
