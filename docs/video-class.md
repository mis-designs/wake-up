# Video Class — implementation and source audit

Owner request:23 September2026. Implemented locally; no deployment, main-repository commit or Play Store release is implied.

## Follow-up: watched progress and simpler presentation

### Entry/cards and loading correction

Latest owner correction: Video Class must use the full original landscape, not the earlier68/32 dark-column/portrait split. `video-class.css` now places the unchanged1200×675 image at full card width with intrinsic height and contain sizing. Copy overlays only its quiet left area; no dark/native-blue filler or gradient. Enlarged text may grow the white card without stretching/cropping the image. The quiz card and all routing/playback/storage behavior remain unchanged. Cache217 / video stylesheet4 ship this correction.640 tests pass; browser assertions cover intrinsic ratio, full width and absence of dark overlay in both web and native themes.

The owner's later marked screenshots supersede the original hub density: section-only Studia header, compact side-by-side copy/artwork inside each phone choice, desktop two-column choices retained, concise Capitoli heading and visible interactive chapter links. Removed the repeated slogans and document-provenance copy from the learner UI; source accounting below remains unchanged.

Two confirmed presentation drifts: the hub referenced an older560×700 `teacher.webp` while the owner had replaced its PNG with a1672×941 landscape picture; the video loading markup omitted the canonical indicator parent, leaving its media size undefined. The new derivative preserves the latest original at1200×675; its source-hash URL is shared by hub, neutral covers and worker precache. The loader now uses the full64–88px shared panel variant, rounding its white GIF on the tinted canvas without rotating/sizing the whole page. No new network or storage behavior.

For every card-image replacement run `npm run build:video-card` before release. It regenerates only the optimized image/provenance manifest and mechanically updates its three image URL consumers plus the screen-module import chain. This avoids reusing cached JavaScript that still embeds the old image URL. Tests reject stale source/output hashes, consumer URLs or import-chain versions. Source PNG remains untouched. This command does not deploy or publish anything; the normal newer client/cache release still applies to UI changes.

Local verification for this correction:639 unit/regression tests pass; CSS build, DESIGN lint and strict premium audit pass. Browser fixtures cover1440/1920/768/375/320px web and375/740px native themes, actual image decoding, pending64–88px rounded loading, keyboard focus, unchanged one-read catalog budget, favorites/progress and failure/retry.375px also covers200% text, forced colors and a broken decorative portrait with operable routes. No production traffic, deployment or physical Android/Safari playback claim. Cache epoch216 and versioned UI/import/artwork URLs release together.

The23 September follow-up supersedes the initial sample covers and autoplay setting below. The header contains only Back and Video Class, no brand/subtitle/quiz shortcut. Preferiti · Salvati explicitly identifies the existing saved collection. Source captions are preserved as `sourceTitle`, explicit teachers as `teacher`; first-chapter untitled theory links use Teoria · Parte in document order. END after a numbered sequence is shown as its final part. Duplicate Quiz references are combined visibly (e.g. Quiz1 /2), never additional videos. Vocabulary part numbers, source order, all166 YouTube identities and the Facebook entry remain unchanged.

The owner's `icons/video_section_theory.png` and `icons/video_section_quiz.png` are used via1200×675 WebP derivatives,124416/114872bytes. PNG originals are untouched. Theory/mixed use the theory image; quizzes use the quiz image; vocabulary/guides keep the existing neutral artwork. These replace the initial Road Basics/Danger Signs samples in the live library without deleting those earlier assets.

Watched progress is local-only, not historical YouTube-account history or cross-device sync. `video-progress.mjs` stores only allowed video IDs, actual provider duration, disjoint watched ranges and update time in `magicbook-video-progress-v1:<account+device scope>`. At most250 records,128 ranges per video and1MiB input/output; the smallest fragments are discarded if fragmentation exceeds the bound, never joined over unseen gaps. Retention matches the saved lesson feature: until browser/app data is cleared (or capacity eviction); no new external-storage permission. Blocked/corrupt/quota storage remains memory-only with a concise visible note. No tokens, catalog, titles or quiz answers are copied here. Tabs merge coverage on storage events and before writes; underlying localStorage is best-effort, not a transactional cross-tab database.

The percentage is floor(union of observed segments / actual YouTube duration ×100). A repeated segment is counted once; seek gaps, non-playing state, hidden pages, implausible jumps and sample gaps over2.5seconds are not credited. Playback speed is considered; a rate change starts a fresh baseline. The quarter-second-scale sampling tolerance handles provider timing jitter, not a promise of gaze/attention measurement. Ended is not completion by itself; only full measured coverage displays100%. Source handout minutes never form the denominator. No past viewing is reconstructed.

