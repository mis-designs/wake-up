---
surface: product
canonical_ui:
  mode: B
  source: runtime
  paths:
    - loading-ui.css
    - style.css
    - src/daisyui.css
    - assets/daisyui.css
    - src/learning-insights.css
    - assets/fonts/magicbook-bangla-fonts.css
    - study-quiz.css
    - libreria-font.css
  notes: Existing application tokens remain canonical. Locally compiled, d-prefixed daisyUI controls provide interaction primitives; the scoped learning stylesheet owns layout and visual hierarchy.
design_context:
  owner: Magic Book
  last_updated: 2026-08-31
  revision_notes: Added a shared icon-led pill treatment for Admin utility actions, with distinct emerald, coral, and violet palettes; the local Bengali font library now compares its faces using the approved Magic Book sentence. Admin now opens with the 10 most recent users, searches remotely by phone, and loads the complete list only after an explicit action. The Admin search and dataset filters now share the same compact pill geometry and semantic palette as the utility actions. Live quiz help now uses one bottom-centred bilingual card with two dot-selected swipe panels; signed Admin quiz sessions alone receive the restrained correct-answer marker and an overtime timer that continues beyond the normal limit. Quiz correction keeps the person-led audio explanation control available on correct, wrong, and unanswered rows. Every Magic Book surface now shares one connection-loss alert that clears automatically when the browser reports the network is back. Visible asynchronous work now uses the supplied loading.gif through one shared loading treatment across access, Admin, book, dictionary, learning, quiz, study, and explanation workflows. The blocking quiz load is one seamless white viewport with only the centered GIF visible, while its status remains available to assistive technology. The WhatsApp group dialog now uses the Admin pill language, local Bengali typography, aligned language controls, and modal focus behavior.
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
- Type: Inter/system sans for Italian UI. The large study-mode Bengali hero title uses self-hosted Hadi Rounded 400/700. All smaller Bengali study and quiz text—including the last-chapter subtitle, translations, controls, keyword chips, and word details—uses self-hosted Adorsho Lipi 400. The dictionary is the approved catalog exception: every element marked `lang="bn"` uses Tiro Bangla, with Noto Sans Bengali and Hind Siliguri as fallbacks. Primary Bangla vocabulary labels synthesize weight 700 from the provider's Regular 400 face; supporting explanations remain 400. Full translations use a fluid 1.15–1.2rem support scale; compact Bangla controls, keyword lines, and word details use .86–.92rem. Ekushey Lal Sabuj 400 remains locally available as an alternate and specimen in the font library.
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
- Public access entry: Promo Code is temporarily disabled by the fail-closed `PROMO_LOGIN_ENABLED` switch in `script.js`; logged-out visitors go directly to the personal phone login and no promo-status request runs. When the switch is restored, the preserved promo landing uses a wide two-column pass from 1024px and keeps its vertical mobile flow.

## Components and behavior

- Shared component base: locally compiled daisyUI 5 with the `d-` prefix. Header, route, primary, secondary, category, and pagination controls use these primitives; the scoped stylesheet remains the visual owner.
- Shared loading indicator: `loading-ui.css` is the canonical visual owner and `icons/loading.gif` is the approved animated asset. Page, panel, inline-status, and busy-control variants reserve stable geometry, retain Italian status text and `aria-busy`, block duplicate actions, and replace animation with a static high-contrast mark when reduced motion is requested. Background refresh keeps usable content visible instead of opening a blocking loader.
- Quiz blocking load: `mystyle.css` owns a single white viewport surface. The supplied GIF sits directly in the center without a visible card, border, shadow, progress copy, or nested loading surface; changing status text remains screen-reader-only. Recoverable failure appears only after loading ends and uses plain learner-facing Italian.
- WhatsApp group dialog: `style.css` owns one responsive white modal with a restrained green accent, local Hadi Rounded title and Adorsho Lipi support copy in Bangla, an aligned Bangla/Italian control, and two Admin-derived icon-led pill actions. It traps focus, supports Escape/backdrop dismissal, restores focus, and keeps the background inert while open.
- Admin utility actions: `Nuovo utente`, `Aggiungi spiegazioni audio`, and `Libreria font` share one compact icon-led pill component. Emerald, coral, and violet distinguish the three destinations without replacing their text labels; links remain links and the create action remains a button.
- Admin search and filters: the phone field is an emerald icon-led pill with no visible placeholder, while retaining a programmatic Italian name and explicit clear control. Users, Promo, In scadenza, Scaduti, and Duplicati use the same pill radius with green, violet, amber, red, and slate state accents; runtime values are owned by `style.css` under `.admin-toolbar` and consumed by the search, tabs, and utility actions.
- Admin user dataset: entry loads at most the 10 newest registrations. A labelled scope bar explains whether the current data is recent, searched, or complete; exact phone lookup stays remote, while `Carica tutti gli utenti` is the explicit opt-in for full-list filters such as Promo and Duplicati.
- Live quiz bilingual help: clicking the Italian question opens one dark bottom-centred card. Translation and keyword content are peer panels inside the same frame, selected through two accessible dots, Left/Right/Home/End keys, or a horizontal touch swipe; long content scrolls vertically inside its panel. Pink remains the single help accent and the dialog owns focus, Escape, backdrop dismissal, and trigger-focus restoration.
- Admin quiz answer marker: only a server-authorized Admin session receives the private answer value. One small green marker sits below `Vero` when true is correct, or one small red marker sits below `Falso` when false is correct; ordinary learners receive neither the value nor reserved marker space, and assistive technology receives an explicit Admin-only text equivalent.
- Admin quiz overtime: the timer counts down through the normal duration for every role. At zero, a server-authorized Admin session changes to a `+0:00` elapsed-overtime display and continues until the Admin finishes or exits; non-Admin sessions retain automatic submission at the limit. Result summaries report the Admin's complete elapsed time.
- Quiz correction audio: every correction row—correct, wrong, or unanswered—keeps the existing person artwork as a labelled audio button. Audio remains demand-loaded after activation, one review explanation plays at a time, and unavailable audio returns the existing recoverable message.
- Font library: `/libreria-font` is an Admin-linked static reference page. One bordered specimen sheet contains three divided rows—Hadi Rounded, Adorsho Lipi, and Ekushey Lal Sabuj—and renders the same live Bengali sentence in each face for an honest comparison without image previews.
- Global offline notice: every application page loads the same blocking connection-loss alert. It uses one calm white Magic Book surface, the existing no-internet illustration, a textual waiting state, focus containment, and automatic recovery without a dismiss action while the browser remains offline.
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

- Admin authentication and device-bound authorization remain unchanged. Its read flow uses a bounded recent-list request, remote phone search, and an explicit complete-list request; the server still validates and normalizes phone data before forwarding it upstream.
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
