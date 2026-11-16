'use strict'

/*
 * 在 Markdown 渲染之前把公式替换成占位符，并用 MathJax 预渲染为 SVG，
 * Markdown 渲染完成后再把占位符换回 SVG。
 *
 * 这样写公式时可以直接使用自然的 TeX 语法（包括 `_`、`*`、`\`、`&`），
 * 不必担心被 Markdown 当成强调、转义或 HTML 实体。
 *
 * 只对 front-matter 里写了 `mathjax: true` 的文章生效（或 every_page: true）。
 */

const crypto = require('crypto')
const path = require('path')

const { mathjax } = require('mathjax-full/js/mathjax.js')
const { TeX } = require('mathjax-full/js/input/tex.js')
const { SVG } = require('mathjax-full/js/output/svg.js')
const { LiteAdaptor } = require('mathjax-full/js/adaptors/liteAdaptor.js')
const { RegisterHTMLHandler } = require('mathjax-full/js/handlers/html.js')
const { AllPackages } = require('mathjax-full/js/input/tex/AllPackages.js')

const config = Object.assign({
  tags: 'none',
  single_dollars: true,
  cjk_width: 0.9,
  normal_width: 0.6,
  every_page: false
}, hexo.config.mathjax || {})

const adaptor = new LiteAdaptor({
  fontSize: 16,
  cjkCharWidth: config.cjk_width,
  unknownCharWidth: config.normal_width
})
RegisterHTMLHandler(adaptor)

// 让 MathJax 能按需加载 HTML 实体表（例如 `&emsp;`），避免构建时报错
mathjax.asyncLoad = (name) => {
  const target = name.startsWith('./')
    ? path.join('mathjax-full/js', name.slice(2))
    : name
  return require(target)
}

const texJax = new TeX({
  packages: AllPackages,
  tags: config.tags,
  inlineMath: config.single_dollars ? { '[+]': [['$', '$']] } : {}
})
const svgJax = new SVG({ fontCache: 'none' })

const cache = new Map()
const pending = new Map() // token -> svg，由 before 阶段写入，after 阶段消费

function renderTex (source) {
  if (cache.has(source)) return cache.get(source)
  const html = mathjax.document(source, { InputJax: texJax, OutputJax: svgJax })
  html.render()
  const svg = adaptor.innerHTML(adaptor.body(html.document))
  cache.set(source, svg)
  return svg
}

hexo.extend.filter.register('before_post_render', function (data) {
  if (!data.mathjax && !config.every_page) return data
  if (!data.content || !data.content.includes('$')) return data

  const uid = crypto.randomBytes(6).toString('hex')
  const rawParts = []
  const mathParts = []

  const rawToken = (i) => `@@MATHRAW${uid}_${i}@@`
  const mathToken = (i) => `@@MATHFORMULA${uid}_${i}@@`

  let content = data.content

  // 1. 保护代码块与行内代码，避免其中的 `$` 被当作公式
  content = content.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[ \t]*$/gm, (block) => {
    rawParts.push(block)
    return rawToken(rawParts.length - 1)
  })
  content = content.replace(/`[^`\n]*`/g, (code) => {
    rawParts.push(code)
    return rawToken(rawParts.length - 1)
  })

  // 2. 提取公式（先长后短，避免 `$$` 被当成两个 `$`）
  const pushMath = (tex, display) => {
    mathParts.push({ tex: tex.trim(), display })
    return mathToken(mathParts.length - 1)
  }

  content = content.replace(/\$\$([\s\S]+?)\$\$/g, (_, tex) => pushMath(tex, true))
  content = content.replace(/\\\[([\s\S]+?)\\\]/g, (_, tex) => pushMath(tex, true))
  content = content.replace(/(?<!\\)\$([^\n$]+?)\$/g, (_, tex) => pushMath(tex, false))
  content = content.replace(/\\\(([^\n]+?)\\\)/g, (_, tex) => pushMath(tex, false))

  // 3. 把代码块换回 Markdown，公式继续保留占位符
  for (let i = 0; i < rawParts.length; i++) {
    content = content.split(rawToken(i)).join(rawParts[i])
  }

  // 4. 预渲染公式，结果暂存到 pending，等 Markdown 渲染完再替换
  for (let i = 0; i < mathParts.length; i++) {
    const { tex, display } = mathParts[i]
    const source = display ? `$$${tex}$$` : `$${tex}$`
    pending.set(mathToken(i), renderTex(source))
  }

  data.content = content
  return data
})

hexo.extend.filter.register('after_post_render', function (data) {
  if (!pending.size) return data

  const tokenPattern = /@@MATHFORMULA[0-9a-f]+_\d+@@/g
  const usedTokens = [
    ...(data.content || '').matchAll(tokenPattern),
    ...(data.excerpt || '').matchAll(tokenPattern),
    ...(data.more || '').matchAll(tokenPattern)
  ].map((m) => m[0])
  if (!usedTokens.length) return data

  const replaceAll = (html) => {
    if (!html || !html.includes('@@MATHFORMULA')) return html
    // 独占一行的公式还原成块级元素；行内公式直接替换
    html = html.replace(/<p>\s*(@@MATHFORMULA[0-9a-f]+_\d+@@)\s*<\/p>/g, (m, token) => pending.get(token) || m)
    return html.replace(tokenPattern, (token) => pending.get(token) || token)
  }

  data.content = replaceAll(data.content)
  data.excerpt = replaceAll(data.excerpt)
  data.more = replaceAll(data.more)

  // 只删除本文用到的 token，避免并行渲染时误删其他文章的公式
  for (const token of usedTokens) pending.delete(token)
  return data
})

// 注入 MathJax SVG 的基础样式（居中、行距、错误提示等）。
// 注意：Hexo 会把 scripts/ 下的每个文件都当 JS 加载，所以样式只能内联在这里，
// 不能写成独立的 .css 文件，否则启动时会报 "Script load failed"。
const mathCss = `
mjx-container[jax="SVG"] { direction: ltr; }
mjx-container[jax="SVG"] > svg { overflow: visible; }
mjx-container[jax="SVG"][display="true"] {
  display: block;
  text-align: center;
  margin: 1em 0;
  overflow-x: auto;
  overflow-y: hidden;
}
mjx-container[jax="SVG"][justify="left"] { text-align: left; }
mjx-container[jax="SVG"][justify="right"] { text-align: right; }
g[data-mml-node="merror"] > g { fill: red; stroke: red; }
g[data-mml-node="merror"] > rect[data-background] { fill: yellow; stroke: none; }
g[data-mml-node="mtable"] > line[data-line] { stroke-width: 70px; fill: none; }
g[data-mml-node="mtable"] > rect[data-frame] { stroke-width: 70px; fill: none; }
g[data-mml-node="mtable"] > .mjx-dashed { stroke-dasharray: 140; }
g[data-mml-node="mtable"] > .mjx-dotted { stroke-linecap: round; stroke-dasharray: 0,140; }
g[data-mml-node="mtable"] > svg { overflow: visible; }
.MathJax path { stroke-width: 3; }
mjx-container[display="true"] + br { display: none; }
`

hexo.extend.filter.register('after_render:html', function (html) {
  if (!html.includes('<mjx-container') || html.includes('data-hexo-mathjax-css')) return html
  return html.replace('</head>', `<style data-hexo-mathjax-css>${mathCss}</style></head>`)
})
