/* Header clock + interactive calendar (native Intl lunar, zero dependency) */
(function () {
  var ZODIAC = { 子: '鼠', 丑: '牛', 寅: '虎', 卯: '兔', 辰: '龙', 巳: '蛇', 午: '马', 未: '羊', 申: '猴', 酉: '鸡', 戌: '狗', 亥: '猪' };
  var CAL_WEEK = ['一', '二', '三', '四', '五', '六', '日'];

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function lunarInfo(d) {
    var str = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', { year: 'numeric', month: 'long', day: 'numeric' }).format(d);
    // e.g. "2026丙午年六月28" -> ganzhi "丙午", rest "六月28日"
    var m = str.match(/([甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥])年(.*)$/);
    if (m) return { ganzhi: m[1], rest: m[2].replace(/(\d+)$/, '$1日'), animal: ZODIAC[m[1].charAt(1)] || '' };
    return { ganzhi: '', rest: str, animal: '' };
  }

  function lunarDayNum(d) {
    var s = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', { day: 'numeric' }).format(d);
    var n = parseInt(s.replace(/[^\d]/g, ''), 10);
    return Number.isFinite(n) ? n : 0;
  }

  function lunarDayText(n) {
    if (!n) return '';
    var one = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
    if (n <= 10) return n === 10 ? '初十' : '初' + one[n];
    if (n < 20) return '十' + one[n - 10];
    if (n === 20) return '二十';
    if (n < 30) return '廿' + one[n - 20];
    return '三十';
  }

  function lunarMonthDay(date) {
    var s = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', { month: 'numeric', day: 'numeric' }).format(date);
    var parts = s.split('-');
    return { m: Number(parts[0]), d: Number(parts[1]) };
  }

  function getHoliday(date) {
    var m = date.getMonth() + 1;
    var d = date.getDate();
    var fixed = {
      '1-1': '元旦', '2-14': '情人节', '3-8': '妇女节', '4-1': '愚人节',
      '5-1': '劳动节', '6-1': '儿童节', '7-1': '建党节', '8-1': '建军节',
      '9-10': '教师节', '10-1': '国庆节', '12-24': '平安夜', '12-25': '圣诞节'
    };
    if (fixed[m + '-' + d]) return fixed[m + '-' + d];

    var lm = lunarMonthDay(date);
    var lunar = {
      '1-1': '春节', '1-15': '元宵节', '2-2': '龙抬头',
      '5-5': '端午节', '7-7': '七夕节', '7-15': '中元节',
      '8-15': '中秋节', '9-9': '重阳节', '12-23': '小年'
    };
    if (lunar[lm.m + '-' + lm.d]) return lunar[lm.m + '-' + lm.d];
    // 除夕: tomorrow is lunar 1-1
    var tom = lunarMonthDay(new Date(date.getTime() + 86400000));
    if (tom.m === 1 && tom.d === 1) return '除夕';
    return '';
  }

  // ---------------- Solar terms (节气, Meeus 低精度太阳黄经) ----------------
  var SOLAR_TERMS = ['立春', '雨水', '惊蛰', '春分', '清明', '谷雨', '立夏', '小满', '芒种', '夏至', '小暑', '大暑', '立秋', '处暑', '白露', '秋分', '寒露', '霜降', '立冬', '小雪', '大雪', '冬至', '小寒', '大寒'];

  function lambdaAt(jd) {
    var n = jd - 2451545.0;
    var L = (280.460 + 0.9856474 * n) % 360;
    var g = (357.528 + 0.9856003 * n) % 360;
    var lam = L + 1.915 * Math.sin(g * Math.PI / 180) + 0.020 * Math.sin(2 * g * Math.PI / 180);
    lam = lam % 360;
    if (lam < 0) lam += 360;
    return lam;
  }

  function localJd(date) {
    return date.getTime() / 86400000 + 2440587.5;
  }

  function addDays(date, n) {
    var d = new Date(date);
    d.setDate(d.getDate() + n);
    return d;
  }

  function boundaryIn(a, b) {
    var d = b - a;
    if (d < -180) d += 360;
    if (d > 180) d -= 360;
    if (d <= 0) return -1;
    for (var k = 0; k < 24; k++) {
      var t = (315 + 15 * k) % 360;
      if (a < t && t <= b) return k;
    }
    return -1;
  }

  function termInfo(date) {
    var day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    var idx = -1, start = null;

    // 当天自身发生节气切换 → 当天即该节气首日
    var k0 = boundaryIn(lambdaAt(localJd(day)), lambdaAt(localJd(addDays(day, 1))));
    if (k0 >= 0) {
      idx = k0;
      start = day;
    } else {
      var end = day;
      for (var i = 0; i < 40; i++) {
        var kk = boundaryIn(lambdaAt(localJd(addDays(end, -1))), lambdaAt(localJd(end)));
        if (kk >= 0) { idx = kk; start = addDays(end, -1); break; }
        end = addDays(end, -1);
      }
    }
    if (idx < 0 || !start) return { cur: '', daysInto: 0, next: '', daysToNext: 0 };

    var daysInto = Math.round((day - start) / 86400000) + 1;
    var nextIdx = (idx + 1) % 24;
    var nt = (315 + 15 * nextIdx) % 360;
    if (nt === 0) nt = 360;

    var prev = day, nextStart = null;
    for (var j = 0; j < 40; j++) {
      var nx = addDays(prev, 1);
      var l1 = lambdaAt(localJd(prev)), l2 = lambdaAt(localJd(nx));
      var dl = l2 - l1;
      if (dl < -180) dl += 360;
      if (dl > 180) dl -= 360;
      if (dl > 0 && l1 < nt && nt <= l2) { nextStart = prev; break; }
      prev = nx;
    }
    var daysToNext = nextStart ? Math.round((nextStart - day) / 86400000) : 0;

    return { cur: SOLAR_TERMS[idx], daysInto: daysInto, next: SOLAR_TERMS[nextIdx], daysToNext: daysToNext };
  }

  // ---------------- Calendar ----------------
  function calState(panel) {
    if (!panel.__cal) {
      var now = new Date();
      panel.__cal = { y: now.getFullYear(), m: now.getMonth() + 1, sy: now.getFullYear(), sm: now.getMonth() + 1, sd: now.getDate() };
    }
    return panel.__cal;
  }

  function buildCalendar(panel) {
    if (!panel.querySelector('.header-clock-cal')) {
      var cal = document.createElement('div');
      cal.className = 'header-clock-cal';
      cal.innerHTML =
        '<div class="header-clock-cal-head">' +
        '<button type="button" class="header-clock-cal-btn header-clock-cal-prev" aria-label="上月">‹</button>' +
        '<span class="header-clock-cal-title"></span>' +
        '<button type="button" class="header-clock-cal-btn header-clock-cal-next" aria-label="下月">›</button>' +
        '</div>' +
        '<div class="header-clock-cal-week"></div>' +
        '<div class="header-clock-cal-grid"></div>' +
        '<div class="header-clock-cal-foot">' +
        '<span class="header-clock-cal-info"></span>' +
        '</div>';
      panel.appendChild(cal);

      var week = panel.querySelector('.header-clock-cal-week');
      CAL_WEEK.forEach(function (w) {
        var s = document.createElement('span');
        s.textContent = w;
        week.appendChild(s);
      });

      panel.querySelector('.header-clock-cal-prev').addEventListener('click', function (e) {
        e.stopPropagation();
        var st = calState(panel);
        st.m--;
        if (st.m < 1) { st.m = 12; st.y--; }
        renderCalendar(panel);
      });
      panel.querySelector('.header-clock-cal-next').addEventListener('click', function (e) {
        e.stopPropagation();
        var st = calState(panel);
        st.m++;
        if (st.m > 12) { st.m = 1; st.y++; }
        renderCalendar(panel);
      });
    }
    renderCalendar(panel);
  }

  // 重置日历到当前月份/今天
  function resetToToday(panel) {
    var now = new Date();
    panel.__cal = { y: now.getFullYear(), m: now.getMonth() + 1, sy: now.getFullYear(), sm: now.getMonth() + 1, sd: now.getDate() };
    buildCalendar(panel);
  }

  function renderCalendar(panel) {
    var st = calState(panel);
    var now = new Date();

    var title = panel.querySelector('.header-clock-cal-title');
    title.textContent = st.y + '年' + st.m + '月';

    var grid = panel.querySelector('.header-clock-cal-grid');
    grid.innerHTML = '';
    var first = new Date(st.y, st.m - 1, 1);
    var offset = (first.getDay() + 6) % 7; // Monday-start
    var dim = new Date(st.y, st.m, 0).getDate();
    var d, cell;

    for (d = 0; d < offset; d++) {
      cell = document.createElement('div');
      cell.className = 'header-clock-cal-cell is-blank';
      grid.appendChild(cell);
    }
    for (d = 1; d <= dim; d++) {
      cell = document.createElement('div');
      cell.className = 'header-clock-cal-cell';
      if (st.y === now.getFullYear() && st.m === now.getMonth() + 1 && d === now.getDate()) cell.classList.add('is-today');
      if (st.y === st.sy && st.m === st.sm && d === st.sd) cell.classList.add('is-selected');

      var num = document.createElement('span');
      num.className = 'header-clock-cal-day';
      num.textContent = d;

      var hol = getHoliday(new Date(st.y, st.m - 1, d));
      var lun = document.createElement('span');
      lun.className = 'header-clock-cal-lunar';
      if (hol) {
        lun.textContent = hol;
        lun.classList.add('is-holiday');
      } else {
        var term = termInfo(new Date(st.y, st.m - 1, d));
        if (term.cur && term.daysInto === 1) {
          lun.textContent = term.cur;
          lun.classList.add('is-term');
        } else {
          lun.textContent = lunarDayText(lunarDayNum(new Date(st.y, st.m - 1, d)));
        }
      }

      cell.appendChild(num);
      cell.appendChild(lun);
      cell.dataset.d = d;
      cell.addEventListener('click', function (e) {
        e.stopPropagation();
        var s = calState(panel);
        s.sy = s.y; s.sm = s.m; s.sd = Number(this.dataset.d);
        renderCalendar(panel);
      });
      grid.appendChild(cell);
    }
    updateCalInfo(panel);
  }

  function updateCalInfo(panel) {
    var st = calState(panel);
    var date = new Date(st.sy, st.sm - 1, st.sd);
    var info = panel.querySelector('.header-clock-cal-info');
    if (!info) return;
    var li = lunarInfo(date);
    var lmName = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', { month: 'long' }).format(date); // "六月"
    var txt = (li.ganzhi || '') + ' ' + lmName + lunarDayText(lunarDayNum(date));
    var t = termInfo(date);
    if (t.cur) {
      txt += ' · ' + t.cur + '第' + t.daysInto + '天 · 距' + t.next + t.daysToNext + '天';
    }
    info.textContent = txt;
  }

  // ---------------- Flip clock ----------------
  function buildFlipClock(el) {
    if (!el || el.__flipBuilt) return;
    el.__flipBuilt = true;
    el.classList.add('header-clock-flip');
    var html = '';
    for (var g = 0; g < 2; g++) {
      if (g) html += '<span class="flip-colon">:</span>';
      html += '<span class="flip-card"><span class="flip-digit">0</span></span>' +
              '<span class="flip-card"><span class="flip-digit">0</span></span>';
    }
    el.innerHTML = html;
  }

  function setFlipDigit(card, val) {
    var digit = card.querySelector('.flip-digit');
    if (!digit) return;
    if (digit.textContent === val) return;
    digit.classList.remove('flip');
    void digit.offsetWidth;
    digit.classList.add('flip');
    setTimeout(function () {
      digit.textContent = val;
      digit.classList.remove('flip');
    }, 170);
  }

  function updateFlipClock(el, d) {
    if (!el) return;
    var cards = el.querySelectorAll('.flip-card');
    if (!cards.length) buildFlipClock(el);
    var hh = pad(d.getHours());
    var mm = pad(d.getMinutes());
    var vals = [hh[0], hh[1], mm[0], mm[1]];
    cards.forEach(function (card, i) {
      if (card) setFlipDigit(card, vals[i]);
    });
  }

  // ---------------- Clock tick ----------------
  function tick() {
    var d = new Date();
    document.querySelectorAll('.header-clock-flip').forEach(function (el) { updateFlipClock(el, d); });
    document.querySelectorAll('.header-clock-mobile-text').forEach(function (el) {
      el.textContent = pad(d.getHours()) + ':' + pad(d.getMinutes());
    });
  }

  // ---------------- Init ----------------
  function init() {
    var panels = document.querySelectorAll('.header-clock-panel');
    if (!panels.length) return;
    panels.forEach(function (p) { buildCalendar(p); });

    document.querySelectorAll('.header-clock-flip').forEach(function (el) { buildFlipClock(el); });

    // mobile toggle (guard against double-binding on pjax re-init)
    document.querySelectorAll('.header-clock-mobile').forEach(function (el) {
      if (el.__calToggleBound) return;
      el.__calToggleBound = true;
      el.addEventListener('click', function () {
        var p = el.querySelector('.header-clock-panel');
        if (!p) return;
        var opening = !el.classList.contains('show-clock-panel');
        el.classList.toggle('show-clock-panel');
        // 每次打开都默认看今天
        if (opening) resetToToday(p);
        else buildCalendar(p);
        // 打开日历时关闭天气/音乐卡片，避免重叠
        document.querySelectorAll('.header-weather-mobile').forEach(function (w) { w.blur(); });
        document.querySelectorAll('[data-music-nav-mobile].show-music-panel').forEach(function (m) { m.classList.remove('show-music-panel'); });
      });
    });

    // 桌面端每次悬停打开都默认看今天
    document.querySelectorAll('.header-clock-item[data-clock-desktop]').forEach(function (el) {
      if (el.__calHoverBound) return;
      el.__calHoverBound = true;
      el.addEventListener('mouseenter', function () {
        var p = el.querySelector('.header-clock-panel');
        if (p) resetToToday(p);
      });
    });

    // 打开天气时关闭日历/音乐卡片
    document.querySelectorAll('.header-weather-mobile').forEach(function (w) {
      if (w.__weatherMutexBound) return;
      w.__weatherMutexBound = true;
      w.addEventListener('focusin', function () {
        document.querySelectorAll('.header-clock-mobile.show-clock-panel').forEach(function (c) {
          c.classList.remove('show-clock-panel');
        });
        document.querySelectorAll('[data-music-nav-mobile].show-music-panel').forEach(function (m) {
          m.classList.remove('show-music-panel');
        });
      });
    });

    if (window.__fsClockTimer) clearInterval(window.__fsClockTimer);
    window.__fsClockTimer = setInterval(tick, 1000);
    tick();
  }

  // close mobile calendar when clicking outside
  document.addEventListener('click', function (e) {
    document.querySelectorAll('.header-clock-mobile.show-clock-panel').forEach(function (el) {
      if (!el.contains(e.target)) el.classList.remove('show-clock-panel');
    });
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
  document.addEventListener('pjax:complete', init);
})();
