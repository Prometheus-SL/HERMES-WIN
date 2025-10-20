Param(
  [switch]$Force
)

Write-Host "This script will remove legacy Rust projects from the repository:" -ForegroundColor Yellow
Write-Host " - agent-core/" -ForegroundColor Yellow
Write-Host " - agent-service/" -ForegroundColor Yellow
Write-Host " - agent-tray/" -ForegroundColor Yellow

if (-not $Force) {
  $confirm = Read-Host "Type 'YES' to confirm removal"
  if ($confirm -ne 'YES') {
    Write-Host "Aborted by user" -ForegroundColor Red
    exit 1
  }
}

# Remove directories
$paths = @('agent-core','agent-service','agent-tray')
foreach ($p in $paths) {
  if (Test-Path $p) {
    Write-Host "Removing $p ..."
    Remove-Item -Recurse -Force -Path $p
  } else {
    Write-Host "$p not found, skipping"
  }
}

# Remove top-level Cargo files if present (optional)
$files = @('Cargo.toml','Cargo.lock')
foreach ($f in $files) {
  if (Test-Path $f) {
    Write-Host "Removing $f ..."
    Remove-Item -Force $f
  }
}

Write-Host "Staged removals. Commit them now if correct." -ForegroundColor Green

# Stage and commit
git add -A
git commit -m "chore: remove legacy Rust projects (agent-core, agent-service, agent-tray)"
Write-Host "Committed removals. Push to remote branch as needed." -ForegroundColor Green


