
const RAW_COOKIE = typeof NETEASE_COOKIE !== 'undefined' ? NETEASE_COOKIE : '';
// 复制 Cookie 时可能带入换行/回车或 "Cookie:" 前缀，会触发 fetch "Invalid header value"，这里统一清洗
const COOKIE = String(RAW_COOKIE)
  .replace(/^Cookie:\s*/i, '')
  .replace(/[\r\n]+/g, ' ')
  .replace(/\s{2,}/g, ' ')
  .trim();
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

// 缓存时长（秒）：播放地址有效期 20 分钟，缓存 10 分钟安全；歌单/歌词变动少，缓存更久
const TTL = {
  playlist: 1800,
  url: 600,
  lyric: 86400
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': '*'
};

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      'Referer': 'https://music.163.com/',
      'Cookie': COOKIE
    }
  });
  return res.json();
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders }
  });
}

// 用 Cloudflare 边缘缓存包一层：命中就直接返回，不再打网易云，避免频繁刷新触发限流。
// 只缓存成功（200）响应，并给浏览器也带上 Cache-Control，让重复刷新连 Worker 都不用到。
function serveCached(event, ttlSeconds, producer) {
  const cache = caches.default;
  const key = new Request(event.request.url, { method: 'GET' });

  event.respondWith(
    (async () => {
      const hit = await cache.match(key);
      if (hit) {
        const hitHeaders = new Headers(hit.headers);
        hitHeaders.set('X-Cache', 'HIT');
        return new Response(hit.body, { status: hit.status, headers: hitHeaders });
      }

      const res = await producer();
      if (res.status !== 200) return res;

      const body = await res.arrayBuffer();
      const headers = new Headers(res.headers);
      headers.set('Cache-Control', `public, max-age=${ttlSeconds}`);
      headers.set('X-Cache', 'MISS');
      const out = new Response(body, { status: 200, headers });

      event.waitUntil(cache.put(key, out.clone()));
      return out;
    })()
  );
}

addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (event.request.method === 'OPTIONS') {
    return event.respondWith(new Response(null, { headers: corsHeaders }));
  }

  const path = url.pathname;

  // 诊断：/debug（不返回 Cookie 内容，只报告是否存在、长度、字段和登录状态）
  if (path === '/debug') {
    return event.respondWith(
      (async () => {
        const result = {
          hasCookie: COOKIE.length > 0,
          cookieLength: COOKIE.length,
          hasMusicU: /(^|;\s*)MUSIC_U=/.test(COOKIE),
          hasCsrf: /(^|;\s*)__csrf=/.test(COOKIE),
          cookieLooksMalformed: COOKIE.length > 0 && COOKIE.indexOf('=') === -1,
        };

        try {
          const acc = await fetchJson('https://music.163.com/api/nuser/account/get');
          result.login = {
            code: acc.code,
            nickname: acc.profile ? acc.profile.nickname : null,
            userId: acc.profile ? acc.profile.userId : null,
            vipType: acc.profile ? acc.profile.vipType : null,
          };
        } catch (e) {
          result.login = { error: String(e) };
        }

        result.loginOk = !!(result.login && result.login.userId);

        return json(result);
      })()
    );
  }

  // 歌单详情：/playlist?id=xxx
  if (path === '/playlist') {
    const id = url.searchParams.get('id');
    if (!id) return event.respondWith(json({ error: 'missing id' }, 400));

    return serveCached(event, TTL.playlist, () =>
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
  if (path === '/url') {
    const ids = url.searchParams.get('ids');
    const br = url.searchParams.get('br') || '128000';
    if (!ids) return event.respondWith(json({ error: 'missing ids' }, 400));

    return serveCached(event, TTL.url, () =>
      fetchJson('https://music.163.com/api/song/enhance/player/url?ids=' + ids + '&br=' + br)
        .then((data) => json(data))
        .catch((e) => json({ error: 'url fetch failed', detail: String(e) }, 502))
    );
  }

  // 歌曲歌词：/lyric?id=xxx（LRC 时间轴文本）
  if (path === '/lyric') {
    const id = url.searchParams.get('id');
    if (!id) return event.respondWith(json({ error: 'missing id' }, 400));

    return serveCached(event, TTL.lyric, () =>
      fetchJson('https://music.163.com/api/song/lyric?id=' + id + '&lv=1&kv=1&tv=-1')
        .then((data) => json({ lyric: (data.lrc && data.lrc.lyric) || '', nolyric: !!data.nolyric }))
        .catch((e) => json({ error: 'lyric fetch failed', detail: String(e) }, 502))
    );
  }

  return event.respondWith(json({ error: 'not found' }, 404));
});
