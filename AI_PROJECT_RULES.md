# AI_PROJECT_RULES.md

# Regole fondamentali del progetto MagicBook

Questo progetto è una **web app**, non un semplice sito vetrina.  
Ogni modifica deve rispettare logica, usabilità, responsive design e comportamento da applicazione.

Codex deve leggere e rispettare sempre queste regole prima di modificare il progetto.

---

## 1. Principio principale

L’app deve essere progettata con logica da **applicazione**, non come una pagina web casuale.

Ogni schermata deve essere:

- chiara;
- centrata;
- responsive;
- navigabile;
- leggibile;
- coerente con il resto dell’app;
- utilizzabile su mobile, tablet e desktop.

Non bisogna aspettare che l’utente dica ogni piccolo dettaglio.  
Freccia indietro, centratura, responsive, spazi, stati di errore e comportamento dei pulsanti sono logiche base di una web app.

---

## 2. Regole generali del progetto

- Non modificare la logica esistente se non viene richiesto.
- Non rompere funzioni già presenti.
- Non cambiare nomi di file, classi, id, funzioni o variabili se non è necessario.
- Prima di aggiungere codice nuovo, controllare se esiste già qualcosa di simile.
- Non duplicare componenti, sezioni o logiche.
- Non creare soluzioni provvisorie o disordinate.
- Ogni modifica deve essere controllata su desktop, tablet e mobile.
- Ogni pagina deve mantenere lo stesso stile visivo dell’app.
- Se una schermata ha una funzione, deve avere anche una navigazione logica.

---

## 3. Comportamento da web app

La web app deve comportarsi come una vera applicazione:

- Il contenuto principale deve stare sempre centrato nello schermo.
- Le schermate principali non devono sembrare pagine vuote con elementi piccoli in alto.
- Dove possibile, tutto deve stare dentro una singola schermata visibile.
- Evitare scroll inutili.
- Lo scroll è permesso solo quando il contenuto è realmente troppo lungo.
- Header e footer non devono rubare troppo spazio.
- Il contenuto deve essere bilanciato verticalmente e orizzontalmente.
- Se esistono più pagine o schermate, deve esserci una logica di navigazione chiara.
- Se l’utente entra in una schermata secondaria, deve poter tornare indietro.
- Se esiste una pagina login e una pagina home, il passaggio tra loro deve essere logico.

---

## 4. Struttura base consigliata per ogni schermata

Usare una struttura simile per login, home, schermate errore, caricamento e pagine principali:

```html
<div class="app-screen">
  <header class="app-header">
    <!-- logo, titolo, icone -->
  </header>

  <main class="app-main">
    <section class="app-content">
      <!-- contenuto principale -->
    </section>
  </main>

  <footer class="app-footer">
    By MiskatDesigns
  </footer>
</div>
```

CSS base consigliato:

