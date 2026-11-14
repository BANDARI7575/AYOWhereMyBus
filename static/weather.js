
"use strict";

/* ==========================================================
   AYO! WHERE'S MY BUS?
   MILWAUKEE WEATHER

   Timestamped observations, last-good fallback and visibility-aware refresh
   ========================================================== */

(() => {

  /* ========================================================
     01. WEATHER SETTINGS
     ======================================================== */

  const MILWAUKEE = {
    latitude: 43.0389,
    longitude: -87.9065
  };

  const WEATHER_REFRESH_MS = 15 * 60 * 1000;

  const WEATHER_URL =
    "https://api.open-meteo.com/v1/forecast" +
    "?latitude=" + MILWAUKEE.latitude +
    "&longitude=" + MILWAUKEE.longitude +
    "&current=temperature_2m,weather_code,wind_speed_10m,is_day" +
    "&temperature_unit=fahrenheit" +
    "&wind_speed_unit=mph" +
    "&timezone=America%2FChicago&timeformat=unixtime";

  const weatherIcon = document.getElementById(
    "weatherIcon"
  );

  const weatherTemp = document.getElementById(
    "weatherTemp"
  );

  const weatherCondition = document.getElementById(
    "weatherCondition"
  );

  const logoWeather = document.getElementById(
    "logoWeather"
  );

  function interpretWeather(code, windSpeed, isDay) {

    // WMO weather condition codes.
    if ([71, 73, 75, 77, 85, 86].includes(code)) {
      return {
        icon: "❄",
        condition: "Snowing",
        effect: "snow"
      };
    }

    if ([95, 96, 97, 99].includes(code)) {
      return {
        icon: "⛈",
        condition: "Thunderstorm",
        effect: "rain"
      };
    }

    if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) {
      return {
        icon: "☂",
        condition: "Raining",
        effect: "rain"
      };
    }

    if ([51, 53, 55, 56, 57].includes(code)) {
      return {
        icon: "☂",
        condition: "Light rain",
        effect: "rain"
      };
    }

    if (windSpeed >= 25 && [0,1,2,3].includes(code)) {
      return {
        icon: "≋",
        condition: "Windy",
        effect: "wind"
      };
    }

    if (code === 0) {
      if(isDay!==0&&isDay!==1)return {icon:'◐',condition:'Clear sky (day/night unavailable)',effect:'none'};
      const hour = Number(
        new Intl.DateTimeFormat("en-US", {
          timeZone: "America/Chicago",
          hour: "numeric",
          hour12: false
        }).format(new Date())
      );

      const night = isDay===0 ? true : isDay===1 ? false : hour < 6 || hour >= 19;

      return {
        icon: night ? "☾" : "☀",
        condition: night ? "Clear night" : "Sunny",
        effect: night ? "night" : "sun"
      };
    }

    if (code===1) return {icon:isDay===0?'☾':isDay===1?'☀':'◐',condition:'Mainly clear',effect:isDay===0?'night':isDay===1?'sun':'none'};
    if (code===2) {
      return {
        icon: isDay===0?"☁":"⛅",
        condition: "Partly cloudy",
        effect: "cloud"
      };
    }

    if (code === 3) {
      return {
        icon: "☁",
        condition: "Cloudy",
        effect: "cloud"
      };
    }

    if ([45, 48].includes(code)) {
      return {
        icon: "≋",
        condition: "Foggy",
        effect: "cloud"
      };
    }

    return {
      icon: "◐",
      condition: "Conditions unavailable",
      effect: "none"
    };
  }

  function updateWeatherDisplay(data) {
    if (
      !data ||
      !data.current ||
      !Number.isFinite(data.current.temperature_2m)
    ) {
      throw new Error("Missing weather information");
    }

    const current = data.current;
    const widgetState=document.getElementById("weatherWidget");if(widgetState)widgetState.dataset.availability="current";

    const temperature = Math.round(
      current.temperature_2m
    );

    const code = current.weather_code;

    const windSpeed = Number(
      current.wind_speed_10m || 0
    );

    const weather = interpretWeather(
      code,
      windSpeed, current.is_day
    );

    if (weatherIcon) {
      const symbol=({sun:'sun',night:'moon',rain:'rain',snow:'snow',cloud:'cloud',wind:'wind',none:'cloud'})[weather.effect]||'cloud';
      const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('class','icon');svg.setAttribute('aria-hidden','true');const use=document.createElementNS('http://www.w3.org/2000/svg','use');use.setAttribute('href','/static/icons.svg#'+symbol);svg.append(use);weatherIcon.replaceChildren(svg);
    }

    if (weatherTemp) {
      weatherTemp.textContent = `${temperature}°F`;
    }

    if (weatherCondition) {
      weatherCondition.textContent = window.AyoI18n?.translate(weather.condition,document.documentElement.lang)||weather.condition;
    }

    if (logoWeather) {
      logoWeather.dataset.weather = weather.effect;logoWeather.textContent=weather.icon;
    }

    const widget = document.getElementById(
      "weatherWidget"
    );

    if (widget) {
      widget.setAttribute(
        "aria-label",
        `Milwaukee weather: ${temperature} degrees Fahrenheit, ${weather.condition}`
      );

      widget.dataset.observedAt=String(current.time);
      const updated=new Date(current.time*1000).toLocaleTimeString(document.documentElement.lang==='es'?'es-US':'en-US',{timeZone:'America/Chicago',hour:'numeric',minute:'2-digit'});
      widget.title = `Milwaukee · ${temperature}°F · ${window.AyoI18n?.translate(weather.condition,document.documentElement.lang)||weather.condition} · ${updated}`;
      const spanish=document.documentElement.lang==='es';widget.setAttribute('aria-label',`${spanish?'Clima de Milwaukee':'Milwaukee weather'}: ${temperature}°F, ${window.AyoI18n?.translate(weather.condition,document.documentElement.lang)||weather.condition}. ${spanish?'Actualizado':'Updated'} ${updated}`);
    }
  }

  let lastWeather = null;
  function weatherUnavailable() {
    const widget=document.getElementById('weatherWidget');
    const observed=Number(lastWeather?.current?.time),age=Date.now()/1000-observed;
    const usable=lastWeather&&Number.isFinite(observed)&&age>=-900&&age<=7200;
    const message=document.documentElement.lang==='es'?'Clima no disponible; última observación':'Weather unavailable; last observation';
    if(widget){widget.title=message;widget.setAttribute('aria-label',message);widget.dataset.availability='unavailable';if(!usable)delete widget.dataset.observedAt;}
    if(usable){weatherTemp.textContent=Math.round(lastWeather.current.temperature_2m)+(document.documentElement.lang==='es'?'°F (anterior)':'°F (earlier)');weatherCondition.textContent=message;return;}
    if(weatherTemp)weatherTemp.textContent=document.documentElement.lang==='es'?'Clima no disponible':'Weather unavailable';
    if(weatherCondition)weatherCondition.textContent=document.documentElement.lang==='es'?'Sin datos actuales':'No current data';
    if(weatherIcon)weatherIcon.textContent='';
  }

  async function refreshWeather() {
    const controller = new AbortController();

    const timeout = setTimeout(
      () => controller.abort(),
      10000
    );

    try {
      const response = await fetch(WEATHER_URL, {
        cache: "no-store",
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(
          `Weather service returned ${response.status}`
        );
      }

      const data = await response.json();

      // Parse epoch time, not a timezone-less local string. Reject stale/future weather.
      const observed=Number(data.current?.time);
      if (!Number.isFinite(observed) || Date.now()/1000-observed>7200 || observed-Date.now()/1000>900) throw new Error('Weather timestamp is stale or invalid');
      updateWeatherDisplay(data);
      lastWeather = data;

    } catch (error) {
      console.warn(
        "Weather information unavailable:",
        error
      );

      weatherUnavailable();

    } finally {
      clearTimeout(timeout);
    }
  }


  /* ========================================================
     03. WEATHER INITIALIZATION
     ======================================================== */

  function startEnhancements() {
    document.addEventListener('visibilitychange',()=>document.documentElement.classList.toggle('weather-paused',document.hidden));


    // Obtain current weather after page initialization.
    refreshWeather();
    // A navigation-aborted language fetch must not create an unhandled weather promise.
    window.AyoI18n?.ready.then(()=>{if(lastWeather)updateWeatherDisplay(lastWeather);}).catch(()=>{});

    // Refresh weather periodically while the page is open.
    setInterval(
      () => {
        if (!document.hidden && navigator.onLine) {
          refreshWeather();
        }
      },
      WEATHER_REFRESH_MS
    );

    window.addEventListener("offline",weatherUnavailable);
    window.addEventListener(
      "online",
      refreshWeather
    );
  }

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      startEnhancements,
      { once: true }
    );
  } else {
    startEnhancements();
  }

})();
