# Shared figure details

## Data and provenance

`figure-catalog.mjs` is a small, static, public identity catalog. It covers the
186 distinct valid figures currently used by the local MagicBook/Exam bank,
after `api/quiz-figure-corrections.mjs` is applied. It contains no quiz questions,
answers, user data, access tokens or remote lookup code.

Italian identities were checked against the numbered figures and topic headings
in [NECA's published AB quiz list](https://www.neca.it/assets/pdf/ListatoAB.pdf),
version 27 February 2025, consulted 18 September 2026. Each catalog entry has its
one-based PDF page for review. These are **quiz-list figure IDs**, not the numbered
figures in the road-code regulation. For example listato fig40 is *Dare precedenza*.
Source page is provenance, not a runtime dependency; the PDF is not shipped.

Bangla names are editorial translations, not official source labels. Native-speaker
review remains advisable. Diagrams and combined panels use descriptive names;
intersection labels deliberately do not disclose which vehicle goes first.
No name is inferred from the quiz proposition, which may be false.

When adding a figure, verify the actual image and listato identity, add an Italian
name and Bangla translation, record the source page, and bump the catalog version
in the viewer and service worker. Unknown future figures still open, with an honest
name-unavailable message; the brand placeholder does not open a figure dialog.

## Interaction ownership

- `figure-detail.js` enhances standalone images in live Quiz/Exam, review, Studia
  quiz, learning details and Admin question details. Existing actionable list
  thumbnails keep their selection/assignment behavior; their detail image is
  the zoom target. Book page protection and covers are outside this feature.
- `app-popup.js` is the shared Home/login/figure modal owner. Its classic script
  must load **before route scripts**, so its history dispatcher consumes only an
  active layer's Back event before Study/Quiz/Home navigation listeners.
- The viewer moves the existing image node into the dialog, preserving its source,
  listeners and decoded pixels. A measured spacer holds the original layout.
  Dismissal returns that exact node, focus and scroll position: no route render,
  data request, restart of audio, or answer/search state changes.
- X, Escape, backdrop and Android/browser Back dismiss only this viewer. Other
  modal layers remain inert while it is open and resume their previous state.
  Offline notices and quiz question/help changes close stale figures first.
- White centered card, no visible figure number/header, original image without
  cropping, Italian name and Hadi Rounded Bangla title. The bottom-right X uses
  the existing `native-action-scallop.svg` decorative mask and a 48px touch target.
- Entry animation respects system and native Profile motion preferences.
  Background isolation, keyboard trapping, focus restoration, safe areas and
  bounded internal scrolling reuse the shared authored-dialog contract.

## Related compact-study correction

`audio-player-ui.css` owns a named Study-only compact variant, shared by browser
and installed Android: 44px controls, 36px artwork, no padded/glowing outer pill.
Playback, seeking, speed order and interruption behavior remain unchanged.
`android-app-theme.css` gives the help action an explicit primary/on-primary pair
after the generic white action rule, fixing white-on-white text.
Loaders use shared panel/page sizes (64–88px / 88–112px), no raised GIF card, and
small rounded image corners on nonwhite surfaces. White full-page Quiz loading
retains its flat white canvas. The new assets and every modified CSS owner have
versioned URLs in the PWA cache; auth, APIs and answer data are unchanged.

## Release checks

Run `node --test tests/*.test.mjs` and `npm run build:css`. Browser regression must
open/close repeatedly via X, Escape, backdrop and Back, checking identical DOM,
viewport/ancestor scroll, help state, focus and request counts. Check narrow/large
screens, reduced motion, failed/unknown figures, nested translation/review layers,
contrast and seeking/rate controls. Physical Android Back and iOS Safari remain
device smoke checks. Deployment is a shared-web release; this change itself does
not alter the native APK or Google Apps Script.
