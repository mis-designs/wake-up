# Local project workflow

- After changing any project file, run `powershell -ExecutionPolicy Bypass -File .\scripts\update-local-backup.ps1` before handing the work back to the user.
- Confirm that the backup command completed successfully.
- Never copy `.env` files, private keys, local credentials, `node_modules`, `.git`, or assistant settings into the backup.
- The backup is a local recovery repository only. Do not push it to a remote service.
