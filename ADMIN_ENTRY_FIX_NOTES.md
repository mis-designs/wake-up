# Correzione pulsante admin Magic Book

Data: 26 luglio 2026

## Problema

Il pulsante admin poteva sparire dopo un cambio schermata o quando la pagina tornava dal background. Il profilo e l'ingresso admin venivano gestiti dalla stessa funzione, quindi una schermata che nascondeva il profilo nascondeva anche il pulsante admin.

## Correzione

- L'ingresso admin ora ha una visibilità indipendente dall'icona profilo.
- La visibilità viene ricalcolata dopo `pageshow`, `focus` e `visibilitychange`.
- Il pulsante viene mostrato solo se esistono sessione/telefono validi e il ruolo salvato è admin.
- Aggiornato il cache-buster del progetto e del service worker per evitare che il browser mantenga la vecchia logica.

## File aggiornati

- `script.js`
- `index.html` (`script.js?v=17`)
- `service-worker.js` (cache `v25`, script `v17`, registrazione `v18`)

## Verifica

- Sintassi JavaScript verificata.
- Test sicurezza ruolo admin superati: 3/3.

Dopo la pubblicazione, il primo caricamento aggiorna automaticamente il service worker. Se il vecchio pulsante resta visibile, eseguire un solo ricaricamento forzato (`Ctrl+F5`).
