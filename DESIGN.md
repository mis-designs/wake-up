---
surface: product
canonical_ui:
  mode: B
  source: runtime
  paths:
    - loading-ui.css
    - style.css
    - mystyle.css
    - quiz-help.css
    - mobile-experience.css
    - api/quiz-figure-image.mjs
    - android-webview-mode.js
    - android-app-theme.css
    - android-study-shell.css
    - android-study-shell.js
    - android-rotary-model.mjs
    - src/daisyui.css
    - assets/daisyui.css
    - src/learning-insights.css
    - assets/fonts/magicbook-bangla-fonts.css
    - study-quiz.css
    - libreria-font.css
    - magic-styles.css
  notes: Existing application tokens remain canonical. Locally compiled, d-prefixed daisyUI controls provide interaction primitives; the scoped learning stylesheet owns layout and visual hierarchy.
design_context:
  owner: Magic Book
  last_updated: 2026-09-08
  revision_notes: User-supplied rotary Home/chapter design is a named installed-Android-only variant. White, charcoal, blue and Norwester override the older palette on these two screens only. Existing routes, authorization and progress data remain canonical.
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
- Android WebView compactness is owned by `mobile-experience.css`; it may reduce decoration and spacing without changing route meaning or hiding required controls. Header titles stay visually centered through symmetric live utility rails, and short Home content uses auto margins that collapse safely when vertical scrolling is needed.
- Installed-app color is owned by `android-app-theme.css` behind the `html.android-webview` marker. Lavender chrome, gold secondary actions, an ivory background, sage supporting surfaces, and white reading paper distinguish the Android app while the ordinary browser version keeps its current palette. Route structure, density, typography, and business behavior stay with their existing owners.

## Tokens

