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
    const cacheSeconds = Number(env.CACHE_SECONDS || 600);

    const cache = caches.default;
    const cacheKey = new Request(
      `${url.origin}/weather-cache?location=${encodeURIComponent(locationName)}&adm=${encodeURIComponent(adm)}`
    );

    const cached = await cache.match(cacheKey);
    if (cached) return cached;

    try {
      const token = await createQWeatherJwt(env);
      const apiHost = normalizeHost(env.QWEATHER_API_HOST);

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
        return json(
          {
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
          502
        );
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
        return json(
          {
            ok: false,
            message: "weather request failed",
            qweatherStatus: weatherRes.status,
            qweatherCode: weatherData.code,
            location,
            raw: weatherData,
          },
          502
        );
      }

      const now = weatherData.now;

      const response = json(
        {
          ok: true,
          source: "qweather",
          attribution: "Powered by QWeather",
          location: {
            id: location.id,
            name: location.name,
            adm1: location.adm1,
            adm2: location.adm2,
            country: location.country,
            lat: location.lat,
            lon: location.lon,
          },
          weather: {
            text: now.text,
            icon: now.icon,
            iconUrl: `https://icons.qweather.com/assets/icons/${now.icon}.svg`,
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
          },
          updateTime: weatherData.updateTime,
          fxLink: weatherData.fxLink,
        },
        200,
        {
          "Cache-Control": `public, max-age=${cacheSeconds}`,
        }
      );

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
