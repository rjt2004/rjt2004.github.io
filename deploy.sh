#!/usr/bin/env bash
# 统一逻辑在 deploy.js，这里仅做转发（保持 ./deploy.sh 用法）
# 用法: ./deploy.sh ["提交说明"] [remote] [pages_branch]
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
export DEPLOY_MESSAGE="${1:-}"
export DEPLOY_REMOTE="${2:-origin}"
export DEPLOY_BRANCH="${3:-gh-pages}"
exec node deploy.js
