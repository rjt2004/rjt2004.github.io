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
    if (m === 4 && (d === 4 || d === 5)) return '清明节';
    if (m === 12 && (d === 21 || d === 22)) return '冬至';

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
        '<button type="button" class="header-clock-cal-btn header-clock-cal-today">今天</button>' +
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
      panel.querySelector('.header-clock-cal-today').addEventListener('click', function (e) {
        e.stopPropagation();
        var now = new Date();
        var st = calState(panel);
        st.y = now.getFullYear();
        st.m = now.getMonth() + 1;
        st.sy = st.y; st.sm = st.m; st.sd = now.getDate();
        renderCalendar(panel);
      });
    }
    renderCalendar(panel);
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
        lun.textContent = lunarDayText(lunarDayNum(new Date(st.y, st.m - 1, d)));
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
    var li = lunarInfo(date);
    var info = panel.querySelector('.header-clock-cal-info');
    if (!info) return;
    var hol = getHoliday(date);
    var lmName = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', { month: 'long' }).format(date); // "六月"
    var txt = '农历' + (li.ganzhi ? ' ' + li.ganzhi + '年' : '') + ' ' + lmName + lunarDayText(lunarDayNum(date));
    if (li.animal) txt += ' · 属' + li.animal;
    if (hol) txt = hol + ' · ' + txt;
    info.textContent = txt;
  }

  // ---------------- Flip clock ----------------
  function buildFlipClock(el) {
    if (!el || el.__flipBuilt) return;
    el.__flipBuilt = true;
    el.classList.add('header-clock-flip');
    var html = '';
    for (var g = 0; g < 3; g++) {
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
    var ss = pad(d.getSeconds());
    var vals = [hh[0], hh[1], mm[0], mm[1], ss[0], ss[1]];
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
        el.classList.toggle('show-clock-panel');
        buildCalendar(p);
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
