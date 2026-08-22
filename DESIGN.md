---
surface: product
canonical_ui:
  mode: B
  source: runtime
  paths:
    - style.css
    - src/daisyui.css
    - assets/daisyui.css
    - src/learning-insights.css
  notes: Existing application styles remain canonical; locally compiled, d-prefixed daisyUI primitives are scoped to the login, while the learning-insights layer adds scoped semantic tokens and components.
design_context:
  owner: Magic Book
  last_updated: 2026-08-22
  revision_notes: Documented the Roadbook redesign for Statistics and Error Recovery while preserving the scoped daisyUI login study pass and established learning-route identity.
---

# Magic Book design context

## Product intent

Magic Book helps Italian driving-licence learners understand what to study next. The interface is bilingual where the learning catalog provides Bangla support, but navigation and controls remain concise Italian. Statistics must feel like a calm learning path, never a business dashboard or a fabricated readiness score.

## Visual direction

- Signature motif: a Roadbook that turns evidence into a legible route of stages and checkpoints, with restrained editorial labels instead of dashboard chrome.
- Mood: intelligent, calm, slightly futuristic, spacious, instructional, and action-oriented without becoming clinical.
- Density: one compact snapshot or recovery summary, one primary next move, then evidence-backed signals and progressive disclosure.
- Imagery: use the supplied `icons/statistiche-patente.png` and `icons/errori-patente.png` as navigation symbols. Navigation and action icons come from existing PNG/SVG assets; figure assets come from the existing authenticated asset endpoint.
- Icon rule: interactive UI never uses Unicode characters as icons. Use an existing image/SVG asset, a text label, or a purely decorative CSS mark with no semantic role.
- Avoid literal cars, traffic-sign decoration, dense chart grids, neon gradients, and generic SaaS KPI cards.

## Tokens

The root variables in `style.css` remain the brand source of truth. The insights layer maps them to semantic tokens:

- `--li-action`: `var(--color-primary)`
- `--li-info`: `var(--color-secondary)`
- `--li-ink`: `#16233b`
- `--li-navy`: `#102a52`
- `--li-teal`: `#159c91`
- `--li-amber`: `#c88720`
- `--li-coral`: `#d85c55`
- `--li-mist`: `#f3f6fb`
- `--li-line`: `#dce4ef`
- `--li-surface`: `#ffffff`
- `--li-shadow`: `0 18px 50px rgba(24, 45, 82, 0.1)`
- Type: `Rubik`, `Inter`, system sans for UI and values; `Hind Siliguri`, `Noto Sans Bengali` for Bangla; `Bodoni Moda` only for restrained editorial headings.
- Radius: 14px controls, 20px grouped surfaces, 28px hero surfaces.
- Focus: 3px cobalt outline with 3px offset.

## Layout

- Mobile-first, full-width screens with a sticky compact header and stable segmented navigation.
- Content max width: 1480px. Desktop uses a 12-column grid; primary narrative occupies eight columns and the action rail four.
- Breakpoints: 720px for two-column lists; 1024px for desktop journey/error layouts.
- On desktop, Statistics pairs the compact snapshot with the next move, then gives the signal board and five Roadbook stages full width. Errori uses a wide recovery workspace with a master/detail explorer and a separate plan rail.
- On tablet, major regions stack in reading order while paired cards and the master/detail relationship use available width without compressing controls.
- On mobile, every screen becomes one natural vertical flow: snapshot, next move, signals, stages; or recovery summary, emerging signals, category grid, master/detail, plan, and recovered evidence.
- Reading order must remain meaningful without CSS. No horizontal page scroll at 320px.

## Components and behavior

