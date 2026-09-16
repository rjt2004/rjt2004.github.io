/**
 * 网易云音乐代理 Worker
 * 用途：给博客导航栏音乐播放器提供歌单和歌曲播放地址（绕过 CORS，并注入登录 Cookie）
 *
 * 部署步骤：
 * 1. Cloudflare Dashboard → Workers & Pages → 创建 Worker
 * 2. 把本文件内容粘贴进代码编辑器，保存部署
 * 3. 设置环境变量（Settings → Variables）：
 *      NETEASE_COOKIE = 你的网易云登录 Cookie（含 MUSIC_U 的那串）
 *    获取方式：浏览器登录 music.163.com → F12 → Application/Storage → Cookies
 *    → 复制整个 Cookie 字符串（含 MUSIC_U=xxx; __csrf=xxx; ...）
 * 4. 部署后得到地址 https://<你的子域名>.workers.dev
 * 5. 在博客 source/_data/keep.yml 的 music_player.proxy 填这个地址
 */
// 复制 Cookie 时可能带入换行或 "Cookie:" 前缀，会触发 fetch "Invalid header value"，统一清洗
const COOKIE = String(typeof NETEASE_COOKIE !== 'undefined' ? NETEASE_COOKIE : '')
  .replace(/^Cookie:\s*/i, '')
  .replace(/[\r\n]+/g, ' ')
  .replace(/\s{2,}/g, ' ')
  .trim();
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': '*'
};

function neteaseHeaders(extra) {
  const h = { 'User-Agent': UA, 'Referer': 'https://music.163.com/' };
  if (COOKIE) h['Cookie'] = COOKIE;
  return Object.assign(h, extra || {});
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: neteaseHeaders() });
  return res.json();
}

async function playUrl(id, br) {
  const data = await fetchJson(
    'https://music.163.com/api/song/enhance/player/url?ids=' +
      encodeURIComponent('[' + id + ']') +
      '&br=' +
      br
  );
  return data && data.data && data.data[0];
}

/* ------------------------------------------------------------------ *
 * 网易云 eapi（移动端加密接口）
 *
 * 为什么用它：Web 接口 /api/song/enhance/player/url 在带登录 Cookie 时
 * 返回的地址会附带 authSecret（与请求出口 IP 绑定的防盗链签名），
 * 浏览器/Worker 换 IP 直连一律 403。而移动端 eapi 返回的地址
 * 不带 authSecret，可直接播放。付费曲目必须走 eapi。
 * ------------------------------------------------------------------ */
const EAPI_KEY = new TextEncoder().encode('e82ckenh8dichen8');
const EAPI_UA =
  'NeteaseMusic/9.1.65.240916182646(9001065);Dalvik/2.1.0 (Linux; U; Android 14)';

