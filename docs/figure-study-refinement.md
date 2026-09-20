# Figure study: Android preview refinement, 2026-09-20

## Scope and ownership

Only the existing installed Android marker enables this section. Ordinary browsers, embedded social browsers and trial remain chapter-only. No Android binary, authentication, payments, score persistence or shared quiz UI changes. Deployment remains the owner's responsibility.

The section title stays fixed. Categories are compact ruled rows; phone galleries are image/text rows instead of tall narrow cards. Long Italian/Bangla copy wraps without truncation. Detail images are bounded, support sections compact, source notes collapsed. Runtime native palette and existing fonts are reused, without animations or extra category image requests.

## Editorial changes

- Move fig86 (Parcheggio) from Divieto to Indicazione; all186 IDs remain unique and present.
- Preview display labels simplify repetitive panel prefixes; canonical Italian/BN catalog data remains intact for existing consumers.
- Preview Bangla revisions: fig17, fig18, fig121, fig122, fig125, fig126. These are educational translations, not a certified Bangla legal text; native-language editorial review remains required before public rollout.
- Six deliberately short teaching notes use exact quiz IDs, not regulatory figure numbers. fig121/122/125/126: Regolamento art.83, distance/extent/time/limitation; fig15: art.88, advance pedestrian warning; fig218: art.135, location of crossing. Reference: [Regolamento published by ACI](https://rivistagiuridica.aci.it/fileadmin/Documenti/regolamento_codice_della_strada.pdf), consulted2026-09-20. No universal150m claim, inferred intersection order or invented true/false example.
- Other186-catalog entries retain their existing identities; this revision does not claim a full independent translation audit.

## Network budget and recovery

Entering a lesson: zero explanation metadata/example calls. First explicit illustration open: at most one getExplanationFigures read, deduplicated, cached60seconds by user/device, memory maximum16entries; one exact image request only when the manifest contains a validated filename. Closing/reopening the same disclosure reuses its DOM. No format probes or automatic retries.

Manual metadata retry invalidates only that entry, leaving examples cached. Confirmed absence differs from an incomplete catalog. Both remain small, optional states and keep practice available. Leaving cancels pending reads and prevents late results from replacing a new route; timers clear and the single delegated listener is removed on destroy. First explicit practice click reads at most one getFigureStudy response with max two original examples. Scores stay untouched.

The existing server intentionally withholds image filenames when its explanation-listing storage differs from the asset-serving storage (`explanationListingMatchesAssets`). Local inspection identifies this possible cause, not the deployed environment. No private credentials or production bucket settings were changed; live Allbooks archive completeness has not been verified. Do not hide this uncertainty by guessing image URLs or treating an incomplete response as definitive absence.

## Verification and release check

Local unit tests cover the gate, unique IDs, labels/search, genuine examples, cache/deduplication/invalidation, cancellation and deadlines. Mocked browser tests cover Android375/320portrait and740landscape; browser320/768/1440 remain disabled. Check stable header, search/IME, pagination focus, Back position, popup close preserving answers, demand-only calls, errors/retry, and200% text reflow. No production polling or load tests.

Verification result: full repository suite586/586 passed; all six mocked viewport cases passed, including incomplete-manifest retry and confirmed absence without repeated image probes. CSS build, whitespace check, DESIGN lint and configured strict UI audit passed. Screenshots were inspected with local numberless figure assets. These are local browser tests, not a physical-device or deployed-storage verification. Existing release-cache assertions were mechanically advanced to epoch209; their behavioral expectations were not weakened.

After deployment, check one real Android session and a known uploaded Allbooks illustration. If metadata remains incomplete, reconcile the existing listing/asset configuration with the verified archive owner; do not loosen protected asset authorization. A native Bangla review of all186 names is still outstanding. A new APK/AAB is not required for this web-served refinement.

## Design drift

Preserved: installed-app gate, palette, fonts, numberless images, shared popup and request/auth owners. Deliberate change: fixed section title, reduced density, optional illustration disclosure and scoped editorial aids. Unchanged: public web presentation and native release binary. Not claimed: production archive repair or comprehensive certified translation accuracy.
