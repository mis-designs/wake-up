# Video Class — implementation and source audit

Owner request:23 September2026. Implemented locally; no deployment, main-repository commit or Play Store release is implied.

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
