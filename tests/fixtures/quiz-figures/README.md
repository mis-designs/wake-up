# Quiz figure regression fixtures

Original, unmodified catalog images retrieved on 2026-09-08 from the public asset bucket already referenced by the All Books project:

`https://pub-21131aa867534601af79c34beb746fb7.r2.dev/Figure/fig{number}.jpg`

- 40: reported yield-sign corner clipped by the former fixed mask.
- 698: monochrome double triangle.
- 704: high-resolution monochrome temperature symbol.
- 552: grey road diagram.

Tests remove only the label and compare all remaining decoded pixels against these originals.
