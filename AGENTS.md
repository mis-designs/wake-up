# Local project workflow

## Production UI standard (owner decision, 2026-09-22)

- This is an actively used product, not a prototype. Finish each touched workflow in its real data, empty, saved/offline, failure and recovery states on both web and installed Android.
- Write for the learner: show progress, chapters and useful next actions. Do not expose internal synchronization queues or database terminology as headline metrics or warnings. Preserve truthful period/coverage information in concise supporting copy and accessible details.
- Statistics need readable, correctly labelled charts and chapter-level results from actual data. Never fabricate trends, readiness, percentages or missing history to fill space.
- Use the available desktop width with a deliberate responsive grid and a natural mobile scroll. A narrow fallback card is not an acceptable replacement for the main experience.
- Reuse the real data and UI owners; verify rendered screenshots and interactions, not just source assertions. Preserve authorization, grading and storage retention. Record durable owner-approved design changes in DESIGN.md and UX-CONTRACT.md.

- After changing any project file, run `powershell -ExecutionPolicy Bypass -File .\scripts\update-local-backup.ps1` before handing the work back to the user.
- Confirm that the backup command completed successfully.
- Never copy `.env` files, private keys, local credentials, `node_modules`, `.git`, or assistant settings into the backup.
- The backup is a local recovery repository only. Do not push it to a remote service.

## Request and cost safety

- Default to local fixtures and mocked services for development and regression tests. Do not run production polling, repeated smoke tests, bulk probes or load tests without explicit authorization.
- Before adding or changing network work, state the trigger, expected request count, cache lifetime, cancellation and failure behavior. Add request-count regression tests for fan-out, retries and repeated navigation.
- Prefer lazy reads for the item being used. Do not scan every item/format when a complete availability list exists. Deduplicate concurrent reads and bound caches by size and lifetime.
- Cancel obsolete fetches, clear timers and disconnect observers when their screen leaves; preserve back/forward restoration. Do not retry endlessly or poll in hidden pages.
- Keep authorization, payments, answer persistence and private book protection intact. Public caching must never include private user data or authenticated book content.
- Avoid routine per-request production logs and never log credentials or personal data. Preserve actionable errors and security diagnostics. Observability events also include requests, not just console output.
- Separate historical samples and local benchmarks from current production measurements. Do not promise a billing reduction without an equivalent before/after usage window. Do not commit, push or deploy unless requested.
