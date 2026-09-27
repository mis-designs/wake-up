# Animazioni sopra Magic Here

Mettere qui gli originali: GIF, SVG, PNG, JPG/JPEG, WebP, AVIF o TIFF.
Non rinominare i file in base a una sequenza: la raccolta viene generata dalla cartella.
Gli originali non vengono modificati. Non aggiungere dati privati: queste immagini sono pubbliche.

Dopo aggiunte o sostituzioni, prima della pubblicazione:

```
npm run build:home-animations
```

Il comando genera `assets/home-animations/catalog.mjs`, le immagini ferme e i riferimenti
aggiornati per la cache. Per gli SVG animati usa Edge e Playwright, come i test browser
del progetto (`PLAYWRIGHT_PATH` se Playwright è fornito dall'ambiente di sviluppo).
`tests/home-animation.test.mjs` verifica che cartella, immagini generate e cache coincidano.

La Home web sceglie l'immagine successiva a ogni nuovo ingresso/refresh. L'animazione
continua in ciclo finché la Home è attiva; con movimento ridotto mostra direttamente
l'immagine ferma. In background viene sospesa e al ritorno riprende senza un nuovo
caricamento. Una sola immagine visibile, mai sovrapposta alla copia ferma.
Nessun pulsante pausa. Il libro e Magic Here restano utilizzabili
anche se un'immagine non si carica. La Home nativa Android mantiene il proprio layout.
