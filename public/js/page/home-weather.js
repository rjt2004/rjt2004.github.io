(function () {
  const DEFAULT_CONFIG = {
    provider: 'qweather',
    endpoint: '',
    location: '',
    adm: '',
    display_place: '天气',
    refresh_minutes: 10
  };

  const CONFIG = Object.assign({}, DEFAULT_CONFIG, window.TONE_HOME_WEATHER || {});
  const DISPLAY_PLACE = CONFIG.display_place || DEFAULT_CONFIG.display_place;
  const LOCATION = CONFIG.location || CONFIG.query_place || '';
  const ADM = CONFIG.adm || CONFIG.match_admin1 || '';
  const ENDPOINT = CONFIG.endpoint || '';
  const ICON_BASE = '/images/meteocons/';
  const refreshMinutes = Number(CONFIG.refresh_minutes ?? CONFIG.cache_minutes);
  const REFRESH_INTERVAL = (Number.isFinite(refreshMinutes) && refreshMinutes > 0 ? refreshMinutes : DEFAULT_CONFIG.refresh_minutes) * 60 * 1000;
  let refreshTimer = null;
  let requestId = 0;

  function qweatherIconToMeteocon(code) {
    const icon = String(code || '');
    const n = Number(icon);
    const isNight = n >= 150 && n < 200 || n >= 350 && n < 400 || n >= 456 && n <= 457;
    const dayNight = (day, night) => isNight ? night : day;

    if (icon === '100') return 'clear-day';
    if (icon === '150') return 'clear-night';
    if (['101', '102', '151', '152'].includes(icon)) return dayNight('partly-cloudy-day', 'partly-cloudy-night');
    if (['103', '153'].includes(icon)) return dayNight('mostly-clear-day', 'mostly-clear-night');
    if (icon === '104') return 'cloudy';

    if (['300', '350'].includes(icon)) return dayNight('partly-cloudy-day-rain', 'partly-cloudy-night-rain');
    if (['301', '351'].includes(icon)) return dayNight('partly-cloudy-day-rain', 'partly-cloudy-night-rain');
    if (['302', '303'].includes(icon)) return dayNight('thunderstorms-day-rain', 'thunderstorms-night-rain');
    if (icon === '304') return 'hail';
    if (['305', '309', '314'].includes(icon)) return 'drizzle';
    if (['306', '315', '399'].includes(icon)) return 'rain';
    if (['307', '316'].includes(icon)) return 'overcast-rain';
    if (['308', '310', '311', '312', '317', '318'].includes(icon)) return 'extreme-rain';
    if (icon === '313') return 'sleet';

    if (['400', '401', '408', '499'].includes(icon)) return 'snow';
    if (['402', '409'].includes(icon)) return 'overcast-snow';
    if (['403', '410'].includes(icon)) return 'overcast-snow';
    if (['404', '405', '406'].includes(icon)) return 'sleet';
    if (['407', '456', '457'].includes(icon)) return dayNight('partly-cloudy-day-snow', 'partly-cloudy-night-snow');

    if (['500', '501', '509', '510', '514', '515'].includes(icon)) return dayNight('fog-day', 'fog-night');
    if (['502', '511', '512', '513'].includes(icon)) return 'fog';
    if (['503', '504', '507', '508'].includes(icon)) return 'wind';
    if (['900', '901'].includes(icon)) return 'not-available';
    return 'not-available';
  }

  function buildWeatherUrl() {
    if (!ENDPOINT) throw new Error('Missing weather endpoint');
    if (!LOCATION) throw new Error('Missing weather location');
    const url = new URL(ENDPOINT, window.location.href);
    url.searchParams.set('location', LOCATION);
    if (ADM) url.searchParams.set('adm', ADM);
    return url.toString();
  }

  function formatTime(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
  }
  function renderMetricGrid(el, items) {
    if (!el) return;
    el.textContent = '';
    items.filter(item => item.value).forEach(item => {
      const metric = document.createElement('span');
      metric.className = 'home-weather-metric';
      const icon = document.createElement('span');
      icon.className = 'home-weather-metric-icon';
      if (item.iconSrc) {
        const img = document.createElement('img');
        img.src = item.iconSrc;
        img.alt = item.iconAlt || '';
        img.loading = 'lazy';
        icon.appendChild(img);
      } else {
        icon.textContent = item.icon;
      }
      const text = document.createElement('span');
      text.className = 'home-weather-metric-text';
      text.textContent = item.value;
      metric.append(icon, text);
      el.appendChild(metric);
    });
  }


  function setIcon(el, src, alt, hidden) {
    el.querySelectorAll('.home-weather-icon').forEach(icon => {
      icon.hidden = Boolean(hidden);
      icon.src = hidden ? '' : src;
      icon.alt = hidden ? '' : alt;
    });
    el.querySelectorAll('.header-weather-fallback').forEach(icon => {
      icon.hidden = !hidden;
    });
  }

  function renderMessage(el, message, isError) {
    el.classList.add('is-message');
    el.classList.toggle('is-error', Boolean(isError));
    setIcon(el, '', '', true);
    const brief = el.querySelector('.home-weather-brief');
    const place = el.querySelector('.home-weather-place');
    const main = el.querySelector('.home-weather-main');
    const meta = el.querySelector('.home-weather-meta');
    const detail = el.querySelector('.home-weather-detail');
    if (brief) brief.textContent = isError ? '失败' : '--°C';
    if (place) place.textContent = message;
    if (main) main.textContent = '';
    if (meta) meta.textContent = '';
    if (detail) detail.textContent = '';
  }

  function renderWeather(el, state) {
    const weather = state.weather || {};
    const text = weather.text || '天气';
    const temp = weather.temp || '--';
    const iconName = qweatherIconToMeteocon(weather.icon);
    const iconSrc = `${ICON_BASE}${iconName}.svg`;
    const updateTime = formatTime(state.updateTime || weather.obsTime);
    const brief = el.querySelector('.home-weather-brief');
    const place = el.querySelector('.home-weather-place');
    const main = el.querySelector('.home-weather-main');
    const meta = el.querySelector('.home-weather-meta');
    const detail = el.querySelector('.home-weather-detail');

    el.classList.remove('is-message', 'is-error');
    setIcon(el, iconSrc, text, false);
    if (brief) brief.textContent = `${text} ${temp}°C`;
    if (place) place.textContent = DISPLAY_PLACE;
    if (main) main.textContent = `${text} ${temp}°C`;
    const feels = weather.feelsLike ? `体感 ${weather.feelsLike}°C` : '';
    const humidity = weather.humidity ? `湿度 ${weather.humidity}%` : '';
    const wind = [weather.windDir, weather.windScale ? `${weather.windScale}级` : ''].filter(Boolean).join(' ');
    const updated = updateTime ? `观测 ${updateTime}` : '';
    renderMetricGrid(meta, [
      { iconSrc: '/images/weather/temperature-emoji.svg', iconAlt: '体感', value: feels },
      { iconSrc: '/images/weather/humidity-emoji.svg', iconAlt: '湿度', value: humidity },
      { iconSrc: '/images/weather/wind-emoji.svg', iconAlt: '风', value: wind },
      { iconSrc: '/images/weather/time-emoji.svg', iconAlt: '观测', value: updated }
    ]);
    if (detail) detail.textContent = '';
  }

  function render(state) {
    document.querySelectorAll('[data-home-weather-status]').forEach(el => {
      if (state.loading) {
        renderMessage(el, '天气加载中', false);
        return;
      }
      if (state.error) {
        renderMessage(el, '天气加载失败', true);
        return;
      }
      renderWeather(el, state);
    });
  }

  function fetchWeather() {
    return fetch(buildWeatherUrl(), { method: 'GET', cache: 'no-store' })
      .then(res => res.json().then(data => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok || data?.ok === false) throw new Error(data?.message || 'Weather request failed');
        return data;
      });
  }

  function loadWeather(showLoading) {
    const currentRequest = ++requestId;
    if (showLoading) render({ loading: true });
    return fetchWeather()
      .then(state => {
        if (currentRequest === requestId) render(state);
      })
      .catch(() => {
        if (currentRequest === requestId) render({ error: true });
      });
  }

  function init() {
    if (!document.querySelector('[data-home-weather-status]')) return;
    if (refreshTimer) clearInterval(refreshTimer);
    loadWeather(true);
    refreshTimer = setInterval(() => loadWeather(false), REFRESH_INTERVAL);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
  document.addEventListener('pjax:complete', init);
})();


