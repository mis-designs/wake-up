# Bilingual quiz theory

Owner-approved release, 2026-11-11: the compact `Perché? [bulb] কেন` action opens the same explanatory card wherever a reviewed question occurs. The Bangla button label uses Hadi Rounded 700. The card uses Ekushey Lal Sabuj 600 for Bangla, Italian below, an inline audio action after each paragraph, and one playback bar. Opening never starts audio.

## Content and identity

`api/_quiz-theory.json` is the curated server data owner. The locally prepared 2026-11-17 revision covers all 443 figure-free chapter question occurrences across Magic Book chapters 1-25, using 439 distinct bilingual explanations (133 true). Four repeated occurrences share an explanation. Questions with figures remain excluded. Existing quiz wording and correct answers are not changed.

`lib/quiz-theory.cjs` reuses the existing v2 question/figure identity, requires a known matching canonical answer and refuses actual figures. There are 441 accepted keys: 439 canonical explanations and two explicitly reviewed wording equivalents (`a un incrocio` / `ad un incrocio`, and `9 posti` / `nove posti`). No fuzzy matching is permitted. The complete All Books catalogue has 406 matching rows using 403 distinct explanations; its canonical Magic snapshot has 469 matching rows including repeated exam occurrences. This does not imply coverage of the entire All Books or QuizBank catalogue. The light-quadricycle question, Magic `cap1_q34`, has no All Books equivalent; it must never be matched to the opposite non-light-quadricycle proposition.

`quiz-theory-index.js` contains availability hashes only, without answers, explanations or question text. Each product adapter resolves its own authorized canonical row. A browser-supplied answer or explanation is never authoritative. QuizBank also retains its current-content HMAC check. An unknown, changed, ambiguous or conflicting row must fail closed.

The original editorial draft and its source notes are in the owner's project workspace under `outputs/teoria-capitolo-1`; they are not browser assets. Q30 and Q31 retain the existing true answer while explicitly describing the alternative L5e thresholds, rather than teaching that both thresholds are always required. Reference: [ACI, article 47](https://aci.gov.it/codice-della-strada/art-47/). The bilingual content has assistant editorial review; no independent human linguistic review is claimed.

## Transport and lifecycle

The hash index adds no per-question API requests. `getQuizTheory` reads one explanation only after activation through the product's existing authorization boundary. `getQuizTheoryAudio` reads only the server-owned Italian or Bangla explanation, using the existing GAS speech actions. No new GAS deployment, credential, account permission or answer-grading policy is required.

One explicit language action makes one application request. Its upstream speech work is bounded to at most three sequential chunks; the present content is at most 345 Italian / 332 Bangla UTF-16 units in this revision. There is no autoplay, pre-generation, polling or automatic retry. Closing, navigation, a new question, logout or a superseding language stops playback and cancels obsolete client work; late responses cannot reopen a card or start playback. Already submitted upstream synthesis cannot necessarily be recalled.

The shared UI keeps bounded memory-only caches (36 text entries, eight audio entries, five-minute TTL), scoped to the active account/session. No theory response or audio is put into localStorage, IndexedDB or the service-worker cache. API responses are private/no-store; static hashes, UI code, fonts and styles may be cached. Direct server-data paths are guarded by deployment routes.

Existing trial policy remains authoritative: the disabled guest trial is not activated by this feature. Its dormant text path is restricted to issued question IDs; explanation audio remains Premium.

## Extending coverage

1. Review each new question's exact text, figure identity, canonical answer and Italian/Bangla explanation. Preserve short separator hyphens with spaces; do not silently rewrite the quiz.
2. Add the reviewed record and explicit aliases to the shared server data in both products. Regenerate the hash-only index from `records.flatMap(record => record.keys)`; never export full records to a public asset.
3. In All Books, update the minimal canonical Magic-row snapshot if adding Magic questions. Verify against the current Magic source bank and the compiled QuizBook bank, including conflicting answers. A corrected answer requires re-review of its explanation, not automatic reuse.
4. Run the resolver, product API and real-page browser checks. Verify question/alias coverage, unauthorized denial, stale QuizBank content, request counts, cancellation, retry, audio language switching, and 320px layout with the actual fonts.
5. Version the shared UI/index URLs and service-worker cache when content or code changes, and publish both products from the same validated content revision.

The shared component is `quiz-theory.js/css`; modal and audio-focus behavior belongs to `app-popup.js` and `audio-focus.js`. Product adapters own authentication, placement and navigation. Do not duplicate the dialog or generate a separate theory copy per quiz mode.

## Content update prepared 2026-11-15

Added all figure-free questions from chapters 6 (cap6_q8, cap6_q14, cap6_q17) and 9 (cap9_q7), in that order. Chapters 2-5, 7-8 and 10 have no figure-free rows in the current Magic catalogue. Total: 71 explanations, 73 identity keys. Canonical answers and existing 67 records remain unchanged. References: DPR 495/1992 art.141(3), art.148(4,8,9), and CdS art.41(19-bis,19-ter). Italian and Bangla editorial review by assistant; no independent human certification claimed. Portable UTF-8 export: output/quiz-explanations/perche-completo-it-bn.json in owner workspace; source notes: verifica-capitoli-6-9.json alongside it. This earlier preparation is superseded by the complete revision below.

## Complete figure-free revision prepared 2026-11-17

Supersedes the 71-record preparation above. All 443 eligible chapter occurrences are covered; the original 71 records and canonical answers are preserved. Chapters 2-5, 7-8 and 10 contain no eligible figure-free questions. Each new focus phrase is a literal excerpt from the canonical question. Memory aids explain contextual distinctions, never an unconditional word-to-answer heuristic.

Portable artifacts in the owner workspace, under `output/quiz-explanations/`:
- `perche-completo-it-bn.json`: complete UTF-8 export, matching both private server data copies.
- `copertura-capitoli.json`: per-chapter coverage and question-to-explanation mapping.
- `fonti-e-revisione.json`: topic references and sensitive editorial decisions.
- `chapters/`: chapter inventories and original bilingual editorial drafts.
- `verifica-finale.json`: local test evidence and limitations.

Validation: 41 automated tests across both products, plus five browser scenarios with real fonts and 320/375/768px layouts. Browser audio playback was simulated; no live speech synthesis or production-wide probes were run. Figure-bearing and opposite-answer inputs are rejected. Both products share identical private records and hash availability index. The bilingual content has assistant editorial review, not independent human certification.

Complete revision included in the owner-requested 2026-11-17 release alongside figure-video chapter organization. Deployment evidence is retained in the owner workspace.
