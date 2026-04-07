$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$nativeRoot = Join-Path $projectRoot 'src\native\win_volume'
$releaseDir = Join-Path $nativeRoot 'target\release'
$dllPath = Join-Path $releaseDir 'win_volume.dll'
$nodePath = Join-Path $releaseDir 'win_volume.node'

if ($env:HERMES_ENABLE_NATIVE_AUDIO -ne '1') {
  Write-Host "Skipping optional native addon 'win_volume'. Hermes uses the PowerShell audio path by default."
  return
}

Push-Location $nativeRoot
try {
  cargo build --release
  if ($LASTEXITCODE -ne 0) {
    Write-Warning "Optional native addon 'win_volume' failed to build. Hermes will keep using the PowerShell audio path."
    return
  }

  if (-not (Test-Path $dllPath)) {
    Write-Warning "Optional native addon output '$dllPath' was not found. Hermes will keep using the PowerShell audio path."
    return
  }

  Copy-Item $dllPath $nodePath -Force
  Write-Host "Native addon ready at $nodePath"
} finally {
  Pop-Location
}
