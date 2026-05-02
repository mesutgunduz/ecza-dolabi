param(
  [string]$RepoUrl = "https://github.com/mesutgunduz/ecza-dolabi.git",
  [string]$ProjectDir = "C:\Projects\ecza-dolabi",
  [switch]$SkipExpoStart
)

$ErrorActionPreference = "Stop"

function Assert-CommandExists {
  param([string]$CommandName)
  if (-not (Get-Command $CommandName -ErrorAction SilentlyContinue)) {
    throw "Required command not found: $CommandName"
  }
}

try {
  Write-Host "[1/6] Checking prerequisites..." -ForegroundColor Cyan
  Assert-CommandExists git
  Assert-CommandExists node
  Assert-CommandExists npm

  $parentDir = Split-Path -Parent $ProjectDir
  if (-not (Test-Path $parentDir)) {
    New-Item -ItemType Directory -Path $parentDir -Force | Out-Null
  }

  if (-not (Test-Path $ProjectDir)) {
    Write-Host "[2/6] Cloning repository..." -ForegroundColor Cyan
    git clone $RepoUrl $ProjectDir
  }
  else {
    Write-Host "[2/6] Repository already exists, skipping clone." -ForegroundColor Cyan
  }

  Set-Location $ProjectDir

  Write-Host "[3/6] Pulling latest changes..." -ForegroundColor Cyan
  git pull origin main

  Write-Host "[4/6] Installing dependencies with npm ci..." -ForegroundColor Cyan
  npm ci

  Write-Host "[5/6] Checking git identity (optional warning)..." -ForegroundColor Cyan
  $gitName = git config --global user.name
  $gitMail = git config --global user.email
  if ([string]::IsNullOrWhiteSpace($gitName) -or [string]::IsNullOrWhiteSpace($gitMail)) {
    Write-Warning "Global git user.name/user.email is not set."
    Write-Warning "Set it once with: git config --global user.name 'Your Name'"
    Write-Warning "and: git config --global user.email 'you@example.com'"
  }

  if (-not $SkipExpoStart) {
    Write-Host "[6/6] Starting Expo..." -ForegroundColor Cyan
    npx expo start -c
  }
  else {
    Write-Host "[6/6] Done. Expo start skipped by flag." -ForegroundColor Green
  }
}
catch {
  Write-Host "Setup failed: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
