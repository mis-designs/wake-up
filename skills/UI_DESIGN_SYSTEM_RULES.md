# UI_DESIGN_SYSTEM_RULES.md

# Regole Design System per MagicBook

Questo file definisce le regole visive principali della web app **MagicBook**.  
Codex deve leggerlo prima di creare, modificare o sistemare qualsiasi schermata, componente o stile CSS.

L’obiettivo è evitare pagine fatte “a caso” e mantenere tutta l’app coerente, moderna, responsive e professionale.

---

## 1. Principio principale

MagicBook deve avere un design system coerente.

Ogni schermata deve sembrare parte della stessa app.

Non creare stili diversi per ogni pagina.  
Non inventare nuovi colori, bottoni, card, input o spaziature se esistono già regole definite.

---

## 2. Regole generali

- Usare sempre gli stessi colori.
- Usare sempre gli stessi font.
- Usare una scala coerente per dimensioni, spazi, radius e ombre.
- Ogni bottone deve avere lo stesso stile base.
- Ogni input deve avere lo stesso stile base.
- Ogni card deve avere lo stesso linguaggio visivo.
- Header, footer e contenuti devono essere coerenti.
- Ogni pagina deve funzionare su mobile, tablet e desktop.
- Ogni nuova schermata deve rispettare il design già esistente.
- Non usare dimensioni fisse inutili.
- Usare `clamp()`, `max-width`, `min()`, `100dvh` e media query quando serve.

---

## 3. Palette colori

Usare variabili CSS, non colori sparsi nel codice.

```css
:root {
  --color-blue-900: #031b46;
  --color-blue-800: #072b6d;
  --color-blue-700: #0a4ecf;
  --color-blue-600: #1670ff;

  --color-bg: #f3f6fb;
  --color-section: #eef2f8;

  --color-text-dark: #0f1b36;
  --color-text-main: #1a2340;
  --color-muted: #5d687a;

  --color-whatsapp: #25d366;
  --color-green: #17a673;

  --color-white: #ffffff;
  --color-danger: #d93025;
  --color-warning: #f59e0b;
  --color-success: #17a673;
}
```

### Uso colori

- Blu notte `--color-blue-900`: titoli forti, testi importanti, elementi istituzionali.
- Blu istituzionale `--color-blue-800`: header, elementi principali.
- Blu CTA `--color-blue-600`: bottoni principali, link importanti, azioni.
- Sfondo pagina `--color-bg`: background generale.
- Sfondo sezioni `--color-section`: blocchi soft.
- Testo scuro `--color-text-dark`: titoli e card.
- Testo principale `--color-text-main`: paragrafi principali.
- Testo secondario `--color-muted`: descrizioni leggere.
- Verde `--color-green`: conferme, accenti positivi.
- WhatsApp `--color-whatsapp`: solo per azioni WhatsApp o contatti.

---

## 4. Tipografia

Usare una scala tipografica coerente.

```css
:root {
  --font-main: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;

  --font-size-xs: 12px;
  --font-size-sm: 14px;
  --font-size-md: 16px;
  --font-size-lg: 18px;
  --font-size-xl: clamp(22px, 4vw, 34px);
  --font-size-2xl: clamp(28px, 6vw, 48px);

  --line-height-tight: 1.15;
  --line-height-normal: 1.5;
  --line-height-relaxed: 1.7;
}
```

### Regole testo

- Testo normale: almeno 15–16px.
- Testo piccolo: non sotto 12px.
- Titoli principali: usare `clamp()`.
- Non usare grigi troppo chiari per testi importanti.
- Ogni input deve avere label leggibile.
- I messaggi di errore devono essere ben visibili.
- I placeholder non devono sembrare testo già inserito.

---

## 5. Spaziature

Usare una scala unica per margini, padding e gap.

```css
:root {
  --space-2xs: 4px;
  --space-xs: 6px;
  --space-sm: 10px;
  --space-md: 16px;
  --space-lg: 24px;
  --space-xl: 40px;
  --space-2xl: 64px;
}
```

### Regole spazi

- Non mettere elementi attaccati.
- Non creare spazi enormi senza motivo.
- Su mobile usare spazi più piccoli.
- Su desktop aumentare gli spazi senza disperdere il contenuto.
- Gli elementi collegati devono stare vicini.
- Header, main e footer devono avere proporzioni corrette.

---

## 6. Radius e ombre

Usare radius e ombre coerenti.

```css
:root {
  --radius-sm: 10px;
  --radius-md: 16px;
  --radius-lg: 24px;
  --radius-xl: 32px;
  --radius-pill: 999px;

  --shadow-sm: 0 4px 12px rgba(3, 27, 70, 0.08);
  --shadow-md: 0 12px 32px rgba(3, 27, 70, 0.14);
  --shadow-lg: 0 20px 60px rgba(3, 27, 70, 0.18);
}
```

### Uso

- Card normali: `--radius-lg` + `--shadow-sm`.
- Card importanti: `--radius-xl` + `--shadow-md`.
- Bottoni: `--radius-pill` o `--radius-md`.
- Input: `--radius-md`.
- Evitare ombre troppo nere o troppo pesanti.

---

## 7. Layout base app

Ogni schermata principale deve seguire una struttura logica.

```css
.app-screen {
  min-height: 100dvh;
  display: grid;
  grid-template-rows: auto 1fr auto;
  background: var(--color-bg);
  color: var(--color-text-main);
  font-family: var(--font-main);
}

.app-main {
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: clamp(16px, 3vw, 40px);
}

.app-content {
  width: min(100%, 430px);
  margin: 0 auto;
}
```