- Brand action: `--li-action: var(--color-primary)`; dark action `#263bd4`.
- Android installed palette: primary `#A79CFF`, secondary `#F4B942`, accent `#F4B942`, background `#F9F8F5`, surface `#88C999`, primary text `#111827`, muted text `#333B4A`, structural border `#6B7280`, and reading paper `#FFFFFF`. Primary, secondary, accent, and surface all use dark ink. Gold is a brand emphasis, never a danger color. Background, supporting surface, reading paper, text, and border remain separate roles.
- Token mapping (model B): `android-app-theme.css` owns `--app-palette-*`, maps them to existing route aliases and shared components, and supplies the browser theme-color metadata through `android-webview-mode.js`. The `aura-fluid` dataset value remains a compatibility switch for existing chapter drag behavior, not the palette source. Layout, sizes, order, fonts, and motion are unchanged by this palette update.
- Semantic colors are independent of the installed palette: correct/positive remains green, incorrect/error remains red, and warning/limited data remains amber.
- Ink/navy: `#17233a` / `#12315f`.
- Positive: `--li-teal: #138f86`; attention: `--li-coral: #c84f4b`; limited data: `--li-amber: #a96c16`.
- Page/surface/line: `#f3f6fb`, `#ffffff`, `#d9e2ee`.
- Type: Inter/system sans for Italian UI. The large study-mode Bengali hero title uses self-hosted Hadi Rounded 400/700. All smaller Bengali study and quiz text—including the last-chapter subtitle, translations, controls, keyword chips, and word details—uses self-hosted Adorsho Lipi 400. The dictionary is the approved catalog exception: every element marked `lang="bn"` uses Tiro Bangla, with Noto Sans Bengali and Hind Siliguri as fallbacks. Primary Bangla vocabulary labels synthesize weight 700 from the provider's Regular 400 face; supporting explanations remain 400. Full translations use a fluid 1.15–1.2rem support scale; compact Bangla controls, keyword lines, and word details use .86–.92rem. Ekushey Lal Sabuj 400 remains locally available as an alternate and specimen in the font library.
- Italian display case: `italian-display.js` is the shared presentation owner. Chapter and topic tags are uppercase; ordinary Italian words, locutions, and explanatory copy start with an uppercase letter while preserving the remaining source spelling and intentional special forms.
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
- Audio focus: `audio-focus.js` coordinates every Quiz and Studia quiz audio action. Explanation audio is resumable: question, keyword, and dictionary TTS pause it at the current timestamp and expose a violet dashed interrupted state. Only the latest TTS may play; natural completion resumes the same explanation, while manual stop, navigation, or an explicit explanation action suppresses automatic resume. Pending explanation requests are invalidated so a late response cannot overlap newer audio.
- Quiz blocking load: `mystyle.css` owns a single white viewport surface. The supplied GIF sits directly in the center without a visible card, border, shadow, progress copy, or nested loading surface; changing status text remains screen-reader-only. Recoverable failure appears only after loading ends and uses plain learner-facing Italian.
- WhatsApp group dialog: `style.css` owns one responsive white modal with a restrained green accent, local Hadi Rounded title and Adorsho Lipi support copy in Bangla, an aligned Bangla/Italian control, and two Admin-derived icon-led pill actions. It traps focus, supports Escape/backdrop dismissal, restores focus, and keeps the background inert while open.
- Admin identity: `assets/admin/ADMIN_PROFILE_LOGO.jpg` is the single Admin profile image. It fills the circular entry control and the compact circular identity mark beside the Admin title; both keep stable geometry and use an empty alternative because the surrounding control or title already supplies the accessible name. The floating Admin and Profile controls use solid white surfaces with an opaque line and no glass transparency or backdrop blur.
- Admin utility actions: `Nuovo utente`, `Aggiungi spiegazioni audio`, and `Magic Styles` share one compact icon-led pill component. Emerald, coral, and violet distinguish the three destinations without replacing their text labels; links remain links and the create action remains a button.
- Explanation audio player: `audio-player-ui.css` is the shared visual owner for Quiz, Studia quiz, and Admin explanation players (including legacy review). It carries the Admin search-pill language into one fully transparent surface with an emerald line and glow: a 40px emerald radial control using only the approved outlined play/pause SVG pair, emerald progress, violet speed utility, stable loading/error geometry, cobalt focus, and motion-safe hover/playing feedback. All three surfaces use the same emerald control, transparent surface, violet speed selector, and supplied SVG pair. Both SVGs share the same grid cell so playback state never shifts the control; route-level pseudo-icons and black active backgrounds are explicitly retired. The speed selector starts at 1x, moves to 0.5x on its first activation, then cycles through 1x, 1.25x, 1.5x, and 2x. A bounded 56px speed column, reduced to 52px on narrow phones, keeps `1,25×` and every other label inside the player while the progress track uses the remaining flexible width.
- App transition ownership: `script.js` exposes one action gate for Home, chapter, Exam, Quiz-mode, Admin, and delayed route changes. The first accepted action owns the transition until release; competing taps are ignored, browser history cancels stale delayed work, and the active native shell temporarily removes pointer interaction from conflicting launch controls without shifting their geometry.
- Aura chapter interaction: the installed-app carousel is the single expressive motion moment. While dragging, cards continuously scale and fade around the pointer position; edges add resistance and release velocity projects at most six chapter steps before the track settles. Vertical page scrolling remains native. Every card is a real roving-tabindex button, tap remains available, Arrow/Home/End provide keyboard selection, Enter/Space opens the selected chapter, cancellation never launches content, and reduced-motion removes the spring timing.
- Admin search and filters: the phone field is an emerald icon-led pill with no visible placeholder, while retaining a programmatic Italian name and explicit clear control. Users, Promo, In scadenza, Scaduti, and Duplicati use the same pill radius with green, violet, amber, red, and slate state accents; runtime values are owned by `style.css` under `.admin-toolbar` and consumed by the search, tabs, and utility actions.
- Admin user dataset: entry loads at most the 10 newest registrations. A labelled scope bar explains whether the current data is recent, searched, or complete; exact phone lookup stays remote, while `Carica tutti gli utenti` is the explicit opt-in for full-list filters such as Promo and Duplicati.
- Live quiz bilingual help: activating the Italian question toggles one inline glass panel directly below it in the existing question scroller. The shared `magic-styles.css` liquid-glass surface is neutral and transparent: a white reflection fading from 30% to 6% opacity, a fine graphite edge, inset highlights, 8px backdrop blur, and dark ink `#202936` with muted text `#526071`. Pills use the same clear material; no opaque blue/teal fill is used; `quiz-help.css` owns its natural-height content. The Bangla translation precedes real Italian keyword pills, each expanding its Bangla meaning and audio inside the same panel. Context tags use an optional disclosure. The quiz remains operable, Tab follows document order, Escape within the panel closes it, and focus returns only when it was inside the closed content. No backdrop, modal, dots, carousel, or separate floating window is used. Magic Styles preserves a shared live glass specimen.
- Live quiz question footer: figure, Italian question, and optional Admin recorder keep their semantic source order in the card’s dedicated scroll region. “Spiega” and the first-question help hint share a reserved, wrapping footer below it; neither uses overlay coordinates. The footer remains visible while long text scrolls independently and keeps important controls at least 44px tall.
- Quiz figure presentation: `api/quiz-figure-image.mjs`, reached through `api/asset.js`, is the single owner for every catalog figure shown in Quiz, quiz correction, Studia quiz, Statistiche/Errori, and Admin explanation tools. It removes only isolated, neutral digit-sized components on the upper-left label line, never a fixed rectangle. Lossless PNG output preserves the other decoded pixels; an uncertain label leaves the source figure intact. This runs before the image reaches CSS; therefore resizing, browser zoom, text zoom, orientation, and `object-fit` cannot reveal it. Original R2 objects and separate Admin metadata remain unchanged. Transformation failure is fail-closed and shows the owning surface's existing image fallback rather than an unprocessed figure.
- Admin quiz answer marker: only a server-authorized Admin session receives the private answer value. One small green marker sits below `Vero` when true is correct, or one small red marker sits below `Falso` when false is correct; ordinary learners receive neither the value nor reserved marker space, and assistive technology receives an explicit Admin-only text equivalent.
- Quiz timer continuation: the timer counts down through the normal duration for every role. At zero, a server-authorized Admin session changes to a `+0:00` elapsed-overtime display and continues until the Admin finishes or exits. A non-Admin session pauses at `0:00` and opens the shared timeout dialog; `Sì, continua` starts a fresh full-duration cycle while preserving total elapsed time, and `Chiudi quiz` returns to the menu without grading. The decision repeats after every completed cycle. Result summaries report the complete elapsed time.
- Quiz correction audio: every correction row—correct, wrong, or unanswered—keeps the existing person artwork as a labelled audio button. Audio remains demand-loaded after activation, one review explanation plays at a time, and unavailable audio returns the existing recoverable message.
- Magic Styles: `/libreria-font` remains the stable Admin-linked reference route, now labelled `Magic Styles`. Its live component collection preserves the Exam 80 glow card, chapter card, progress bar and shared loading indicator. Demonstration progress is explicitly labelled as an example; cards link to their real destinations. `magic-styles.css` owns the shared card/progress rules and the approved Exam 80 accent: a white reading surface, a top-right violet sparkle using `icons/magic-sparkles.svg`, and a restrained animated perimeter blending lilac `#c4b5fd`, rose `#fbcfe8` and mint `#a7f3d0` over nine seconds. Reduced motion keeps a static glow, forced colors retain a visible border, and keyboard focus remains explicit. This requested accent is reserved for highlighted actions rather than every card. The font specimen sheet contains three divided rows—Hadi Rounded, Adorsho Lipi, and Ekushey Lal Sabuj—and renders the same live Bengali sentence in each face for an honest comparison without image previews.
- Global offline notice: every application page loads the same blocking connection-loss alert. It uses one calm white Magic Book surface, the existing no-internet illustration, a textual waiting state, focus containment, and automatic recovery without a dismiss action while the browser remains offline.
- Learning shell: back, brand, labelled/icon-only responsive refresh, Statistics/Errori route switcher, freshness note, and one polite live status. Legacy fixed chrome is suppressed while this route owns the viewport.
- Statistics overview: answers correct, quizzes done, chapters started, items to review, and the real percentage from the recent window. Comparison copy is plain and threshold-based.
- Immediate action: exactly one useful action in the first viewport. Empty and insufficient histories get a quiz action; ready users get the first real plan action or a positive continue state.
- Progress groups: at most three chapters going well and at most three chapters to review; no duplicate metric wall.
- Chapter matrix: 25 compact cells with number, clamped title, explicit status, and optional review count. Status vocabulary is `Bene`, `Sta migliorando`, `Da ripassare`, `Pochi dati`, `Non iniziato`.
- Chapter detail: one selected chapter at a time, side-by-side on wide screens, sequential on tablet, and a focusable bottom sheet on phones; it shows attempts, quiz coverage, correct answers, recent result, review/recovered counts, and existing quiz/book actions.
- Error summary: `Da ripassare`, `Sta migliorando`, and `Recuperati` in one grouped strip.
- Error categories: five stable tabs — Figure, Quiz, Parole, Argomenti, Capitoli. Recovered items are a separate positive section, not a duplicated tab.
- Error master/detail: figures show the real authenticated numberless presentation; words retain dictionary access; detail copy states observed counts without causal diagnosis. Lists start at eight items and use `Mostra altri`.
- Review plan: one to three actions, total estimated time, and immediate CTA using the existing quiz, book, figure, or dictionary destinations.
- Recovered: up to three recent recovered items remain visible below active work.

