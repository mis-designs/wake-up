# Correzione player audio Magicph

Data: 26 luglio 2026

## Problema

Su alcuni audio WebM il browser riproduceva il file ma non esponeva subito una durata numerica. Il player mostrava quindi il cursore all'inizio e non consentiva un seek affidabile.

## Correzione

- `api/quiz.js` restituisce la durata salvata nel database sia nello stato audio sia nell'header `X-Audio-Duration-Ms` del file.
- Il player prova prima l'URL firmato R2, che mantiene il normale supporto HTTP al seek; se il browser blocca il dominio R2, passa automaticamente al caricamento Blob già supportato.
- `quiz.js` e `aggiungi-spiegazioni.js` usano la durata nativa del browser quando disponibile e la durata del database come fallback.
- Il cursore viene aggiornato con gli eventi media e con un aggiornamento continuo durante la riproduzione.
- Il trascinamento imposta `currentTime` usando la durata effettiva/fallback.
- La riproduzione attende i metadati prima di chiamare `play()`.
- Il player utente e quello admin seguono lo stesso comportamento; gli errori restano mostrati nel dialog interno.

## Cache

- `quiz.html`: `quiz.js?v=37`
- `aggiungi-spiegazioni.html`: `aggiungi-spiegazioni.js?v=5`

## Verifica dopo pubblicazione

1. Aprire un quiz con audio e premere Play.
2. Verificare che la pallina avanzi mentre l'audio procede.
3. Trascinare la pallina avanti e indietro e verificare che l'audio cambi posizione.
4. Mettere in pausa, riprendere e cambiare velocità.
5. Ripetere nella pagina admin e su uno schermo mobile.
