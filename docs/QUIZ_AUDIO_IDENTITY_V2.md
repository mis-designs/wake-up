# Quiz audio identity V2

Magic Book usa lo stesso contratto audio V2 di All Books.

## Regola

L'identità di una spiegazione è calcolata da testo italiano normalizzato e figura canonica. Di conseguenza:

- stesso testo e stessa figura nei due sistemi: un solo audio condiviso;
- stesso testo ma figura diversa: audio distinti;
- domanda senza figura: figura canonica `none`.

La chiave è `q2_<sha256>` e le nuove registrazioni vengono salvate sotto:

`quiz-explanations/v2/<quizKey>/explanation.webm`

## Protezione degli audio precedenti

Gli audio legacy non ambigui restano disponibili e possono essere migrati automaticamente. Quando lo stesso testo esiste con più figure, l'audio legacy viene bloccato per gli utenti e compare nel "Controllo sicurezza" della pagina admin. L'admin ascolta l'audio e sceglie la figura corretta tra tutte quelle realmente presenti nei cataloghi All Books e Magic Book.

La procedura non cancella né sovrascrive l'oggetto audio esistente in R2.

## Coordinamento

I file seguenti devono rimanere identici nei due repository:

- `quiz-audio-identity.cjs`
- `quiz-audio-identity.js`
- `data/quiz-audio-legacy-collisions-v1.json`

Pubblicare Magic Book e All Books nella stessa finestra di rilascio. Non serve una nuova tabella Neon: entrambi continuano a usare `quiz_audio_explanations` nel database condiviso.

## Riconciliazione con il catalogo corrente

Prima di mostrare le possibili figure per un audio legacy, All Books confronta il registro statico con il proprio catalogo completo e rimuove le figure che non esistono più. Magic Book applica la stessa verifica al catalogo live, mantenendo anche tutte le figure certificate dal catalogo All Books. Figure di prova o valori rimossi successivamente dal database non vengono più proposti all'admin. La riconciliazione modifica soltanto le opzioni visibili: non cancella e non sposta alcun audio finché l'admin non conferma l'associazione.