```css
.app-screen {
  min-height: 100dvh;
  display: grid;
  grid-template-rows: auto 1fr auto;
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

Se c’è un header fisso o footer fisso, calcolare bene lo spazio disponibile:

```css
.app-main {
  min-height: calc(100dvh - var(--header-height) - var(--footer-height));
}
```

---

## 5. Responsive design obbligatorio

Ogni schermata deve funzionare bene su:

- mobile piccolo;
- mobile grande;
- tablet;
- desktop;
- desktop largo.

Non bisogna sistemare solo la versione desktop.

### Desktop

- Il contenuto non deve essere troppo piccolo.
- Il contenuto non deve stare troppo in alto.
- Il blocco principale deve essere centrato nella viewport.
- Usare `max-width` per evitare elementi troppo larghi.
- Non lasciare enormi spazi vuoti senza motivo.
- Le immagini devono avere una dimensione proporzionata allo schermo.

### Mobile

- Il contenuto deve rimanere leggibile.
- Nessun elemento deve uscire dallo schermo.
- I pulsanti devono essere facili da toccare.
- I testi non devono essere troppo piccoli.
- Le immagini non devono diventare enormi.
- La pagina deve usare `100dvh`, non solo `100vh`, perché su mobile la barra del browser cambia altezza.
- Se il contenuto può entrare nello schermo, non deve esserci scroll inutile.

### Tablet

- Non usare direttamente il layout desktop.
- Gli elementi devono restare proporzionati.
- Se una card è troppo grande o troppo piccola, adattarla con `clamp()`.

---

## 6. Login page

La pagina login deve essere centrata sia su PC che su telefono.

Regole:

- Logo/immagine in alto, ma non troppo grande.
- Titolo, descrizione, input e bottone devono stare in un blocco unico.
- Il blocco deve essere centrato verticalmente e orizzontalmente.
- Il messaggio di errore deve essere vicino al form.
- Il footer “By MiskatDesigns” deve stare in basso ma non deve spingere il contenuto fuori centro.
- Su desktop non deve esserci troppo spazio vuoto sopra o sotto.
- Su mobile non deve richiedere scroll se il contenuto entra nello schermo.
- Il bottone deve essere disabilitato se il numero non è valido.
- Se c’è errore, il messaggio deve essere visibile e chiaro.

---

## 7. Home page

La home deve sembrare una dashboard/app, non una pagina casuale.

Regole:

- Il contenuto principale deve stare centrato.
- L’immagine/offerta principale deve essere ben visibile ma proporzionata.
- Le card o icone sotto devono avere distanza coerente.
- Se ci sono pulsanti o icone, devono avere significato chiaro.
- Se c’è una pagina profilo/account, l’icona utente deve aprirla.
- Se ci sono più schermate interne, deve esserci sempre un modo logico per tornare indietro.
- Non devono esserci spazi vuoti enormi senza motivo.
- Il layout deve funzionare sia su telefono che su desktop.

---

## 8. Navigazione e pulsante indietro

Se una schermata non è la prima schermata dell’app, deve avere una navigazione chiara.

Regole:

- Home principale: non serve freccia indietro.
- Login iniziale: non serve freccia indietro.
- Pagine interne: serve freccia indietro o breadcrumb.
- Modali o popup: serve pulsante chiudi.
- Pagina profilo/account: serve ritorno alla home.
- Pagina dettaglio libro/quiz/scheda: serve ritorno alla schermata precedente.
- Pagina impostazioni: serve ritorno alla schermata precedente.
- Pagina errore: deve avere un’azione chiara, per esempio “Riprova” o “Torna alla home”.

Questo comportamento non deve essere richiesto ogni volta: è una regola base dell’app.

---

## 9. Pulsanti e azioni

Ogni pulsante deve essere chiaro.

- Il testo deve spiegare l’azione.
- Il pulsante principale deve essere evidente.
- I pulsanti secondari devono essere meno forti.
- I pulsanti disabilitati devono sembrare realmente disabilitati.
- Se un input è obbligatorio, il bottone non deve funzionare finché il dato non è valido.
- Se c’è caricamento, mostrare uno stato di loading.
- Se c’è errore, mostrare un messaggio chiaro.

Esempi di testi corretti:

- Continua
- Accedi
- Torna indietro
- Apri il libro
- Inizia quiz
- Riprova
- Contatta assistenza

---

## 10. Stati obbligatori da gestire

Ogni schermata deve gestire almeno questi stati:

- caricamento;
- successo;
- errore;
- campo vuoto;
- dato non valido;
- accesso negato;
- dispositivo non autorizzato;
- nessun contenuto disponibile.

Non lasciare schermate vuote, rotte o senza spiegazione.

---

## 11. Dispositivo non autorizzato

Se appare il messaggio:

> Questo dispositivo non è più autorizzato perché l’accesso è stato spostato su un altro dispositivo.

Allora:

- il messaggio deve essere visibile;
- deve essere vicino al form;
- deve avere colore rosso leggibile;
- non deve rompere il layout;
- deve esserci una soluzione logica, per esempio:
  - contattare assistenza;
  - tornare alla schermata iniziale;
  - riprovare con un altro numero.

Non lasciare l’utente bloccato senza azione.

---

## 12. Immagini

Le immagini devono essere responsive.

```css
img {
  max-width: 100%;
  height: auto;
  display: block;
}
```

Non usare dimensioni fisse troppo grandi.

Usare `clamp()` quando serve:

```css
.hero-image {
  width: clamp(220px, 28vw, 420px);
}
```

Le immagini principali devono essere proporzionate alla viewport:

```css
.home-poster {
  width: clamp(220px, 24vw, 360px);
  max-height: 55dvh;
  object-fit: contain;
}
```

---

## 13. Font e leggibilità

- Testo minimo consigliato: 14px.
- Testo principale: 16px o più.
- Titoli proporzionati con `clamp()`.
- I colori devono essere leggibili.
- Non usare grigi troppo chiari per testi importanti.
- Non mettere testi importanti sopra immagini confuse senza overlay.
- Gli errori devono essere ben visibili.
- I placeholder non devono sembrare testo già inserito.

Esempio:

```css
.page-title {
  font-size: clamp(22px, 4vw, 34px);
}

