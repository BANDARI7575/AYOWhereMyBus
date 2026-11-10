
"use strict";

/* ==========================================================
   AYO! WHERE'S MY BUS?
   CINEMATIC WEBSITE ENHANCEMENTS

   01 - Smart navigation
   02 - Milwaukee live weather
   03 - Weather-reactive logo
   04 - Cinematic creator reveal
   ========================================================== */

(() => {

  /* ========================================================
     01. SMART NAVIGATION
     ======================================================== */

  const navbar = document.getElementById("navbar");
  const menuButton = document.getElementById(
    "mobileMenuButton"
  );
  const navLinks = document.getElementById("navLinks");

  function updateNavigation() {
    if (!navbar) return;

    navbar.classList.toggle(
      "scrolled",
      window.scrollY > 45
    );
  }

  function closeMobileMenu(restoreFocus = false) {
    if (!navLinks || !menuButton) return;

    navLinks.classList.remove("open");

    menuButton.setAttribute(
      "aria-expanded",
      "false"
    );

    menuButton.textContent = "☰";
    if (restoreFocus) menuButton.focus();
  }

  function setupNavigation() {
    updateNavigation();

    window.addEventListener(
      "scroll",
      updateNavigation,
      { passive: true }
    );

    if (!menuButton || !navLinks) return;

    menuButton.addEventListener("click", () => {
      const isOpen = navLinks.classList.toggle("open");

      menuButton.setAttribute(
        "aria-expanded",
        String(isOpen)
      );

      menuButton.textContent = isOpen ? "✕" : "☰";
      if (isOpen) navLinks.querySelector("a")?.focus();
    });

    navLinks.querySelectorAll("a").forEach(link => {
      link.addEventListener(
        "click",
        () => closeMobileMenu()
      );
    });

    document.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        if (navLinks.classList.contains("open")) closeMobileMenu(true);
      }
    });
  }


  /* ========================================================
     02. MILWAUKEE LIVE WEATHER
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
      weatherIcon.textContent = weather.icon;
    }

    if (weatherTemp) {
      weatherTemp.textContent = `${temperature}°F`;
    }

    if (weatherCondition) {
      weatherCondition.textContent = weather.condition;
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
      widget.title = `Milwaukee · ${temperature}°F · ${weather.condition} · ${updated}`;
      const spanish=document.documentElement.lang==='es';widget.setAttribute('aria-label',`${spanish?'Clima de Milwaukee':'Milwaukee weather'}: ${temperature}°F, ${window.AyoI18n?.translate(weather.condition)||weather.condition}. ${spanish?'Actualizado':'Updated'} ${updated}`);
      let stamp=document.getElementById('weatherObserved');if(!stamp){stamp=document.createElement('small');stamp.id='weatherObserved';widget.append(stamp);}stamp.textContent=updated;stamp.setAttribute('aria-label',(document.documentElement.lang==='es'?'Actualizado: ':'Updated: ')+updated);
    }
  }

  function weatherUnavailable() {
    const widget=document.getElementById('weatherWidget');if(widget){widget.title='Weather unavailable';widget.setAttribute('aria-label','Milwaukee weather unavailable');delete widget.dataset.observedAt;}document.getElementById('weatherObserved')?.remove();
    if (weatherIcon) {
      weatherIcon.textContent = "◐";
    }

    if (weatherTemp) {
      weatherTemp.textContent = "--°F";
    }

    if (weatherCondition) {
      weatherCondition.textContent =
        "Weather unavailable";
    }

    if (logoWeather) {
      logoWeather.dataset.weather = "none";logoWeather.textContent="◐";
    }
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
     03. CINEMATIC CREATOR REVEAL
     ======================================================== */

  function setupCreatorReveal() {
    const creator = document.getElementById(
      "creator"
    );

    if (!creator) return;

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    if (
      reducedMotion ||
      !("IntersectionObserver" in window)
    ) {
      return;
    }

    creator.classList.add("reveal-ready");

    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;

          creator.classList.add("revealed");

          observer.unobserve(creator);
        }
      },
      {
        threshold: 0.12
      }
    );

    observer.observe(creator);
  }


  /* ========================================================
     04. START ENHANCEMENTS
     ======================================================== */

  function startEnhancements() {
    document.addEventListener('visibilitychange',()=>document.documentElement.classList.toggle('weather-paused',document.hidden));
    setupNavigation();

    setupCreatorReveal();

    // Obtain current weather after page initialization.
    refreshWeather();

    // Refresh weather periodically while the page is open.
    setInterval(
      () => {
        if (!document.hidden && navigator.onLine) {
          refreshWeather();
        }
      },
      WEATHER_REFRESH_MS
    );

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
