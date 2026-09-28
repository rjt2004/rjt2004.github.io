# 统一逻辑在 deploy.js，这里仅做转发（保持 .\deploy.ps1 用法）
# 用法: .\deploy.ps1 [-Message "new post"] [-Remote origin] [-PagesBranch gh-pages]
param(
  [string]$Message = "",
  [string]$Remote = "origin",
  [string]$PagesBranch = "gh-pages"
)

$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot

$env:DEPLOY_MESSAGE = $Message
$env:DEPLOY_REMOTE = $Remote
$env:DEPLOY_BRANCH = $PagesBranch

node deploy.js
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
