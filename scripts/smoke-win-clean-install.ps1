param(
  [string]$Installer = "dist-app/AppPublisher-Setup.exe"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$installerPath = [IO.Path]::GetFullPath((Join-Path $root $Installer))
$reportDir = Join-Path $root ".artifacts"
$reportPath = Join-Path $reportDir "windows-clean-machine-smoke.json"
$checks = [System.Collections.Generic.List[object]]::new()
$failure = $null
$installedExe = $null

New-Item -ItemType Directory -Force -Path $reportDir | Out-Null

function Add-Check {
  param(
    [string]$Name,
    [bool]$Ok,
    [string]$Detail = ""
  )
  $checks.Add([ordered]@{ name = $Name; ok = $Ok; detail = $Detail })
  if (-not $Ok) {
    throw "${Name}: ${Detail}"
  }
  Write-Host "✓ $Name"
}

function Wait-Until {
  param(
    [scriptblock]$Condition,
    [int]$TimeoutSeconds = 20
  )
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    if (& $Condition) { return $true }
    Start-Sleep -Milliseconds 500
  } while ((Get-Date) -lt $deadline)
  return $false
}

function Get-AppUninstallEntry {
  $roots = @(
    "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*",
    "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*"
  )
  foreach ($registryRoot in $roots) {
    $entry = Get-ItemProperty $registryRoot -ErrorAction SilentlyContinue |
      Where-Object { $_.DisplayName -eq "AppPublisher" } |
      Select-Object -First 1
    if ($entry) { return $entry }
  }
  return $null
}

function Resolve-InstalledExe {
  param($Entry)

  $candidates = [System.Collections.Generic.List[string]]::new()
  $candidates.Add((Join-Path $env:LOCALAPPDATA "Programs\AppPublisher\AppPublisher.exe"))

  if ($Entry -and $Entry.InstallLocation) {
    $candidates.Add((Join-Path ([Environment]::ExpandEnvironmentVariables([string]$Entry.InstallLocation)) "AppPublisher.exe"))
  }
  if ($Entry -and $Entry.DisplayIcon) {
    $iconPath = ([Environment]::ExpandEnvironmentVariables([string]$Entry.DisplayIcon)).Trim('"')
    $iconPath = $iconPath -replace ',\d+$', ''
    $candidates.Add($iconPath)
  }

  foreach ($candidate in $candidates | Select-Object -Unique) {
    if ($candidate -and (Test-Path -LiteralPath $candidate -PathType Leaf)) {
      return [IO.Path]::GetFullPath($candidate)
    }
  }
  return $null
}

function Resolve-Uninstaller {
  param(
    $Entry,
    [string]$AppExe
  )

  if ($AppExe) {
    $candidate = Join-Path (Split-Path -Parent $AppExe) "Uninstall AppPublisher.exe"
    if (Test-Path -LiteralPath $candidate -PathType Leaf) { return $candidate }
  }

  if ($Entry -and $Entry.UninstallString) {
    $raw = [Environment]::ExpandEnvironmentVariables([string]$Entry.UninstallString)
    if ($raw -match '^\s*"([^"]+\.exe)"') {
      if (Test-Path -LiteralPath $Matches[1] -PathType Leaf) { return $Matches[1] }
    }
  }
  return $null
}

function Invoke-SilentInstaller {
  param([string]$Path)
  $process = Start-Process -FilePath $Path -ArgumentList "/S" -Wait -PassThru
  Add-Check "Installation silencieuse sans élévation" ($process.ExitCode -eq 0) "Code de sortie : $($process.ExitCode)"
}

function Invoke-SilentUninstaller {
  param([string]$Path)
  $process = Start-Process -FilePath $Path -ArgumentList "/S" -Wait -PassThru
  Add-Check "Désinstallation silencieuse" ($process.ExitCode -eq 0) "Code de sortie : $($process.ExitCode)"
}

