# Integrazione audio Magicph ↔ All Books

**Stato:** implementazione locale completata; pubblicazione non ancora eseguita  
**Data:** 25 luglio 2026  
**Repository:** `magicph` (Magic Book)  
**Repository collegato, non modificato:** `all_books_acceess` (All Books)

## Aggiornamento Apps Script — catalogo Magic Book

`quiz_gas.js` ora legge il catalogo esclusivamente dal blocco canonico del
foglio `quiz`:

- riga 1: intestazioni;
- righe 2–789: blocco dei quiz Magic Book;
- colonne usate per la sincronizzazione: `id`, `chapter`, `question`,
  `figure`, `correct`;
- le colonne `question_bd`, `explanations` e `xyz3d` non vengono inviate nel
  catalogo di sincronizzazione;
- righe senza `id` o `question` e ID duplicati vengono esclusi e riportati nel
  dettaglio diagnostico della risposta.

Questo limite evita che valori aggiuntivi sotto la riga 789 alterino il conteggio
dei quiz sincronizzabili. Dopo aver copiato il file in Google Apps Script è
necessario pubblicare una **nuova versione** del deployment Web App e verificare
che `QUIZ_GAS_URL` in Vercel punti all'URL `/exec` aggiornato.

## Aggiornamento player — lettura audio condiviso

Il player del quiz non assegna più direttamente al tag audio l'URL firmato di
R2. Usa l'azione server `getQuizAudioBlob`, riceve i byte con il MIME corretto
e crea un URL temporaneo locale del browser. Quando si cambia quiz o si chiude
il player, l'URL temporaneo viene revocato. In caso di errore il caricamento
viene azzerato, così il pulsante può essere premuto di nuovo senza ricaricare
la pagina.

## Obiettivo richiesto

Condividere le spiegazioni audio soltanto per i quiz presenti nel Magic Book (788 domande):

- un audio salvato in All Books deve risultare disponibile anche in Magicph;
- un audio salvato in Magicph deve risultare disponibile anche in All Books;
- l’aggiunta, la sostituzione e l’eliminazione devono essere disponibili solo agli admin;
- gli utenti normali devono poter soltanto ascoltare;
- i due progetti devono restare repository e deploy separati;
- il collegamento deve usare una corrispondenza verificabile dei quiz, non la posizione casuale nella lista.

## Verifiche effettuate

### Repository Magicph

- Il repository è separato e usa il branch `main`.
- Il working tree era pulito, a eccezione del file non tracciato già presente `icons/4d11476a-1117-4fe1-a3db-be44b224a96b.png`, che non è stato toccato.
- Il quiz viene recuperato dal Google Apps Script tramite `QUIZ_GAS_URL`.
- `quiz_gas.js` legge il foglio `quiz`, filtra le righe valide e restituisce normalmente 30 domande; il limite richiesto dal proxy è massimo 80.
- Il backend Magicph (`api/quiz.js`) gestisce accesso, sessione quiz, TTS e audio italiano/Bangla, ma **non contiene ancora** il sistema di spiegazioni audio registrate, né le chiamate R2/Neon relative a `quiz_audio_explanations`.
- L’autenticazione admin è server-side: il ruolo viene assegnato dall’API di login in base ai numeri admin configurati sul server e, quando richiesto, alla password admin server-side.
- Non esiste nel repository un catalogo locale completo delle 788 domande: la sorgente autorevole è il Google Apps Script.

### Repository All Books (sola lettura)

- All Books possiede già il flusso completo di spiegazioni audio.
- Il file `api/quiz.js` usa una tabella Neon chiamata `quiz_audio_explanations` e un bucket Cloudflare R2.
- Le operazioni già presenti sono: stato disponibilità, elenco admin, playback, upload firmato, conferma upload, salvataggio legacy e cancellazione.
- L’identità audio attuale è calcolata con SHA-256 del testo italiano normalizzato (Unicode NFKC, minuscolo, spazi normalizzati). Il percorso risultante è:

  `quiz-explanations/v1/q_<hash>/explanation.webm`

- La pagina admin esistente è `aggiungi-spiegazioni.html` + `aggiungi-spiegazioni.js`.
- Il progetto All Books non è stato modificato durante questa ricognizione.

## Rischio principale individuato

