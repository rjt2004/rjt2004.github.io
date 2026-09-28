#!/usr/bin/env bash
# 统一逻辑在 preview.js，这里仅做转发（保持 ./preview.sh 用法）
# 用法: ./preview.sh [端口]
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
export PREVIEW_PORT="${1:-4000}"
exec node preview.js
