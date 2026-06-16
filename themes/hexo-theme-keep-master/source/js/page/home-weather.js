(function () {
  const DEFAULT_CONFIG = {
    display_place: '\u5929\u6c14',
    query_place: '',
    match_admin1: '',
    latitude: null,
    longitude: null,
    cache_minutes: 30
  };
  const CONFIG = Object.assign({}, DEFAULT_CONFIG, window.TONE_HOME_WEATHER || {});
  const hasConfiguredLatitude = CONFIG.latitude !== null && CONFIG.latitude !== undefined && CONFIG.latitude !== '';
  const hasConfiguredLongitude = CONFIG.longitude !== null && CONFIG.longitude !== undefined && CONFIG.longitude !== '';
  const configuredLatitude = Number(CONFIG.latitude);
  const configuredLongitude = Number(CONFIG.longitude);
  const DISPLAY_PLACE = CONFIG.display_place || CONFIG.place || DEFAULT_CONFIG.display_place;
  const QUERY_PLACE = CONFIG.query_place || CONFIG.place || CONFIG.display_place || '';
  const MATCH_ADMIN1 = CONFIG.match_admin1 || '';
  const CACHE_KEY = 'tone-home-weather-v9-' + encodeURIComponent(DISPLAY_PLACE + '|' + QUERY_PLACE + '|' + MATCH_ADMIN1);
  const cacheMinutes = Number(CONFIG.cache_minutes);
  const CACHE_TTL = (Number.isFinite(cacheMinutes) && cacheMinutes > 0 ? cacheMinutes : DEFAULT_CONFIG.cache_minutes) * 60 * 1000;
  const WEATHER_LABELS = {
    'clear-day': '\u6674',
    'partly-cloudy-day': '\u591a\u4e91',
    cloudy: '\u9634',
    rain: '\u5c0f\u96e8',
    'showers-day': '\u9635\u96e8',
    sleet: '\u96e8\u5939\u96ea',
    'rain-snow': '\u96e8\u96ea',
    snow: '\u96ea',
    'snow-showers-day': '\u9635\u96ea',
    wind: '\u6709\u98ce',
    fog: '\u96fe',
    'thunder-rain': '\u96f7\u96e8',
    hail: '\u51b0\u96f9'
  };

  function mapWeather(code, windSpeed) {
    if ([45, 48].includes(code)) return 'fog';
    if ([95, 96, 99].includes(code)) return 'thunder-rain';
    if (code === 66 || code === 67) return 'sleet';
    if (code >= 71 && code <= 77) return 'snow';
    if (code === 85 || code === 86) return 'snow-showers-day';
    if (code >= 80 && code <= 82) return 'showers-day';
    if (code >= 51 && code <= 65) return 'rain';
    if (code === 1 || code === 2) return windSpeed >= 30 ? 'wind' : 'partly-cloudy-day';
    if (code === 3) return windSpeed >= 30 ? 'wind' : 'cloudy';
    if (windSpeed >= 34) return 'wind';
    return 'clear-day';
  }

  function drawIcon(canvas, type) {
    if (!canvas || !window.Skycons) return;
    if (canvas._toneSkycon) canvas._toneSkycon.pause();
    const skycons = new window.Skycons({ monochrome: false, resizeClear: true });
    const iconName = (type || 'clear-day').toUpperCase().replace(/-/g, '_');
    skycons.add(canvas, window.Skycons[iconName] || window.Skycons.CLEAR_DAY);
    skycons.play();
    canvas._toneSkycon = skycons;
  }

  function loadingState() {
    return { loading: true, place: DISPLAY_PLACE };
  }

  function errorState() {
    return { error: true, place: DISPLAY_PLACE };
  }

  function readCache() {
    try {
      const data = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (data && Date.now() - data.savedAt < CACHE_TTL) return data.state;
    } catch (error) {}
    return null;
  }

  function writeCache(state) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), state }));
    } catch (error) {}
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
    url.searchParams.set('current', 'temperature_2m,weather_code,wind_speed_10m');
    url.searchParams.set('timezone', 'Asia/Shanghai');
    return fetch(url.toString()).then(res => res.json()).then(data => {
      const current = data.current || {};
      return {
        weather: mapWeather(Number(current.weather_code || 0), Number(current.wind_speed_10m || 0)),
        temp: Number.isFinite(Number(current.temperature_2m)) ? Math.round(Number(current.temperature_2m)) : null,
        place: location.place || DISPLAY_PLACE
      };
    });
  }

  function render(state) {
    document.querySelectorAll('[data-home-weather-status]').forEach(el => {
      const canvas = el.querySelector('canvas');
      const text = el.querySelector('span');
      if (state.loading || state.error) {
        if (canvas?._toneSkycon) canvas._toneSkycon.pause();
        if (canvas) canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
        text.textContent = (state.place || DISPLAY_PLACE) + ' \u00b7 ' + (state.error ? '\u5929\u6c14\u6682\u4e0d\u53ef\u7528' : '\u5929\u6c14\u52a0\u8f7d\u4e2d');
        return;
      }
      drawIcon(canvas, state.weather);
      const temp = state.temp === null ? '' : ' ' + state.temp + '\u00b0C';
      text.textContent = (state.place || DISPLAY_PLACE) + ' \u00b7 ' + (WEATHER_LABELS[state.weather] || '\u5929\u6c14') + temp;
    });
  }

  function init() {
    render(loadingState());
    resolveLocation()
      .then(location => fetchWeather(location))
      .then(state => { writeCache(state); render(state); })
      .catch(() => {
        const cached = readCache();
        if (cached) render(cached);
        else render(errorState());
      });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
  document.addEventListener('pjax:complete', init);
})();







