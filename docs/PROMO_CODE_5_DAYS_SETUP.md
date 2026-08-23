# Promo code da 5 giorni

Il promo code viene verificato esclusivamente dalla funzione Vercel. Google Apps Script riceve soltanto un identificatore HMAC del codice e una richiesta firmata, quindi il codice in chiaro non entra nel foglio Google.

## 1. Variabili Vercel Production

Configurare esclusivamente nell'ambiente `Production`:

- `PROMO_CODE_5_DAYS`: codice corrente, minimo 6 caratteri (consigliati almeno 8 caratteri alfanumerici).
- `PROMO_CODE_5_DAYS_EXPIRES_AT`: scadenza UTC ISO 8601, non oltre cinque giorni; per la campagna del 23 agosto 2026 usare `2026-08-26T22:00:00Z`.
- `PROMO_ALLOWED_HOSTS`: domini ufficiali separati da virgola, per esempio `tmmmagic.eu,www.tmmmagic.eu`.

Dopo ogni modifica è necessario creare un nuovo deployment Production. Non inserire questi valori in `.env.example`, Git o file pubblici.

## 2. Estensione Google Apps Script

Unire `google-apps-script/promo-access.gs` al progetto Apps Script che gestisce `GAS_ACCESS_URL`.

Nel router `doPost`, dopo il parsing JSON, aggiungere:

```javascript
if (payload.action === 'promo_redeem') {
  return promoJsonOutput_(promoRedeem_(payload));
}
if (payload.action === 'admin_promo_users') {
  return promoJsonOutput_(promoAdminUsers_(payload));
}
if (payload.action === 'admin_mark_paid') {
  return promoJsonOutput_(promoAdminMarkPaid_(payload));
}
```

Nelle Script Properties configurare:

- `GAS_SECRET`: lo stesso valore protetto configurato su Vercel.
- `ACCESS_USERS_SHEET_NAME`: facoltativo; se assente viene usato `Users`.
- `GAS_ADMIN_KEY` oppure `ADMIN_KEY`: la stessa chiave admin protetta usata dal backend Vercel.

Pubblicare una nuova versione della Web App Apps Script mantenendo lo stesso URL di accesso.

## 3. Colonne e registro

Il foglio utenti deve avere le colonne base `phone` e `expiry` (sono accettati anche `telefono`/`numero` e `scadenza`). L'estensione aggiunge, se mancanti:

- `device1`
- `device2`
- `promoDaysUsed`
- `promoRedemptions`
- `lastPromoCodeId`
- `promoUsedCodeIds`
- `accessSource`

Viene creato anche il registro durevole `PromoRedemptions`. Le scritture sono protette con `LockService` e rese visibili con `SpreadsheetApp.flush()` prima di liberare il lock: una riga viene prima riservata e poi marcata `granted`, così il limite non si libera se la riga dell'utente viene cancellata o convertita. Una prenotazione interrotta viene riconciliata dopo 10 minuti: diventa `granted` se il grant è presente nella riga utente, altrimenti `failed` e libera il posto. Ogni numero può ricevere una sola promozione da 5 giorni in assoluto, anche quando il codice cambia. Ogni nuovo Promo Code apre una campagna distinta con un massimo di 800 utenti mai entrati prima tramite promo. Lo storico non viene cancellato quando un utente passa a un pacchetto a pagamento.

Il pannello admin legge `accessSource` e l'eventuale casella `isPromo`/`promo`: gli utenti promozionali mantengono l'evidenziazione anche dopo la scadenza. Quando un rinnovo a pagamento viene completato dal pannello, `admin_mark_paid` imposta `accessSource` su `paid` e disattiva la casella promo senza cancellare lo storico delle campagne.

## 4. Rotazione manuale

Ogni cinque giorni:

1. sostituire `PROMO_CODE_5_DAYS`;
2. impostare la nuova `PROMO_CODE_5_DAYS_EXPIRES_AT`;
3. salvare le variabili Production;
4. eseguire il redeploy Production;
5. verificare il login con un numero che non abbia mai utilizzato una promozione;
6. verificare che un numero promozionale storico riceva il percorso verso i pacchetti.

Usare ogni volta un testo Promo Code nuovo e mantenere stabile `SESSION_SECRET`: l'identità della campagna e il relativo contatore di 800 posti derivano da entrambi.

I vecchi deployment non possono riscattare codici tramite i loro domini Vercel perché l'endpoint accetta soltanto gli host presenti in `PROMO_ALLOWED_HOSTS`.
