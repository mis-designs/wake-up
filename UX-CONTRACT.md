# Magic Book learning insights UX contract

## Canonical UI Map

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
| --- | --- | --- | --- | --- |
| Scrollbar | Application root | `src/learning-insights.css` global `html` rules | Browser forced-colors only | Computed root style and unclassed horizontal lens scroller |

## Feature ownership

| Concern | Owner | Contract |
| --- | --- | --- |
| Learning routes | `script.js` | `/statistiche` and `/errori`; error lens is the `tipo` query parameter. |
| Learning data | `src/learning-insights.js` | One abortable request per visible route; prior requests are ignored when the route changes. |
| Server aggregation | `api/learning-insights.mjs` | Authenticated, device-bound, no-store response; server grading and catalog mapping are authoritative. |
| Detail disclosure | `src/learning-insights.js` | At most one expanded item per lens. Button exposes `aria-expanded` and `aria-controls`. |
| Pagination | `src/learning-insights.js` | Eight initial items; `Mostra altri` appends without losing focus or scroll position. |
| Async status | `#learningInsightsStatus` | Polite live region for load completion, offline cache, and retry results. |

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
- A 401 response renders the access-expired state and never leaks cached data from another authenticated identity.
- Retry actions are idempotent and disabled while their request is active.

## Accessibility

- Focus is moved to the screen heading only on route entry, not after background refresh.
- Lens tabs implement Left/Right/Home/End keys.
- Status is never color-only: every chapter and error item includes a text label.
- Reduced-motion users receive no ribbon or skeleton animation.