// 经典 RFC1321 MD5（WebCrypto 不支持 MD5，需自实现）
function md5(str) {
  function safeAdd(x, y) {
    const lsw = (x & 0xffff) + (y & 0xffff);
    const msw = (x >> 16) + (y >> 16) + (lsw >> 16);
    return (msw << 16) | (lsw & 0xffff);
  }
  function rol(num, cnt) {
    return (num << cnt) | (num >>> (32 - cnt));
  }
  function cmn(q, a, b, x, s, t) {
    return safeAdd(rol(safeAdd(safeAdd(a, q), safeAdd(x, t)), s), b);
  }
  const ff = (a, b, c, d, x, s, t) => cmn((b & c) | (~b & d), a, b, x, s, t);
  const gg = (a, b, c, d, x, s, t) => cmn((b & d) | (c & ~d), a, b, x, s, t);
  const hh = (a, b, c, d, x, s, t) => cmn(b ^ c ^ d, a, b, x, s, t);
  const ii = (a, b, c, d, x, s, t) => cmn(c ^ (b | ~d), a, b, x, s, t);

  const bytes = new TextEncoder().encode(str);
  const words = [];
  for (let i = 0; i < bytes.length; i++) {
    words[i >> 2] = (words[i >> 2] || 0) | (bytes[i] << ((i % 4) * 8));
  }
  const bitLen = bytes.length * 8;
  words[bitLen >> 5] = (words[bitLen >> 5] || 0) | (0x80 << bitLen % 32);
  const totalWords = (((bitLen + 64) >>> 9) << 4) + 16;
  for (let i = 0; i < totalWords; i++) words[i] = words[i] || 0;
  words[totalWords - 2] = bitLen;
  words[totalWords - 1] = Math.floor(bitLen / 0x100000000);

  let a = 1732584193, b = -271733879, c = -1732584194, d = 271733878;
  for (let i = 0; i < totalWords; i += 16) {
    const oa = a, ob = b, oc = c, od = d;
    a = ff(a, b, c, d, words[i], 7, -680876936);
    d = ff(d, a, b, c, words[i + 1], 12, -389564586);
    c = ff(c, d, a, b, words[i + 2], 17, 606105819);
    b = ff(b, c, d, a, words[i + 3], 22, -1044525330);
    a = ff(a, b, c, d, words[i + 4], 7, -176418897);
    d = ff(d, a, b, c, words[i + 5], 12, 1200080426);
    c = ff(c, d, a, b, words[i + 6], 17, -1473231341);
    b = ff(b, c, d, a, words[i + 7], 22, -45705983);
    a = ff(a, b, c, d, words[i + 8], 7, 1770035416);
    d = ff(d, a, b, c, words[i + 9], 12, -1958414417);
    c = ff(c, d, a, b, words[i + 10], 17, -42063);
    b = ff(b, c, d, a, words[i + 11], 22, -1990404162);
    a = ff(a, b, c, d, words[i + 12], 7, 1804603682);
    d = ff(d, a, b, c, words[i + 13], 12, -40341101);
    c = ff(c, d, a, b, words[i + 14], 17, -1502002290);
    b = ff(b, c, d, a, words[i + 15], 22, 1236535329);
    a = gg(a, b, c, d, words[i + 1], 5, -165796510);
    d = gg(d, a, b, c, words[i + 6], 9, -1069501632);
    c = gg(c, d, a, b, words[i + 11], 14, 643717713);
    b = gg(b, c, d, a, words[i], 20, -373897302);
    a = gg(a, b, c, d, words[i + 5], 5, -701558691);
    d = gg(d, a, b, c, words[i + 10], 9, 38016083);
    c = gg(c, d, a, b, words[i + 15], 14, -660478335);
    b = gg(b, c, d, a, words[i + 4], 20, -405537848);
    a = gg(a, b, c, d, words[i + 9], 5, 568446438);
    d = gg(d, a, b, c, words[i + 14], 9, -1019803690);
    c = gg(c, d, a, b, words[i + 3], 14, -187363961);
    b = gg(b, c, d, a, words[i + 8], 20, 1163531501);
    a = gg(a, b, c, d, words[i + 13], 5, -1444681467);
    d = gg(d, a, b, c, words[i + 2], 9, -51403784);
    c = gg(c, d, a, b, words[i + 7], 14, 1735328473);
    b = gg(b, c, d, a, words[i + 12], 20, -1926607734);
    a = hh(a, b, c, d, words[i + 5], 4, -378558);
    d = hh(d, a, b, c, words[i + 8], 11, -2022574463);
    c = hh(c, d, a, b, words[i + 11], 16, 1839030562);
    b = hh(b, c, d, a, words[i + 14], 23, -35309556);
    a = hh(a, b, c, d, words[i + 1], 4, -1530992060);
    d = hh(d, a, b, c, words[i + 4], 11, 1272893353);
    c = hh(c, d, a, b, words[i + 7], 16, -155497632);
    b = hh(b, c, d, a, words[i + 10], 23, -1094730640);
    a = hh(a, b, c, d, words[i + 13], 4, 681279174);
    d = hh(d, a, b, c, words[i], 11, -358537222);
    c = hh(c, d, a, b, words[i + 3], 16, -722521979);
    b = hh(b, c, d, a, words[i + 6], 23, 76029189);
    a = hh(a, b, c, d, words[i + 9], 4, -640364487);
    d = hh(d, a, b, c, words[i + 12], 11, -421815835);
    c = hh(c, d, a, b, words[i + 15], 16, 530742520);
    b = hh(b, c, d, a, words[i + 2], 23, -995338651);
    a = ii(a, b, c, d, words[i], 6, -198630844);
    d = ii(d, a, b, c, words[i + 7], 10, 1126891415);
    c = ii(c, d, a, b, words[i + 14], 15, -1416354905);
    b = ii(b, c, d, a, words[i + 5], 21, -57434055);
    a = ii(a, b, c, d, words[i + 12], 6, 1700485571);
    d = ii(d, a, b, c, words[i + 3], 10, -1894986606);
    c = ii(c, d, a, b, words[i + 10], 15, -1051523);
    b = ii(b, c, d, a, words[i + 1], 21, -2054922799);
    a = ii(a, b, c, d, words[i + 8], 6, 1873313359);
    d = ii(d, a, b, c, words[i + 15], 10, -30611744);
    c = ii(c, d, a, b, words[i + 6], 15, -1560198380);
    b = ii(b, c, d, a, words[i + 13], 21, 1309151649);
    a = ii(a, b, c, d, words[i + 4], 6, -145523070);
    d = ii(d, a, b, c, words[i + 11], 10, -1120210379);
    c = ii(c, d, a, b, words[i + 2], 15, 718787259);
    b = ii(b, c, d, a, words[i + 9], 21, -343485551);
    a = safeAdd(a, oa); b = safeAdd(b, ob); c = safeAdd(c, oc); d = safeAdd(d, od);
  }
  function toHex(n) {
    let s = '';
    for (let i = 0; i < 4; i++) s += ('0' + ((n >>> (i * 8)) & 0xff).toString(16)).slice(-2);
    return s;
  }
  return toHex(a) + toHex(b) + toHex(c) + toHex(d);
}

