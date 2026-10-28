# QuizBank preview

Open `/quizbank` manually after an admin login. No link has been added to Home.
Only a valid signed admin session whose phone remains in `ADMIN_PHONE_NUMBERS` may use the API. Ordinary Magic Book access does not grant QuizBank. The requested Google Sheet `QuizBank` column and QB admin checkbox are a later release, not implemented here.

## Production configuration

The two environment names supplied by the owner are supported exactly:

- `quiz_bank_access_key_id`
- `quiz_bank_secret_access_key`

Account ID: `QUIZBANK_R2_ACCOUNT_ID` (or `quiz_bank_account_id`), falling back to the existing `BOOK_R2_ACCOUNT_ID`, then `QUIZ_AUDIO_R2_ACCOUNT_ID`. Never fall back to another bucket's credentials.

Defaults based on the setup conversation:

- Bucket: `quizbank` (override `QUIZBANK_R2_BUCKET`).
- Object key at bucket root: `magic_book_quiz_bank_50_schede_completo.json` (override `QUIZBANK_R2_KEY` if uploaded under another exact name).

Keep R2 private and use read-only credentials scoped to this bucket. No browser-side keys, public R2 URL, CORS changes, bucket listing or write permissions are required. Deploy after adding Production variables. Preview deployments need separately configured Preview variables if used.

## Request and cache budget

One authorized catalog request on entry; one selected-sheet request per open/retry (30 rows). Opening a sheet via its URL needs only that sheet request. Search and Back within the page do not read the archive again. R2: one GetObject per warm process per five minutes, concurrent same-object reads coalesced; 4MiB limit, 12s deadline including body, no SDK retries, no failed-response caching. Each API call authenticates before any cached content is used. Serverless instances have independent caches, so this is not a global once-per-five-minutes guarantee.

No full archive or answers are stored in browser storage or the public repository. The API responses bypass HTTP/CDN/service-worker caches. Existing public language resources load only when help or Bangla audio is requested. Availability checks are delayed and limited to visible questions; unverified associations use only isolated QuizBank identities and never probe other recordings. Audio playback/TTS reuse the existing bounded shared service caches and error handling. GitHub is the primary figure source; only a failed image requests our existing asset endpoint.

## Admin upload of missing explanations

The authorized sheet response supplies `canUploadAudio: true`; no uploader is rendered without it. A confirmed missing audio reveals Carica audio. Select one MP3/M4A/WAV/OGG/WebM up to 3MiB, listen to the local preview, then explicitly save. No microphone, recording, deletion or replacement is introduced. The same-origin POST uses existing `QUIZ_AUDIO_R2_*` and Neon configuration; **the QuizBank archive credentials remain read-only**. No new Vercel variable or CORS change is needed.

One POST per explicit save, no automatic upload retry. The browser has a 30s deadline and an interrupt-wait action; stopping the wait cannot guarantee server rollback. Keep the selected file for manual retry. Identity comes only from the trusted private row; file size/base64/signature are checked on the server. Content-addressed objects and an atomic database guard prevent an existing explanation being overwritten; retrying the same file is idempotent. A conflicting existing recording is surfaced instead of replaced. Uploads for the 49 unmatched source identities stay isolated from unproven All Books/Magic Book recordings, but are readable through the same player and availability service.

UI/browser verification: `node scripts/quizbank-upload-browser-qa.mjs <output-directory>` (local fixtures, no production writes). Actual account upload and physical iPhone audio remain release acceptance checks.

Upload storage/database operations share an abortable 12s deadline and a dedicated single-attempt storage client; existing playback retries are unchanged. A new recording uses two Neon queries and one audio-bucket PUT; an existing association/same-file retry uses one query and one fresh HEAD. Race recovery is bounded to three queries, one PUT and two HEADs. These are separate from existing access validation and the private archive cache. A missing/empty object behind an existing association reports a repair case, not playable audio or permission to overwrite it. Review/repair conflicts remain blocked; nothing is deleted automatically.

## Content integrity

The R2 JSON must be the complete verified 1500-row array (50×30), with `id`, `scheda`, `numero_domanda`, `domanda`, `risposta`, `risposta_corretta`, `ha_figura`, `numero_figura`. Extra local PDF crop/provenance fields are not exposed by the API. Boolean answer and V/F label must agree, and missing figures must be null.

Magic Book recordings match exact text + figure + answer. All Books reuse additionally requires a SHA-256 content proof against `Ed0ardo/QuizPatenteB`'s `quizPatenteB2023.json` reference (MIT); proofs contain hashes, not question text. The proof generator emits an apply_patch patch; it does not copy the private archive. Ambiguous text-only legacy recordings are not used for unmatched Magic Book questions. Current archive: 1451/1500 eligible exact identities; this does not mean 1451 recordings exist. Unmapped questions still support reading, answers and language help/TTS, but do not borrow another explanation.

Two source occurrences of figure546 (`qb_s25_q07`, `qb_s26_q07`) preserve the PDF's90° orientation. Reference657/659 ambiguity was resolved in the supplied source data; do not renumber it by question text.

## Verification / release

- `node --test tests/quizbank.test.mjs tests/quizbank-deployment.test.mjs`
- Upload release: `node --test tests/quizbank-upload.test.mjs tests/quizbank-upload-ui.test.mjs` plus the catalog/deployment tests (70 passing). Both browser fixture suites pass at 320, 375 and 1440px. Full repository run: 747 passing, 26 failures already present before this change; no new failing test names. Premium strict audit and design lint pass. Authenticated production upload and physical-device playback were not exercised.
- `node scripts/quizbank-browser-qa.mjs <private-full-json-path> <qa-output-directory>` with `PLAYWRIGHT_PATH` if needed. All browser requests are local fixtures; no production or database calls.
- Related study, audio, translation, trial/figure rollout tests must continue to pass. The repository's wider suite has existing stale version assertions and sandbox-dependent Git checks; report those separately instead of claiming a clean full suite.
- Live acceptance after deployment: unauthenticated API denied; admin sees50 sheets and can open one; ordinary account denied; R2 exact bucket/key confirmed; test existing recorded explanation plus IT/BN audio on a physical iPhone. Local fixture checks cannot prove live credentials or media availability.
