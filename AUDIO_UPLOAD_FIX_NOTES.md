# Correzione caricamento audio Magic Book

## Problema osservato

Su alcuni dispositivi, soprattutto durante il caricamento da Safari/iPhone, la registrazione restava disponibile nel pannello ma il salvataggio su R2 falliva. Il pannello mostrava correttamente l'audio locale e il pulsante per riprovare.

## Causa

La firma R2 veniva generata con l'header `Content-Type: audio/webm`, mentre il browser inviava il valore restituito da `MediaRecorder`, ad esempio `audio/webm;codecs=opus`. Per un upload firmato questi valori non sono intercambiabili: la firma viene quindi rifiutata da R2.

## Correzione applicata

- Il server Magic Book usa ora `audio/webm` come tipo canonico per gli upload audio.
- L'endpoint di upload firmato restituisce il `Content-Type` da usare.
- Il client invia esattamente quell'header alla richiesta `PUT` verso R2.
- Dopo la conferma, il tipo audio salvato nel database viene ricavato dall'oggetto caricato.
- In caso di errore il draft locale non viene eliminato: il pulsante **Salva** può riprovare usando la stessa registrazione.

## Verifica

- `node --check api/quiz.js`
- `node --check aggiungi-spiegazioni.js`
- `node --test tests/*.mjs` — 13 test superati

## Permesso microfono

La richiesta viene eseguita esclusivamente dal clic sul pulsante microfono, così il browser può mostrare il proprio popup nativo quando il permesso è ancora da decidere. Se l'utente ha già bloccato il microfono per il dominio, il sito non mostra un secondo popup interno: lascia un messaggio nel pannello e indica di usare il lucchetto del browser scegliendo **Consenti**.

È stato inoltre corretto l'header `Permissions-Policy`: il valore precedente `microphone=()` disabilitava completamente il microfono e impediva al browser di mostrare qualsiasi richiesta. Ora il sito usa `microphone=(self)`.

La cache del service worker è stata incrementata per eliminare le pagine eventualmente salvate con il vecchio header. Anche il riferimento allo script principale è stato aggiornato, così il nuovo service worker viene rilevato senza dipendere dalla copia precedente. La pagina admin viene inoltre esclusa dalla cache e configurata su Vercel con `no-cache`, così riceve sempre l’header corrente. Dopo la pubblicazione il nuovo service worker deve attivarsi prima di riprovare.

## Pubblicazione

La modifica è locale nel progetto Magic Book. Dopo il controllo su un dispositivo mobile, pubblicare il progetto su Vercel e fare un aggiornamento completo della pagina.
