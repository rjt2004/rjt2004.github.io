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
const COOKIE = typeof NETEASE_COOKIE !== 'undefined' ? NETEASE_COOKIE : '';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

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

addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (event.request.method === 'OPTIONS') {
    return event.respondWith(new Response(null, { headers: corsHeaders }));
  }

  const path = url.pathname;

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
  if (path === '/url') {
    const ids = url.searchParams.get('ids');
    const br = url.searchParams.get('br') || '128000';
    if (!ids) return event.respondWith(json({ error: 'missing ids' }, 400));
    return event.respondWith(
      fetchJson('https://music.163.com/api/song/enhance/player/url?ids=' + ids + '&br=' + br)
        .then((data) => json(data))
        .catch((e) => json({ error: 'url fetch failed', detail: String(e) }, 502))
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
