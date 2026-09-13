# Correzione Learning Sync — 13 settembre 2026

## Stato

Correzione preparata nel repository locale. Non pubblicata su Google Apps Script
o Vercel. Nessuna richiesta di prova ha scritto nel database di produzione.
La versione 8 pubblicata su Google non è stata scaricata/confrontata: prima di
sostituirla verificare che sia il progetto Learning Database corrispondente a
questo sorgente, senza personalizzazioni presenti solo nell'editor Google.

## Problemi e correzioni

- `magicbook_learning_db.gs`: la sincronizzazione scaricava l'intera colonna
  storica `event_id` ad ogni lotto. Ora una sola ricerca TextFinder per foglio
  seleziona gli ID del lotto (massimo 25); si leggono solo le celle corrispondenti,
  raggruppandole in un'unica lettura quando sono adiacenti.
  La ricerca considera ancora TUTTO lo storico, anche dopo un riavvio: non usa
  una cache scaduta come prova di salvataggio e non elimina la deduplicazione.
  Questo riduce i dati trasferiti a Apps Script, non trasforma Sheets in un
  database indicizzato: il tempo reale della ricerca va misurato dopo il deploy.
- Larghezza, ultima riga e intestazioni vengono lette una volta per foglio,
  non per ogni risposta. Scrittura ancora in blocco, una `setValues` per foglio.
- Solo la sincronizzazione web aspetta il lock fino a 1 secondo invece di 5;
  quando occupata chiede un nuovo tentativo dopo almeno 15 secondi. Il client
  mantiene gli eventi in coda e il backoff progressivo. Nessun loop server.
- `SpreadsheetApp.flush()` precede il rilascio del lock quando si tenta una
  scrittura, anche in caso di errore parziale. Il lock viene rilasciato anche se
  il flush fallisce. Schema, ID eventi e protezione contro formule restano uguali.
- `api/learning-sync.mjs`: attesa Google portata da 12 a 30 secondi, coprendo
  anche la lettura del JSON grazie al nuovo helper `fetchUpstreamJson` in
  `api/upstream-fetch.mjs`. Gli altri consumatori del vecchio helper mantengono
  il loro comportamento.
- `vercel.json`: limite di 35 secondi soltanto per `api/learning-sync.mjs`.
- `learning-sync.js`: attesa client di 40 secondi; resta inferiore ai 120 secondi
  che rendono recuperabile un evento rimasto nello stato `sending`.
- `index.html`, `quiz.html`, `study-quiz.html` e `service-worker.js`: solo nuova
  versione del file learning-sync (`v=4-sync-deadlines`) e cache PWA v200, per
  distribuire il codice aggiornato anche ai dispositivi con cache precedente.

Non sono cambiati UI, autenticazione, token, pagamenti, utenti, correzione quiz,
schema dei fogli, URL o proprietà segrete. Nessun dato viene cancellato.
Le altre ottimizzazioni già presenti nel worktree sono preservate.

## Come aggiornare Google Apps Script

1. Aprire il progetto del **Learning Database**, quello delle esecuzioni
   `doPost` versione 8. Non sostituire gli script di login/pagamenti o
   `promo-access.gs`. Il file attuale deve contenere `syncLearningEventsBatch_`
   e `LEARNING_DB_ID_PROPERTY_ = 'MAGICBOOK_LEARNING_DB_ID'`.
2. Conservare una copia del codice Google attuale e annotare la versione attiva.
   Se contiene modifiche non presenti nel sorgente locale, confrontarle prima:
   non sovrascrivere codice aggiunto soltanto su Google.
3. Sostituire **il file corrispondente**, non aggiungere una seconda copia delle
   stesse funzioni, con il contenuto completo di `magicbook_learning_db.gs` in
   questa cartella. Salvare. Non modificare `GAS_SECRET`, l'ID del foglio o le
   impostazioni di accesso/esecuzione della web app.
4. Dall'editor eseguire una volta `diagnoseLearningDatabase`: è un controllo
   in sola lettura. Verificare `success: true` e `schemaValid: true`. Se fallisce,
   fermarsi e leggere il codice errore; non creare/ripulire fogli per tentativi.