try {
  Add-Check "Installateur présent" (Test-Path -LiteralPath $installerPath -PathType Leaf) $installerPath

  $installerInfo = Get-Item -LiteralPath $installerPath
  $installerHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $installerPath).Hash.ToLowerInvariant()
  Add-Check "Installateur non vide" ($installerInfo.Length -gt 10MB) "$($installerInfo.Length) octets"

  $signature = Get-AuthenticodeSignature -FilePath $installerPath
  Add-Check "Bêta privée explicitement non signée" ($signature.Status -eq "NotSigned") "Authenticode : $($signature.Status)"

  Invoke-SilentInstaller $installerPath

  $entryReady = Wait-Until { $null -ne (Get-AppUninstallEntry) }
  Add-Check "Entrée de désinstallation Windows créée" $entryReady "AppPublisher absent du registre après installation"
  $entry = Get-AppUninstallEntry

  $installedExe = Resolve-InstalledExe $entry
  Add-Check "Exécutable installé" ($null -ne $installedExe) "AppPublisher.exe introuvable"

  $versionInfo = (Get-Item -LiteralPath $installedExe).VersionInfo
  Add-Check "Métadonnées produit valides" ($versionInfo.ProductName -eq "AppPublisher") "ProductName : $($versionInfo.ProductName)"

  $startMenuRoot = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs"
  $shortcut = Get-ChildItem -Path $startMenuRoot -Filter "AppPublisher.lnk" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
  Add-Check "Raccourci menu Démarrer créé" ($null -ne $shortcut) "AppPublisher.lnk introuvable"

  $userData = Join-Path $env:APPDATA "AppPublisher"
  New-Item -ItemType Directory -Force -Path $userData | Out-Null
  $marker = Join-Path $userData "lot-11-3-persistence.txt"
  Set-Content -LiteralPath $marker -Value "keep-user-data" -NoNewline
  Add-Check "Donnée utilisateur témoin créée" (Test-Path -LiteralPath $marker) $marker

  $uninstaller = Resolve-Uninstaller $entry $installedExe
  Add-Check "Désinstalleur trouvé" ($null -ne $uninstaller) "Uninstall AppPublisher.exe introuvable"
  Invoke-SilentUninstaller $uninstaller

  $removed = Wait-Until { -not (Test-Path -LiteralPath $installedExe) }
  Add-Check "Application supprimée après désinstallation" $removed $installedExe
  $entryRemoved = Wait-Until { $null -eq (Get-AppUninstallEntry) }
  Add-Check "Entrée registre supprimée" $entryRemoved "Entrée AppPublisher toujours présente"
  Add-Check "Données utilisateur conservées" (Test-Path -LiteralPath $marker) "Le marqueur utilisateur a été supprimé"

  Invoke-SilentInstaller $installerPath
  $reEntryReady = Wait-Until { $null -ne (Get-AppUninstallEntry) }
  Add-Check "Réinstallation enregistrée" $reEntryReady "Entrée AppPublisher absente après réinstallation"
  $reEntry = Get-AppUninstallEntry
  $reInstalledExe = Resolve-InstalledExe $reEntry
  Add-Check "Exécutable restauré après réinstallation" ($null -ne $reInstalledExe) "AppPublisher.exe introuvable après réinstallation"
  Add-Check "Données conservées après réinstallation" (Test-Path -LiteralPath $marker) "Le marqueur utilisateur a disparu"

  $report = [ordered]@{
    generatedAt = (Get-Date).ToUniversalTime().ToString("o")
    verdict = "ready-for-manual-product-journey"
    installer = [ordered]@{
      path = $installerPath
      sizeBytes = $installerInfo.Length
      sha256 = $installerHash
      authenticode = [string]$signature.Status
    }
    installedExe = $reInstalledExe
    checks = $checks
    failure = $null
  }
}
catch {
  $failure = $_.Exception.Message
  Write-Error $failure
  $report = [ordered]@{
    generatedAt = (Get-Date).ToUniversalTime().ToString("o")
    verdict = "blocked"
    installer = if (Test-Path -LiteralPath $installerPath) {
      [ordered]@{
        path = $installerPath
        sizeBytes = (Get-Item -LiteralPath $installerPath).Length
        sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $installerPath).Hash.ToLowerInvariant()
      }
    } else { $null }
    installedExe = $installedExe
    checks = $checks
    failure = $failure
  }
}
finally {
  $report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $reportPath -Encoding UTF8
  Write-Host "Rapport : $reportPath"
}

if ($failure) { exit 1 }
Write-Host "✓ Recette Windows machine neuve automatisée validée."
