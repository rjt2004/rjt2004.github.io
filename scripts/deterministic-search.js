'use strict'

// hexo-generator-searchdb 遍历 locals.posts 输出，未做排序，
// 顺序取决于 Hexo 内部文章处理顺序，跨构建 / 跨设备会抖动。
// 这里在 after_generate 阶段读取 search.json 的路由流，按 url 排序后写回，
// 保证生成结果完全确定。
//
// 注意：after_generate 运行时文件尚未落盘，route.get() 返回的是 RouteStream 流，
// 必须先消费流拿到内容，再 route.set() 替换。
const SORT_LOCALE = 'en'

function readRouteData(src) {
  return new Promise((resolve) => {
    if (src == null) return resolve('')

    if (typeof src === 'function') {
      return Promise.resolve(src()).then((v) => resolve(v == null ? '' : String(v)))
    }

    if (typeof src.pipe === 'function' && typeof src.on === 'function') {
      const chunks = []
      src.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(String(c))))
      src.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
      src.on('error', () => resolve(''))
      return
    }

    resolve(String(src))
  })
}

function sortSearchJson(raw) {
  try {
    const data = JSON.parse(raw)
    if (Array.isArray(data)) {
      data.sort((a, b) => String(a.url || '').localeCompare(String(b.url || ''), SORT_LOCALE))
    }
    return JSON.stringify(data)
  } catch (e) {
    return raw
  }
}

hexo.extend.filter.register('after_generate', function () {
  const rel = (hexo.config.search && hexo.config.search.path) || 'search.json'
  const route = hexo.route
  const original = route.get(rel)
  if (original == null) return

  return readRouteData(original).then((raw) => {
    route.set(rel, sortSearchJson(raw))
  })
})
