/* Home widgets: hitokoto + on-this-day + decider (dialog bubbles) */
(function () {
  var container = document.querySelector('.first-screen-container');
  if (!container) return;

  function $1(sel, root) { return (root || document).querySelector(sel); }

  // ---------------- Hitokoto ----------------
  var quoteBubble = $1('.fs-bubble-hitokoto');
  var quoteText = $1('.fs-bubble-text', quoteBubble);
  var quoteSource = $1('.fs-bubble-source', quoteBubble);

  function loadQuote() {
    if (!quoteText) return;
    quoteText.textContent = '正在加载一言…';
    quoteSource.textContent = '';
    // 加随机参数 + no-store，避免浏览器缓存导致刷新后仍是同一句
    fetch('https://v1.hitokoto.cn/?c=a&c=b&c=c&c=d&c=e&c=f&c=g&c=h&c=i&c=j&c=k&c=l&_=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || !d.hitokoto) throw new Error('empty');
        quoteText.textContent = d.hitokoto;
        var src = '';
        if (d.from_who) src += d.from_who + ' · ';
        if (d.from) src += '《' + d.from + '》';
        quoteSource.textContent = src ? '—— ' + src : '';
      })
      .catch(function () {
        quoteText.textContent = '人生在世，无非是笑笑别人，然后再让别人笑笑自己。';
        quoteSource.textContent = '—— 路遥《平凡的世界》';
      });
  }

  var quoteRefresh = $1('.fs-bubble-refresh', quoteBubble);
  if (quoteRefresh) {
    quoteRefresh.addEventListener('click', loadQuote);
  }

  // ---------------- Decider ----------------
  var deciderBubble = $1('.fs-bubble-decider');
  var deciderResult = $1('.fs-bubble-decider-result', deciderBubble);
  var deciderDataEl = $1('#fs-decider-data');
  var deciderOptions = [];
  try { if (deciderDataEl) deciderOptions = JSON.parse(deciderDataEl.textContent); } catch (e) { deciderOptions = []; }
  if (!deciderOptions.length) deciderOptions = ['火锅', '烧烤', '日料', '麦当劳', '自己做'];

  function pickDecider() {
    if (!deciderResult) return;
    var chosen = deciderOptions[(Math.random() * deciderOptions.length) | 0];
    var step = 0;
    var total = 8 + ((Math.random() * 8) | 0);
    var timer = setInterval(function () {
      deciderResult.textContent = deciderOptions[(Math.random() * deciderOptions.length) | 0];
      step++;
      if (step >= total) {
        clearInterval(timer);
        deciderResult.textContent = chosen;
        deciderResult.classList.remove('picked');
        void deciderResult.offsetWidth;
        deciderResult.classList.add('picked');
      }
    }, 70);
  }

  var deciderRefresh = $1('.fs-bubble-refresh', deciderBubble);
  if (deciderRefresh) deciderRefresh.addEventListener('click', pickDecider);

  loadQuote();
})();
