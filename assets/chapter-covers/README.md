# Native chapter artwork

Source: the existing public All Books `quiz_cards/Capitolo_01.png` through `Capitolo_25.png`, requested by the owner for this Android UI on 2026-09-08. All Books originals are untouched.

The chapter mapping follows All Books `script.js` `QUIZBOOK_CHAPTERS`, checked against Magic Book's `CHAPTER_TITLES`: road definitions/duties; danger; prohibition; obligation; priority; road markings; traffic lights/agents; information signs; temporary/complementary signs; supplementary panels; speed; safety distance; vehicle position/circulation; priority/intersections; overtaking; stopping/parking; motorways; lights/horns; helmets/belts; licences/documents; accidents; alcohol/drugs; liability; fuel consumption; maintenance.

Run `node scripts/build-native-chapter-covers.mjs <All-Books-quiz_cards-directory>` to regenerate. The build only resizes and re-encodes to 640px-wide WebP; it does not invent, redraw or crop artwork.

For the Android ring, run `node scripts/build-ring-jackets.mjs <All-Books-quiz_cards-directory>`. This creates the full-resolution gallery derivatives in `ring/` from the same public originals and records them in the manifest. The measured margins remove the surrounding paper. The original printed frame, illustration, title and action remain intact.

The gallery loads the current jacket and its two neighbors. Visiting a new chapter fetches only unseen images, and each decoded jacket is reused within the page. A failed image leaves a numbered title card that still opens the reader. The service worker does not precache the set of jackets.
