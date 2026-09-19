# Local project workflow

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