## Data, states, and trust

- Admin authentication and device-bound authorization remain unchanged. Its read flow uses a bounded recent-list request, remote phone search, and an explicit complete-list request; the server still validates and normalizes phone data before forwarding it upstream.
- Empty, insufficient, ready, cached, refreshing, offline-cached, no-cache offline, expired access, timeout, and generic failure are distinct states.
- Empty/insufficient views stay compact and tell the learner exactly which quiz action is available.
- Cached data renders first; online data replaces it only after validation. Pending local responses remain identified without blocking the UI.
- Figures are lazy loaded, use a stable aspect frame, receive their numberless pixels from the shared asset endpoint, and expose a visible fallback without layout shift.
- Backend diagnostic labels and reasons are translated into simpler presentation copy; the underlying classification and calculations are untouched.

## Accessibility and validation

- Route entry focuses `#learningInsightsHeading`; background refresh does not steal focus. Re-rendered tabs, chapter cells, disclosure controls, and close actions restore focus.
- Tabs implement Left/Right/Home/End. Selected and expanded controls expose matching ARIA state/control relationships.
- Status is expressed with text and color. Interactive targets are at least 40–44px, focus is visible, and reduced-motion/forced-colors modes are supported.
- Long quiz questions and reader-size variants reflow before their action footer; no question utility may cover copy at 320px, browser zoom, or iOS text scaling.
- Verify 320, 375, 430, 768, 1024, 1280, 1440, and 1920 widths; capture 375, 768, 1440, and 1920 evidence.
- Verify empty, 1–9 answers, medium history, large history, figure failure, offline cache, expired access, timeout, and generic backend failure.
- No Unicode UI icons, fabricated sequences/charts, inferred causes, duplicate global chrome, or hidden horizontal overflow patches.
## Installed Android rotary study variant

