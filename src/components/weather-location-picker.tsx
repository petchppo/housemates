"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { parseWeatherLocation, weatherLocationLabel, weatherLocationsMatch, type WeatherLocation } from "@/domain/weather-location";

export function WeatherLocationPicker({value,onChange}:{value?:WeatherLocation;onChange:(location:WeatherLocation)=>void}) {
  const [query,setQuery]=useState("");
  const [results,setResults]=useState<WeatherLocation[]>([]);
  const [loading,setLoading]=useState(false);
  const [notice,setNotice]=useState("");
  const request=useRef<AbortController|null>(null);
  const timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  useEffect(()=>()=>{request.current?.abort();request.current=null;clearTimeout(timer.current);},[]);

  function cancelSearch() { request.current?.abort();request.current=null;clearTimeout(timer.current); }
  async function search(event:FormEvent) {
    event.preventDefault();
    const name=query.trim();
    if(name.length<2||name.length>80)return;
    cancelSearch();
    const controller=new AbortController();request.current=controller;
    setLoading(true);setResults([]);setNotice("Finding cities and counties…");
    let timedOut=false;
    try {
      const payload:unknown=await Promise.race([
        (async()=>{const response=await fetch(`/api/weather/locations?q=${encodeURIComponent(name)}`,{signal:controller.signal,cache:"no-store"});if(!response.ok)throw new Error("Unavailable");return response.json();})(),
        new Promise<never>((_,reject)=>{timer.current=setTimeout(()=>{timedOut=true;controller.abort();reject(new Error("Timeout"));},12_000);}),
      ]);
      if(request.current!==controller||controller.signal.aborted)return;
      if(!payload||typeof payload!=="object"||!("locations" in payload)||!Array.isArray(payload.locations))throw new Error("Invalid places");
      const seen=new Set<number>();
      const locations:WeatherLocation[]=[];
      for(const item of payload.locations.slice(0,20)){
        const location=parseWeatherLocation(item);
        if(location&&!seen.has(location.id)){locations.push(location);seen.add(location.id);}
      }
      setResults(locations);
      setNotice(locations.length?"Choose your city or county below. Check the state and country.":"No matching places found. Try a nearby city or a different spelling.");
    }catch{
      if(request.current!==controller||(controller.signal.aborted&&!timedOut))return;
      setNotice("Place search unavailable. Try Find places again.");
    }finally{
      if(request.current===controller){clearTimeout(timer.current);if(!controller.signal.aborted||timedOut)setLoading(false);}
    }
  }
  const corrected=results.find(location=>location.id===value?.id&&!weatherLocationsMatch(location,value));
  const options=value&&!results.some(location=>location.id===value.id)?[value,...results]:results;
  return <div className="demo-location-picker" id="demo-weather-controls">
    <form onSubmit={search}>
      <label htmlFor="weather-place-search">City or county</label>
      <div className="demo-location-search"><input id="weather-place-search" type="search" autoComplete="off" placeholder="e.g. Oakland or Alameda County" minLength={2} maxLength={80} value={query} onChange={event=>{cancelSearch();setQuery(event.target.value);setResults([]);setLoading(false);setNotice("");}}/><button type="submit" disabled={loading||query.trim().length<2}>Find places</button></div>
    </form>
    <label htmlFor="weather-place-select">Your forecast location</label>
    <select id="weather-place-select" value={value?String(value.id):""} disabled={!options.length} aria-describedby="weather-place-status" onChange={event=>{const location=options.find(item=>String(item.id)===event.target.value);if(location){setNotice("");onChange(location);}}}>
      <option value="" disabled>Choose a city or county…</option>
      {options.map(location=><option key={location.id} value={String(location.id)}>{weatherLocationLabel(location)}</option>)}
    </select>
    {corrected&&<button type="button" className="demo-location-update" onClick={()=>{setNotice("");onChange(corrected);}}>Update selected place details</button>}
    <p id="weather-place-status" className="demo-location-status" role="status">{notice||(value?`Selected: ${weatherLocationLabel(value)}`:"Search, then choose a place. We won’t use your device location.")}</p>
    <p className="demo-location-hint">Place-center forecast, not an exact-address reading. If your county isn’t listed, try a nearby city. Search uses Open-Meteo.</p>
  </div>;
}
