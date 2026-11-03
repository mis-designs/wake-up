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

The versioned `catalog=quizbank-r2-v1` query prevents old fallback responses
from being reused. For figure 565 it selects `Figure/quizbank-fig565-v1.jpg`,
the exact owner-supplied correct JPEG (SHA-256
`011431ca0bdfeb04ea54d025ff15e59755b84af2e0b126c984c015b94c9e46c2`).
If the object has not been uploaded, the UI shows the unavailable/retry state.
It must never fall back to `Figure/fig565.jpg`, confirmed to have different
lane arrows. The original object remains unchanged for existing consumers.
Other figures retain their existing `Figure/figN.jpg` paths in R2. Their
visual correctness is not certified by this delivery change.

The supplied 50-sheet JSON places the reported figure at qb_s03_q04 and
qb_s46_q04. Figure 564 is different and remains distinct. No question text,
answer, audio identity or special figure-546 rotation changes. The reference
image was visually checked against the owner's attachment and the extracted
PDF figure pdf_027. No private question archive or exam candidate information
is committed. The image must be uploaded to R2 before these two questions
can display it.
