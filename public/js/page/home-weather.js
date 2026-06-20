(function () {
  const DEFAULT_CONFIG = {
    display_place: '\u5929\u6c14',
    query_place: '',
    match_admin1: '',
    latitude: null,
    longitude: null,
    refresh_minutes: 5
  };
  const CONFIG = Object.assign({}, DEFAULT_CONFIG, window.TONE_HOME_WEATHER || {});
  const hasConfiguredLatitude = CONFIG.latitude !== null && CONFIG.latitude !== undefined && CONFIG.latitude !== '';
  const hasConfiguredLongitude = CONFIG.longitude !== null && CONFIG.longitude !== undefined && CONFIG.longitude !== '';
  const configuredLatitude = Number(CONFIG.latitude);
  const configuredLongitude = Number(CONFIG.longitude);
  const DISPLAY_PLACE = CONFIG.display_place || CONFIG.place || DEFAULT_CONFIG.display_place;
  const QUERY_PLACE = CONFIG.query_place || CONFIG.place || CONFIG.display_place || '';
  const MATCH_ADMIN1 = CONFIG.match_admin1 || '';
  const refreshMinutes = Number(CONFIG.refresh_minutes ?? CONFIG.cache_minutes);
  const REFRESH_INTERVAL = (Number.isFinite(refreshMinutes) && refreshMinutes > 0 ? refreshMinutes : DEFAULT_CONFIG.refresh_minutes) * 60 * 1000;
  const ICON_BASE = '/images/meteocons/';
  let refreshTimer = null;
  let requestId = 0;

  const WEATHER_LABELS = {
    'clear-day': '\u6674',
    'clear-night': '\u6674',
    'mostly-clear-day': '\u5c11\u4e91',
    'mostly-clear-night': '\u5c11\u4e91',
    'partly-cloudy-day': '\u591a\u4e91',
    'partly-cloudy-night': '\u591a\u4e91',
    'overcast-day': '\u9634',
    'overcast-night': '\u9634',
    fog: '\u96fe',
    'fog-day': '\u96fe',
    'fog-night': '\u96fe',
    drizzle: '\u6bdb\u6bdb\u96e8',
    'partly-cloudy-day-drizzle': '\u9635\u6bdb\u6bdb\u96e8',
    'partly-cloudy-night-drizzle': '\u9635\u6bdb\u6bdb\u96e8',
    'overcast-drizzle': '\u6bdb\u6bdb\u96e8',
    rain: '\u5c0f\u96e8',
    'overcast-rain': '\u4e2d\u96e8',
    'extreme-rain': '\u5927\u96e8',
    'partly-cloudy-day-rain': '\u9635\u96e8',
    'partly-cloudy-night-rain': '\u9635\u96e8',
    sleet: '\u96e8\u5939\u96ea',
    snow: '\u96ea',
    snowflake: '\u96ea\u7c92',
    'partly-cloudy-day-snow': '\u9635\u96ea',
    'partly-cloudy-night-snow': '\u9635\u96ea',
    'overcast-snow': '\u5927\u96ea',
    wind: '\u6709\u98ce',
    hail: '\u51b0\u96f9',
    thunderstorms: '\u96f7\u66b4',
    'thunderstorms-night': '\u96f7\u66b4',
    'thunderstorms-rain': '\u96f7\u96e8',
    'thunderstorms-hail': '\u96f7\u66b4\u51b0\u96f9',
    'thunderstorms-day': '\u96f7\u66b4',
    'thunderstorms-day-rain': '\u96f7\u96e8',
    'thunderstorms-night-rain': '\u96f7\u96e8',
    'thunderstorms-day-hail': '\u96f7\u66b4\u51b0\u96f9',
    'thunderstorms-night-hail': '\u96f7\u66b4\u51b0\u96f9'
  };

  function dayNight(dayIcon, nightIcon, isDay) {
    return isDay ? dayIcon : nightIcon;
  }

  function mapWeather(code, windSpeed, isDay) {
    if (code === 0) return windSpeed >= 34 ? 'wind' : dayNight('clear-day', 'clear-night', isDay);
    if (code === 1) return windSpeed >= 30 ? 'wind' : dayNight('mostly-clear-day', 'mostly-clear-night', isDay);
    if (code === 2) return windSpeed >= 30 ? 'wind' : dayNight('partly-cloudy-day', 'partly-cloudy-night', isDay);
    if (code === 3) return windSpeed >= 30 ? 'wind' : dayNight('overcast-day', 'overcast-night', isDay);
    if (code === 45) return dayNight('fog-day', 'fog-night', isDay);
    if (code === 48) return 'fog';
    if (code === 51) return dayNight('partly-cloudy-day-drizzle', 'partly-cloudy-night-drizzle', isDay);
    if (code === 53 || code === 55) return 'overcast-drizzle';
    if (code === 56 || code === 57) return 'sleet';
    if (code === 61) return 'rain';
    if (code === 63) return 'overcast-rain';
    if (code === 65) return 'extreme-rain';
    if (code === 66 || code === 67) return 'sleet';
    if (code === 71 || code === 73) return 'snow';
    if (code === 75) return 'overcast-snow';
    if (code === 77) return 'snowflake';
    if (code >= 80 && code <= 82) return dayNight('partly-cloudy-day-rain', 'partly-cloudy-night-rain', isDay);
    if (code === 85) return dayNight('partly-cloudy-day-snow', 'partly-cloudy-night-snow', isDay);
    if (code === 86) return 'overcast-snow';
    if (code === 95) return dayNight('thunderstorms-day-rain', 'thunderstorms-night-rain', isDay);
    if (code === 96 || code === 99) return dayNight('thunderstorms-day-hail', 'thunderstorms-night-hail', isDay);
    if (windSpeed >= 34) return 'wind';
    return dayNight('clear-day', 'clear-night', isDay);
  }

  function drawIcon(img, type) {
    if (!img) return;
    const icon = type || 'not-available';
    img.src = ICON_BASE + icon + '.svg';
    img.alt = WEATHER_LABELS[icon] || '\u5929\u6c14';
  }

  function loadingState() {
    return { loading: true };
  }

  function errorState() {
    return { error: true };
  }

  function resolveLocation() {
    if (hasConfiguredLatitude && hasConfiguredLongitude && Number.isFinite(configuredLatitude) && Number.isFinite(configuredLongitude)) {
      return Promise.resolve({ latitude: configuredLatitude, longitude: configuredLongitude, place: DISPLAY_PLACE });
    }
    if (!QUERY_PLACE) return Promise.reject(new Error('Missing weather query_place'));
    const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
    url.searchParams.set('name', QUERY_PLACE);
    url.searchParams.set('count', '10');
    url.searchParams.set('language', 'zh');
    url.searchParams.set('format', 'json');
    return fetch(url.toString())
      .then(res => res.json())
      .then(data => {
        const results = Array.isArray(data?.results) ? data.results : [];
        const result = MATCH_ADMIN1 ? results.find(item => item?.admin1 === MATCH_ADMIN1) : results[0];
        const latitude = Number(result?.latitude);
        const longitude = Number(result?.longitude);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
          throw new Error('Weather location not found');
        }
        return { latitude, longitude, place: DISPLAY_PLACE };
      });
  }

  function fetchWeather(location) {
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude', Number(location.latitude).toFixed(4));
    url.searchParams.set('longitude', Number(location.longitude).toFixed(4));
    url.searchParams.set('current', 'temperature_2m,weather_code,wind_speed_10m,is_day');
    url.searchParams.set('timezone', 'Asia/Shanghai');
    return fetch(url.toString()).then(res => res.json()).then(data => {
      const current = data.current || {};
      return {
        weather: mapWeather(Number(current.weather_code || 0), Number(current.wind_speed_10m || 0), Number(current.is_day ?? 1) === 1),
        temp: Number.isFinite(Number(current.temperature_2m)) ? Math.round(Number(current.temperature_2m)) : null,
        place: location.place || DISPLAY_PLACE
      };
    });
  }

  function render(state) {
    document.querySelectorAll('[data-home-weather-status]').forEach(el => {
      const icon = el.querySelector('img');
      const text = el.querySelector('span');
      if (state.loading || state.error) {
        el.classList.add('is-message');
        if (icon) icon.hidden = true;
        text.textContent = state.error ? '\u5929\u6c14\u52a0\u8f7d\u5931\u8d25' : '\u5929\u6c14\u52a0\u8f7d\u4e2d';
        return;
      }
      el.classList.remove('is-message');
      if (icon) icon.hidden = false;
      drawIcon(icon, state.weather);
      const temp = state.temp === null ? '' : ' ' + state.temp + '\u00b0C';
      text.textContent = (state.place || DISPLAY_PLACE) + ' \u00b7 ' + (WEATHER_LABELS[state.weather] || '\u5929\u6c14') + temp;
    });
  }

  function loadWeather(showLoading) {
    const currentRequest = ++requestId;
    if (showLoading) render(loadingState());
    return resolveLocation()
      .then(location => fetchWeather(location))
      .then(state => {
        if (currentRequest === requestId) render(state);
      })
      .catch(() => {
        if (currentRequest === requestId) render(errorState());
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
