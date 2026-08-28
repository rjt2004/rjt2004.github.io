'use strict'

// Convert images in one or more directories to a unified format (WebP) and
// unified width (downscale to TARGET_WIDTH, keep aspect ratio, never upscale).
// Originals are moved to <dir>/_original/ (underscore-prefixed, so Hexo ignores
// them when generating the site).
//
// Usage:
//   node tools/optimize-images.js [dir1 dir2 ...]
//   (dirs are relative to project root; default: source/images/record)
//
// Already-normalized files (WebP and width <= TARGET_WIDTH) are skipped, so it
// is safe to run on every preview/deploy.

const fs = require('fs')
const path = require('path')
const sharp = require('sharp')

const ROOT = path.join(__dirname, '..')
const DEFAULT_DIRS = ['source/images/record']
const TARGET_WIDTH = 800
const WEBP_QUALITY = 82

const IMAGE_RE = /\.(jpe?g|png|webp|gif)$/i

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function withRetry(fn, tries = 8, delay = 500) {
  let lastErr
  for (let i = 0; i < tries; i++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (i < tries - 1) await sleep(delay)
    }
  }
  throw lastErr
}

const isNormalized = async (src) => {
  if (!/\.webp$/i.test(src)) return false
  try {
    const meta = await sharp(fs.readFileSync(src)).metadata()
    return (meta.width || 0) <= TARGET_WIDTH
  } catch {
    return false
  }
}

const escapeReg = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// When a cover's extension changes (e.g. xxx.jpg -> xxx.webp), keep the
// corresponding `cover:` line in source/_data/record.yml in sync.
const updateRecordCoverReferences = (pairs) => {
  const ymlPath = path.join(ROOT, 'source', '_data', 'record.yml')
  if (!fs.existsSync(ymlPath) || !pairs.length) return

  let text = fs.readFileSync(ymlPath, 'utf8')
  let changed = false
  for (const { oldFile, newFile } of pairs) {
    if (oldFile === newFile) continue
    const re = new RegExp(
      `(cover\\s*:\\s*[^\\r\\n]*?)${escapeReg(oldFile)}(?=\\s|\\r|\\n|$)`,
      'g'
    )
    if (re.test(text)) {
      text = text.replace(re, `$1${newFile}`)
      changed = true
    }
  }
  if (changed) {
    fs.writeFileSync(ymlPath, text)
    console.log('updated cover references in source/_data/record.yml')
  }
}

async function convertDir(dir) {
  const absDir = path.join(ROOT, dir)
  if (!fs.existsSync(absDir)) {
    console.log(`SKIP (not found): ${dir}`)
    return
  }

  const backupDir = path.join(absDir, '_original')
  fs.mkdirSync(backupDir, { recursive: true })

  const files = fs
    .readdirSync(absDir)
    .filter((name) => IMAGE_RE.test(name))
    .sort()

  if (!files.length) {
    console.log(`SKIP (no images):  ${dir}`)
    return
  }

  const results = []
  const coverPairs = []
  for (const file of files) {
    const src = path.join(absDir, file)
    const base = path.basename(file).replace(IMAGE_RE, '')
    const out = path.join(absDir, base + '.webp')

    if (await isNormalized(src)) {
      continue
    }

    try {
      const r = await withRetry(async () => {
        const meta = await sharp(fs.readFileSync(src)).metadata()
        const before = fs.statSync(src).size

        const buffer = await sharp(fs.readFileSync(src))
          .resize({ width: TARGET_WIDTH, withoutEnlargement: true })
          .webp({ quality: WEBP_QUALITY })
          .toBuffer()

        fs.writeFileSync(out, buffer)
        const after = fs.statSync(out).size

        if (out !== src) {
          fs.copyFileSync(src, path.join(backupDir, file))
          fs.unlinkSync(src)
          coverPairs.push({ oldFile: file, newFile: path.basename(out) })
        }

        return { file, dim: `${meta.width}x${meta.height}`, beforeKB: before / 1024, afterKB: after / 1024 }
      })
      results.push(r)
    } catch (err) {
      console.error('FAILED:', dir, file, err.message)
    }
  }

  if (!results.length) {
    console.log(`OK (up to date):   ${dir}`)
    return
  }

  if (path.resolve(absDir) === path.resolve(ROOT, 'source/images/record')) {
    updateRecordCoverReferences(coverPairs)
  }

  if (!results.length) {
    console.log(`OK (up to date):   ${dir}`)
    return
  }

  console.log(`\n== ${dir}`)
  console.log('file'.padEnd(34), 'size'.padEnd(14), 'before'.padEnd(10), 'after'.padEnd(10), 'saved')
  let totalBefore = 0
  let totalAfter = 0
  for (const r of results) {
    totalBefore += r.beforeKB
    totalAfter += r.afterKB
    const pct = r.beforeKB > 0 ? Math.round((1 - r.afterKB / r.beforeKB) * 100) : 0
    console.log(
      r.file.padEnd(34),
      r.dim.padEnd(14),
      `${r.beforeKB.toFixed(1)}KB`.padEnd(10),
      `${r.afterKB.toFixed(1)}KB`.padEnd(10),
      `${pct}%`
    )
  }
  console.log(`TOTAL: ${(totalBefore / 1024).toFixed(2)}MB -> ${(totalAfter / 1024).toFixed(2)}MB`)
}

async function main() {
  const dirs = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_DIRS
  for (const dir of dirs) {
    await convertDir(dir)
  }
}

main()
