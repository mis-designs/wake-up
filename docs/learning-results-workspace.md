# Learning results workspace — 2026-09-22

## Owner decision

Statistics and Errors are learner-facing production workflows on web and installed Android. A server outage must not replace useful study content with technical synchronization counts. Use the available desktop width, natural phone scrolling, real charts and chapter-level actions. Keep data coverage truthful but secondary.

## Implementation and data contract

- `src/learning-insights.js` remains the presentation, request and navigation owner. Saved graded corrections and the server model use the same ring, chart-card, chapter-bar and next-study renderers.
- Correct-answer percentage means correct / evaluated answers. Repeated questions count as attempts. Distinct questions are labelled separately. It is not exam readiness.
- Local review groups actual session/question keys into correction batches. At most eight batches are charted; no invented day/week time series. Server history compares the actual recent window with cumulative accuracy because the API does not return a chronology.
- Canonical `capN_qN` identities map old saved corrections to chapters without a catalog request. The test checks every Magic Book and Exam identity. Unknown/Exam IDs stay in overall totals, not chapter bars; a note explains unassigned answers. Titles reuse `script.js`'s existing `CHAPTER_TITLES`.
- The latest graded answer per question determines local review membership. Server categories and recommendations keep the server's different multi-entity rules and are labelled as elements, not unique questions.
- LocalStorage retention and bounds remain **24 hours / 250 answers / 512KB**, scoped to user/device. No new storage, credentials, answer key, permission, grading rule or background task. If storage cannot persist, the disclosure explains the temporary session copy.
- Auth failure never falls back to private history. A valid server recovery replaces the local view; totals are not summed. The existing cache, cancellation and failure cooldown stay unchanged.

## Request budget

Charts, chapter expansion, pagination and data-scope disclosure: **zero requests**. Opening/refreshing the route keeps the existing authenticated read, 60-second reuse/cooldown, bounded token renewal, 14-second deadline and navigation cancellation. Explicit practice actions use existing destinations. No production endpoint was probed for this redesign.

## Reconciled design drift

| Previous rule / implementation | Resolution |
| --- | --- |
| Documented wide layout, but runtime capped at1240px and local report at960px | Remove local cap; use1720px fluid main width on both data paths. |
| Technical fallback banner and synchronization KPI | Replace with learner results; expose actual period/freshness/limitations through a quiet native disclosure. |
| Compact chapter cells without measured visualization | Shared labelled bars, numerator/denominator and percent; reuse chapter detail and practice actions. |
| Global button shadows leak onto chart rows | Explicit flat chart-row variant, with hover, active, focus and selection states. |

## Verification

- 610 Node tests pass, including three new chart/identity/deduplication tests and updated fallback-copy expectations.
- Local mocked browser checks:320×640,375×812,390×844 Android marker,768×1024,1440×900,1920×1080.
- Checked persisted local results after reload, 503 recovery, permission denial, server replacement, chapter open/close with pointer and keyboard, keyboard disclosure, pagination8→10, empty history, forced colors, no horizontal overflow and no request on switching routes during cooldown.
- Six mocked reads per scenario cover initial read, two fresh-document reloads and three explicit refresh paths; chart interactions introduce none. All other external traffic is blocked.
- CSS build, strict premium audit, DESIGN.md lint and diff whitespace checks pass.
- Physical Android and Safari remain release smoke checks. No AAB/APK rebuild, commit, push or deployment is included.
