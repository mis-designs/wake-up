# QuizBank access and study

Open `/quizbank` manually after login. No link has been added to Home.
The owner's follow-up enables ordinary authenticated accounts only when GAS returns the exact `Quiz_bank` field as numeric1 or trimmed string`"1"`. Missing, blank,0, booleans and differently named fields do not grant access. The Sheet header must be exactly `Quiz_bank` (surrounding whitespace tolerated), unique, and after the original five columns; its position among extra columns is immaterial. The existing account expiry and device rules are unchanged. This flag is a separate additional entitlement, not an independent expiry/subscription/login system. A normal Magic Book subscription alone never grants QuizBank.

Signed admin sessions whose phone remains in `ADMIN_PHONE_NUMBERS` retain management access without the flag. The allow-list alone never elevates a user-role session. Only these admins can upload missing audio, with server-side denial before file decoding or any archive/storage write. Catalog and sheet responses expose `role`/`canUploadAudio`; the client does not trust locally edited role/flag values. QuizBank session tokens have a separate purpose/audience and do not become Magic Book quiz/admin tokens. The QB checkbox in the user-add form remains deferred; set the Sheet flag manually for now.

## Update the existing Google Apps Script deployment

No new Vercel project, environment variable, secret, R2 key or database column is needed. The existing access-service URL and secrets are reused.

