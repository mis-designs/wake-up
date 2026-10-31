# QuizBank access and study

Open `/quizbank` manually after login. No link has been added to Home.
## Current promotion: included with Magic Book (owner decision, 2026-10-31)

Valid, server-verified Magic Book accounts can currently use QuizBank even when `Quiz_bank` is0, blank or absent. This is not anonymous or trial access: the signed phone/device session and the existing GAS account/device/expiry validation still apply before private data or media is read. Expired/unknown accounts and invalid/replaced devices remain denied; upstream errors fail closed. The flag is preserved, not rewritten or deleted.

The server-only `QUIZBANK_ACCESS_MODE` switch controls this policy:

- Unset (the current default), or `magicbook`: promotional inclusion for valid Magic Book accounts.
- `separate`: restore the original additional entitlement. GAS must return exact `Quiz_bank` numeric1 or trimmed string"1"; missing,0 or blank denies ordinary accounts.
- Any other value, including an explicitly empty value: configuration failure, no access grant.

No Vercel environment addition or Google Sheet/GAS change is needed to start this promotion: publishing the code enables the default. To end it, set `QUIZBANK_ACCESS_MODE=separate` in the Vercel project's Production environment and redeploy. Keep the existing column and Admin create/edit flags; they continue saving explicit1/0 for later separate access. During the promotion those saved flags do not restrict learner access. There is no automatic promotion end date.

Both modes use the existing one-GAS-read validation path, shared in-flight work and non-sliding60s positive cache. The mode is captured per request and included in pending/cache keys, so a promotional grant cannot satisfy a separate-mode request. A request already authorized under the previous mode may finish; a redeployment is the operational switch. No background polling, extra reads, account migration or new client entitlement is introduced.

### Preserved separate-access contract

In `separate` mode, the Sheet header must be exactly `Quiz_bank` (surrounding whitespace tolerated), unique, and after the original five columns; its position among extra columns is immaterial. Account expiry and device rules are unchanged. The flag is an additional entitlement, not an independent expiry/subscription/login system.

Signed admin sessions whose phone remains in `ADMIN_PHONE_NUMBERS` retain management access without the flag. The allow-list alone never elevates a user-role session. Only these admins can upload missing audio, with server-side denial before file decoding or any archive/storage write. Catalog and sheet responses expose `role`/`canUploadAudio`; the client does not trust locally edited role/flag values. QuizBank session tokens have a separate purpose/audience and do not become Magic Book quiz/admin tokens. The existing Admin user modal has six independent QB checkboxes, initially unchecked, and an Accesso QuizBank checkbox in Edit. An explicit save writes numeric1/0; changing the checkbox alone does not make requests. Recent/list/search return the saved flag, shown in each user card. Legacy updates that omit the field and renew/device-reset operations preserve it.

## Preserved Google Apps Script setup (not required for the promotion)

The original flag setup needs no new Vercel project, secret or R2 key. The existing Sheet needs the Quiz_bank column below. The existing access-service URL and secrets are reused.

