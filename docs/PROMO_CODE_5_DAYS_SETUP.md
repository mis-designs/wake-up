# Promo code da 5 giorni

Il promo code viene verificato esclusivamente dalla funzione Vercel. Google Apps Script riceve soltanto un identificatore HMAC del codice e una richiesta firmata, quindi il codice in chiaro non entra nel foglio Google.

## 1. Variabili Vercel Production

Configurare esclusivamente nell'ambiente `Production`:

- `PROMO_CODE_5_DAYS`: codice corrente, minimo 6 caratteri (consigliati almeno 8 caratteri alfanumerici).
- `PROMO_CODE_5_DAYS_EXPIRES_AT`: scadenza UTC ISO 8601, non oltre cinque giorni, per esempio `2026-08-17T22:00:00Z`.
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
- `accessSource`

Viene creato anche il foglio append-only `PromoRedemptions`. Le scritture sono protette con `LockService`; un accesso ancora valido non viene modificato, lo stesso codice non può essere riutilizzato dallo stesso numero e il totale non supera 30 giorni.

Il pannello admin legge `accessSource` e l'eventuale casella `isPromo`/`promo`: gli utenti promozionali mantengono l'evidenziazione anche dopo la scadenza. Quando un rinnovo a pagamento viene completato dal pannello, `admin_mark_paid` imposta `accessSource` su `paid` e disattiva la casella promo senza cancellare lo storico delle campagne.

## 4. Rotazione manuale

Ogni cinque giorni:

1. sostituire `PROMO_CODE_5_DAYS`;
2. impostare la nuova `PROMO_CODE_5_DAYS_EXPIRES_AT`;
3. salvare le variabili Production;
4. eseguire il redeploy Production;
5. verificare il login con un numero di prova nuovo o scaduto.

I vecchi deployment non possono riscattare codici tramite i loro domini Vercel perché l'endpoint accetta soltanto gli host presenti in `PROMO_ALLOWED_HOSTS`.
