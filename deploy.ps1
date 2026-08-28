param(
  [string]$Message = "",
  [string]$Remote = "origin",
  [string]$PagesBranch = "gh-pages",
  [switch]$ForcePush
)

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot
$Public = Join-Path $Root "public"
if ([string]::IsNullOrWhiteSpace($Message)) { $Message = 'update blog ' + (Get-Date -Format 'yyyy-MM-dd HH:mm') }

function Invoke-Step($Title, [scriptblock]$Action) {
  Write-Host "`n==> $Title" -ForegroundColor Cyan
  & $Action
}

function Invoke-Native($File, [string[]]$Arguments) {
  & $File @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$File $($Arguments -join ' ') failed with exit code $LASTEXITCODE"
  }
}

function Clear-DirectoryContent($Path) {
  if (-not (Test-Path -LiteralPath $Path)) {
    New-Item -ItemType Directory -Path $Path | Out-Null
    return
  }
  Get-ChildItem -Force -LiteralPath $Path | Remove-Item -Recurse -Force
}

Invoke-Step "Optimize images" {
  Set-Location -LiteralPath $Root
  Invoke-Native node @("tools/optimize-images.js")
}

Invoke-Step "Clean and generate static site" {
  Set-Location -LiteralPath $Root
  Invoke-Native hexo @("clean")
  Invoke-Native hexo @("generate")
}

Invoke-Step "Commit and push source branch" {
  Set-Location -LiteralPath $Root
  Invoke-Native git @("add", "-A")
  $changes = git status --porcelain
  if ($changes) {
    Invoke-Native git @("commit", "-m", $Message)
  } else {
    Write-Host "No source changes to commit."
  }
  if ($ForcePush) {
    Invoke-Native git @("push", "-u", "--force-with-lease", $Remote, "main")
  } else {
    Invoke-Native git @("push", "-u", $Remote, "main")
  }
}

Invoke-Step "Publish public folder to GitHub Pages branch" {
  Set-Location -LiteralPath $Root
  $RemoteUrl = git remote get-url $Remote
  if ($LASTEXITCODE -ne 0) { throw "Cannot read remote '$Remote'." }

  $DeployDir = Join-Path $env:TEMP "toneblog-gh-pages"
  if (Test-Path -LiteralPath $DeployDir) {
    Remove-Item -Recurse -Force -LiteralPath $DeployDir
  }

  git clone --depth 1 --branch $PagesBranch $RemoteUrl $DeployDir
  if ($LASTEXITCODE -ne 0) {
    if (Test-Path -LiteralPath $DeployDir) { Remove-Item -Recurse -Force -LiteralPath $DeployDir }
    Invoke-Native git @("clone", "--depth", "1", $RemoteUrl, $DeployDir)
    Set-Location -LiteralPath $DeployDir
    Invoke-Native git @("checkout", "--orphan", $PagesBranch)
  } else {
    Set-Location -LiteralPath $DeployDir
  }

  Get-ChildItem -Force -LiteralPath $DeployDir | Where-Object { $_.Name -ne ".git" } | Remove-Item -Recurse -Force
  Copy-Item -Path (Join-Path $Public "*") -Destination $DeployDir -Recurse -Force
  New-Item -ItemType File -Path (Join-Path $DeployDir ".nojekyll") -Force | Out-Null

  Invoke-Native git @("add", "-A")
  $pageChanges = git status --porcelain
  if ($pageChanges) {
    Invoke-Native git @("commit", "-m", "deploy site")
  } else {
    Write-Host "No public changes to publish."
  }

  if ($ForcePush) {
    Invoke-Native git @("push", "-u", "--force-with-lease", "origin", $PagesBranch)
  } else {
    Invoke-Native git @("push", "-u", "origin", $PagesBranch)
  }
}

Write-Host "`nDone. GitHub Pages site: https://rjt2004.github.io/" -ForegroundColor Green