Network/lifecycle budget: Watch creates one privacy-enhanced iframe with autoplay1 and autoplay permission, then loads `https://www.youtube.com/iframe_api` at most once concurrently per document; the provider may load its own supporting script/media. The API has a12-second deadline, player-ready15seconds; no automatic retry. The resolved API remains document-scoped. A pending shared script may finish after navigation, but stale consumers create no player or timer. No provider reads on list/lesson entry. CSP adds only `https://www.youtube.com` to script-src; frame origin remains nocookie, no wildcard/new API endpoint. Local1-second samples run only during active visible playback; persistence is batched at5seconds and flushed on pause/navigation/background/pagehide. Navigation removes the player, invalidates late callbacks, and stops sampling. Playback failures preserve progress and expose small YouTube fallback; blocked autoplay retains visible controls and explains the needed touch. Older native shells and external Facebook/YouTube viewing cannot be measured and do not fabricate progress.

Verification: `tests/video-progress.test.mjs` covers union, replays, jumps, pauses, speed, hidden/long gaps, duration, fragment/storage bounds, quota/corruption, account separation, two-tab merging, source naming and autoplay/CSP. The local YouTube API fixture verifies one-click start,20% then30% coverage, seek/replay/pause invariance, persistence/reload, request counts and layout. It does not establish live-provider or physical Android playback availability. Official API reference: [YouTube IFrame Player API](https://developers.google.com/youtube/iframe_api_reference).

## Entry and canonical ownership

`/studia-quiz` is the Studia hub. `?view=chapters` preserves the existing chapter picker and chapter deep links. `?view=videos` is the new library; group, lesson, kind and saved are URL state. Existing Study owns Back, authentication, trial exclusion, toasts and header. The header remains Video Class inside the library. Browser Back restores bounded list scroll/count and the originating lesson focus. Segnali e figure remains Android-only.

`video-class.js` is the screen owner; its model owns filtering, favorites, safe URLs and private in-memory retrieval. No parallel design system, carousel library or new global store. `video-class.css` uses Study/native tokens, existing fonts, explicit focus, reduced-motion and forced-colors support. The shared Study scrollbar baseline covers the horizontal rail without requiring opt-in classes.

## Exact source accounting

Source: the owner's pasted student handout attached23 September2026. Its greeting, private contact details and marketing copy are not application instructions and were not imported. A separate extraction of every YouTube ID in source order is recorded in `video-class-source-ids.json` and compared to the server catalog by tests.

- 174 YouTube occurrences,166 distinct YouTube videos.
- One Facebook video from chapter20, explicitly opened on Facebook.
- Two useful external resources in Guide alle app.
- 25 chapter groups, Parole da imparare and Guide alle app.
- Eight repeated occurrences retained as aliases of their first canonical video: TZPZlTNd4IA, z8uwbe-qccs, KtF81j7pyPM, MDE8JOh5CPg, tr6zLat8F5Y, Sa4oMMmQ3EU, _jJyRWSN2RA and uxra5oJQ_FU.

Only accidental URL whitespace and tracking parameters were removed; hyphens and case within IDs are unchanged. Titles, teacher names and explicit durations follow the source. Where no topic title exists, use Lezione/Parte and its document order; do not invent a subject or duration. The trailing57-minute note in chapter24 is ambiguous and not attached to a guessed video. Chapter22 is Primo soccorso in this handout even though another quiz taxonomy differs. Mixed theory/quiz videos appear in either relevant filter.

No bulk YouTube availability scan was run. Provider-deleted/private/age-restricted/embed-disabled videos may not play; the external link is always available. These links are controlled by the source author, not by Magic Book. An authenticated viewer can necessarily inspect an unlisted URL they are allowed to play: this is access control, not DRM.

## Request budget and privacy

| Trigger | Maximum work owned by Magic Book | Cache/cancellation |
| --- | --- | --- |
| Open Studia hub |0 catalog requests | Only public images/styles |
| Enter Video Class |1 getVideoClasses request | Existing access validation; valid signed token requires0 upstream lookups; HTTP/CDN no-store |
| Move between chapters, filters, favorites, lessons |0 fresh catalog requests within5-minute lease | One in-flight request, user+device identity-bound memory only |
| Lease expired and user navigates |1 catalog request |12-second abort deadline; late result rejected |
| Load failure |0 automatic retries | Explicit Riprova only |
| Scroll/list pagination |0 API/provider metadata calls |12 initial tiles, local expansion; lazy public images |
| Press Watch |1 iframe created; YouTube owns its subsequent media requests | No iframe before click, autoplay0; one frame at a time |
| Leave/change lesson/background/pagehide/account |0 new requests | Remove player; cancel pending app reads; no background playback/automatic resume |
| Save/remove favorite |0 server writes | IDs only; bounded local storage; other-tab changes reconciled |

The server catalog is not shipped in the static client, service-worker cache or a trial endpoint. Its helper module returns404 on direct invocation. Public cover images contain no video URLs/IDs. Source/audit documents are excluded from production deployment. CSP permits only the exact privacy-enhanced YouTube frame origin in addition to the existing sources. The iframe sends only the site origin as referrer, not the private route/query/token.

Favorites use `magicbook-video-favorites-v1:<account+device scope>` with validated IDs, a maximum250 entries and a32KiB input bound. They persist until explicitly removed or the browser/app data is cleared; they are not cross-device synchronization. Storage unavailable/corrupt/full falls back to memory with clear copy. The five-minute private catalog is not persisted. Existing quiz storage/retention/grading are untouched.

## Assets and editorial approval

Prompt set (compact reproducible specifications; built-in ImageGen, not CLI):

1. **Road Basics** — Use case: ads-marketing. Asset:16:9 driving-school lesson cover. Identity reference: supplied `video_section_card_image.png`; preserve the man's recognizable face, short dark hair, short beard and navy suit. Compose a waist-up right-hand portrait gesturing toward one clear road on the lower left, with a white lane divider. Forest/charcoal background, restrained lime accent. Exact headline: ROAD BASICS, bold condensed white/lime, left-aligned, clearly readable at thumbnail size. No extra characters, small text, logos, decorative clutter or complex traffic scenes.
2. **Danger Signs** — Use case: ads-marketing. Asset:16:9 driving-school lesson cover. Use the same supplied likeness, now chest-up on the left, navy suit, gesturing toward one accurate upright red-bordered white triangle with black exclamation mark on the right. Light gray/white background, restrained red framing shape. Exact headline: DANGER SIGNS in large bold condensed red/black lettering. Few elements, clean hierarchy, recognizable face and undistorted sign. No extra signs, small captions, logos or clutter.

- Supplied portrait: `icons/video_section_card_image.png`, compressed as `assets/video-class/teacher.webp` for the hub and neutral lesson template.
- Supplied save_before/save_after/link_interface SVGs and favorite_section_icon_heart PNG reused unchanged.
- Two image-generation samples only: `road-basics.webp` and `danger-signs.webp`,960px wide and roughly60/51KB respectively. Generated with the built-in ImageGen tool using the supplied portrait as the identity reference; WebP conversion/resizing only afterward with Sharp.
- Road Basics brief: preserve the man's face/hair/short beard/navy suit; waist-up portrait on the right, large condensed white/lime ROAD BASICS on the left; forest/charcoal background and one clear asphalt road with a white divider; no logos, tiny captions or clutter.
- Danger Signs brief: same likeness on the left, navy suit, gesturing toward one upright red-bordered white warning triangle with a black exclamation mark; light background with a restrained red shape; large short DANGER SIGNS headline, no extra signs or clutter.
- Covers are illustrative brand art, not automatically inferred video contents or speaker identification. Additional individualized thumbnails await the owner's direction. Automotive instruments/blinks/sounds are deliberately not included.

## Android integration

The separate `Documents/MagicBookViewer` shell previously opened non-MagicBook iframe navigations externally. Its new `VideoFramePolicy.kt` permits only exact approved HTTPS subframe origins inside the trusted main site, without routing arbitrary frames into external apps. Explicit top-level external links keep the existing Android handler. Non-user-gesture popups are refused. Native video custom-view enter/exit uses the existing safe viewport, Back closes video first, and navigation/background/recovery/disposal clears the view. Existing TLS/offline/capture/haptic policies remain unchanged.

The new shell advertises `MagicBookVideo/1` in its user agent. Browsers and capable shells embed. Already-installed older wrappers display Guarda su YouTube and deliberately open the provider instead. Catalog, saved lessons and the next-video rail remain available in either version. A newly signed version-code release is necessary to install the native fix; no AAB/APK/version bump was produced here.

## Verification and release gates

- `node --test tests/*.test.mjs` includes source-identity, alias/count, private API/auth/no-store, URL/provider, bounded retrieval, abort/stale, storage corruption/quota/isolation and legacy-shell fallback tests.
- `scripts/video-class-browser-qa.mjs` runs only local fixtures, blocks external traffic and captures hub/catalog/list/player/empty states for web and native-themed viewports. Screenshots wait for local image decoding. It verifies request/frame counts, navigation, preferred lessons, refresh, immediate removal, retry, chapter access and web figure exclusion.
- CSS build, DESIGN lint, strict premium audit and diff whitespace check are required before handoff. Android `:app:testDebugUnitTest --offline` compiles the changed shell and runs its policies.
- Real YouTube playback/fullscreen, embed-disabled examples, Safari/iPad and a physical Android device are still release-acceptance checks; mocked browser tests do not establish provider availability. No production account/session traffic is used by these tests.

Official references: [YouTube player parameters](https://developers.google.com/youtube/player_parameters), [YouTube client/referrer requirements](https://developers.google.com/youtube/terms/required-minimum-functionality), [Android WebView navigation](https://developer.android.com/reference/android/webkit/WebViewClient#shouldOverrideUrlLoading(android.webkit.WebView,%20android.webkit.WebResourceRequest)), [Android video custom views](https://developer.android.com/reference/android/webkit/WebChromeClient#onShowCustomView(android.view.View,%20android.webkit.WebChromeClient.CustomViewCallback)).
