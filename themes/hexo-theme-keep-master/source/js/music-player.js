/* Navbar music player: single shared audio + global state (persists across pjax) */
(function () {
  // 挂在 window 上，脚本被 pjax 重新执行时复用，避免重复创建 Audio（两首歌）
  var shared = window.__musicShared = window.__musicShared || {
    audio: null,
    tracks: [],
    current: -1,
    playing: false,
    loaded: false,
    bound: false,
    lyric: [],
    statusMsg: ''
  };

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function fmt(t) {
    t = Math.floor(t || 0);
    var m = Math.floor(t / 60), s = t % 60;
    return m + ':' + (s < 10 ? '0' + s : s);
  }

  // 解析 LRC 歌词为 [{time, text}]，按时间排序
  function parseLyric(text) {
    if (!text) return [];
    var out = [];
    text.split('\n').forEach(function (line) {
      var m = line.match(/\[(\d+):(\d+(?:\.\d+)?)\](.*)/);
      if (m) {
        var time = Number(m[1]) * 60 + Number(m[2]);
        var t = (m[3] || '').trim();
        if (t) out.push({ time: time, text: t });
      }
    });
    out.sort(function (a, b) { return a.time - b.time; });
    return out;
  }

  function panels() { return document.querySelectorAll('.music-nav-panel'); }
  function getProxy() { var p = panels()[0]; return p ? (p.dataset.proxy || '') : ''; }
  function getBr() { var p = panels()[0]; return p ? (Number(p.dataset.br) || 128000) : 128000; }

  function ensureAudio() {
    if (shared.audio) return shared.audio;
    var audio = new Audio();
    shared.audio = audio;
    if (!shared.bound) {
      shared.bound = true;
      audio.addEventListener('play', function () { shared.playing = true; syncUI(); });
      audio.addEventListener('pause', function () { shared.playing = false; syncUI(); });
      audio.addEventListener('ended', function () { if (shared.tracks.length > 1) shuffle(); });
      audio.addEventListener('timeupdate', syncProgress);
      audio.addEventListener('error', function () { setStatus('播放出错', true); });
    }
    return audio;
  }

  function setStatus(msg, err) {
    shared.statusMsg = msg || '';
    panels().forEach(function (p) {
      var el = p.querySelector('.music-status');
      if (el) {
        el.textContent = msg || '';
        el.classList.toggle('is-error', !!err);
        el.classList.remove('is-lyric');
      }
    });
  }

  // 播放时在状态行显示当前歌词
  function updateLyric() {
    if (shared.statusMsg) return;
    var line = '';
    if (shared.playing && shared.lyric && shared.lyric.length && shared.audio) {
      var t = shared.audio.currentTime;
      for (var i = 0; i < shared.lyric.length; i++) {
        if (shared.lyric[i].time <= t + 0.3) line = shared.lyric[i].text;
        else break;
      }
    }
    panels().forEach(function (p) {
      var el = p.querySelector('.music-status');
      if (!el) return;
      el.textContent = line;
      el.classList.toggle('is-lyric', !!line);
    });
  }

  function syncUI() {
    panels().forEach(function (p) {
      var btnPlay = p.querySelector('.music-btn-play');
      if (btnPlay) btnPlay.innerHTML = shared.playing ? '<i class="fa-solid fa-pause"></i>' : '<i class="fa-solid fa-play"></i>';
      var nav = p.closest('.music-nav-item, .music-nav-mobile');
      var pill = nav ? nav.querySelector('.music-nav-pill, .music-nav-mobile-button') : null;
      if (pill) pill.classList.toggle('is-playing', shared.playing);
    });
  }

  function syncMeta() {
    var t = shared.tracks[shared.current];
    if (!t) return;
    panels().forEach(function (p) {
      var nameEl = p.querySelector('.music-player-name');
      var artistEl = p.querySelector('.music-player-artist');
      var cover = p.querySelector('.music-player-cover');
      if (nameEl) nameEl.textContent = t.name || '';
      if (artistEl) artistEl.textContent = (t.artists || []).join(' / ');
      if (t.cover) { cover.src = t.cover; cover.style.display = ''; } else { cover.style.display = 'none'; }
      var nav = p.closest('.music-nav-item, .music-nav-mobile');
      var navName = nav ? nav.querySelector('.music-nav-name') : null;
      if (navName) navName.textContent = t.name || '';
    });
  }

  function syncProgress() {
    var audio = shared.audio;
    if (!audio) return;
    updateLyric();
    panels().forEach(function (p) {
      var prog = p.querySelector('.music-progress-range');
      var time = p.querySelector('.music-time');
      if (!prog || !time) return;
      if (audio.duration) {
        prog.value = (audio.currentTime / audio.duration) * 1000;
        time.textContent = fmt(audio.currentTime) + ' / ' + fmt(audio.duration);
      }
    });
  }

  function playAt(i) {
    if (i < 0 || i >= shared.tracks.length) return;
    shared.current = i;
    var t = shared.tracks[i];
    shared.lyric = [];
    setStatus('加载中…');
    syncMeta();
    fetch(getProxy() + '/url?ids=' + encodeURIComponent('[' + t.id + ']') + '&br=' + getBr())
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var url = d.data && d.data[0] && d.data[0].url;
        if (!url) {
          setStatus('该歌曲需登录/版权受限，已跳过', true);
          setTimeout(shuffle, 800);
          return;
        }
        // 拉取歌词
        fetch(getProxy() + '/lyric?id=' + t.id)
          .then(function (r2) { return r2.json(); })
          .then(function (ld) {
            shared.lyric = parseLyric((ld && ld.lyric) || '');
          })
          .catch(function () { shared.lyric = []; });
        var audio = ensureAudio();
        audio.src = url;
        audio.play().then(function () { shared.playing = true; syncUI(); setStatus(''); })
          .catch(function () { shared.playing = false; syncUI(); setStatus('点击播放'); });
      })
      .catch(function () { setStatus('获取播放地址失败', true); });
  }

  function togglePlay() {
    var audio = ensureAudio();
    if (audio.src) {
      if (audio.paused) {
        audio.play().then(function () { shared.playing = true; syncUI(); setStatus(''); }).catch(function () { setStatus('播放失败', true); });
      } else {
        audio.pause(); shared.playing = false; syncUI();
      }
    }
  }

  function shuffle() {
    if (shared.tracks.length < 2) return;
    var next = shared.current;
    while (next === shared.current) next = (Math.random() * shared.tracks.length) | 0;
    playAt(next);
  }

  // 批量检查歌曲是否可播放，过滤掉版权受限的（返回只含可播放的）
  function checkPlayable(tracks, cb) {
    var playable = [];
    var chunks = [];
    for (var i = 0; i < tracks.length; i += 40) chunks.push(tracks.slice(i, i + 40));
    if (!chunks.length) { cb(playable); return; }
    var done = 0;
    chunks.forEach(function (chunk) {
      var ids = chunk.map(function (t) { return t.id; });
      fetch(getProxy() + '/url?ids=' + encodeURIComponent('[' + ids.join(',') + ']') + '&br=' + getBr())
        .then(function (r) { return r.json(); })
        .then(function (d) {
          var ok = {};
          (d.data || []).forEach(function (item) {
            if (item && item.code === 200 && item.url) ok[item.id] = true;
          });
          chunk.forEach(function (t) { if (ok[t.id]) playable.push(t); });
        })
        .catch(function () {
          // 该批检查失败：保守全部保留，避免误删
          chunk.forEach(function (t) { playable.push(t); });
        })
        .then(function () {
          done++;
          if (done === chunks.length) cb(playable);
        });
    });
  }

  function loadList() {
    var playlistId = panels()[0] ? panels()[0].dataset.playlist || '' : '';
    setStatus('加载歌单中…');
    fetch(getProxy() + '/playlist?id=' + encodeURIComponent(playlistId))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var all = (data.tracks || []).filter(function (t) { return t && t.id; });
        if (!all.length) { setStatus('歌单为空或接口异常', true); return; }
        setStatus('正在检查可播放歌曲…');
        checkPlayable(all, function (ok) {
          shared.tracks = ok;
          if (!shared.tracks.length) { setStatus('歌单中暂无可用歌曲', true); return; }
          setStatus('');
          playAt((Math.random() * shared.tracks.length) | 0);
        });
      })
      .catch(function () { setStatus('歌单加载失败，请检查代理配置', true); });
  }

  function buildPlayer(panel) {
    if (panel.__built) return;
    panel.__built = true;

    panel.innerHTML =
      '<div class="music-player">' +
      '<div class="music-player-now">' +
      '<img class="music-player-cover" src="" alt="">' +
      '<div class="music-player-info">' +
      '<div class="music-player-name"></div>' +
      '<div class="music-player-artist"></div>' +
      '</div></div>' +
      '<div class="music-player-bar">' +
      '<button class="music-btn music-btn-play" type="button" title="播放/暂停"><i class="fa-solid fa-play"></i></button>' +
      '<button class="music-btn music-btn-shuffle" type="button" title="随机"><i class="fa-solid fa-shuffle"></i></button>' +
      '<div class="music-volume">' +
      '<i class="fa-solid fa-volume-high"></i>' +
      '<input class="music-volume-range" type="range" min="0" max="100" value="80">' +
      '</div></div>' +
      '<div class="music-progress">' +
      '<input class="music-progress-range" type="range" min="0" max="1000" value="0">' +
      '<span class="music-time">0:00 / 0:00</span>' +
      '</div>' +
      '<div class="music-status"></div>' +
      '</div>';

    var btnPlay = panel.querySelector('.music-btn-play');
    var btnShuffle = panel.querySelector('.music-btn-shuffle');
    var volRange = panel.querySelector('.music-volume-range');
    var progRange = panel.querySelector('.music-progress-range');

    btnPlay.addEventListener('click', togglePlay);
    btnShuffle.addEventListener('click', shuffle);
    volRange.addEventListener('input', function () {
      if (shared.audio) shared.audio.volume = Number(volRange.value) / 100;
    });
    progRange.addEventListener('input', function () {
      var audio = shared.audio;
      if (audio && audio.duration) audio.currentTime = (Number(progRange.value) / 1000) * audio.duration;
    });

    if (shared.loaded) {
      // 已加载过（含 pjax 切页），同步状态，音乐继续播
      volRange.value = shared.audio ? Math.round(shared.audio.volume * 100) : 80;
      syncMeta();
      syncUI();
      syncProgress();
    } else {
      shared.loaded = true;
      loadList();
    }
  }

  function bindMobileToggle() {
    document.querySelectorAll('[data-music-nav-mobile]').forEach(function (el) {
      if (el.__musicToggleBound) return;
      el.__musicToggleBound = true;
      el.addEventListener('click', function () {
        var p = el.querySelector('.music-nav-panel');
        if (!p) return;
        el.classList.toggle('show-music-panel');
        // 互斥：打开音乐时关闭日历/天气
        document.querySelectorAll('.header-clock-mobile.show-clock-panel').forEach(function (c) { c.classList.remove('show-clock-panel'); });
        document.querySelectorAll('.header-weather-mobile').forEach(function (w) { w.blur(); });
      });
    });
  }

  function ensureBuilt() {
    panels().forEach(function (p) { if (!p.__built) buildPlayer(p); });
    bindMobileToggle();
  }

  function init() {
    ensureBuilt();
  }

  // 脚本只在首屏加载一次（无 data-pjax），此观察器永久监听新面板出现并自动构建
  if (!window.__musicObserver) {
    window.__musicObserver = true;
    new MutationObserver(ensureBuilt).observe(document.body, { childList: true, subtree: true });
  }

  document.addEventListener('click', function (e) {
    document.querySelectorAll('[data-music-nav-mobile].show-music-panel').forEach(function (el) {
      if (!el.contains(e.target)) el.classList.remove('show-music-panel');
    });
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
  document.addEventListener('pjax:complete', init);
})();
