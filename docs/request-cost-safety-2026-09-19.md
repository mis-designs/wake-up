# Richieste e costi: correzioni del 19 settembre 2026

## Cosa dimostrano i dati

Lo screenshot mostra **9,76 USD di credito incluso consumato su 20 USD**, 21 giorni rimanenti e **0 USD di extra**. Le voci principali sono Observability (3,67 USD), memoria (2,78), trasferimento dall'origine (1,85), CPU (1,18); le invocazioni pesano direttamente 0,26 USD. Non è una suddivisione per endpoint e non dimostra quale versione del codice sia pubblicata.

Il rapporto locale sull'export del **13 settembre, 15:01–15:30 UTC** individua:

- `/api/asset`: **228 HEAD 404** per spiegazioni mancanti. Erano il **30,4% delle 751 richieste con record function** del campione, non del mese.
- `/api/quiz`: **198 controlli di disponibilità audio** e 33 richieste dell'elenco delle spiegazioni, su 347 richieste. Le verifiche audio sono necessarie; non vanno eliminate mostrando player non funzionanti.
- `/api/learning-sync`: 124 fallimenti su 129 richieste e 957,745 secondi di durata cumulata. Queste sono misure storiche, antecedenti alle correzioni GAS/batching/timeout: non provano che il problema persista oggi. La somma delle durate non equivale a CPU o memoria fatturata.

Non è stato interrogato il servizio pubblico né eseguito un test di carico. Non c'è un nuovo export di produzione con cui attribuire l'intero consumo attuale.

## Problemi corretti adesso

| File | Problema e intervento | Effetto e limiti |
| --- | --- | --- |
| `quiz.js` | L'elenco completo era seguito da una scansione di tutte le figure in quattro formati, anche per le assenze già note. Eliminata la scansione; elenco richiesto solo quando serve alla figura corrente, condiviso tra chiamanti e conservato per 60 secondi. | Elimina richieste frontend, invocazioni e controlli storage per le assenze note. Nessuna richiesta per domande senza figura. |
| `quiz.js` | I controlli falliti non restavano in cache; navigazione rapida poteva avviare lavoro per domande ormai lasciate. Recupero solo per la figura corrente quando l'elenco non è disponibile, con deduplica, cache negativa limitata, backoff e annullamento. | Massimo quattro formati per il recupero di una figura mancante; un errore di servizio ferma subito la catena. Nessun retry periodico. |
| `script.js` | La home precaricava l'elenco anche senza aprire un quiz, che poi lo richiedeva di nuovo. Rimosso quel precaricamento. | Zero richieste di disponibilità spiegazioni dalla home. Accesso e convalida della sessione restano invariati. |
| `api/quiz.js`, `api/quiz-explanation-availability.mjs` | L'elenco poteva provenire da un account/bucket diverso da quello usato per servire le figure. Aggiunto il segnale `complete` solo quando le sorgenti coincidono; rilevate paginazioni incomplete o circolari. | Impedisce di nascondere spiegazioni valide usando un elenco di un altro archivio. Se non è autorevole resta il recupero limitato alla figura corrente. Nessuna configurazione o credenziale cambiata. |
| `api/asset.js` | I file pubblici mancanti non avevano una politica esplicita di cache negativa. Aggiunti 60 secondi solo per nomi validati e assenza confermata. | Può evitare accessi all'origine ripetuti. Non elimina la richiesta edge se il browser arriva alla CDN. Errori storage/configurazione non sono memorizzati. |
| `api/quiz-figure-image.mjs` | La stessa figura poteva essere decodificata ed elaborata più volte. Cache del risultato e deduplica simultanea per hash dei byte, figura e versione. | Evita lavoro CPU ripetuto sulla stessa istanza calda. Limite 16 immagini / 8 MiB / 5 minuti. Non evita da sola invocazioni o letture storage; la CDN già protegge molte richieste. |
| `study-quiz.js` | I timer e l'observer venivano puliti, ma le verifiche audio già partite continuavano dopo l'uscita dal capitolo. Aggiunti deduplica, abort, protezione dalle risposte obsolete e ripresa dopo back/forward cache. | Evita duplicati e lavoro client superato. Abort non garantisce di annullare una funzione server già avviata. Nessun preload degli audio aggiunto. |

La cache locale delle spiegazioni usa una nuova chiave: la vecchia mescolava elenchi completi e figure trovate singolarmente e quindi non poteva certificare un'assenza. Le verifiche di autorizzazione e il normale recupero immagini rimangono invariati.

