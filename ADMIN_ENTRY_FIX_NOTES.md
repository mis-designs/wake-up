# Correzione definitiva pulsante admin Magic Book

Data: 27 luglio 2026

## Problema

Il pulsante admin poteva sparire anche dopo un accesso amministratore valido. Il caso si verificava soprattutto dopo la riapertura della PWA, un ritorno dal background oppure quando il browser conservava telefono e dispositivo ma perdeva una parte del token precedente.

Il rinnovo della sessione richiedeva contemporaneamente:

- telefono presente nella lista admin del server;
- ruolo admin già presente nel vecchio token.

Se il vecchio token non arrivava correttamente, il server emetteva un nuovo token utente e la UI nascondeva il pulsante fino a logout e nuovo login.

## Correzione

- Dopo che il server ha validato realmente telefono e dispositivo tramite Google Apps Script, il ruolo viene ricalcolato dalla lista `ADMIN_PHONE_NUMBERS` configurata su Vercel.
- Il client riconcilia sempre una sessione ripristinata con il server al caricamento.
- Le validazioni simultanee vengono unite in una sola richiesta, evitando risposte concorrenti che possono sovrascrivere la sessione.
- Il pulsante viene aggiornato immediatamente dopo login e dopo ogni rinnovo valido.
- Il ruolo letto dal browser viene normalizzato.
- Aggiornati cache-buster e cache PWA per impedire il riutilizzo del vecchio JavaScript.

## Sicurezza

- Il client non decide chi è admin.
- Prima di assegnare il ruolo, il server verifica telefono e dispositivo sul backend accessi.
- L’assegnazione admin dipende esclusivamente da `ADMIN_PHONE_NUMBERS` sul server.
- Le API amministrative continuano a richiedere un token firmato con ruolo admin.
- La password admin resta obbligatoria durante il login iniziale.

## File aggiornati

- `api/getPages.js`
- `script.js`
- `index.html`
- `service-worker.js`
- `tests/security.test.mjs`

## Pubblicazione

Pubblicare il progetto Magic Book su Vercel. Al primo caricamento online il nuovo service worker elimina la cache precedente. Non è necessario fare logout e login: la sessione già presente viene riconciliata automaticamente.
