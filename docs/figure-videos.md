# Video delle figure

Gestione master admin: Home → Video Gallery → Video figure. Il catalogo mostra numero, nome e immagine originali; ricerca per numero o nome. La scheda «Aggiungi video alle figure» mostra quelle ancora senza video; «Video caricati» mostra quelle completate. Caricamento MP4, sostituzione e rimozione riusano il servizio video verificato, senza copertine. Restano i limiti esistenti: 128 MB e 10 minuti.

Archivio comune R2: `magicbook-assets/xyz3d/figure-v1/figN/`. `current.json` contiene figura, numero, nome e percorso del video attuale. Il file MP4 ha una revisione distinta; una sostituzione verificata rimuove il precedente. Questi video non modificano quelli associati alle domande, conservati in `xyz3d/quiz-v1/`.

Magic Book e Quiz Bank condividono il backend Magic; All Books risolve lo stesso ID `fv_N` e lo stesso archivio. La gestione resta master-only; la riproduzione cliente autenticata è descritta sotto.

Catalogo portabile: `lib/figure-video-catalog.json`, derivato dai nomi e ID già verificati in `figure-catalog.mjs`; la copia All Books deve essere identica. Non modificare numeri o associazioni partendo dal testo di un quiz. Nessuna migrazione dei video esistenti.

La lista delle figure viene richiesta solo aprendo Video figure o aggiornando dopo una modifica: una lista paginata del prefisso figure e letture dei soli current.json esistenti, con concorrenza 8, timeout 25 secondi, cache 60 secondi e nessun polling. Gli errori non vengono convertiti in una lista vuota. Le immagini sono caricate in modo lazy tramite il resolver R2 esistente. I cambiamenti da altre istanze diventano visibili al più entro la scadenza della cache.

## Riproduzione cliente (2026-11-16)
Il lettore delle figure propone Play solo dopo una verifica positiva del video. La lettura richiede accesso valido; restituisce solo URL temporaneo e metadati di riproduzione, senza percorsi R2 o controlli amministrativi. Mutazioni e galleria rimangono master-only. Una richiesta per apertura, cache in memoria 60 secondi per account/figura (massimo 64), timeout 20 secondi, annullamento alla chiusura, nessun polling. Play apre il lettore verticale con nome della figura; X e Indietro fermano il video e ripristinano il contesto.
