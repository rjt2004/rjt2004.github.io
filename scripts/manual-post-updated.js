'use strict'

const MANUAL_UPDATED_FIELDS = ['updated', 'manual_updated', 'last_updated']

const getFrontMatter = (raw) => {
  if (!raw || !raw.startsWith('---')) return ''
  const end = raw.indexOf('\n---', 3)
  if (end === -1) return ''
  return raw.slice(3, end)
}

const stripInlineComment = (value) => {
  let quote = ''
  for (let i = 0; i < value.length; i++) {
    const char = value[i]
    if ((char === '"' || char === "'") && value[i - 1] !== '\\') {
      quote = quote === char ? '' : quote || char
    }
    if (char === '#' && !quote && (i === 0 || /\s/.test(value[i - 1]))) {
      return value.slice(0, i).trim()
    }
  }
  return value.trim()
}

const unquote = (value) => value.replace(/^['"]|['"]$/g, '').trim()

const parseLocalDate = (value) => {
  const text = unquote(stripInlineComment(String(value || '')))
  if (!text) return null

  const match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/)
  if (match) {
    const [, y, m, d, hh = '0', mm = '0', ss = '0'] = match
    return new Date(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss))
  }

  const parsed = new Date(text)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

const getManualUpdated = (raw) => {
  const frontMatter = getFrontMatter(raw)
  if (!frontMatter) return null

  for (const field of MANUAL_UPDATED_FIELDS) {
    const pattern = new RegExp(`^${field}\\s*:\\s*(.+)$`, 'im')
    const match = frontMatter.match(pattern)
    if (match) {
      return parseLocalDate(match[1])
    }
  }

  return null
}

hexo.extend.filter.register('before_post_render', function (data) {
  const manualUpdated = getManualUpdated(data.raw)
  if (manualUpdated) {
    data.updated = manualUpdated
  }
  return data
})