1. In the access workbook's `Sheet1`, append a column headed `Quiz_bank`, without moving the original phone/device/expiry/registration columns. Set1 for enabled accounts,0 or blank otherwise.
2. Replace the existing access-script source in its current Apps Script project with the updated `C:\Users\miskat01\Downloads\appuimg\accesso_gas.js`. The maintained identical copy is `google-apps-script/accesso.gs`; do not paste both, and keep companion PromoAccess files/properties intact. The source reuses the existing row read and never creates the header. Only authenticated admin_add/admin_update can write the flag; login/device rotation/renewal cannot. Header/value validation happens before any mutation. A missing, duplicated or misplaced header returns quizbank_column_missing; numeric0/1 is returned to confirm each save.
3. Save, then use Deploy → Manage deployments → select the current web app → Edit → New version → Deploy. Update the **existing deployment**, keeping its URL and access settings; do not create a second endpoint. See [Google's deployment instructions](https://developers.google.com/apps-script/concepts/deployments#edit_a_versioned_deployment).
4. The Vercel code release and Apps Script release are separate. Deploy this GAS version before using the new Admin checkbox. An old GAS may already save the phone but ignore the flag: Vercel reports quizbank_not_confirmed rather than claiming success; refresh the user list and edit that number after updating GAS. In separate mode, before GAS is updated, missing `Quiz_bank` safely denies ordinary users; admins still work. After both releases, test a valid enabled account and a valid disabled account. After changing1→0, new protected reads may use a prior verified grant for up to60s; already delivered text/audio cannot be recalled. No automatic page polling or logout/reset is required to pick up an enabled flag on the next request.

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

Admin entitlement saves: no request on toggle; one existing /api/admin POST and one GAS POST per submitted user (maximum six sequential creates), then the existing scoped user-list refresh. No new permission lookup, polling, optimistic grant or mutation retry. GAS serializes create/update with a5s script lock and validates the exact unique header/value before writing. Each mutation has a30s browser deadline; uncertain completion is reported and retained for manual verification, not replayed. Existing bounded read retries/token refresh remain unchanged. Grant/revocation uses the already documented60s entitlement cache bound.

One authorized catalog request on entry; one selected-sheet request per open/retry (30 rows). Opening a sheet via its URL needs only that sheet request. Search and Back within the page do not read the archive again. R2: one GetObject per warm process per five minutes, concurrent same-object reads coalesced; 4MiB limit, 12s deadline including body, no SDK retries, no failed-response caching. Each API call authenticates before any cached content is used. Serverless instances have independent caches, so this is not a global once-per-five-minutes guarantee.

No full archive or answers are stored in browser storage or the public repository. The API responses bypass HTTP/CDN/service-worker caches. Existing public language resources load only when help or Bangla audio is requested. Availability checks are delayed and limited to visible questions; unverified associations use only isolated QuizBank identities and never probe other recordings. Audio playback/TTS reuse the existing bounded shared service caches and error handling. GitHub is the primary figure source; only a failed image requests our existing asset endpoint.

QuizBank entitlement: every request first checks a signed, phone/device-bound access session. A cold ordinary session makes one GAS `validate` read (10s abortable deadline including response body; no retry). Successful grants are process-local for at most60s, bounded to256 sessions/64 pending reads, keyed by a hash of access mode, signed token and identity. Same-session concurrent checks share one read; token renewal reuses the GAS response it already fetched. Denials and failures are not cached. Revocation is evaluated again on the next protected request after expiry; no background polling, whole-Sheet download, client entitlement cache or stale-on-error fallback is added. Disconnecting a waiter blocks its subsequent archive/media work but does not cancel a shared validation other requests still need. Admins retain existing signed-session validation/renewal; normal Magic Book access caching/retries are unchanged.

## Admin recording of missing explanations

Only an authorized admin sheet response supplies `canUploadAudio: true`; ordinary enabled learners receive false and no recorder action is rendered. A confirmed missing audio reveals the same + action as Magic Book. The shared `quiz-audio-recorder.js/css` opens its existing inline Spiegazione audio controls: Registra, Pausa/Riprendi, local preview, Salva. The owner explicitly rejected the former file-picker dialog. Both pages now use one recorder implementation; Magic Book retains its existing save adapter. QuizBank's same-origin POST uses existing `QUIZ_AUDIO_R2_*` and Neon configuration; **the QuizBank archive credentials remain read-only**. No new Vercel variable or CORS change is needed.

Microphone permission is requested only on Registra; capture and preview are local. QuizBank sends one POST per explicit Salva, no automatic retry, with a30s client deadline. A recoverable failure retains the recording for manual retry. Closing/navigation releases capture, timers and preview URLs, aborts pending work and ignores late completions; abort does not guarantee server rollback. QuizBank's transport accepts at most3MiB; identity comes only from the trusted private row and size/base64/signature are checked server-side. Content-addressed objects and an atomic database guard prevent an existing explanation being overwritten; retrying the same recording is idempotent. A conflicting existing recording is surfaced instead of replaced. Recordings for the49 unmatched source identities stay isolated from unproven All Books/Magic Book recordings, but use the same player and availability service.

UI/browser verification: `node scripts/quizbank-recorder-browser-qa.mjs <output-directory>` (local fixtures, no production writes). Actual account recording/save and physical iPhone audio remain release acceptance checks.

Upload storage/database operations share an abortable 12s deadline and a dedicated single-attempt storage client; existing playback retries are unchanged. A new recording uses two Neon queries and one audio-bucket PUT; an existing association/same-file retry uses one query and one fresh HEAD. Race recovery is bounded to three queries, one PUT and two HEADs. These are separate from existing access validation and the private archive cache. A missing/empty object behind an existing association reports a repair case, not playable audio or permission to overwrite it. Review/repair conflicts remain blocked; nothing is deleted automatically.

## Same-sheet practice (2026-10-30)

Study shows the correct V/F mark immediately. Its CTA opens `/quiz?source=quizbank&scheda=N` in the existing quiz engine, with all30 questions in original order, including after study search filters the visible list. The existing20-minute timer, 27/30 pass threshold and result review are reused. This attempt does not write to Magic Book learning statistics, local mistake review or any new persistent storage. Back returns to the same study sheet.

`GET /api/quizbank?action=getQuiz&chapters=N` returns copied rows without `correct`, `quizbankRevision`, existing quiz session fields, and server-confirmed audio capability. `POST checkQuiz` accepts `chapters`, `quizbankRevision`, and exactly30 ordered `{id,answer:0|1|null}` entries. The revision is a SHA-256 of trusted sheet content. The server checks the existing QuizBank entitlement before archive access, rejects forged/duplicate/reordered IDs and invalid values, and grades only the private canonical answers. A corrected archive yields409 `quizbank_revision_changed`; the UI offers an explicit restart instead of silently discarding work. Permission denial clears private attempt data; recoverable submission errors retain answers for manual retry.

Budget: one start GET and one explicit finish/timer-end POST per attempt, no per-answer request or additional animation request. Auth and five-minute R2 cache limits remain as above; no public question cache. Media and missing-only admin recording use `/api/quizbank` with the same shared UI, identity and size limits. No direct upload, replacement or deletion is exposed by this variant.

## Source identity

The R2 JSON must be the complete verified 1500-row array (50×30), with `id`, `scheda`, `numero_domanda`, `domanda`, `risposta`, `risposta_corretta`, `ha_figura`, `numero_figura`. Extra local PDF crop/provenance fields are not exposed by the API. Boolean answer and V/F label must agree, and missing figures must be null.

Magic Book recordings match exact text + figure + answer. All Books reuse additionally requires a SHA-256 content proof against `Ed0ardo/QuizPatenteB`'s `quizPatenteB2023.json` reference (MIT); proofs contain hashes, not question text. The proof generator emits an apply_patch patch; it does not copy the private archive. Ambiguous text-only legacy recordings are not used for unmatched Magic Book questions. Current archive: 1451/1500 eligible exact identities; this does not mean 1451 recordings exist. Unmapped questions still support reading, answers and language help/TTS, but do not borrow another explanation.

Two source occurrences of figure546 (`qb_s25_q07`, `qb_s26_q07`) preserve the PDF's90° orientation. Reference657/659 ambiguity was resolved in the supplied source data; do not renumber it by question text.

## Verification / release

Promotion release (2026-10-31):277 focused test cases pass across access, attempts, audio, upload, Admin and GAS flag retention. Coverage includes default/explicit promotion, no flag/0/blank, valid account/device validation, forged/trial/mismatched sessions, expired accounts, upstream failures, no Admin elevation, all read/media routes, study/start/grade, one-read renewal/coalescing,60s non-sliding cache, and mode changes with cached/pending grants. Full suite1080 cases/1052 passes retains the same28 preceding failures with no new failure names. DESIGN lint passes. Tests use intercepted local transports; no real account, GAS, R2 or Neon reads/writes are used for acceptance.

Admin flag release (2026-10-28): six independent create flags, saved edit grant/revoke, hidden flag during renewal, inline partial-failure recovery, duplicate-submit prevention and keyboard/popup behavior pass the local browser matrix1440x900,375x812,320x640,375x812 native-theme and640x450. tests/admin-quizbank.test.mjs covers authorized forwarding, bad values, missing/old GAS acknowledgment, unchanged renewals, retained read metadata and no mutation replay; the extended GAS VM tests cover both GET/POST routes, exact column positions, default0,1→0, missing/ambiguous headers and original account/device data. Full suite retains the same26 pre-existing failures; no new failure names. CSS build, strict UI audit and DESIGN lint pass. Google Apps Script publication and real-account acceptance are not performed by local tests.

- `node --test tests/quizbank.test.mjs tests/quizbank-deployment.test.mjs`
- Access and recorder release: GAS/entitlement/archive/upload/deployment/study tests pass240/240; shared recorder, QuizBank integration, audio-focus/player and layout regressions pass87/87. Both browser fixture suites pass at320,375 and1440px, including the real shared recorder with a synthetic microphone on both Magic Book and QuizBank. Full repository run:971 test cases,945 passing and the same26 pre-existing failures; no new failing test names against the preceding release. Premium strict audit and design lint pass. Authenticated production recording and physical-device playback were not exercised.
- `node scripts/quizbank-browser-qa.mjs <private-full-json-path> <qa-output-directory>` with `PLAYWRIGHT_PATH` if needed. All browser requests are local fixtures; no production or database calls.
- Related study, audio, translation, trial/figure rollout tests must continue to pass. The repository's wider suite has existing stale version assertions and sandbox-dependent Git checks; report those separately instead of claiming a clean full suite.
- Live acceptance after both deployments: unauthenticated API denied; admin and enabled learner see50 sheets; a disabled learner is denied, including media; only the admin can upload. Check flag revocation after the60s bound and device/expiry protection. R2 exact bucket/key confirmed; test existing recorded explanation plus IT/BN audio on a physical iPhone. Local fixture checks cannot prove live credentials or media availability.
