$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$releaseDir = Join-Path $projectRoot 'release'
$packageJsonPath = Join-Path $projectRoot 'package.json'
$docsDir = Join-Path $projectRoot 'docs'
$quickstartPath = Join-Path $docsDir 'CLIENT_QUICKSTART.md'
$consentPath = Join-Path $docsDir 'CONSENT.md'
$securityPath = Join-Path $docsDir 'SECURITY.md'
$readmePath = Join-Path $projectRoot 'README.md'
$licensePath = Join-Path $projectRoot 'LICENSE'

function Get-Sha256Hex {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  $getFileHashCommand = Get-Command Get-FileHash -ErrorAction SilentlyContinue
  if ($getFileHashCommand) {
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
  }

  $stream = [System.IO.File]::OpenRead($Path)
  try {
    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    try {
      $hashBytes = $sha256.ComputeHash($stream)
    } finally {
      $sha256.Dispose()
    }
  } finally {
    $stream.Dispose()
  }

  return ([System.BitConverter]::ToString($hashBytes)).Replace('-', '').ToLowerInvariant()
}

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
Copy-Item $consentPath $bundleDir -Force
Copy-Item $securityPath $bundleDir -Force
Copy-Item $readmePath $bundleDir -Force
Copy-Item $licensePath $bundleDir -Force

foreach ($artifact in $artifacts) {
  Copy-Item $artifact.FullName $bundleDir -Force
}

$hashLines = foreach ($artifact in ($artifacts | Sort-Object Name)) {
  $hash = Get-Sha256Hex -Path $artifact.FullName
  "$hash *$($artifact.Name)"
}

Set-Content -Path $hashFile -Value $hashLines -Encoding ascii
Copy-Item $hashFile $bundleDir -Force

Compress-Archive -Path (Join-Path $bundleDir '*') -DestinationPath $bundlePath -Force
Write-Host "Client bundle ready at $bundlePath"