Usare soltanto il testo della domanda come collegamento è compatibile con gli audio già salvati, ma non è sufficiente come unica garanzia: una modifica anche minima al testo può generare un hash diverso e creare un audio duplicato. Usare invece l’indice della riga o la posizione nella lista sarebbe ancora più rischioso, perché il Google Apps Script mescola le domande e restituisce batch diversi.

Per questo la sincronizzazione deve conservare una mappatura persistente tra gli identificativi dei due sistemi e verificare almeno il testo normalizzato e la figura quando il match viene creato.

## Architettura proposta (da confermare prima dell’implementazione)

### 1. Contratto audio comune

Magicph deve usare gli stessi valori server-side già usati da All Books per:

- database Neon;
- account e credenziali R2;
- nome bucket R2;
- prefisso oggetti `quiz-explanations/v1/`.

Le credenziali non devono essere inserite nel frontend, nei file pubblici o nel Google Apps Script. Devono restare variabili d’ambiente Vercel/API.

### 2. Catalogo Magic Book protetto

Il Google Apps Script di Magicph dovrebbe offrire un’azione server-to-server protetta da `QUIZ_PROXY_SECRET` che restituisca il catalogo completo delle 788 domande con almeno:

- `id` Magic Book;
- `chapter`;
- testo italiano;
- figura;
- risposta corretta.

L’endpoint Vercel admin lo chiamerebbe solo dopo avere verificato la sessione admin. Non si deve esporre direttamente il catalogo completo al browser tramite un token segreto.

### 3. Tabella di mappatura persistente

Nel database condiviso è consigliabile aggiungere una tabella separata, ad esempio `magic_book_quiz_map`, senza modificare le righe audio esistenti. La tabella dovrebbe conservare:

- `magic_quiz_id`;
- identificativo All Books, quando disponibile;
- `quiz_key` audio canonico già esistente;
- hash/testo normalizzato usato per la verifica;
- figura normalizzata;
- data e versione del catalogo;
- eventuale stato `matched`, `review_required` o `unmatched`.

Così gli audio già presenti restano compatibili e i futuri cambiamenti dei testi non vengono associati in modo silenzioso alla domanda sbagliata.

### 4. UI admin Magicph

Solo dopo che catalogo e mapping sono verificati, si può aggiungere in Magicph una sezione admin dedicata ai 788 quiz, riutilizzando il comportamento già collaudato di All Books ma con codice locale a Magicph:

- capitoli e conteggio degli audio;
- ricerca per testo;
- filtri “da aggiungere” e “audio aggiunti”;
- visualizzazione della domanda e della figura;
- registratore inline con un solo pannello attivo;
- conferma interna al sistema per abbandonare audio non salvato;
- upload firmato diretto verso R2 e conferma server-side;
- player completo per admin e utenti;
- eliminazione/sostituzione solo admin.

## Ordine sicuro dei lavori

1. Aggiungere e verificare lo schema/mapping nel database senza cambiare gli audio esistenti.
2. Aggiungere in Magicph gli endpoint server-side di lettura audio, usando gli stessi valori Neon/R2 di All Books.
3. Aggiungere il catalogo protetto al Google Apps Script Magicph e verificare che restituisca esattamente 788 righe uniche.
4. Eseguire il match in modalità diagnostica, senza scrivere audio e senza cancellare dati.
5. Mostrare all’admin un report dei match sicuri e dei casi da controllare.
6. Solo dopo il controllo, attivare la UI di registrazione e le operazioni di scrittura.
7. Verificare da entrambi i domini: upload, playback, sostituzione, cancellazione, permessi admin/user e caso di quiz non abbinato.

## Cose non fatte in questa fase

- Nessun file del progetto All Books è stato modificato.
- Nessuna variabile Vercel, database, bucket R2 o Google Apps Script è stata modificata.
- Nessun audio è stato caricato, sovrascritto o cancellato.
- Nessun codice funzionale di Magicph è stato copiato o cambiato.
- Non sono state lette o stampate credenziali/segreti.

## Implementazione locale eseguita

Dopo la conferma dell’architettura sono state aggiunte queste parti, esclusivamente in Magicph:

- `api/quiz.js`: accesso Neon/R2 condiviso, identità audio compatibile con All Books, catalogo admin, stato/playback, upload firmato, conferma upload, salvataggio legacy e cancellazione.
- `quiz_gas.js`: nuova azione protetta `getCatalog`, che restituisce il catalogo completo del foglio `quiz` senza risposta corretta nel payload pubblico del quiz.
- `aggiungi-spiegazioni.html`, `aggiungi-spiegazioni.css`, `aggiungi-spiegazioni.js`: pagina admin dedicata ai quiz Magic Book, organizzata per capitoli, ricerca, filtri, percentuali, domanda e figura, registratore inline, player, sostituzione, eliminazione e conferme interne.
- `quiz.html`, `quiz.js`, `mystyle.css`: player di ascolto per l’utente nel quiz, visibile solo quando l’audio condiviso esiste, con play/pausa, avanzamento sincronizzato e velocità.
- `index.html`, `vercel.json`: collegamento dalla sezione admin e rotta `/aggiungi-spiegazioni`.
- `package.json`, `package-lock.json`: dipendenze server ufficiali AWS SDK S3/R2 e Neon.
- `database/quiz_audio_sync.sql`: schema documentato per la tabella audio condivisa e la mappatura Magic Book.

### Comportamenti protetti

- Il microfono parte soltanto cliccando il pulsante microfono, non aprendo il pannello.
- È aperto un solo registratore alla volta.
- Cambiando domanda, un audio non salvato richiede conferma interna; un pannello vuoto si sposta senza avvisi.
- Un errore di upload conserva la registrazione in IndexedDB locale e mostra il dettaglio tecnico nel dialog interno, così l’admin può premere “Salva” di nuovo senza registrare da capo.
- Le operazioni di scrittura e cancellazione richiedono un token admin verificato dal server.
- Gli utenti non admin non possono usare catalogo admin, upload o cancellazione; possono solo verificare e ascoltare un audio già presente.
- Il catalogo admin viene rifiutato se il Google Sheet non restituisce esattamente 788 quiz: questo evita di sincronizzare per errore una sorgente incompleta o diversa.

## Passaggi operativi ancora necessari

1. Eseguire una sola volta `database/quiz_audio_sync.sql` nel database Neon condiviso. Se `quiz_audio_explanations` esiste già, il comando la lascia intatta.
2. Copiare la versione aggiornata di `quiz_gas.js` nel progetto Google Apps Script di Magicph e pubblicare una nuova versione del deployment. Il file è ignorato da Git (`*_gas.js`), quindi questo passaggio è manuale.
3. In Vercel Magicph impostare gli stessi valori già funzionanti in All Books per:
   `DATABASE_URL` (oppure `STORAGE_URL`/`NEON_DATABASE_URL`), `QUIZ_AUDIO_R2_BUCKET`, `QUIZ_AUDIO_R2_ACCOUNT_ID`, `QUIZ_AUDIO_R2_ACCESS_KEY_ID`, `QUIZ_AUDIO_R2_SECRET_ACCESS_KEY`.
4. Verificare che `QUIZ_GAS_URL` punti al deployment Apps Script aggiornato e che `QUIZ_PROXY_SECRET` coincida con la proprietà Apps Script.
5. Distribuire Magicph e provare prima con un quiz di test: catalogo admin, registrazione, upload, ascolto utente, apertura dello stesso quiz in All Books e cancellazione.
6. Aggiornare la policy CORS del bucket R2 per consentire almeno `https://tmmmagic.eu` e `https://www.tmmmagic.eu` oltre agli origin già presenti di All Books. Servono `GET`, `HEAD`, `PUT` e l’header `Content-Type`; senza questo passaggio l’upload o il playback dal dominio Magicph può essere bloccato dal browser.

## Verifiche locali eseguite

- `node --check api/quiz.js`
- `node --check quiz.js`
- `node --check aggiungi-spiegazioni.js`
- validazione JSON di `vercel.json`
- suite Node: **13 test superati, 0 falliti**

La pubblicazione su Vercel e l’esecuzione dello SQL remoto non sono state fatte automaticamente: richiedono i valori server e il deployment Apps Script aggiornato.

## Conferma necessaria prima di procedere

Prima di implementare endpoint, schema, Apps Script e interfaccia, serve confermare questa scelta:

> usare lo stesso database Neon e lo stesso bucket R2 già usati da All Books, mantenere compatibile l’identità audio attuale e aggiungere una tabella di mappatura persistente per i 788 quiz Magic Book.

Questa è la soluzione meno invasiva e permette di sincronizzare i due progetti senza unirne i repository o i deploy.
