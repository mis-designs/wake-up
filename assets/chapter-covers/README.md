# Native chapter artwork

Source: the existing public All Books `quiz_cards/Capitolo_01.png` through `Capitolo_25.png`, requested by the owner for this Android UI on 2026-09-08. All Books originals are untouched.

The chapter mapping follows All Books `script.js` `QUIZBOOK_CHAPTERS`, checked against Magic Book's `CHAPTER_TITLES`: road definitions/duties; danger; prohibition; obligation; priority; road markings; traffic lights/agents; information signs; temporary/complementary signs; supplementary panels; speed; safety distance; vehicle position/circulation; priority/intersections; overtaking; stopping/parking; motorways; lights/horns; helmets/belts; licences/documents; accidents; alcohol/drugs; liability; fuel consumption; maintenance.

Run `node scripts/build-native-chapter-covers.mjs <All-Books-quiz_cards-directory>` to regenerate. The build only resizes and re-encodes to 640px-wide WebP; it does not invent, redraw or crop artwork. CSS frames the illustration above the original baked-in title and action. Visible current chapter names and the real Vai action stay outside the image.

These are public navigation illustrations, not protected book pages, exam figures, or correct-answer content. Only the selected card is requested. The existing service worker caches successful same-origin requests; unseen cards are not bulk-downloaded during installation. The manifest remains explicit in `assets/native-chapter-covers.json`.