- Login study pass: a calm two-zone card connects the multilingual greeting and existing illustration to the phone-access form with one road-waypoint motif. On narrow screens it becomes one natural-height column.
- Login controls: locally compiled daisyUI 5 components use the `d-` prefix and `#login` theme root. `style.css` remains the visual owner; generated `assets/daisyui.css` is never hand-edited.
- Home learning entries: two equal-weight buttons for `Statistiche` and `Errori`, each with the supplied icon and a short purpose label.
- Learning shell: shared Roadbook header, asset-based back/refresh/route controls, route-backed Statistics/Errori navigation, freshness status, and one live status region.
- Statistics snapshot: a compact current-state summary combines attempts, precision, recent performance, and coverage with an explicit evidence-progress indicator. It is not an exam-readiness prediction.
- Next move and signals: one evidence-backed recommendation is followed by at most three concise signals drawn from observed chapters, active recovery priorities, or recent recoveries.
- Chapter Roadbook: all 25 chapters are always represented as five ordered stages of five checkpoints. Selecting a checkpoint reveals its detail inside that same stage, with status, attempts, accuracy, recent accuracy, active errors, and chapter/quiz actions.
- Recovery center: Errori opens with active, planned, and recovered totals followed by no more than three emerging signals.
- Error category grid: Figure, Quiz, Parole, Argomenti, Capitoli, and Recuperati form a stable six-tab grid. `Capitoli` is derived client-side from `model.chapters` and does not extend the API. The active category is encoded in the URL query and uses accessible tab semantics.
- Error master/detail: the selected signal remains in the master list while its explanation, related quiz, media, and recovery actions appear in the detail pane. Only one detail is active and it never traps focus.
- Lists initially show eight items and expose `Mostra altri`; empty states contain one valid next action.
- Recovery plan: maximum three ordered, evidence-backed actions. Existing chapter quiz, book viewer, figure asset, and dictionary are reused.
- Recovered evidence: up to three recent recoveries remain visible after the active workspace so improvement is not lost when an error leaves the active list.

## Data and trust

- Metrics are derived only from authenticated answer events stored in the existing learning database plus validated local outbox events.
- Ten answers are required before strong diagnostic copy appears.
- A figure becomes an active pattern only after errors on at least two different linked quizzes.
- A word is highlighted only with at least four occurrences and a meaningful negative delta from the learner baseline.
- Recovered and improving states require recent correct evidence; raw historic error frequency alone is insufficient.
- Missing catalog relationships are reported as data-quality coverage, not silently presented as certainty.

## Resilience and accessibility

- Login uses a visible phone label, app-owned validation, an inline polite status, stable busy-button geometry, and a masked admin password with an accessible show/hide control.
- Learning insights are local-first: a user-scoped cached model renders immediately when available, pending local answers are counted separately, and an online refresh replaces it only after a valid response.
- Cached results may be shown offline with a persistent, explicit stale banner. No-cache offline, access-expired, generic network failure, and the explicit 14-second timeout have distinct recovery copy.
- Skeleton, empty, insufficient, offline-cached, access-expired, timeout, and retryable error states preserve geometry.
- Route entry moves focus to `#learningInsightsHeading`; background refresh does not steal focus. Rerendered checkpoint, tab, disclosure, and close actions restore focus to a stable control.
- Selected tabs and expanded checkpoint/error controls expose matching `aria-controls`; status is always expressed in text as well as color.
- All icon-only controls use asset icons and accessible names; decorative images have empty alternatives; buttons are at least 44px high; tab arrows work; `aria-live` is used only for meaningful status updates.
- Motion is restrained and disabled under `prefers-reduced-motion: reduce`.
- Scrollbar styling is global, subtle, and must not be overridden by nested components.

## Validation checklist

- 320px, 390px, 768px, 1440px, and 1920px layouts.
- Keyboard-only flow through header, the six category tabs, stage checkpoints, master/detail disclosures, close control, and plan actions.
- Empty, 1–9 answers, normal history, large history, offline cache, expired session, explicit timeout, and backend failure.
- Desktop, tablet, and mobile reading order for both the Statistics Roadbook and Error Recovery center.
- Italian wrapping and Bangla glyph rendering.
- No Unicode UI icons, synthetic charts, inferred causes, readiness scores, or unverified progress claims.
