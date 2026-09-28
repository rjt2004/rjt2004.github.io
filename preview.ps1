# 统一逻辑在 preview.js，这里仅做转发（保持 .\preview.ps1 用法）
# 用法: .\preview.ps1 [-Port 4000]
param(
  [int]$Port = 4000
)

$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot

$env:PREVIEW_PORT = "$Port"

node preview.js
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
