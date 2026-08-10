# Correzione definitiva pulsante admin Magic Book

Data originale: 27 luglio 2026
Aggiornamento sicurezza: 10 agosto 2026

## Problema

Il pulsante admin poteva sparire anche dopo un accesso amministratore valido. Il caso si verificava soprattutto dopo la riapertura della PWA, un ritorno dal background oppure quando il browser conservava telefono e dispositivo ma perdeva una parte del token precedente.

Il rinnovo della sessione richiedeva contemporaneamente:

- telefono presente nella lista admin del server;
- token admin firmato ancora non scaduto.

Il token di accesso dura 15 minuti. Se la PWA rimaneva sospesa oltre tale durata, il token conservava una firma server valida ma risultava scaduto: il rinnovo emetteva un token utente e la UI nascondeva il pulsante fino a logout e nuovo login.

## Correzione

- Dopo che il server ha validato realmente telefono e dispositivo tramite Google Apps Script, un token admin scaduto può rinnovare il ruolo soltanto se la firma server è valida, il token appartiene allo stesso telefono e il telefono è ancora presente in `ADMIN_PHONE_NUMBERS` su Vercel.
- Il client riconcilia sempre una sessione ripristinata con il server al caricamento.
- Le validazioni simultanee vengono unite in una sola richiesta, evitando risposte concorrenti che possono sovrascrivere la sessione.
- Il pulsante viene aggiornato immediatamente dopo login e dopo ogni rinnovo valido.
- Il ruolo letto dal browser viene normalizzato.
- I test coprono rinnovo dopo scadenza, rimozione dalla allow-list, token contraffatto, ruolo utente e associazione a un telefono diverso.

## Sicurezza

- Il client non decide chi è admin.
- Prima del rinnovo il server verifica telefono e dispositivo sul backend accessi.
- Il solo numero in `ADMIN_PHONE_NUMBERS` non concede mai il ruolo admin: serve anche una prova admin firmata, emessa dopo la password amministratore.
- La rimozione del numero da `ADMIN_PHONE_NUMBERS` revoca il ruolo al rinnovo successivo.
- Le API amministrative continuano a richiedere un token firmato con ruolo admin.
- La password admin resta obbligatoria durante il login iniziale.

## File aggiornati

- `api/getPages.js`
- `tests/security.test.mjs`

## Pubblicazione

Pubblicare il progetto Magic Book su Vercel. La correzione è nel backend e non dipende dalla cache PWA. Le sessioni che possiedono ancora un token admin firmato recuperano il pulsante automaticamente; se una versione precedente ha già trasformato il token in utente, è necessario effettuare una sola volta logout e nuovo login con la password admin.
