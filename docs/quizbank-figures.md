# QuizBank figure delivery

Owner decision, 3 November 2026: all quiz figures must use our Cloudflare R2
image archive through the shared Vercel asset API. No external catalogue or
repository-hosted image fallback is used by QuizBank Study or Quiz.

`quizbank-figures.js` requests one image for a visible/lazy study row or the
current quiz question. The API reads the exact R2 key using the existing
MagicBook storage configuration. Successful responses retain the existing
browser cache of one day and CDN cache of seven days. API requests are not
stored by the service worker. Missing objects have a 60-second negative
cache; storage/configuration failures are not publicly cached. There is no
bulk prefetch, automatic image retry, or catalogue fallback. Manual retry
requests the same R2 object with a fresh query parameter to bypass a cached
failed image; it never selects a substitute. Stale callbacks do not update another question.

The owner confirmed that the misnumbered figure was corrected in the existing
Cloudflare archive. All figures, including 565, now use `Figure/figN.jpg`.
The temporary 565 object override has been removed. The v2 catalog query is
only a browser/CDN cache version; it does not select a different R2 folder.
No image objects were written, renamed, copied, replaced or deleted by this
release. The application always retrieves the owner's numbered archive.

## Prepared Final v3 question update (not uploaded or deployed)

Owner clarification, 3 November 2026: the existing Cloudflare R2 figure
archive is authoritative. Correct numero_figura in the private question JSON;
the existing resolver retrieves the figure by that number. Do not create,
replace, upload or introduce release-specific figure folders or catalogues.
The previous proposal to upload versioned image copies was withdrawn.
The standard number-based resolver is retained; only the obsolete 565 override
has been removed after the owner corrected the numbered object.
No remote image writes were performed. Local comparisons are audit evidence,
not proof that a remote R2 object differs and not instructions to replace it.

The owner supplied Quiz_Bank_final_v3_0.pdf, SHA-256
d3445a83769b06eee77d3a5dea0e9fbba236ac070d138578256944eead04bd89.
It replaces sheets 7, 11, 19, 20, 26, 29, 36, 40 and 45: 270 positions.
All 1,500 ordered rows were checked. The 591 illustrated rows reference
249 figure numbers in the existing archive. JSON path fields are descriptive
existing catalogue references; runtime selection continues via numero_figura.
The old JSON matches its older PDF. New physical page 56 is printed page 55.

The local release manifest contains question-archive hashes and counts only.
Question text and candidate information stay out of the repository. Source
revision tokens prevent stale pages from attaching audio to replaced content;
1,307 equivalent-content audio identities are preserved. No source-key change
or deployment has been performed. Publishing and updating the private JSON
are separate from the unchanged image archive.

Request behavior remains unchanged: archive read on a five-minute bounded
cache miss; authorization on every call; selected R2 figure reads only, with
the existing cache, cancellation, unavailable and explicit-retry behavior.
No additional image requests, upload plan, automatic retries or polling.
