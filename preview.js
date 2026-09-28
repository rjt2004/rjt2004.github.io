#!/usr/bin/env node
'use strict'

/*
 * 跨平台本地预览脚本（macOS / Windows 共用同一份逻辑）
 * 步骤：优化图片 -> clean -> generate -> hexo server
 *
 * 用法：
 *   node preview.js
 *   node preview.js 4010
 */

const { spawnSync } = require('child_process')

const ROOT = __dirname
const PORT = process.argv[2] || process.env.PREVIEW_PORT || '4000'

function runShell(cmd) {
  console.log(`\n==> ${cmd}`)
  const r = spawnSync(cmd, { shell: true, stdio: 'inherit', cwd: ROOT })
  if (r.status !== 0) process.exit(r.status || 1)
}

runShell('node tools/optimize-images.js')
runShell('npx hexo clean')
runShell('npx hexo generate')

console.log(`\n==> 启动预览 http://127.0.0.1:${PORT}/`)
runShell(`npx hexo server -p ${PORT}`)
