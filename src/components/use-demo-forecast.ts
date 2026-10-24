"use client";

import { useEffect, useRef, useState } from "react";
import { weatherLocationsMatch } from "@/domain/weather-location";
import type { DemoProfile } from "@/domain/demo";
import { isDemoWeather, type DemoWeather } from "@/domain/demo-weather";

/** A snapshot changes only on city/mode change or explicit refresh, never under a running plan. */
export function useDemoForecast(profile: DemoProfile, enabled: boolean, onForecast: (weather: DemoWeather) => void) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{ region: string; loading: boolean; notice: string }>({ region: "", loading: false, notice: "" });
  const latest = useRef({ profile, onForecast });
  useEffect(() => { latest.current = { profile, onForecast }; }, [profile, onForecast]);
  const region = profile.regionId, mode = profile.weatherMode, location = profile.weatherLocation;
  const locationKey = location ? `${region}:${JSON.stringify(location)}` : "";
  useEffect(() => {
    if (!enabled || mode !== "live" || !locationKey) return;
    const selected = latest.current.profile.weatherLocation!;
    const matches = (weather: DemoWeather | undefined) => weatherLocationsMatch(weather?.location, selected);
    if (revision === 0 && latest.current.profile.forecast?.regionId === region && latest.current.profile.forecast.source === "live" && matches(latest.current.profile.forecast)) return;
    const controller = new AbortController();
    let timedOut = false;
    let disposed = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    queueMicrotask(() => { if (!controller.signal.aborted) setState({ region: locationKey, loading: true, notice: "Fetching your selected location’s current conditions and hourly forecast…" }); });
    void (async () => {
      try {
        const weather: unknown = await Promise.race([
          (async () => {
            const response = await fetch(`/api/weather?region=${encodeURIComponent(region)}&locationId=${selected.id}`, { signal: controller.signal, cache: "no-store" });
            if (!response.ok) throw new Error("Weather unavailable");
            return response.json();
          })(),
          new Promise<never>((_, reject) => { timeout = setTimeout(() => {
            timedOut = true; controller.abort(); reject(new Error("Weather request timed out"));
          }, 12_000); }),
        ]);
        if (!isDemoWeather(weather, region) || weather.source !== "live" || !matches(weather)) throw new Error("Weather unavailable");
        if (disposed || controller.signal.aborted) return;
        latest.current.onForecast(weather);
        setState({ region: locationKey, loading: false, notice: "Forecast loaded. Hourly weather now drives the building’s heating/cooling estimates." });
      } catch {
        if (disposed || (controller.signal.aborted && !timedOut)) return;
        const retained = latest.current.profile.forecast?.source === "live" && matches(latest.current.profile.forecast);
        setState({ region: locationKey, loading: false, notice: retained ? "Forecast refresh unavailable. Keeping your saved forecast; check its date below and retry." : "City forecast unavailable. Retry to load actual weather data." });
      } finally { clearTimeout(timeout); }
    })();
    return () => { disposed = true; controller.abort(); clearTimeout(timeout); };
  }, [region, mode, enabled, revision, locationKey]);
  return { loading: enabled && mode === "live" && !!locationKey && state.region === locationKey && state.loading, notice: enabled && mode === "live" && !!locationKey && state.region === locationKey ? state.notice : "", refresh: () => setRevision(value => value + 1) };
}
