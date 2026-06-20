# INTERACTION_DESIGN_RULES.md

# Regole Interaction Design per MagicBook

Questo file definisce le regole per micro-interazioni, animazioni, transizioni, loading, feedback visivi e stati interattivi della web app **MagicBook**.

Codex deve leggerlo prima di aggiungere o modificare animazioni e comportamenti interattivi.

L’obiettivo è rendere l’app più fluida e professionale, senza appesantirla e senza usare animazioni inutili.

---

## 1. Principio principale

Le animazioni devono aiutare l’utente, non decorare a caso.

Ogni movimento deve avere uno scopo:

- confermare un’azione;
- guidare l’utente;
- mostrare un cambiamento;
- rendere il passaggio tra schermate più naturale;
- evidenziare un errore o un successo;
- dare feedback quando l’utente clicca.

Non usare animazioni pesanti o inutili.

---

## 2. Regole generali

- Le animazioni devono essere leggere.
- Usare soprattutto `transform` e `opacity`.
- Evitare animazioni su `width`, `height`, `top`, `left`, `margin`.
- Non bloccare mai l’utente durante un’animazione.
- Le animazioni devono essere brevi.
- Ogni bottone deve avere stato hover, active, focus e disabled.
- Ogni card cliccabile deve dare feedback visivo.
- I messaggi di errore devono apparire in modo chiaro.
- I loading devono essere visibili.
- Rispettare sempre `prefers-reduced-motion`.

---

## 3. Timing consigliati

Usare durate coerenti in tutta l’app.

```css
:root {
  --duration-fast: 120ms;
  --duration-normal: 220ms;
  --duration-medium: 320ms;
  --duration-slow: 480ms;

  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-in: cubic-bezier(0.55, 0, 1, 0.45);
  --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
}
```

### Quando usare ogni durata

- 100–150ms: click, hover, micro feedback.
- 200–300ms: dropdown, toggle, cambio stato piccolo.
- 300–500ms: modali, cambio pagina, card importanti.
- Oltre 500ms: evitare, salvo casi molto particolari.

---

## 4. Stato hover, active e focus

Ogni elemento cliccabile deve dare feedback.

```css
.clickable {
  transition:
    transform var(--duration-normal) var(--ease-out),
    box-shadow var(--duration-normal) var(--ease-out),
    background var(--duration-normal) var(--ease-out);
}

.clickable:hover {
  transform: translateY(-2px);
}

.clickable:active {
  transform: translateY(0) scale(0.98);
}

.clickable:focus-visible {
  outline: 3px solid rgba(22, 112, 255, 0.35);
  outline-offset: 3px;
}
```

Regole:

- Hover leggero, non esagerato.
- Active deve far capire che il click è stato preso.
- Focus deve essere visibile per tastiera/accessibilità.
- Disabled non deve avere hover o active forte.

---

## 5. Bottoni

I bottoni principali devono avere micro-interazione chiara.

```css
.btn {
  transition:
    transform var(--duration-fast) var(--ease-out),
    box-shadow var(--duration-fast) var(--ease-out),
    opacity var(--duration-fast) var(--ease-out);
}

.btn:hover:not(:disabled) {
  transform: translateY(-1px);
}

.btn:active:not(:disabled) {
  transform: translateY(0) scale(0.98);
}

.btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
```

Regole:

- Se l’utente clicca, il bottone deve reagire.
- Se il bottone carica, mostrare loading.
- Se il bottone è disabilitato, deve essere chiaro.
- Non usare animazioni aggressive.

---

## 6. Loading states

Ogni azione che richiede tempo deve avere loading.

Esempi:

- controllo numero di telefono;
- login;
- caricamento home;
- salvataggio dati;
- apertura contenuti;
- invio form.

### Spinner semplice

```css
.spinner {
  width: 18px;
  height: 18px;
  border: 2px solid rgba(255, 255, 255, 0.45);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 700ms linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
```

### Skeleton

```css
.skeleton {
  position: relative;
  overflow: hidden;
  background: rgba(93, 104, 122, 0.14);
  border-radius: 12px;
}

.skeleton::after {
  content: "";
  position: absolute;
  inset: 0;
  transform: translateX(-100%);
  background: linear-gradient(
    90deg,
    transparent,
    rgba(255, 255, 255, 0.55),
    transparent
  );
  animation: shimmer 1.2s infinite;
}

@keyframes shimmer {
  to {
    transform: translateX(100%);
  }
}
```

Regole:

- Non lasciare l’utente fermo senza feedback.
- Se il caricamento è breve, basta spinner.
- Se carica contenuti visivi, meglio skeleton.
- Il loading non deve spostare troppo il layout.

---

## 7. Messaggi di errore

Gli errori devono apparire vicino all’azione.

```css
.form-error {
  color: #d93025;
  font-size: 14px;
  font-weight: 700;
  line-height: 1.4;
  animation: errorIn var(--duration-normal) var(--ease-out);
}

@keyframes errorIn {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

Regole:

- Il messaggio deve essere leggibile.
- Non deve rompere il layout.
- Deve spiegare il problema.
- Deve stare vicino al form o al campo.
- Non usare solo colore: aggiungere testo chiaro.

---

## 8. Messaggi di successo

Quando un’azione va a buon fine, dare feedback.

```css
.success-message {
  color: #17a673;
  font-size: 14px;
  font-weight: 700;
  animation: successIn var(--duration-normal) var(--ease-out);
}

