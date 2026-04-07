$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$releaseDir = Join-Path $projectRoot 'release'
$packageJsonPath = Join-Path $projectRoot 'package.json'
$quickstartPath = Join-Path $projectRoot 'CLIENT_QUICKSTART.md'
$readmePath = Join-Path $projectRoot 'README.md'
$licensePath = Join-Path $projectRoot 'LICENSE'

if (-not (Test-Path $releaseDir)) {
  throw "Release directory '$releaseDir' does not exist. Run 'npm run build' first."
}

$packageJson = Get-Content $packageJsonPath | ConvertFrom-Json
$version = [string]$packageJson.version

$bundleDir = Join-Path $releaseDir 'client-bundle'
$bundlePath = Join-Path $releaseDir "HERMES-WIN-client-bundle-$version.zip"
$hashFile = Join-Path $releaseDir 'SHA256SUMS.txt'

if (Test-Path $bundleDir) {
  Remove-Item $bundleDir -Recurse -Force
}

if (Test-Path $bundlePath) {
  Remove-Item $bundlePath -Force
}

New-Item -ItemType Directory -Path $bundleDir | Out-Null

$artifacts = Get-ChildItem $releaseDir -File | Where-Object {
  $_.Extension -in '.exe', '.zip' -and $_.Name -notlike 'HERMES-WIN-client-bundle-*'
}

if (-not $artifacts) {
  throw "No release artifacts were found in '$releaseDir'."
}

Copy-Item $quickstartPath $bundleDir -Force
Copy-Item $readmePath $bundleDir -Force
Copy-Item $licensePath $bundleDir -Force

foreach ($artifact in $artifacts) {
  Copy-Item $artifact.FullName $bundleDir -Force
}

$hashLines = foreach ($artifact in $artifacts) {
  $hash = (Get-FileHash $artifact.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
  "$hash *$($artifact.Name)"
}

Set-Content -Path $hashFile -Value $hashLines -Encoding ascii
Copy-Item $hashFile $bundleDir -Force

Compress-Archive -Path (Join-Path $bundleDir '*') -DestinationPath $bundlePath -Force
Write-Host "Client bundle ready at $bundlePath"
