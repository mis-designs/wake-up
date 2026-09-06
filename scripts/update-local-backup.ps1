[CmdletBinding()]
param(
  [string]$Destination = "C:\Users\miskat01\Downloads\appuimg\magicph-backup"
)

$ErrorActionPreference = "Stop"

$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$backupRoot = [IO.Path]::GetFullPath($Destination)
$expectedBackupRoot = [IO.Path]::GetFullPath("C:\Users\miskat01\Downloads\appuimg\magicph-backup")

if ($backupRoot -ne $expectedBackupRoot) {
  throw "Unexpected backup destination: $backupRoot"
}

if ($backupRoot.StartsWith($projectRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
  throw "The backup must stay outside the project directory."
}

$currentSnapshot = Join-Path $backupRoot "current"
New-Item -ItemType Directory -Path $currentSnapshot -Force | Out-Null

$excludedDirectories = @(
  (Join-Path $projectRoot ".git"),
  (Join-Path $projectRoot "node_modules"),
  (Join-Path $projectRoot ".npm-cache"),
  (Join-Path $projectRoot ".npm-cache-temp"),
  (Join-Path $projectRoot ".vercel"),
  (Join-Path $projectRoot "coverage"),
  (Join-Path $projectRoot "dist"),
  (Join-Path $projectRoot ".claude"),
  (Join-Path $projectRoot ".agents"),
  (Join-Path $projectRoot ".codex")
)

$excludedFiles = @(
  ".env",
  ".env.*",
  "*.local",
  "*.secret",
  "*.pem",
  "*.key",
  "*.p12",
  "*.pfx",
  "*.jks",
  "*.keystore",
  "credentials*.json",
  "service-account*.json",
  ".npmrc",
  ".netrc",
  "*.log",
  "*.tmp"
)

& robocopy $projectRoot $currentSnapshot /MIR /COPY:DAT /DCOPY:DAT /R:2 /W:1 /XJ /FFT /NP /NFL /NDL /XD $excludedDirectories /XF $excludedFiles
$robocopyExit = $LASTEXITCODE
if ($robocopyExit -ge 8) {
  throw "Backup copy failed with robocopy exit code $robocopyExit"
}

if (-not (Test-Path -LiteralPath (Join-Path $backupRoot ".git") -PathType Container)) {
  & git -C $backupRoot init --quiet
  if ($LASTEXITCODE -ne 0) { throw "Could not initialize the backup repository." }
}

& git -C $backupRoot config user.name "MagicPH Local Backup"
& git -C $backupRoot config user.email "magicph-backup@local.invalid"
& git -C $backupRoot config core.autocrlf false

& git -C $backupRoot add --all -- current
if ($LASTEXITCODE -ne 0) { throw "Could not stage the backup snapshot." }

& git -C $backupRoot diff --cached --quiet
$hasChanges = $LASTEXITCODE -eq 1
if ($LASTEXITCODE -gt 1) { throw "Could not inspect backup changes." }

if ($hasChanges) {
  $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  & git -C $backupRoot commit --quiet -m "backup: snapshot $timestamp"
  if ($LASTEXITCODE -ne 0) { throw "Could not commit the backup snapshot." }
  Write-Output "Backup updated: $backupRoot ($timestamp)"
} else {
  Write-Output "Backup already up to date: $backupRoot"
}
