---
surface: product
canonical_ui:
  mode: B
  source: runtime
  paths:
    - style.css
    - src/learning-insights.css
  notes: Existing application styles remain canonical; the learning-insights layer adds scoped semantic tokens and components.
design_context:
  owner: Magic Book
  last_updated: 2026-08-21
  revision_notes: Added the authenticated learning journey, statistics, error recovery, and local-first states.
---

# Magic Book design context

## Product intent

Magic Book helps Italian driving-licence learners understand what to study next. The interface is bilingual where the learning catalog provides Bangla support, but navigation and controls remain concise Italian. Statistics must feel like a calm learning path, never a business dashboard or a fabricated readiness score.

## Visual direction

- Signature motif: an abstract road ribbon with waypoints that turns progress into a journey.
- Mood: intelligent, calm, slightly futuristic, spacious, and instructional.
- Density: one primary insight per view, a small set of supporting measures, then progressive disclosure.
- Imagery: use the supplied `icons/statistiche-patente.png` and `icons/errori-patente.png` as navigation symbols. Figure assets come from the existing authenticated asset endpoint.
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
- Reading order must remain meaningful without CSS. No horizontal page scroll at 320px.

## Components and behavior

- Home learning entries: two equal-weight buttons for `Statistiche` and `Errori`, each with the supplied icon and a short purpose label.
- Learning shell: shared header, back to Home, route-backed Statistics/Errori navigation, freshness status, and one live status region.
- Journey ribbon: summary, recent accuracy, coverage, and the next evidence milestone. It is not an exam-readiness prediction.
- Chapter route: all 25 chapters are always represented. Status is conveyed with text as well as color.
- Error lenses: Figure, Quiz, Parole, Argomenti, Recuperati. The active lens is encoded in the URL query and uses accessible tabs.
- Detail disclosure: opens inline on mobile and in the same content column on desktop. It never traps focus.
- Lists initially show eight items and expose `Mostra altri`; empty states contain one valid next action.
- Recovery plan: maximum three evidence-backed actions. Existing chapter quiz, book viewer, figure asset, and dictionary are reused.

## Data and trust

- Metrics are derived only from authenticated answer events stored in the existing learning database plus validated local outbox events.
- Ten answers are required before strong diagnostic copy appears.
- A figure becomes an active pattern only after errors on at least two different linked quizzes.
- A word is highlighted only with at least four occurrences and a meaningful negative delta from the learner baseline.
- Recovered and improving states require recent correct evidence; raw historic error frequency alone is insufficient.
- Missing catalog relationships are reported as data-quality coverage, not silently presented as certainty.

## Resilience and accessibility

- Cached results may be shown offline with a persistent, explicit stale banner; pending answers are counted separately.
- Skeleton, empty, insufficient, offline-cached, access-expired, and retryable error states preserve geometry.
- All icon-only controls have accessible names; buttons are at least 44px high; tab arrows work; `aria-live` is used only for meaningful status updates.
- Motion is restrained and disabled under `prefers-reduced-motion: reduce`.
- Scrollbar styling is global, subtle, and must not be overridden by nested components.

## Validation checklist

- 320px, 390px, 768px, 1440px, and 1920px layouts.
- Keyboard-only flow through header, lenses, chapter nodes, disclosures, and plan actions.
- Empty, 1–9 answers, normal history, large history, offline cache, expired session, and backend failure.
- Italian wrapping and Bangla glyph rendering.
- No synthetic charts, inferred causes, readiness scores, or unverified progress claims.
