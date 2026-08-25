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
    - study-quiz.css
  notes: Existing application tokens remain canonical. Locally compiled, d-prefixed daisyUI controls provide interaction primitives; the scoped learning stylesheet owns layout and visual hierarchy.
design_context:
  owner: Magic Book
  last_updated: 2026-08-25
  revision_notes: Restored self-hosted Hadi Rounded for Bengali study titles and content, with Ekushey Lal Sabuj reserved for the last-chapter subtitle.
---

# Magic Book design context

## Product intent

Magic Book helps adult, primarily Bangla-speaking learners in Italy decide what to study next for the driving-licence exam. Navigation and actions use short A2/B1 Italian. Bangla is supporting content where the catalog already supplies it. The interface reports observed quiz results only; it never predicts exam readiness or invents causes.

## Visual direction

- Direction: Adaptive Study Workspace — a calm, adult study tool that changes density with the amount of real data.
- Signature composition: recent-result band, compact action rail, five-by-five chapter matrix, and recovery stack.
- Tone: direct, professional, reassuring, and operational. Avoid poetic, analytical, and internal-system language in student-facing copy.
- Density: useful information in the first viewport, a restrained 1240px reading canvas on desktop, and one natural vertical flow on mobile.
- Surface rule: one bordered surface per section; use dividers for rows and tabs instead of cards nested inside cards. Elevation is reserved for the single next-action panel.
- Imagery: reuse `icons/statistiche-patente.png`, `icons/errori-patente.png`, `icons/go-back.png`, `icons/next.png`, `assets/admin/update.png`, and authenticated figure assets. Existing SVGs are reused only when their meaning matches.
- Icon rule: no Unicode characters as UI icons. Use repository assets, text labels, or decorative CSS marks hidden from assistive technology.
- Avoid giant headings, oversized empty surfaces, decorative gradients, neon, game styling, generic KPI-card grids, traffic-sign decoration, and horizontal scrollers.

## Tokens

- Brand action: `--li-action: var(--color-primary)`; dark action `#263bd4`.
- Ink/navy: `#17233a` / `#12315f`.
- Positive: `--li-teal: #138f86`; attention: `--li-coral: #c84f4b`; limited data: `--li-amber: #a96c16`.
- Page/surface/line: `#f3f6fb`, `#ffffff`, `#d9e2ee`.
- Type: Inter/system sans for Italian UI. Study-mode titles and default Bengali content use self-hosted Hadi Rounded 400/700; the last-chapter subtitle uses self-hosted Ekushey Lal Sabuj 400. Both faces are limited to the Bengali Unicode range, with Noto Sans Bengali and Hind Siliguri as fallbacks; other catalog surfaces retain their established Bengali families.
- Radius: 16px learning cards, 8px controls, and 9999px status/action pills.
- Focus: 3px cobalt outline with 3px offset.
- Learning-route UI contract: Inter for display and body copy; JetBrains Mono or
  an equivalent system mono for technical labels and metadata. Cards use a
  16px radius, controls 8px, and status/action pills 9999px. Eccellente uses
  teal, Buono uses a distinct green, In miglioramento amber, and Da ripassare
  coral so status can be understood at a glance.

## Layout

- Mobile-first full-screen workspace with one sticky header and one sticky two-route switcher.
- Main width: up to 1720px with fluid side gutters. Desktop uses a 12-column relationship: Statistics overview about eight columns and immediate action about four; Errori explorer about nine and plan about three.
- At 1024px, chapter detail becomes sequential and the recovery plan becomes a compact horizontal region.
- At 767px and below, content becomes one vertical flow. In Errori, `Il tuo ripasso` precedes category exploration.
- The chapter matrix uses five columns when space permits and two columns on phones. All 25 chapters remain visible without horizontal scrolling.
- Reading order remains meaningful without CSS. Nothing may create page-level horizontal scrolling at 320px.
- Public promo landing: from 1024px, the access card becomes a wide two-column pass with campaign title and timer on the left, the labelled phone/code form on the right, and the Login/Join/About switcher in one compact row below. Below 1024px it keeps the existing vertical flow.

## Components and behavior

- Shared component base: locally compiled daisyUI 5 with the `d-` prefix. Header, route, primary, secondary, category, and pagination controls use these primitives; the scoped stylesheet remains the visual owner.
- Learning shell: back, brand, labelled/icon-only responsive refresh, Statistics/Errori route switcher, freshness note, and one polite live status. Legacy fixed chrome is suppressed while this route owns the viewport.
- Statistics overview: answers correct, quizzes done, chapters started, items to review, and the real percentage from the recent window. Comparison copy is plain and threshold-based.
- Immediate action: exactly one useful action in the first viewport. Empty and insufficient histories get a quiz action; ready users get the first real plan action or a positive continue state.
- Progress groups: at most three chapters going well and at most three chapters to review; no duplicate metric wall.
- Chapter matrix: 25 compact cells with number, clamped title, explicit status, and optional review count. Status vocabulary is `Bene`, `Sta migliorando`, `Da ripassare`, `Pochi dati`, `Non iniziato`.
- Chapter detail: one selected chapter at a time, side-by-side on wide screens, sequential on tablet, and a focusable bottom sheet on phones; it shows attempts, quiz coverage, correct answers, recent result, review/recovered counts, and existing quiz/book actions.
- Error summary: `Da ripassare`, `Sta migliorando`, and `Recuperati` in one grouped strip.
- Error categories: five stable tabs — Figure, Quiz, Parole, Argomenti, Capitoli. Recovered items are a separate positive section, not a duplicated tab.
- Error master/detail: figures show the real authenticated image; words retain dictionary access; detail copy states observed counts without causal diagnosis. Lists start at eight items and use `Mostra altri`.
- Review plan: one to three actions, total estimated time, and immediate CTA using the existing quiz, book, figure, or dictionary destinations.
- Recovered: up to three recent recovered items remain visible below active work.

## Data, states, and trust

- API, Google Apps Script, Sheets, IndexedDB, local outbox, synchronization, routing, authentication, calculations, and event collection remain unchanged.
- Empty, insufficient, ready, cached, refreshing, offline-cached, no-cache offline, expired access, timeout, and generic failure are distinct states.
- Empty/insufficient views stay compact and tell the learner exactly which quiz action is available.
- Cached data renders first; online data replaces it only after validation. Pending local responses remain identified without blocking the UI.
- Figures are lazy loaded, use a stable aspect frame, and expose a visible fallback without layout shift.
- Backend diagnostic labels and reasons are translated into simpler presentation copy; the underlying classification and calculations are untouched.

## Accessibility and validation

- Route entry focuses `#learningInsightsHeading`; background refresh does not steal focus. Re-rendered tabs, chapter cells, disclosure controls, and close actions restore focus.
- Tabs implement Left/Right/Home/End. Selected and expanded controls expose matching ARIA state/control relationships.
- Status is expressed with text and color. Interactive targets are at least 40–44px, focus is visible, and reduced-motion/forced-colors modes are supported.
- Verify 320, 375, 430, 768, 1024, 1280, 1440, and 1920 widths; capture 375, 768, 1440, and 1920 evidence.
- Verify empty, 1–9 answers, medium history, large history, figure failure, offline cache, expired access, timeout, and generic backend failure.
- No Unicode UI icons, fabricated sequences/charts, inferred causes, duplicate global chrome, or hidden horizontal overflow patches.