1. In the access workbook's `Sheet1`, append a column headed `Quiz_bank`, without moving the original phone/device/expiry/registration columns. Set1 for enabled accounts,0 or blank otherwise.
2. Replace the existing access-script source in its current Apps Script project with the updated `C:\Users\miskat01\Downloads\appuimg\accesso_gas.js`. The maintained identical copy is `google-apps-script/accesso.gs`; do not paste both, and keep companion PromoAccess files/properties intact. The source reads this field from the existing row read; it never creates the header or overwrites flags during login/device rotation/renewal.
3. Save, then use Deploy → Manage deployments → select the current web app → Edit → New version → Deploy. Update the **existing deployment**, keeping its URL and access settings; do not create a second endpoint. See [Google's deployment instructions](https://developers.google.com/apps-script/concepts/deployments#edit_a_versioned_deployment).
4. The Vercel code release and Apps Script release are separate. Before GAS is updated, missing `Quiz_bank` safely denies ordinary users; admins still work. After both releases, test a valid enabled account and a valid disabled account. After changing1→0, new protected reads may use a prior verified grant for up to60s; already delivered text/audio cannot be recalled. No automatic page polling or logout/reset is required to pick up an enabled flag on the next request.

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

QuizBank entitlement: every request first checks a signed, phone/device-bound access session. A cold ordinary session makes one GAS `validate` read (10s abortable deadline including response body; no retry). Successful grants are process-local for at most60s, bounded to256 sessions/64 pending reads, keyed by a hash of signed token and identity. Same-session concurrent checks share one read; token renewal reuses the GAS response it already fetched. Denials and failures are not cached. Revocation is evaluated again on the next protected request after expiry; no background polling, whole-Sheet download, client entitlement cache or stale-on-error fallback is added. Disconnecting a waiter blocks its subsequent archive/media work but does not cancel a shared validation other requests still need. Admins retain existing signed-session validation/renewal; normal Magic Book access caching/retries are unchanged.

## Admin recording of missing explanations

Only an authorized admin sheet response supplies `canUploadAudio: true`; ordinary enabled learners receive false and no recorder action is rendered. A confirmed missing audio reveals the same + action as Magic Book. The shared `quiz-audio-recorder.js/css` opens its existing inline Spiegazione audio controls: Registra, Pausa/Riprendi, local preview, Salva. The owner explicitly rejected the former file-picker dialog. Both pages now use one recorder implementation; Magic Book retains its existing save adapter. QuizBank's same-origin POST uses existing `QUIZ_AUDIO_R2_*` and Neon configuration; **the QuizBank archive credentials remain read-only**. No new Vercel variable or CORS change is needed.

Microphone permission is requested only on Registra; capture and preview are local. QuizBank sends one POST per explicit Salva, no automatic retry, with a30s client deadline. A recoverable failure retains the recording for manual retry. Closing/navigation releases capture, timers and preview URLs, aborts pending work and ignores late completions; abort does not guarantee server rollback. QuizBank's transport accepts at most3MiB; identity comes only from the trusted private row and size/base64/signature are checked server-side. Content-addressed objects and an atomic database guard prevent an existing explanation being overwritten; retrying the same recording is idempotent. A conflicting existing recording is surfaced instead of replaced. Recordings for the49 unmatched source identities stay isolated from unproven All Books/Magic Book recordings, but use the same player and availability service.

UI/browser verification: `node scripts/quizbank-recorder-browser-qa.mjs <output-directory>` (local fixtures, no production writes). Actual account recording/save and physical iPhone audio remain release acceptance checks.

Upload storage/database operations share an abortable 12s deadline and a dedicated single-attempt storage client; existing playback retries are unchanged. A new recording uses two Neon queries and one audio-bucket PUT; an existing association/same-file retry uses one query and one fresh HEAD. Race recovery is bounded to three queries, one PUT and two HEADs. These are separate from existing access validation and the private archive cache. A missing/empty object behind an existing association reports a repair case, not playable audio or permission to overwrite it. Review/repair conflicts remain blocked; nothing is deleted automatically.

## Content integrity

The R2 JSON must be the complete verified 1500-row array (50×30), with `id`, `scheda`, `numero_domanda`, `domanda`, `risposta`, `risposta_corretta`, `ha_figura`, `numero_figura`. Extra local PDF crop/provenance fields are not exposed by the API. Boolean answer and V/F label must agree, and missing figures must be null.

Magic Book recordings match exact text + figure + answer. All Books reuse additionally requires a SHA-256 content proof against `Ed0ardo/QuizPatenteB`'s `quizPatenteB2023.json` reference (MIT); proofs contain hashes, not question text. The proof generator emits an apply_patch patch; it does not copy the private archive. Ambiguous text-only legacy recordings are not used for unmatched Magic Book questions. Current archive: 1451/1500 eligible exact identities; this does not mean 1451 recordings exist. Unmapped questions still support reading, answers and language help/TTS, but do not borrow another explanation.

Two source occurrences of figure546 (`qb_s25_q07`, `qb_s26_q07`) preserve the PDF's90° orientation. Reference657/659 ambiguity was resolved in the supplied source data; do not renumber it by question text.

## Verification / release

- `node --test tests/quizbank.test.mjs tests/quizbank-deployment.test.mjs`
- Access and recorder release: GAS/entitlement/archive/upload/deployment/study tests pass240/240; shared recorder, QuizBank integration, audio-focus/player and layout regressions pass87/87. Both browser fixture suites pass at320,375 and1440px, including the real shared recorder with a synthetic microphone on both Magic Book and QuizBank. Full repository run:971 test cases,945 passing and the same26 pre-existing failures; no new failing test names against the preceding release. Premium strict audit and design lint pass. Authenticated production recording and physical-device playback were not exercised.
- `node scripts/quizbank-browser-qa.mjs <private-full-json-path> <qa-output-directory>` with `PLAYWRIGHT_PATH` if needed. All browser requests are local fixtures; no production or database calls.
- Related study, audio, translation, trial/figure rollout tests must continue to pass. The repository's wider suite has existing stale version assertions and sandbox-dependent Git checks; report those separately instead of claiming a clean full suite.
- Live acceptance after both deployments: unauthenticated API denied; admin and enabled learner see50 sheets; a disabled learner is denied, including media; only the admin can upload. Check flag revocation after the60s bound and device/expiry protection. R2 exact bucket/key confirmed; test existing recorded explanation plus IT/BN audio on a physical iPhone. Local fixture checks cannot prove live credentials or media availability.
