param(
  [int]$Port = 4000
)

$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot

function Invoke-Native($File, [string[]]$Arguments) {
  & $File @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$File $($Arguments -join ' ') failed with exit code $LASTEXITCODE"
  }
}

Write-Host "Optimizing images..." -ForegroundColor Cyan
Invoke-Native node @("tools/optimize-images.js")

Write-Host "Cleaning generated files..." -ForegroundColor Cyan
Invoke-Native hexo @("clean")

Write-Host "Generating static site..." -ForegroundColor Cyan
Invoke-Native hexo @("generate")

Write-Host "Starting Hexo preview at http://127.0.0.1:$Port/" -ForegroundColor Green
Invoke-Native hexo @("server", "-p", $Port)