#!/usr/bin/env node
'use strict'

/*
 * 跨平台部署脚本（macOS / Windows 共用同一份逻辑）
 * 步骤：拉取远端最新 -> 优化图片 -> clean/generate -> 提交推送源码到 main -> 发布 public 到 gh-pages
 *
 * 用法：
 *   node deploy.js
 *   node deploy.js "new post"
 *   DEPLOY_MESSAGE="new post" DEPLOY_REMOTE=origin DEPLOY_BRANCH=gh-pages node deploy.js
 */

const { spawnSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const ROOT = __dirname
const PUBLIC_DIR = path.join(ROOT, 'public')

const pad = (n) => String(n).padStart(2, '0')
const timestamp = () => {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const argv = process.argv.slice(2)
const MESSAGE = process.env.DEPLOY_MESSAGE || argv[0] || `update blog ${timestamp()}`
const REMOTE = process.env.DEPLOY_REMOTE || argv[1] || 'origin'
const PAGES_BRANCH = process.env.DEPLOY_BRANCH || argv[2] || 'gh-pages'

function runShell(cmd, cwd = ROOT) {
  console.log(`\n==> ${cmd}`)
  const r = spawnSync(cmd, { shell: true, stdio: 'inherit', cwd })
  if (r.status !== 0) throw new Error(`命令失败 (exit ${r.status}): ${cmd}`)
}

function git(args, cwd = ROOT) {
  console.log(`\n==> git ${args.join(' ')}`)
  const r = spawnSync('git', args, { stdio: 'inherit', cwd })
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} 失败 (exit ${r.status})`)
}

function gitCapture(args, cwd = ROOT) {
  const r = spawnSync('git', args, { encoding: 'utf8', cwd })
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} 失败 (exit ${r.status})`)
  return (r.stdout || '').trim()
}

function gitProbe(args, cwd = ROOT) {
  return spawnSync('git', args, { stdio: 'ignore', cwd }).status === 0
}

function clearDirExceptGit(dir) {
  for (const name of fs.readdirSync(dir)) {
    if (name === '.git') continue
    fs.rmSync(path.join(dir, name), { recursive: true, force: true })
  }
}

try {
  console.log('\n==> [1/5] 同步远端最新源码（避免与另一台设备冲突）')
  git(['pull', '--rebase', '--autostash', REMOTE, 'main'])

  console.log('\n==> [2/5] 优化图片')
  runShell('node tools/optimize-images.js')

  console.log('\n==> [3/5] 清理并生成静态站点')
  runShell('npx hexo clean')
  runShell('npx hexo generate')

  console.log('\n==> [4/5] 提交并推送源码到 main')
  git(['add', '-A'])
  if (gitCapture(['status', '--porcelain'])) {
    git(['commit', '-m', MESSAGE])
  } else {
    console.log('没有源码改动，跳过提交')
  }
  git(['push', REMOTE, 'main'])

  console.log(`\n==> [5/5] 发布 public 到 ${PAGES_BRANCH} 分支`)
  const remoteUrl = gitCapture(['remote', 'get-url', REMOTE])
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-pages-'))
  const deployDir = path.join(tmp, 'pages')

  if (!gitProbe(['clone', '--depth', '1', '--branch', PAGES_BRANCH, remoteUrl, deployDir])) {
    fs.rmSync(deployDir, { recursive: true, force: true })
    git(['clone', '--depth', '1', remoteUrl, deployDir])
    git(['checkout', '--orphan', PAGES_BRANCH], deployDir)
  }

  clearDirExceptGit(deployDir)
  fs.cpSync(PUBLIC_DIR, deployDir, { recursive: true })
  fs.writeFileSync(path.join(deployDir, '.nojekyll'), '')

  git(['add', '-A'], deployDir)
  if (gitCapture(['status', '--porcelain'], deployDir)) {
    git(['commit', '-m', 'deploy site'], deployDir)
  } else {
    console.log('没有站点改动，跳过发布')
  }
  git(['push', '-u', 'origin', PAGES_BRANCH], deployDir)

  fs.rmSync(tmp, { recursive: true, force: true })

  console.log('\n完成 ✅  https://rjt2004.github.io/')
} catch (err) {
  console.error(`\n❌ ${err.message}`)
  process.exit(1)
}