// AES-128-ECB 加密为十六进制。WebCrypto 只有 CBC，用「零 IV + 单块」等价实现 ECB。
async function aesEcbHex(keyBytes, dataBytes) {
  const block = 16;
  const pad = block - (dataBytes.length % block);
  const padded = new Uint8Array(dataBytes.length + pad);
  padded.set(dataBytes);
  padded.fill(pad, dataBytes.length);
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-CBC' }, false, ['encrypt']);
  const iv = new Uint8Array(block);
  const out = new Uint8Array(padded.length);
  for (let i = 0; i < padded.length; i += block) {
    // AES-CBC 会自动补一个块，取前 16 字节即该块独立加密结果（等价 ECB）
    const enc = await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, key, padded.subarray(i, i + block));
    out.set(new Uint8Array(enc).subarray(0, block), i);
  }
  let hex = '';
  for (let i = 0; i < out.length; i++) hex += ('0' + out[i].toString(16)).slice(-2);
  return hex.toUpperCase();
}

function csrfFromCookie() {
  const m = COOKIE.match(/(?:^|;\s*)__csrf=([^;]*)/);
  return m ? m[1] : '';
}

// 调用 eapi 获取播放地址，返回网易云原始 JSON（data 数组）
async function eapiSongUrl(ids, br) {
  const path = '/api/song/enhance/player/url';
  const dataText = JSON.stringify({
    ids: JSON.stringify(ids),
    br: Number(br) || 128000,
    csrf_token: csrfFromCookie()
  });
  const signText =
    path + '-36cd479b6b5-' + dataText + '-36cd479b6b5-' +
    md5('nobody' + path + 'use' + dataText + 'md5forencrypt');
  const params = await aesEcbHex(EAPI_KEY, new TextEncoder().encode(signText));

  const post = (cookie) => {
    const headers = {
      'User-Agent': EAPI_UA,
      'Referer': '/api/song/enhance/player/url',
      'Content-Type': 'application/x-www-form-urlencoded'
    };
    if (cookie) headers['Cookie'] = cookie;
    return fetch('https://interface.music.163.com/eapi' + path, {
      method: 'POST',
      headers,
      body: 'params=' + params
    });
  };

  // 首次请求会下发 NMTID，缺少它时付费曲目可能只返回试听；带上后再请求一次
  let res = await post(COOKIE);
  const setCookie = res.headers.get('set-cookie') || '';
  let data = await res.json();
  if (!/(^|;\s*)NMTID=/.test(COOKIE) && /NMTID=/.test(setCookie)) {
    const nmtid = (setCookie.match(/NMTID=([^;]+)/) || [])[1];
    if (nmtid) {
      res = await post(COOKIE ? COOKIE + '; NMTID=' + nmtid : 'NMTID=' + nmtid);
      data = await res.json();
    }
  }
  return data;
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders }
  });
}

addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (event.request.method === 'OPTIONS') {
    return event.respondWith(new Response(null, { headers: corsHeaders }));
  }

  const path = url.pathname;

  // 诊断：/debug?id=xxx（不返回 Cookie 内容，只报告登录、出口 IP/协议族、各类地址接口与防盗链测试）
  if (path === '/debug') {
    const id = url.searchParams.get('id') || '426194887';
    return event.respondWith(
      (async () => {
        const out = {
          hasCookie: COOKIE.length > 0,
          cookieLength: COOKIE.length,
          hasMusicU: /(^|;\s*)MUSIC_U=/.test(COOKIE),
          hasCsrf: /(^|;\s*)__csrf=/.test(COOKIE)
        };

        const ip = async (u) => {
          try {
            const r = await fetch(u);
            return r.ok ? (await r.text()).trim() : 'http ' + r.status;
          } catch (e) {
            return 'err:' + e;
          }
        };
        const family = async () => ({
          ident4: await ip('https://v4.ident.me'),
          ident6: await ip('https://v6.ident.me')
        });
        out.egressStart = await family();

        try {
          const r = await fetch('https://httpbin.org/headers');
          out.sentHeaders = (await r.json()).headers;
        } catch (e) {
          out.sentHeaders = 'err:' + e;
        }

        try {
          const acc = await fetchJson('https://music.163.com/api/nuser/account/get');
          out.login = {
            code: acc.code,
            userId: acc.profile && acc.profile.userId,
            vipType: acc.profile && acc.profile.vipType
          };
        } catch (e) {
          out.login = { error: String(e) };
        }

        out.egressBeforeApi = await family();

        const mask = (u) => (u || '').replace(/authSecret=[^&]*/i, 'authSecret=***').slice(0, 150);
        const eps = {
          playerUrl:
            'https://music.163.com/api/song/enhance/player/url?ids=' +
            encodeURIComponent('[' + id + ']') +
            '&br=128000',
          playerUrlV1:
            'https://music.163.com/api/song/enhance/player/url/v1?ids=' +
            encodeURIComponent('[' + id + ']') +
            '&level=standard&encodeType=mp3',
          downloadUrl:
            'https://music.163.com/api/song/enhance/download/url?ids=' +
            encodeURIComponent('[' + id + ']') +
            '&br=128000',
          songUrlV1:
            'https://music.163.com/api/song/url/v1?id=' + id + '&level=standard&encodeType=mp3'
        };
        out.endpoints = {};
        let target = '';
        for (const k in eps) {
          try {
            const d = await fetchJson(eps[k]);
            const it = (d.data && d.data[0]) || d;
            const u = (it && it.url) || '';
            if (k === 'playerUrl' && u) target = u;
            out.endpoints[k] = {
              code: it && it.code,
              hasUrl: !!u,
              authSecret: /authSecret=/.test(u),
              freeTrial: !!(it && it.freeTrialInfo)
            };
          } catch (e) {
            out.endpoints[k] = 'err:' + e;
          }
        }

        try {
          const r = await fetch('https://music.163.com/song/media/outer/url?id=' + id + '.mp3', {
            headers: neteaseHeaders(),
            redirect: 'manual'
          });
          out.outerUrl = { status: r.status, location: mask(r.headers.get('location')) };
        } catch (e) {
          out.outerUrl = 'err:' + e;
        }

        let eapiTarget = '';
        try {
          const d = await eapiSongUrl([id], '128000');
          const it = d && d.data && d.data[0];
          eapiTarget = (it && it.url) || '';
          out.eapi = {
            code: it && it.code,
            hasUrl: !!eapiTarget,
            authSecret: /authSecret=/.test(eapiTarget),
            freeTrial: !!(it && it.freeTrialInfo),
            size: it && it.size,
            time: it && it.time
          };
        } catch (e) {
          out.eapi = 'err:' + e;
        }

        out.egressBeforeCdn = await family();

        const probe = async (u, headers) => {
          try {
            const r = await fetch(u, { headers });
            return {
              status: r.status,
              ct: r.headers.get('content-type') || '',
              len: r.headers.get('content-length') || ''
            };
          } catch (e) {
            return { err: String(e) };
          }
        };

        if (target) {
          const https = target.replace(/^http:/, 'https:');
          const http = target.replace(/^https:/, 'http:');
          const base = { 'User-Agent': UA, 'Referer': 'https://music.163.com/' };
          const withCookie = Object.assign({}, base);
          if (COOKIE) withCookie['Cookie'] = COOKIE;
          out.cdn = {
            https_base: await probe(https, base),
            https_nohdr: await probe(https, {}),
            https_cookie: await probe(https, withCookie),
            https_range: await probe(https, Object.assign({ Range: 'bytes=0-1' }, base)),
            http_base: await probe(http, base)
          };
        }

        if (eapiTarget) {
          out.cdnEapi = await probe(eapiTarget.replace(/^http:/, 'https:'), {
            Range: 'bytes=0-1',
            'User-Agent': EAPI_UA,
            'Referer': 'https://music.163.com/'
          });
        }

        return json(out);
      })()
    );
  }

  // 歌单详情：/playlist?id=xxx
  if (path === '/playlist') {
    const id = url.searchParams.get('id');
    if (!id) return event.respondWith(json({ error: 'missing id' }, 400));
    return event.respondWith(
      fetchJson('https://music.163.com/api/v6/playlist/detail?id=' + encodeURIComponent(id))
        .then(async (data) => {
          const pl = data.playlist || {};
          // 先用 trackIds 拿到全部歌曲ID，再批量取详情（detail 默认只给前 10 首）
          const ids = (pl.trackIds || []).map((t) => t.id).filter(Boolean);
          const tracks = [];
          for (let i = 0; i < ids.length; i += 100) {
            const chunk = ids.slice(i, i + 100);
            const c = JSON.stringify(chunk.map((sid) => ({ id: sid })));
            const detail = await fetchJson('https://music.163.com/api/v3/song/detail?c=' + encodeURIComponent(c));
            (detail.songs || []).forEach((s) => {
              tracks.push({
                id: s.id,
                name: s.name,
                artists: (s.ar || []).map((a) => a.name),
                cover: s.al && s.al.picUrl ? s.al.picUrl : '',
                duration: s.dt || 0
              });
            });
          }
          return json({ name: pl.name || '', tracks });
        })
        .catch((e) => json({ error: 'playlist fetch failed', detail: String(e) }, 502))
    );
  }

  // 歌曲播放地址：/url?ids=[1,2,3]&br=128000
  // 优先走 eapi（移动端），返回的地址不带 authSecret，浏览器可直接播放；
  // 失败再回退到 Web 接口（可能带 authSecret，需 /stream 代理）。
  if (path === '/url') {
    const idsParam = url.searchParams.get('ids');
    const br = url.searchParams.get('br') || '128000';
    if (!idsParam) return event.respondWith(json({ error: 'missing ids' }, 400));
    let ids;
    try {
      ids = JSON.parse(idsParam);
    } catch (e) {
      ids = [idsParam];
    }
    if (!Array.isArray(ids) || !ids.length) ids = [idsParam];
    return event.respondWith(
      (async () => {
        try {
          const data = await eapiSongUrl(ids, br);
          if (data && Array.isArray(data.data) && data.data.length) return json(data);
        } catch (e) {
          /* 回退 Web 接口 */
        }
        try {
          const data = await fetchJson(
            'https://music.163.com/api/song/enhance/player/url?ids=' +
              encodeURIComponent(idsParam) +
              '&br=' +
              br
          );
          return json(data);
        } catch (e) {
          return json({ error: 'url fetch failed', detail: String(e) }, 502);
        }
      })()
    );
  }

  // 音频流代理：/stream?id=xxx&br=128000
  // 优先 eapi 取地址（不带 authSecret）；若回退到 Web 地址（带 authSecret），
  // 则由 Worker 同请求转发音频。透传 Range，保证可拖动进度条（206）。
  if (path === '/stream') {
    const id = url.searchParams.get('id');
    const br = url.searchParams.get('br') || '128000';
    if (!id) return event.respondWith(json({ error: 'missing id' }, 400));
    const range = event.request.headers.get('Range') || '';
    return event.respondWith(
      (async () => {
        try {
          let item = null;
          try {
            const d = await eapiSongUrl([id], br);
            item = d && d.data && d.data[0];
          } catch (e) {
            /* 回退 Web 接口 */
          }
          if (!item || !item.url) item = await playUrl(id, br);
          const target = item && item.url;
          if (!target) return json({ error: 'no playable url', id }, 404);

          const headers = neteaseHeaders();
          if (range) headers['Range'] = range;

          const upstream = await fetch(String(target).replace(/^http:/, 'https:'), { headers });
          const out = new Headers();
          out.set('Access-Control-Allow-Origin', '*');
          out.set('Access-Control-Allow-Headers', '*');
          out.set('Accept-Ranges', 'bytes');
          out.set('Content-Type', upstream.headers.get('Content-Type') || 'audio/mpeg');
          const cr = upstream.headers.get('Content-Range');
          if (cr) out.set('Content-Range', cr);
          const cl = upstream.headers.get('Content-Length');
          if (cl) out.set('Content-Length', cl);

          return new Response(upstream.body, { status: upstream.status, headers: out });
        } catch (e) {
          return json({ error: 'stream failed', detail: String(e) }, 502);
        }
      })()
    );
  }

  // 歌曲歌词：/lyric?id=xxx（LRC 时间轴文本）
  if (path === '/lyric') {
    const id = url.searchParams.get('id');
    if (!id) return event.respondWith(json({ error: 'missing id' }, 400));
    return event.respondWith(
      fetchJson('https://music.163.com/api/song/lyric?id=' + id + '&lv=1&kv=1&tv=-1')
        .then((data) => json({ lyric: (data.lrc && data.lrc.lyric) || '', nolyric: !!data.nolyric }))
        .catch((e) => json({ error: 'lyric fetch failed', detail: String(e) }, 502))
    );
  }

  return event.respondWith(json({ error: 'not found' }, 404));
});