- Scope: only `html.android-webview` on Home and chapter selection. Desktop/mobile browsers and installed browser PWAs never mount the template. Other Android routes retain their existing palette and layouts.
- Evidence: owner-supplied 2026-09-08 mockups and explicit instructions. This variant intentionally permits half-circle cropping, the supplied traffic-line/roundabout divider, a soft book animation and a liquid progress indicator. It supersedes older color-only/no-decoration directions on these two screens, not elsewhere.
- Runtime owners: `android-study-shell.css` owns visual tokens/layout; `android-study-shell.js` owns DOM/lifecycle; `android-rotary-model.mjs` owns bounded direct manipulation. `script.js` still owns routes, selected chapter, the exclusive action gate and authorization. No second navigation or permission model.
- Composition: quiet white-to-light-gray Home, fixed 44px greeting viewport, original `icons/mg_book.svg`, no CSS shadow/filter. Book opens chapter selection. Chapter frame clips the left photo and right solid-black dial into opposing half-circles; selected 01–25 sits in a fixed 64×44px slot in their gap, with a 64×44px Vai action directly below it. No white dial core or internal orbit line. Four requested English-labelled controls remain Study Quiz, Do Quiz, Dictionary, Exam; supporting and accessible copy is Italian. Statistics and Errors follow the exact three supplied divider SVGs.
- Dock: black pill, real quiz-coverage liquid track on the left, existing Profile and authorized Admin controls on the right (the explicit written placement takes precedence over the mockup). Original elements are moved, not copied; event handlers and permissions are preserved. Profile remains the existing phone/logout popover, with the app-only animation preference.
- Tokens (model B): `--native-canvas #FFFFFF`, `--native-ink #202023`, `--native-wheel #000000`, `--native-dock #101114`, `--native-blue #076AE0`, `--native-muted #595B63`, `--native-line #777982`. Blue is slightly darker than the supplied image to retain readable white button copy. Empty image gray `#ECEDEF`, hover gray `#EDEEF0`, liquid body `#9CC6FF` and two wave tints `#CEE2FF`/`#E2EEFF` are distinct supporting roles. Semantic error/success colors on existing routes do not change.
- Type: self-hosted, unmodified Norwester v1.2 (SIL OFL 1.1) for short Latin display/action labels; Arial/system body for smaller explanatory copy. No extra bolding of Norwester. License accompanies the WOFF in `assets/fonts/norwester`.
- Behavior: one captured pointer, 33-degree detents with a 0.08-step midpoint deadband, no inertia or wrapping, clamp 01–25, per-selection haptic and a double boundary pulse. Numbers ascend top-to-bottom and move with the finger, not against it; the selected value appears only in the gap. The owner removed separate previous/next buttons and visible rotation instructions. Tapping a number on the same wheel and Arrow/Home/End/Page keys remain non-drag alternatives; a gesture moving more than 6px cannot become a tap on release. No chapter opens on drag release/cancel. Resizing ends the current gesture. Canonical action gate rejects simultaneous route actions; returning from page cache restores the same selected chapter and dock.
- Haptics: Android `MagicBookHaptics` accepts only selection/boundary from the exact trusted HTTPS main frame, honors system haptic settings, cancels delayed feedback on navigation/destruction, and exposes no arbitrary vibration duration. Browser vibration is best-effort fallback only. Native changes require an updated installed shell; physical feel is a device QA item.
- Motion: 5s gentle book float, restrained liquid wave. Home greets once per entry with `Assalamu alaikum`, the phone-local-hour greeting (05:00–11:59 Buongiorno, 12:00–17:59 Buon pomeriggio, otherwise Buonasera), then `Ciao!`; a 9s Norwester rail slides upward through one fixed line. The supplied `icons/clich_here.svg` rises toward the book, briefly compresses like a tap and fades, on a 10s cycle. The supplied bent up/down arrows cue rotation on a restrained 6s fade/translate cycle, then disappear after using the wheel. Gesture images are decorative and never intercept input. The optional animation control remains in Profile; reduced-motion/paused preference shows a static time-of-day greeting and gesture icons. Hidden/background pages pause motion. No written gesture hint on screen and no added book shadow.
- Progress definition: `summary.quizCoveragePct` against `dataQuality.catalogQuizCount` from the existing authenticated learning-insights model. It means unique quiz questions encountered, not chapters read, mastery or exam readiness. Unknown/error is an em dash, genuine zero is 0%, saved data is marked. Requests are user-scoped, abortable and stale-protected; no fake fill while loading.
- Asset gap: original chapter-photo mapping is not yet located. `assets/native-chapter-covers.json` is the explicit approved-photo map; an empty/missing/failed image uses a stable honest fallback. Do not silently substitute unrelated legacy card illustrations or protected book pages.
- Layout: main chapter canvas max540px, intentionally cropped circles only. One content viewport ends 12px above the measured dock; safe-area and resize changes update the reservation. Caption is exactly 60px with a 48px text slot; Norwester title fits between 18px and 13px, cached by text and available dimensions, remeasured after font readiness. Long text never resizes the wheel, number or action positions. Exceptionally enlarged text remains readable in that slot's overflow without moving other content. The circular stage uses remaining space (minimum144px, maximum min(78vw,421px)). Six actions fit without scrolling across 320×568 through normal tall portrait sizes, including all 25 titles. Controls use 48px/64px heights (primary/supporting), compact 44px/52px below 620px viewport height. Unusually short windows, landscape and enlarged text scroll above the dock. CSS scope never changes normal website geometry.