### Regole layout

- Il contenuto principale deve stare centrato.
- Evitare contenuti piccoli buttati in alto.
- Evitare scroll nelle schermate brevi come login e home.
- Lo scroll è permesso solo per pagine realmente lunghe.
- Usare `100dvh`, non solo `100vh`.

---

## 8. Breakpoint responsive

Usare breakpoint coerenti.

```css
:root {
  --bp-sm: 480px;
  --bp-md: 768px;
  --bp-lg: 1024px;
  --bp-xl: 1280px;
}
```

Indicazioni:

- Mobile: fino a 480px.
- Tablet: da 768px.
- Desktop: da 1024px.
- Desktop largo: da 1280px.

Ogni schermata deve essere controllata almeno su mobile, tablet e desktop.

---

## 9. Bottoni

Tutti i bottoni devono avere stile coerente.

```css
.btn {
  min-height: 44px;
  border: 0;
  border-radius: var(--radius-pill);
  padding: 0 20px;
  font-weight: 700;
  font-size: var(--font-size-sm);
  cursor: pointer;
  transition: transform 180ms ease, box-shadow 180ms ease, background 180ms ease;
}

.btn-primary {
  background: linear-gradient(135deg, var(--color-blue-600), var(--color-blue-700));
  color: var(--color-white);
  box-shadow: var(--shadow-sm);
}

.btn-primary:hover {
  transform: translateY(-1px);
  box-shadow: var(--shadow-md);
}

.btn-primary:active {
  transform: translateY(0);
}

.btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  box-shadow: none;
}
```

### Regole bottoni

- Il bottone principale deve essere evidente.
- Il testo deve spiegare l’azione.
- I bottoni disabilitati devono sembrare disabilitati.
- Non usare bottoni troppo piccoli.
- Su mobile i bottoni devono essere facili da toccare.

---

## 10. Input e form

Gli input devono essere puliti, leggibili e coerenti.

```css
.form-field {
  display: grid;
  gap: var(--space-xs);
}

.form-label {
  font-size: var(--font-size-sm);
  font-weight: 700;
  color: var(--color-text-dark);
}

.input {
  width: 100%;
  min-height: 46px;
  border: 1px solid rgba(3, 27, 70, 0.14);
  border-radius: var(--radius-md);
  padding: 0 16px;
  background: var(--color-white);
  color: var(--color-text-main);
  font-size: var(--font-size-md);
  outline: none;
}

.input:focus {
  border-color: var(--color-blue-600);
  box-shadow: 0 0 0 4px rgba(22, 112, 255, 0.14);
}
```

### Regole form

- Ogni input deve avere label chiara.
- Gli errori devono stare vicino all’input o al form.
- Non usare placeholder come sostituto della label.
- Il bottone non deve funzionare se i dati obbligatori non sono validi.
- Mostrare loading quando il form sta controllando o inviando dati.

---

## 11. Card

Le card devono essere moderne, leggere e coerenti.

```css
.card {
  background: rgba(255, 255, 255, 0.86);
  border: 1px solid rgba(3, 27, 70, 0.08);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-sm);
  padding: clamp(18px, 3vw, 28px);
  backdrop-filter: blur(14px);
}
```

### Regole card

- Le card devono avere padding sufficiente.
- Il contenuto non deve essere attaccato ai bordi.
- Le card cliccabili devono avere feedback hover/focus.
- Le card importanti devono avere ombra leggermente più forte.
- Non creare card con stili completamente diversi senza motivo.

---

## 12. Header

L’header deve essere compatto e coerente.

Regole:

- Non deve essere troppo alto.
- Deve avere logo/titolo ben allineato.
- Le icone devono avere funzione chiara.
- Su mobile deve restare pulito.
- Non deve coprire il contenuto.
- Se contiene l’icona profilo, deve aprire una pagina o un menu reale.

---

## 13. Footer

Il footer deve essere discreto.

Regole:

- Il testo “By MiskatDesigns” deve stare in basso.
- Non deve spingere il contenuto fuori centro.
- Non deve creare scroll inutile.
- Deve essere leggibile ma non troppo invasivo.

---

## 14. Immagini

Le immagini devono essere responsive.

```css
img {
  max-width: 100%;
  height: auto;
  display: block;
}
```

Per immagini hero o poster:

```css
.hero-image {
  width: clamp(220px, 28vw, 420px);
  max-height: 55dvh;
  object-fit: contain;
}
```

Regole:

- Non usare immagini enormi che rompono il layout.
- Non usare dimensioni fisse se non necessario.
- Su desktop l’immagine deve essere proporzionata.
- Su mobile deve entrare bene nello schermo.

---

## 15. Accessibilità base

Ogni componente deve rispettare accessibilità minima.

- I pulsanti devono avere testo o `aria-label`.
- Gli input devono avere label.
- Il contrasto deve essere leggibile.
- Lo stato focus deve essere visibile.
- Non usare solo il colore per indicare errore o successo.
- Gli errori devono essere scritti in testo chiaro.

---

## 16. Regola finale

Prima di consegnare una modifica, Codex deve controllare:

- coerenza colori;
- coerenza font;
- coerenza spaziature;
- coerenza bottoni;
- coerenza card;
- desktop;
- tablet;
- mobile;
- altezza schermo piccola;
- scroll inutile;
- contenuti centrati;
- navigazione logica.

Non basta “funziona”.  
Deve sembrare una web app vera, moderna e professionale.