.page-text {
  font-size: clamp(14px, 2vw, 16px);
}
```

---

## 14. Spaziature

Usare spaziature coerenti:

```css
:root {
  --space-xs: 6px;
  --space-sm: 10px;
  --space-md: 16px;
  --space-lg: 24px;
  --space-xl: 40px;
}
```

Regole:

- Non mettere elementi attaccati.
- Non creare distanze enormi senza motivo.
- I blocchi collegati devono stare vicini.
- Header, contenuto e footer devono avere proporzioni corrette.
- Su mobile ridurre le spaziature.
- Su desktop aumentare leggermente le spaziature senza disperdere il contenuto.

---

## 15. Header

L’header deve essere:

- compatto;
- coerente;
- non troppo alto;
- con logo/titolo centrato o ben allineato;
- con eventuali icone posizionate in modo logico;
- leggibile su mobile;
- non deve coprire il contenuto.

Se c’è un’icona profilo, deve essere cliccabile se rappresenta una funzione reale.

---

## 16. Footer

Il footer “By MiskatDesigns” deve essere:

- discreto;
- leggibile;
- posizionato in basso;
- non deve coprire contenuti;
- non deve causare scroll inutile;
- non deve rendere il contenuto principale fuori centro.

---

## 17. PWA e comportamento mobile

Questa app deve comportarsi come una mobile app installabile/PWA.

Regole:

- Ogni schermata principale deve stare dentro la viewport.
- Evitare scroll nelle schermate brevi come login e home.
- Usare `100dvh`.
- Evitare elementi fissi che coprono input o pulsanti.
- Su mobile i pulsanti devono essere abbastanza grandi.
- Gli input devono essere facili da usare.
- L’esperienza deve sembrare un’app, non una pagina web vecchia.

---

## 18. Accessibilità base

Ogni modifica deve rispettare almeno queste regole:

- I pulsanti devono avere testo o `aria-label`.
- Gli input devono avere label chiara.
- Il contrasto deve essere sufficiente.
- Gli elementi cliccabili devono essere riconoscibili.
- Non usare solo il colore per comunicare errore o successo.
- Gli errori devono essere scritti in testo leggibile.

---

## 19. Controllo qualità prima di consegnare

Prima di dire che il lavoro è finito, controllare:

- desktop largo;
- desktop normale;
- tablet;
- mobile;
- altezza schermo piccola;
- se serve scroll oppure no;
- se i contenuti sono centrati;
- se i pulsanti funzionano;
- se la navigazione ha senso;
- se non ci sono elementi tagliati;
- se non ci sono spazi vuoti esagerati;
- se gli errori sono leggibili;
- se header e footer non rompono il layout.

---

## 20. Prompt operativo da seguire prima di modificare

Quando ricevi una richiesta, procedi così:

1. Leggi questa regola.
2. Analizza la schermata o il codice.
3. Identifica il problema reale.
4. Correggi senza rompere la logica esistente.
5. Controlla responsive desktop/tablet/mobile.
6. Spiega quali file hai modificato e perché.

Non limitarti a eseguire alla lettera una singola richiesta visiva.  
Ragiona come sviluppatore UI/UX.

---

## 21. Prompt rapido per correggere login e home

Usare questo prompt quando bisogna sistemare layout login e home:

```txt
Leggi prima AI_PROJECT_RULES.md e poi correggi layout login e home.

Problema attuale:
- Su desktop il contenuto non è gestito come una vera web app.
- Il contenuto deve stare centrato nella schermata.
- Non voglio enormi spazi vuoti inutili.
- Non voglio scroll se il contenuto può stare in una singola viewport.
- Login e home devono essere responsive su mobile, tablet e desktop.
- Header e footer devono rimanere ordinati.
- Il footer “By MiskatDesigns” deve stare in basso, senza rompere il layout.
- La login card deve essere centrata verticalmente e orizzontalmente.
- La home deve avere il contenuto principale centrato, con immagine e icone proporzionate.
- Usa 100dvh, clamp(), max-width, media query e layout flex/grid pulito.
- Non cambiare la logica di login, dispositivi, autorizzazioni o dati.
- Modifica solo HTML/CSS/JS necessari per layout e responsive.
- Dopo la modifica, spiegami quali file hai cambiato e perché.
```

---

## 22. Regola finale

Questo progetto deve essere sviluppato con logica, non solo con istruzioni singole.

Ogni schermata deve essere:

- bella;
- ordinata;
- centrata;
- navigabile;
- responsive;
- coerente;
- usabile;
- pronta per una vera web app.

Se una cosa è comportamento normale di un’app, deve essere fatta automaticamente senza aspettare che venga richiesta ogni volta.
