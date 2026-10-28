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

No full archive or answers are stored in browser storage or the public repository. The API responses bypass HTTP/CDN/service-worker caches. Existing public language resources load only when help or Bangla audio is requested. Availability checks are delayed and limited to visible mapped questions; no Neon query for unverified associations. Audio playback/TTS reuse the existing bounded shared service caches and error handling. GitHub is the primary figure source; only a failed image requests our existing asset endpoint.

## Content integrity

The R2 JSON must be the complete verified 1500-row array (50×30), with `id`, `scheda`, `numero_domanda`, `domanda`, `risposta`, `risposta_corretta`, `ha_figura`, `numero_figura`. Extra local PDF crop/provenance fields are not exposed by the API. Boolean answer and V/F label must agree, and missing figures must be null.

Magic Book recordings match exact text + figure + answer. All Books reuse additionally requires a SHA-256 content proof against `Ed0ardo/QuizPatenteB`'s `quizPatenteB2023.json` reference (MIT); proofs contain hashes, not question text. The proof generator emits an apply_patch patch; it does not copy the private archive. Ambiguous text-only legacy recordings are not used for unmatched Magic Book questions. Current archive: 1451/1500 eligible exact identities; this does not mean 1451 recordings exist. Unmapped questions still support reading, answers and language help/TTS, but do not borrow another explanation.

Two source occurrences of figure546 (`qb_s25_q07`, `qb_s26_q07`) preserve the PDF's90° orientation. Reference657/659 ambiguity was resolved in the supplied source data; do not renumber it by question text.

## Verification / release

- `node --test tests/quizbank.test.mjs tests/quizbank-deployment.test.mjs`
- `node scripts/quizbank-browser-qa.mjs <private-full-json-path> <qa-output-directory>` with `PLAYWRIGHT_PATH` if needed. All browser requests are local fixtures; no production or database calls.
- Related study, audio, translation, trial/figure rollout tests must continue to pass. The repository's wider suite has existing stale version assertions and sandbox-dependent Git checks; report those separately instead of claiming a clean full suite.
- Live acceptance after deployment: unauthenticated API denied; admin sees50 sheets and can open one; ordinary account denied; R2 exact bucket/key confirmed; test existing recorded explanation plus IT/BN audio on a physical iPhone. Local fixture checks cannot prove live credentials or media availability.