@keyframes successIn {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

Esempi:

- accesso riuscito;
- dati salvati;
- form inviato;
- candidatura inviata;
- contenuto sbloccato.

---

## 9. Transizioni tra schermate

I cambi pagina devono essere leggeri.

```css
.screen-enter {
  animation: screenEnter var(--duration-medium) var(--ease-out);
}

@keyframes screenEnter {
  from {
    opacity: 0;
    transform: translateY(12px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
```

Regole:

- Non usare transizioni lente.
- Non usare effetti strani.
- Il cambio pagina deve mantenere orientamento.
- L’utente deve capire dove si trova.
- Pagine interne devono avere ritorno o breadcrumb.

---

## 10. Card cliccabili

Le card cliccabili devono sembrare interattive.

```css
.card-link {
  cursor: pointer;
  transition:
    transform var(--duration-normal) var(--ease-out),
    box-shadow var(--duration-normal) var(--ease-out);
}

.card-link:hover {
  transform: translateY(-4px);
  box-shadow: 0 16px 40px rgba(3, 27, 70, 0.16);
}

.card-link:active {
  transform: translateY(-1px) scale(0.99);
}
```

Regole:

- Se una card è cliccabile, deve essere chiaro.
- Se una card non è cliccabile, non deve avere hover da bottone.
- Non mettere troppe animazioni sulle card insieme.

---

## 11. Icone e piccoli elementi

Icone e piccoli pulsanti devono avere feedback.

```css
.icon-button {
  display: inline-grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border-radius: 999px;
  transition:
    transform var(--duration-fast) var(--ease-out),
    background var(--duration-fast) var(--ease-out);
}

.icon-button:hover {
  background: rgba(22, 112, 255, 0.1);
  transform: translateY(-1px);
}

.icon-button:active {
  transform: scale(0.96);
}
```

Regole:

- Icona profilo, indietro, chiudi, impostazioni devono reagire.
- Ogni icona deve avere `aria-label`.
- Non usare icone senza funzione.

---

## 12. Toast e notifiche

Se serve una notifica temporanea, usare toast.

```css
.toast {
  position: fixed;
  left: 50%;
  bottom: 24px;
  transform: translateX(-50%);
  max-width: min(92vw, 420px);
  padding: 14px 18px;
  border-radius: 18px;
  background: #031b46;
  color: white;
  box-shadow: 0 16px 40px rgba(3, 27, 70, 0.22);
  animation: toastIn var(--duration-medium) var(--ease-out);
  z-index: 9999;
}

@keyframes toastIn {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
}
```

Regole:

- Usare toast per conferme brevi.
- Non usare toast per errori importanti che richiedono azione.
- Il toast non deve coprire pulsanti importanti su mobile.

---

## 13. Preferenze movimento ridotto

Rispettare sempre chi ha disattivato animazioni.

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    scroll-behavior: auto !important;
    transition-duration: 0.01ms !important;
  }
}
```

Questa regola deve essere sempre presente nel CSS globale.

---

## 14. Performance

Le animazioni devono restare fluide.

Regole:

- Usare `transform` e `opacity`.
- Evitare `width`, `height`, `top`, `left`.
- Non animare troppi elementi insieme.
- Non usare animazioni infinite se non servono.
- Non usare `will-change` ovunque.
- Non bloccare input e click durante animazioni.
- Testare su mobile, non solo desktop.

---

## 15. Cosa evitare

Evitare:

- animazioni lente;
- rimbalzi esagerati;
- troppe animazioni nella stessa schermata;
- effetti 3D inutili;
- scroll animation pesanti;
- elementi che si muovono senza motivo;
- layout che cambia troppo durante loading;
- messaggi che appaiono lontano dall’azione;
- pulsanti che non danno feedback;
- modali senza pulsante chiudi.

---

## 16. Regole per MagicBook

Per MagicBook usare interaction design soprattutto su:

- login;
- bottone continua;
- messaggi di errore;
- dispositivo non autorizzato;
- caricamento dati;
- apertura home;
- card libri;
- pulsanti quiz;
- bottoni Vero/Falso;
- riepilogo finale;
- icone spiegazione AI;
- navigazione indietro;
- apertura modali.

Non usare animazioni inutili su elementi decorativi.

---

## 17. Prompt operativo per Codex

Quando Codex deve modificare interazioni o animazioni, deve seguire questo processo:

1. Leggere questo file.
2. Capire quale azione dell’utente deve ricevere feedback.
3. Aggiungere micro-interazione leggera.
4. Usare `transform` e `opacity`.
5. Aggiungere hover, active, focus e disabled se mancano.
6. Aggiungere loading se l’azione richiede tempo.
7. Rispettare `prefers-reduced-motion`.
8. Controllare desktop, tablet e mobile.
9. Non rompere la logica esistente.

---

## 18. Regola finale

L’interazione deve far capire all’utente che l’app è viva, veloce e affidabile.

Ogni movimento deve avere senso.  
Se l’animazione non aiuta l’utente, non usarla.