5. **Distribuisci → Gestisci deployment → seleziona quello esistente → matita
   Modifica → Versione: Nuova versione → Distribuisci**. Descrizione suggerita:
   `Learning sync: batch ID lookup and shorter busy lock`.
   Aggiornare la distribuzione esistente conserva URL e ID; non crearne una
   separata. Vedi la [documentazione Google sui deployment](https://developers.google.com/apps-script/concepts/deployments).

Salvare nell'editor da solo NON aggiorna la versione pubblica.

## Aggiornamento Vercel e dispositivi

Pubblicare anche le modifiche di frontend/API sopra elencate con il normale
deploy del repository. Entrambe le parti sono necessarie per la correzione
completa. Il worktree contiene anche precedenti modifiche dell'utente: non
eseguire un commit/push indiscriminato senza controllare il diff.

Dopo il deploy riaprire web/app e verificare il caricamento di
`learning-sync.js?v=4-sync-deadlines`. Non cancellare dati del sito/IndexedDB né
disinstallare l'app per aggiornare: la coda locale potrebbe contenere eventi
ancora da sincronizzare. Non serve cambiare variabili d'ambiente.

## Verifica e impatto atteso

Test automatici: storico di 10.000 ID, lotto di 25 eventi, ID storici e ripetuti
nello stesso lotto, nuovo runtime senza cache, distinzione maiuscole/minuscole,
intestazioni riordinate, lock occupato/concorrenza simulata, scritture parziali,
flush fallito, timeout durante il corpo JSON, risposta Google simulata di 23 s,
pulizia dei timer e un solo invio in corso. Nessuna prova di carico sul live.

I test dei componenti UI mantengono le loro verifiche; 26 aspettative sono state
aggiornate meccanicamente da cache v199 a v200, senza cambiare le funzionalità UI.

Nel test con 10.000 ID storici, 24 nuovi e 1 duplicato, la sincronizzazione legge
solo le intestazioni e 1 cella ID; dimensioni lette una volta per foglio. Questi
sono conteggi del simulatore, non un benchmark temporale del servizio Google.

Attesi meno timeout, invii ripetuti ed errori collegati, quindi meno invocazioni
evitabili, lavoro e log. L'attesa massima del lock scende dell'80% (5 → 1 s),
ma questo NON equivale a un risparmio dell'80% sulla fattura. Il timeout più lungo
è un margine contro le risposte tardive, non è di per sé un'ottimizzazione di costo:
se Google resta lento, le singole invocazioni possono durare di più.

Per 30–60 minuti di uso normale dopo il deploy controllare:

- `/api/learning-sync`: rapporto 200/503, timeout, richieste per evento e durata.
- Google: durate `doPost`, esecuzioni occupate/errori. `Completata` da sola non
  dimostra che la sincronizzazione sia stata accettata.
- Coda locale: eventi da `pending/retry` a `synced`, senza crescita persistente.
- Una breve sessione reale: progressi/statistiche aggiornati, riapertura app e
  ripresa dopo offline, nessuna moltiplicazione di righe con lo stesso `event_id`.
- Confrontare finestre con traffico simile, non soltanto i totali grezzi.

Restano fuori da questa correzione i 401 osservati (autenticazione non modificata),
i controlli di immagini mancanti e il polling dello stato audio identificati
nell'audit. Non si attribuisce a questa patch l'intera riduzione mensile dei costi.

## Ripristino

Se compaiono regressioni, dalla distribuzione Google esistente selezionare la
versione precedente annotata, mantenendo lo stesso URL. Ripristinare il precedente
deployment Vercel se necessario. Nessuna migrazione di schema o cancellazione
dati da annullare; non svuotare la coda locale. Il nuovo client e il vecchio script
restano compatibili nel formato dei messaggi.

## Riferimenti tecnici

- [TextFinder: ricerca esatta, case sensitive e regex](https://developers.google.com/apps-script/reference/spreadsheet/text-finder).
- [Lock: flush delle scritture prima del rilascio](https://developers.google.com/apps-script/reference/lock/lock).
- [Google: minimizzare chiamate ai servizi e usare operazioni in blocco](https://developers.google.com/apps-script/guides/support/best-practices).
- [Vercel: maxDuration per singola funzione](https://vercel.com/docs/functions/configuring-functions/duration).