## Verifiche locali e budget di richieste

- 30 figure senza spiegazione e un elenco completo valido: prima la scansione poteva produrre **120 HEAD**, oltre all'elenco; ora **1 elenco, 0 HEAD** nella finestra di cache.
- 30 domande senza figura: **0 richieste di disponibilità spiegazioni**.
- Nuova pagina entro 60 secondi con elenco completo già salvato: **0 nuove richieste dell'elenco**.
- Elenco non disponibile e navigazione rapida attraverso 30 figure: recupero di **soltanto l'ultima figura**, non tutte e 30.
- Ripetizione del recupero, formati supportati, errori temporanei, cache corrotta/scaduta, annullamento e ritorno alla pagina coperti da test.
- Due controlli audio simultanei per la stessa domanda di studio: **1 richiesta**; risposta arrivata dopo l'uscita non aggiorna né cache né vecchia schermata.
- Elaborazione figure verificata anche pixel per pixel: stesso risultato, riuso dei byte; una sorgente diversa invalida immediatamente il risultato.

Test aggiunti in `tests/explanation-request-budget.test.mjs`, `tests/asset-cache-safety.test.mjs`, `tests/study-audio-request-lifecycle.test.mjs` e `tests/quiz-figure-presentation.test.mjs`. Gli altri cambiamenti nei test aggiornano soltanto i riferimenti alle versioni degli asset.

Versionati `script.js`, `quiz.js`, `study-quiz.js` nei relativi HTML e nel service worker `v205-request-budget`, così le vecchie copie non vengono riutilizzate. Nessuna modifica a CSS, layout, pagamenti, autorizzazioni, salvataggio risposte o GAS in questo intervento. Aggiunte regole di lavoro in `AGENTS.md` per usare fixture locali, vietare scansioni/polling di produzione non richiesti e richiedere budget/test delle richieste.

## Perché aiuta, senza promettere percentuali non misurate

Una richiesta evitata nel browser evita la catena edge → funzione → servizi esterni. Questa è la riduzione principale; nel campione storico i 228 controlli mancanti costituiscono un'opportunità importante, **non una promessa del 30,4% di risparmio mensile**. Le cache server riducono lavoro ripetuto ma non cancellano automaticamente invocazioni già entrate.

Gli eventi Observability comprendono richieste e operazioni, non solo `console.log`: togliere log non basta. I log ordinari lato quiz erano già stati ridotti negli interventi precedenti; non sono stati soppressi errori diagnostici o di sicurezza. [Documentazione Vercel Observability](https://vercel.com/docs/observability), [gestione del consumo](https://vercel.com/docs/manage-and-optimize-observability).

L'attesa di GAS può tenere occupata la memoria allocata anche senza CPU attiva per tutta la durata; le due voci non vanno confuse. [Vercel Functions: consumo e prezzi](https://vercel.com/docs/functions/usage-and-pricing).

## Dopo il deploy

Nessun commit, push o deploy del progetto principale effettuato da questo intervento. Le modifiche avranno effetto dopo la pubblicazione e il caricamento dei nuovi asset, sia sul web sia nell'app Android che usa quelle pagine. Nessun nuovo aggiornamento GAS richiesto qui.

1. Confrontare due finestre equivalenti per utenti/sessioni/versione: conteggio `HEAD kind=explanation`, 404, azione `getExplanationFigures`, richieste audio e cache HIT/MISS. Non confrontare semplicemente totali mensili cumulativi.
2. Verificare `/api/learning-sync`: quota di 401/503/timeout e latenza, senza aumentare artificialmente traffico o inserire eventi di prova negli account reali. Se resta lento è la priorità successiva per memoria/durate; non sono state indebolite autenticazione o persistenza per nasconderlo.
3. Controllare figura con spiegazione, figura senza, cambio domanda, ritorno al capitolo e audio effettivo. Nuovi file possono richiedere fino a 60 secondi per superare le nuove cache negative; resta anche la preesistente cache dell'elenco sul server (5 minuti).
4. Le cache in memoria sono locali alla singola istanza e non sopravvivono a un cold start. Non sostituiscono la misura della cache CDN e non rendono privati i contenuti pubblici, né pubblici quelli protetti.
5. Il credito già consumato non diminuisce: deve diminuire la velocità con cui cresce. Eventuali modifiche di piano/Observability Plus richiedono una decisione separata; nessuna impostazione di fatturazione è stata cambiata.
