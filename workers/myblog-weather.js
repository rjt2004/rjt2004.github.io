/**
 * 和风天气代理 Worker
 *
 * 查询方式：
 *   1. 传入 lat / lon 坐标时，优先使用「实时天气 v1」按坐标查询（1 公里网格，全球任意点），
 *      失败则回退到 v7 坐标查询，再回退到按城市名查询。
 *   2. 未传坐标时，按 location + adm 做城市查询（区级）。
 *
 * 环境变量（Settings → Variables）：
 *   QWEATHER_PROJECT_ID / QWEATHER_KEY_ID / QWEATHER_PRIVATE_KEY  必填，JWT 身份认证
 *   QWEATHER_API_HOST                                             必填，你的 API Host
 *   CACHE_SECONDS                                                 可选，默认 600
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    if (url.pathname === "/debug") {
      return json({
        ok: true,
        env: {
          hasProjectId: Boolean(env.QWEATHER_PROJECT_ID),
          projectIdLength: env.QWEATHER_PROJECT_ID?.length || 0,
          hasKeyId: Boolean(env.QWEATHER_KEY_ID),
          keyIdLength: env.QWEATHER_KEY_ID?.length || 0,
          hasPrivateKey: Boolean(env.QWEATHER_PRIVATE_KEY),
          privateKeyStartsWith:
            env.QWEATHER_PRIVATE_KEY?.startsWith("-----BEGIN PRIVATE KEY-----") ||
            false,
          privateKeyEndsWith:
            env.QWEATHER_PRIVATE_KEY?.trim().endsWith("-----END PRIVATE KEY-----") ||
            false,
          apiHost: normalizeHost(env.QWEATHER_API_HOST),
          cacheSeconds: env.CACHE_SECONDS || "600",
        },
      });
    }

    if (url.pathname !== "/weather") {
      return json({ ok: true, message: "myblog weather worker" });
    }

    const locationName = url.searchParams.get("location") || "Fengxian";
    const adm = url.searchParams.get("adm") || "";
    const coords = parseCoords(url.searchParams.get("lat"), url.searchParams.get("lon"));
    const cacheSeconds = Number(env.CACHE_SECONDS || 600);

    const cache = caches.default;
    const cacheKey = new Request(
      `${url.origin}/weather-cache?location=${encodeURIComponent(locationName)}` +
        `&adm=${encodeURIComponent(adm)}` +
        `&lat=${coords ? coords.lat : ""}&lon=${coords ? coords.lon : ""}`
    );

    const cached = await cache.match(cacheKey);
    if (cached) return cached;

    try {
      const token = await createQWeatherJwt(env);
      const apiHost = normalizeHost(env.QWEATHER_API_HOST);

      const result = coords
        ? await resolveByCoords(apiHost, token, coords)
        : await resolveByLocation(apiHost, token, locationName, adm);

      if (!result.ok) {
        return json(result.body, result.status || 502);
      }

      const response = json(result.body, 200, {
        "Cache-Control": `public, max-age=${cacheSeconds}`,
      });

      ctx.waitUntil(cache.put(cacheKey, response.clone()));
      return response;
    } catch (error) {
      return json(
        {
          ok: false,
          message: "weather loading failed",
          errorName: error?.name || "Error",
          errorMessage: error?.message || String(error),
        },
        500
      );
    }
  },
};

async function resolveByLocation(apiHost, token, locationName, adm) {
  const lookupParams = new URLSearchParams({
    location: locationName,
    range: "cn",
    number: "1",
    lang: "zh",
  });

  if (adm) {
    lookupParams.set("adm", adm);
  }

  const lookupUrl = `${apiHost}/geo/v2/city/lookup?${lookupParams.toString()}`;
  const lookupRes = await fetch(lookupUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const lookupData = await safeJson(lookupRes);

  if (lookupData.code !== "200" || !lookupData.location?.[0]?.id) {
    return {
      ok: false,
      status: 502,
      body: {
        ok: false,
        message: "location lookup failed",
        qweatherStatus: lookupRes.status,
        qweatherCode: lookupData.code,
        query: {
          location: locationName,
          adm,
        },
        raw: lookupData,
      },
    };
  }

  const location = lookupData.location[0];

  const weatherParams = new URLSearchParams({
    location: location.id,
    lang: "zh",
    unit: "m",
  });

  const weatherUrl = `${apiHost}/v7/weather/now?${weatherParams.toString()}`;
  const weatherRes = await fetch(weatherUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const weatherData = await safeJson(weatherRes);

  if (weatherData.code !== "200") {
    return {
      ok: false,
      status: 502,
      body: {
        ok: false,
        message: "weather request failed",
        qweatherStatus: weatherRes.status,
        qweatherCode: weatherData.code,
        location: mapLocation(location),
        raw: weatherData,
      },
    };
  }

  return {
    ok: true,
    body: buildResponse({
      mode: "v7-city",
      location: mapLocation(location),
      weather: mapV7Weather(weatherData.now),
      updateTime: weatherData.updateTime,
      fxLink: weatherData.fxLink,
    }),
  };
}

async function resolveByCoords(apiHost, token, coords) {
  const location = await lookupNearest(apiHost, token, `${coords.lon},${coords.lat}`);

  const current = await fetchCurrentByCoords(apiHost, token, coords);

  if (!current.ok) {
    return {
      ok: false,
      status: 502,
      body: {
        ok: false,
        message: "coordinate weather request failed",
        qweatherStatus: current.status,
        qweatherCode: current.code,
        query: {
          lat: coords.lat,
          lon: coords.lon,
        },
        raw: current.raw,
      },
    };
  }

  const isV1 = current.kind === "v1";

  return {
    ok: true,
    body: buildResponse({
      mode: isV1 ? "v1-coordinate" : "v7-coordinate",
      location:
        location ||
        {
          id: "",
          name: "",
          adm1: "",
          adm2: "",
          country: "",
          lat: String(coords.lat),
          lon: String(coords.lon),
        },
      weather: isV1 ? mapV1Weather(current.data) : mapV7Weather(current.data.now),
      updateTime: isV1 ? new Date().toISOString() : current.data.updateTime,
      fxLink: isV1 ? null : current.data.fxLink,
      query: {
        lat: coords.lat,
        lon: coords.lon,
      },
    }),
  };
}

async function fetchCurrentByCoords(apiHost, token, coords) {
  // 优先使用实时天气 v1：按经纬度返回 1 公里网格数据
  try {
    const v1Url = `${apiHost}/weather/v1/current/${coords.lat}/${coords.lon}?lang=zh`;
    const v1Res = await fetch(v1Url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const v1Data = await safeJson(v1Res);

    if (v1Data && v1Data.condition && v1Data.temperature) {
      return { ok: true, kind: "v1", data: v1Data };
    }
  } catch {
    // 忽略 v1 异常，回退到 v7
  }

  // 回退：v7 城市实时天气（即将弃用，精度为就近城市）
  const v7Url = `${apiHost}/v7/weather/now?${new URLSearchParams({
    location: `${coords.lon},${coords.lat}`,
    lang: "zh",
    unit: "m",
  }).toString()}`;
  const v7Res = await fetch(v7Url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const v7Data = await safeJson(v7Res);

  if (v7Data.code === "200") {
    return { ok: true, kind: "v7", data: v7Data };
  }

  return {
    ok: false,
    status: v7Res.status,
    code: v7Data.code,
    raw: v7Data,
  };
}

async function lookupNearest(apiHost, token, coordinate) {
  try {
    const params = new URLSearchParams({
      location: coordinate,
      range: "cn",
      number: "1",
      lang: "zh",
    });

    const res = await fetch(`${apiHost}/geo/v2/city/lookup?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const data = await safeJson(res);

    if (data.code === "200" && data.location?.[0]) {
      return data.location[0];
    }
  } catch {
    // 位置元信息为尽力而为，失败不影响天气返回
  }

  return null;
}

function buildResponse({ mode, location, weather, updateTime, fxLink, query }) {
  const body = {
    ok: true,
    source: "qweather",
    mode,
    attribution: "Powered by QWeather",
    location,
    weather,
    updateTime,
    fxLink,
  };

  if (query) {
    body.query = query;
  }

  return body;
}

function mapLocation(location) {
  return {
    id: location.id,
    name: location.name,
    adm1: location.adm1,
    adm2: location.adm2,
    country: location.country,
    lat: location.lat,
    lon: location.lon,
  };
}

function mapV7Weather(now) {
  return {
    text: now.text,
    icon: now.icon,
    iconUrl: iconUrl(now.icon),
    temp: now.temp,
    feelsLike: now.feelsLike,
    windDir: now.windDir,
    windScale: now.windScale,
    windSpeed: now.windSpeed,
    humidity: now.humidity,
    precip: now.precip,
    pressure: now.pressure,
    vis: now.vis,
    cloud: now.cloud,
    dew: now.dew,
    obsTime: now.obsTime,
  };
}

function mapV1Weather(data) {
  const obsTime = new Date().toISOString();
  const icon = data.condition?.code || "999";

  return {
    text: data.condition?.text || "未知",
    icon,
    iconUrl: iconUrl(icon),
    temp: toIntString(data.temperature?.value),
    feelsLike: toIntString(data.feelsLike?.value),
    windDir: compassToChinese(data.wind?.direction?.compass),
    windScale: data.wind?.scale != null ? String(data.wind.scale) : "",
    windSpeed:
      data.wind?.speed?.value != null
        ? String(Math.round(data.wind.speed.value * 3.6))
        : "",
    humidity: data.humidity != null ? String(Math.round(data.humidity * 100)) : "",
    precip:
      data.precipitation?.amount?.value != null
        ? String(data.precipitation.amount.value)
        : "0.0",
    pressure: toIntString(data.pressure?.value),
    vis:
      data.visibility?.value != null
        ? String(Math.round(data.visibility.value / 1000))
        : "",
    cloud: data.cloudCover != null ? String(Math.round(data.cloudCover * 100)) : "",
    dew: toIntString(data.dewPoint?.value),
    obsTime,
  };
}

function iconUrl(code) {
  return `https://icons.qweather.com/assets/icons/${code}.svg`;
}

function toIntString(value) {
  if (value == null || value === "") return "";
  const n = Number(value);
  return Number.isFinite(n) ? String(Math.round(n)) : String(value);
}

function compassToChinese(compass) {
  const map = {
    n: "北风",
    nne: "东北偏北风",
    ne: "东北风",
    ene: "东北偏东风",
    e: "东风",
    ese: "东南偏东风",
    se: "东南风",
    sse: "东南偏南风",
    s: "南风",
    ssw: "西南偏南风",
    sw: "西南风",
    wsw: "西南偏西风",
    w: "西风",
    wnw: "西北偏西风",
    nw: "西北风",
    nnw: "西北偏北风",
    vrb: "无持续风向",
    none: "无持续风向",
  };

  return map[String(compass || "").toLowerCase()] || "";
}

function parseCoords(latParam, lonParam) {
  if (!latParam || !lonParam) return null;

  const lat = Number(latParam);
  const lon = Number(lonParam);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;

  return {
    lat: lat.toFixed(2),
    lon: lon.toFixed(2),
  };
}

async function createQWeatherJwt(env) {
  if (!env.QWEATHER_PROJECT_ID || !env.QWEATHER_KEY_ID || !env.QWEATHER_PRIVATE_KEY) {
    throw new Error("Missing QWeather JWT environment variables");
  }

  const header = {
    alg: "EdDSA",
    kid: env.QWEATHER_KEY_ID,
  };

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: env.QWEATHER_PROJECT_ID,
    iat: now - 30,
    exp: now + 900,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const data = `${encodedHeader}.${encodedPayload}`;

  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(env.QWEATHER_PRIVATE_KEY),
    { name: "Ed25519" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "Ed25519",
    privateKey,
    new TextEncoder().encode(data)
  );

  return `${data}.${base64UrlEncode(signature)}`;
}

function normalizeHost(host) {
  return String(host || "https://devapi.qweather.com").replace(/\/$/, "");
}

function pemToArrayBuffer(pem) {
  const base64 = String(pem)
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes.buffer;
}

function base64UrlEncode(input) {
  const bytes =
    typeof input === "string" ? new TextEncoder().encode(input) : new Uint8Array(input);

  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function safeJson(response) {
  const text = await response.text();

  try {
    return JSON.parse(text);
  } catch {
    return {
      code: "INVALID_JSON",
      text,
    };
  }
}

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders(),
      ...extraHeaders,
    },
  });
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}
