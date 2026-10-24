"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { DemoHomeDashboard } from "./demo-home-dashboard";
import { getDemoAcStats } from "@/domain/demo-activity";
import { useEffect, useMemo, useRef, useState } from "react";
import { DEMO_REGIONS, getDemoRegion, type RegionId, type ResidenceType } from "@/data/demo-regions";
import { buildDemoScenario, buildDemoWeather, formatDemoHour, parseDemoProfile, type DemoProfile } from "@/domain/demo";
import { type DemoWeather } from "@/domain/demo-weather";
import type { ApplianceId } from "@/domain/appliances";
import type { OptimizationMode } from "@/domain/scheduling";
import { getSimulationStats } from "@/domain/simulation";
import { HouseholdScene3D } from "./household-scene-3d";
import { TutorialNpc, type TutorialTarget } from "./tutorial-npc";
import { CITY_LANDMARKS } from "@/data/city-landmarks";
import { ApplianceCapture } from "./appliance-capture";
import { recruitConfiguredApplimon } from "@/domain/appliance-recruitment";
import { PixelAppliance } from "./pixel-appliance";
import { APPLIMON_CATALOG, getApplimon, type ApplimonDevice, type ApplimonId } from "@/domain/applimon-catalog";
import { ApplimonReveal } from "./applimon-reveal";
import { ApplimonSpecCapture } from "./applimon-spec-capture";
import { ApplimonSprite } from "./applimon-sprite";
import { WeatherLocationPicker } from "./weather-location-picker";
import { weatherLocationLabel, weatherLocationsMatch } from "@/domain/weather-location";
import { useDemoForecast } from "./use-demo-forecast";
import "./demo-onboarding.css";
import "./demo-game.css";

const STORAGE_KEY = "housemates-demo-v1";
const steps = ["Your region", "Your home", "The forecast", "Your team", "Move in"];
const initialProfile: DemoProfile = {version:1,regionId:"california",residenceType:"detached",applianceIds:[],weatherMode:"live",weatherPreferenceExplicit:true};
function actualWeatherProfile(profile: DemoProfile): DemoProfile {
  return {...profile, weatherMode:"live", weatherPreferenceExplicit:true, weatherOffsetC:undefined, weatherCode:undefined,
    forecast:profile.weatherLocation&&profile.forecast?.source==="live"&&weatherLocationsMatch(profile.forecast.location,profile.weatherLocation) ? profile.forecast : undefined};
}
const homes: {id:ResidenceType;icon:string;name:string;description:string}[] = [
  {id:"apartment",icon:"▥",name:"Apartment",description:"A compact home, a little less space to heat."},
  {id:"townhouse",icon:"▤",name:"Townhouse",description:"A shared wall. A world that’s all yours."},
  {id:"detached",icon:"⌂",name:"Detached home",description:"A home and garden with room for your crew."},
];
const team: {id:ApplianceId;name:string;role:string;description:string}[] = [
  {id:"evie",name:"Evie",role:"THE EARLY BIRD",description:"EV · 12 kWh charge · ready by 7am"},
  {id:"bubbles",name:"Bubbles",role:"THE CLEANUP CREW",description:"Dishwasher · 2 hours · 1.2 kWh per cycle"},
  {id:"chill",name:"Chill",role:"THE COMFORT GUARD",description:"AC · weather-based activity · no optimization"},
];
function weatherKind(code:number): "clear"|"cloudy"|"rain"|"snow" {
  if ([71,73,75,77,85,86].includes(code)) return "snow";
  if (code>=51) return "rain";
  return code>0 ? "cloudy" : "clear";
}
function weatherName(code:number) { return {clear:"Clear skies",cloudy:"Cloudy skies",rain:"Rain nearby",snow:"Snow nearby"}[weatherKind(code)]; }
const timeLabel = formatDemoHour;

function WeatherCard({weather}:{weather:DemoWeather}) {
  const temperatures=weather.hourly.map(row=>row.temperatureC);
  const low=Math.min(...temperatures), high=Math.max(...temperatures), spread=Math.max(5,high-low);
  const points=temperatures.map((temperature,index)=>`${12+index/23*336},${94-(temperature-low)/spread*66}`).join(" ");
  return <div className="demo-weather-card">
    <div className="demo-card-top"><span>LOCAL CONDITIONS / {weather.source === "live" ? "LIVE FORECAST" : "SYNTHETIC FALLBACK / DEMO"}</span><span aria-hidden="true">{weatherKind(weather.weatherCode)==="clear"?"☀":weatherKind(weather.weatherCode)==="snow"?"❄":"☁"}</span></div>
    {weather.location&&<p className="demo-weather-place">{weatherLocationLabel(weather.location)}</p>}
    <div className="demo-weather-main"><strong>{Math.round(weather.temperatureC)}<span>°C</span></strong><div><b>{weatherName(weather.weatherCode)}</b><span>{weather.humidityPercent}% humidity</span></div></div>
    <svg viewBox="0 0 360 116" role="img" aria-label={`24 hourly temperature values, low ${low.toFixed(1)} and high ${high.toFixed(1)} degrees Celsius.`}><defs><linearGradient id="demo-temp-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#a589bc" stopOpacity=".35"/><stop offset="100%" stopColor="#a589bc" stopOpacity="0"/></linearGradient></defs><path d={`M12 106 L${points.replaceAll(" "," L")} L348 106 Z`} fill="url(#demo-temp-fill)"/><path d="M12 106H348 M12 60H348 M12 14H348" stroke="#b9acc633"/><polyline points={points} fill="none" stroke="#75538c" strokeWidth="3" strokeLinejoin="round"/></svg>
    <div className="demo-chart-axis"><span>{weather.hourly[0]?.time.slice(11,16)}</span><span>24 HOURLY VALUES</span><span>{weather.hourly[23]?.time.slice(11,16)}</span></div>
    <p className="demo-source">{weather.sourceLabel}</p>
    <p className="demo-source">{weather.source === "live" ? `${weather.currentTime.replace("T"," ")} · ${weather.timezone} · city weather model` : `Fictional day · ${weather.timezone} · not current conditions`}</p>{weather.sourceUrl && <a className="demo-source" href={weather.sourceUrl} target="_blank" rel="noreferrer">Weather source: Open-Meteo ↗</a>}
    {weather.fallbackReason&&<p className="demo-source">{weather.fallbackReason}</p>}
    <details className="demo-data-details"><summary>Read the hourly values</summary><div><table><caption>Outdoor temperature in °C · {weather.source==="live"?"public weather model":"synthetic demonstration"}</caption><thead><tr><th>Local time</th><th>°C</th><th>Humidity</th></tr></thead><tbody>{weather.hourly.map(row=><tr key={row.time}><td>{row.time.replace("T"," ")}</td><td>{row.temperatureC.toFixed(1)}</td><td>{row.humidityPercent}%</td></tr>)}</tbody></table></div></details>
  </div>;
}

export function DemoOnboarding({startAtHome=false}:{startAtHome?:boolean}) {
  const router=useRouter();
  const [completed,setCompleted]=useState(false);
  const [loadingHome,setLoadingHome]=useState(startAtHome);
  const [step,setStep]=useState(0);
  const [profile,setProfile]=useState<DemoProfile>(initialProfile);
  const [replayKey,setReplayKey]=useState(0);
  const [capture,setCapture]=useState(false);
  const [recruited,setRecruited]=useState<ApplimonId|null>(null);
  const [scanPhoto,setScanPhoto]=useState<{file:File;url:string}|null>(null);
  useEffect(()=>{const url=scanPhoto?.url;return()=>{if(url)URL.revokeObjectURL(url);};},[scanPhoto]);
  function rememberPhoto(file:File|null){setScanPhoto(file?{file,url:URL.createObjectURL(file)}:null);}
  function closeRecruitment(){setCapture(false);setConfiguring(null);setRecruited(null);rememberPhoto(null);}
  const [configuring,setConfiguring]=useState<ApplimonId|null>(null);
  const [saved,setSaved]=useState<DemoProfile|null>(null);
  const [saveNotice,setSaveNotice]=useState("");
  const [mode,setMode]=useState<OptimizationMode>("cost");
  const [hour,setHour]=useState(18);
  const [selected,setSelected]=useState<ApplianceId>("evie");
  const heading=useRef<HTMLHeadingElement>(null);
  const choiceMenu=useRef<HTMLDivElement>(null);
  const recruitmentDialog=useRef<HTMLDialogElement>(null);
  const worldDetailsDialog=useRef<HTMLDialogElement>(null);
  const [showDetails,setShowDetails]=useState(false);
  const region=getDemoRegion(profile.regionId);
  const additional = (profile.applimons ?? []).filter(device=>!getApplimon(device.id).legacyId);
  const teammateCount = profile.applianceIds.length + additional.length;
  const forecast = useDemoForecast(profile, step >= 2 || completed, weather=>{setProfile(value=>({...value,forecast:weather}));if(completed)try{localStorage.setItem(STORAGE_KEY,JSON.stringify({...profile,forecast:weather,planningMode:mode}));}catch{setSaveNotice("Forecast updated for this session; browser storage could not save it.");}});
  const effectiveWeather=useMemo(()=>buildDemoWeather(profile),[profile]);
  const hasActualWeather=!!profile.weatherLocation&&effectiveWeather.source==="live"&&weatherLocationsMatch(effectiveWeather.location,profile.weatherLocation);
  const scenario=useMemo(()=>buildDemoScenario(profile,effectiveWeather,mode),[profile,effectiveWeather,mode]);
  const stats=useMemo(()=>getSimulationStats(scenario.plan?.schedules ?? [],hour),[scenario.plan,hour]);
  const acStats=getDemoAcStats(scenario.acActivity,hour);
  const activeIds:ApplianceId[]=Object.values(stats).filter(stat=>stat.status==="active").map(stat=>stat.applianceId);
  if(acStats.currentPowerKw>0)activeIds.push("chill");

  useEffect(()=>{let cancelled=false; queueMicrotask(()=>{
    if(cancelled)return;
    try {
      const restored=parseDemoProfile(localStorage.getItem(STORAGE_KEY)); setSaved(restored);
      if(startAtHome&&restored&&(restored.applianceIds.length||(restored.applimons?.length??0))){setProfile(actualWeatherProfile(restored));setStep(restored.weatherLocation?4:2);setMode(restored.planningMode??"cost");setCompleted(!!restored.weatherLocation);setSaveNotice(restored.weatherLocation?"Your saved world is ready.":"Choose your city or county to finish updating your saved home’s weather.");}
      else if(startAtHome)setSaveNotice("Build your world first, then enter your home.");
    } catch {setSaveNotice("Browser storage is unavailable. You can still complete the demo in this session.");}
    setLoadingHome(false);
  });return()=>{cancelled=true;};},[startAtHome]);

  function go(next:number) { setStep(next);closeRecruitment();setShowDetails(false); requestAnimationFrame(()=>{choiceMenu.current?.scrollTo({top:0,behavior:"instant"});heading.current?.focus({preventScroll:true});}); }
  useEffect(()=>{
    const dialog=recruitmentDialog.current;
    if(!dialog)return;
    if(capture||configuring||recruited){
      if(!dialog.open)dialog.showModal();
      else requestAnimationFrame(()=>dialog.querySelector<HTMLElement>("input, select, textarea, h2, h3")?.focus());
    }
    else if(dialog.open)dialog.close();
  },[capture,configuring,recruited]);
  useEffect(()=>{if(showDetails&&!worldDetailsDialog.current?.open)worldDetailsDialog.current?.showModal();},[showDetails]);
  function closeWorldDetails(){worldDetailsDialog.current?.close();setShowDetails(false);}
  function showTutorialTarget(target:TutorialTarget) {
    const controlGroup=document.getElementById(completed?"demo-dashboard-clock":`demo-${target}-controls`);
    if (!controlGroup) return;
    const control=controlGroup.querySelector<HTMLElement>('button:not(:disabled), input, select');
    control?.focus({preventScroll:true});
    control?.scrollIntoView({block:"nearest",behavior:"instant"});
  }
  function editProfile(update:(value:DemoProfile)=>DemoProfile) {setSaveNotice("");setProfile(update);}
  function chooseRegion(id:RegionId) {editProfile(value=>({...value,regionId:id,weatherLocation:undefined,weatherOffsetC:0,weatherCode:undefined,forecast:undefined}));setReplayKey(value=>value+1);}
  function recruit(id:ApplimonId) {
    setCapture(false);setConfiguring(id);
    setSaveNotice("Review the electrical specifications and usage window before adding this teammate.");
  }
  function addAppliance() {
    try {
      const current=parseDemoProfile(JSON.stringify({...profile,planningMode:mode}));
      if(current) { localStorage.setItem(STORAGE_KEY,JSON.stringify(current)); router.push("/demo/scan"); return; }
    } catch {}
    setCompleted(false);go(3);setCapture(true);setSaveNotice("Add a teammate to this session. Move in again to save when storage is available.");
  }
  function confirmDevice(device:ApplimonDevice,photo?:File) { if(!scanPhoto&&photo)rememberPhoto(photo);setRecruited(device.id); setProfile(value=>recruitConfiguredApplimon(value,device).profile);setConfiguring(null);setSaveNotice(`${getApplimon(device.id).name} joined with reviewed specifications. Move in to save.`); }
  function toggleAppliance(id:ApplianceId) {editProfile(value=>({...value,applimons:value.applianceIds.includes(id)?value.applimons?.filter(device=>device.id!==id):value.applimons,applianceIds:value.applianceIds.includes(id)?value.applianceIds.filter(item=>item!==id):[...value.applianceIds,id]}));setSelected(id);}
  function finish() {try {localStorage.setItem(STORAGE_KEY,JSON.stringify(profile));setSaved(profile);setSaveNotice("Setup saved on this browser.");}catch{setSaveNotice("Your home is ready for this session. Browser storage could not save it.");}go(4);}
  function enterHome() {
    if(!hasActualWeather){go(2);return;}
    if(!teammateCount){go(3);return;}
    try {
      localStorage.setItem(STORAGE_KEY,JSON.stringify({...profile,planningMode:mode}));setSaved({...profile,planningMode:mode});setSaveNotice("Setup saved on this browser.");
      if(startAtHome){setCompleted(true);window.scrollTo({top:0,behavior:"instant"});}else router.push("/demo/home");
    } catch {setSaveNotice("Your home is ready for this session. Browser storage could not save it.");setCompleted(true);window.scrollTo({top:0,behavior:"instant"});}
  }
  function advance() {if(step===2&&!hasActualWeather)return;if(completed){showTutorialTarget("plan");return;} if(step===4)enterHome();else if(step===3){if(teammateCount)finish();}else go(step+1);}
  function restore() {if(!saved)return;setProfile(actualWeatherProfile(saved));setMode(saved.planningMode??"cost");setReplayKey(value=>value+1);setSaveNotice("Restored your saved setup.");go(!saved.weatherLocation||saved.forecast?.source!=="live"?2:saved.applianceIds.length||(saved.applimons?.length??0)?4:3);}

  const titles=["Choose your region","Choose your home","Check the weather","Recruit your party","Ready to move in"];
  const descriptions=["Choose a starting region. Watch its landscape take shape.","Pick the home that feels familiar. I’ll bring the pieces.","Find your city or county for a local forecast.","Recruit your appliances. Each one has a job, and a little personality.","One last step: finish your build and enter your energy dashboard."];


  if(loadingHome)return <main className="demo-shell" aria-busy="true"><p className="demo-fine">Opening your saved home…</p></main>;

  return <div className={`demo-shell demo-game-shell${completed?" is-home":""}`}>
    <header className="demo-header"><Link href="/" className="demo-brand"><span aria-hidden="true">⌂</span>housemates<span className="demo-brand-dot">.</span></Link><span className="demo-edition">HOUSEMATES / PLAYABLE DEMO</span><Link href="/household" className="demo-exit">Existing household ↗</Link></header>
    {completed&&!hasActualWeather?<main className="demo-weather-card" aria-busy={forecast.loading}><h1>Loading your city’s forecast</h1><p role="status">{forecast.notice||"Fetching actual weather before opening your home…"}</p><button type="button" disabled={forecast.loading} onClick={forecast.refresh}>Retry forecast</button><button type="button" onClick={()=>{setCompleted(false);go(0);}}>Edit this world</button></main>:completed?<DemoHomeDashboard scenario={scenario} mode={mode} notice={saveNotice} onAddAppliance={addAppliance} forecastNotice={forecast.notice} forecastLoading={forecast.loading} onRefreshForecast={forecast.refresh} onEdit={()=>{setCompleted(false);go(0);}}/>:<>
    <nav className="demo-progress" aria-label="Demo setup progress">{steps.map((label,index)=><button key={label} type="button" disabled={index>step} aria-current={step===index?"step":undefined} onClick={()=>go(index)}><span>{index<step?"✓":String(index+1).padStart(2,"0")}</span><b>{label}</b></button>)}</nav>
    <main className="demo-layout game-setup-stage" data-chapter={step}>
      <section className="demo-setup" aria-label={steps[step]}><div className="demo-menu-scroll" ref={choiceMenu} tabIndex={0} aria-label={`${steps[step]} choices`}>
        <div className="demo-step-heading"><p className="demo-eyebrow">CHAPTER {String(step+1).padStart(2,"0")} / {steps[step].toUpperCase()}</p><h1 ref={heading} tabIndex={-1}>{titles[step]}</h1><p>{descriptions[step]}</p></div>
        {step===0&&<><div id="demo-region-controls" className="demo-region-grid" aria-label="Choose a region">{DEMO_REGIONS.map(item=><button type="button" key={item.id} className={`demo-region demo-region-${item.theme}`} aria-pressed={profile.regionId===item.id} onClick={()=>chooseRegion(item.id)}><span className="demo-region-art" aria-hidden="true"><i/><i/><i/><b>{item.theme==="urban"?"▥":item.theme==="nordic"?"▲":item.theme==="tropical"?"✳":"⌂"}</b></span><span className="demo-region-copy"><strong>{item.city}</strong><small>{item.country}</small></span><span className="demo-check" aria-hidden="true">{profile.regionId===item.id?"✓":"+"}</span></button>)}</div><p className="demo-fine">Six city presets to explore. Scenery is stylized; energy prices and carbon profiles are synthetic.</p>{saved&&<button type="button" className="demo-resume" onClick={restore}>Continue saved {getDemoRegion(saved.regionId).city} home ↗</button>}</>}
        {step===1&&<div id="demo-home-controls" className="demo-home-options">{homes.map(home=><button type="button" key={home.id} aria-pressed={profile.residenceType===home.id} onClick={()=>editProfile(value=>({...value,residenceType:home.id}))}><span className="demo-home-symbol" aria-hidden="true">{home.icon}</span><span><strong>{home.name}</strong><small>{home.description}</small></span><span className="demo-check" aria-hidden="true">{profile.residenceType===home.id?"✓":"+"}</span></button>)}</div>}
        {step===2&&<><WeatherLocationPicker value={profile.weatherLocation} onChange={location=>{if(weatherLocationsMatch(location,profile.weatherLocation))return;setShowDetails(false);editProfile(value=>({...value,weatherLocation:location,forecast:undefined}));}}/>{profile.weatherLocation&&<><div className="demo-weather-source-controls"><span className="demo-eyebrow">LOCAL FORECAST</span><button type="button" disabled={forecast.loading} onClick={forecast.refresh}>{hasActualWeather?"Refresh forecast":"Retry forecast"}</button></div><p className="demo-fine" role="status">{forecast.notice||(!hasActualWeather?"Loading your selected location’s forecast…":"Saved forecast snapshot. Refresh for the latest conditions.")}</p>{hasActualWeather?<WeatherCard weather={effectiveWeather}/>:<div className="demo-weather-card" aria-busy={forecast.loading}><h2>Waiting for local weather</h2><p>Your selected place’s conditions will appear here when available.</p></div>}<p className="demo-fine">Outdoor forecast, not indoor readings. Its hourly weather drives the illustrative heating/cooling estimate; electricity rates remain synthetic. Refreshing replaces the planning snapshot.</p></>}</>}

        {step===3&&<><button type="button" className="demo-photo-toggle" aria-expanded={capture} onClick={()=>setCapture(value=>!value)}>▧ {capture?"Close photo setup":"Add from a photo or camera"}</button><div id="demo-team-controls" className="demo-team-options">{team.map(member=><button key={member.id} type="button" aria-pressed={profile.applianceIds.includes(member.id)} onClick={()=>toggleAppliance(member.id)}><PixelAppliance id={member.id}/><span><small>{member.role}</small><strong>{member.name}</strong><p>{member.description}</p></span><span className="demo-check" aria-hidden="true">{profile.applianceIds.includes(member.id)?"✓":"+"}</span></button>)}</div><p className="demo-eyebrow">EXPAND YOUR PARTY / REVIEW SPECS BEFORE RECRUITING</p><div className="demo-team-extra-options">{APPLIMON_CATALOG.filter(member=>!member.legacyId).map(member=><button key={member.id} type="button" aria-pressed={additional.some(device=>device.id===member.id)} onClick={()=>setConfiguring(member.id)}><ApplimonSprite id={member.id}/><span><strong>{member.name}</strong><small>{member.category}</small><em>{member.schedulingPolicy==="flexible"?"Time-shifting move":member.schedulingPolicy==="protected"?"Protected teammate":"Fixed routine"}</em></span><b>{additional.some(device=>device.id===member.id)?"✓":"+"}</b></button>)}</div><div className="demo-spec-links">{profile.applianceIds.map(id=><button key={id} type="button" onClick={()=>setConfiguring(id)}>Review {getApplimon(id).name} specs</button>)}</div><p className="demo-fine">Choose at least one teammate. Photos stay on this device. Confirm every match before adding it.</p></>}
        {step===4&&<><div className="demo-completion"><p className="demo-eyebrow">WORLD COMPLETE / YOUR ADVENTURE AWAITS</p><button id="demo-enter-home" disabled={!hasActualWeather} type="button" className="demo-next" onClick={enterHome}>Finish build & enter home <span aria-hidden="true">→</span></button><p>Meet your party, talk through a plan, then approve a simulated run.</p></div><div className="demo-ready-badge"><span aria-hidden="true">✦</span><div><strong>{region.city} / {homes.find(home=>home.id===profile.residenceType)?.name}</strong><p>{teammateCount} teammates · {saveNotice||"Your saved demo setup"}</p></div></div><div className="demo-team-mini">{team.filter(member=>profile.applianceIds.includes(member.id)).map(member=><div key={member.id}><PixelAppliance id={member.id}/><span>{member.name}</span></div>)}{additional.map(device=><div key={device.id}><ApplimonSprite id={device.id}/><span>{getApplimon(device.id).name}</span></div>)}</div><div id="demo-plan-controls" className="demo-quest"><p className="demo-eyebrow">YOUR FIRST ENERGY QUEST</p><label htmlFor="demo-objective">Choose your planning style</label><select id="demo-objective" value={mode} onChange={event=>setMode(event.target.value as OptimizationMode)}><option value="cost">Cost first</option><option value="carbon">Carbon first</option><option value="balanced">Balanced</option></select>{scenario.plan?.status==="feasible"?<><div className="demo-quest-numbers"><div><small>PLAN COST · USD</small><strong>${scenario.plan.proposed!.costUsd.toFixed(2)}</strong></div><div><small>MODELED CO₂e</small><strong>{(scenario.plan.proposed!.carbonGrams/1000).toFixed(2)}<em> kg</em></strong></div></div><p className="demo-savings">{scenario.plan.comparison!.costSavingsUsd<0?"Cost increase":"Cost reduction"}: ${Math.abs(scenario.plan.comparison!.costSavingsUsd).toFixed(2)} versus the fixed original schedule.</p><ul className="demo-schedules">{scenario.plan.schedules.map(schedule=><li key={schedule.applianceId}><b>{team.find(member=>member.id===schedule.applianceId)?.name}</b><span>{timeLabel(schedule.startHour)} → {timeLabel(schedule.endHour)}</span></li>)}</ul></>:<p className="demo-fine">{scenario.plan?.issues.join(" ")||"Chill protects comfort. Add Evie or Bubbles to try flexible energy scheduling."}</p>}<p className="demo-fine">Synthetic regional rates · USD comparison units · simulated appliances. No devices are controlled.</p></div><div className="demo-future"><span aria-hidden="true">↗</span><p><strong>Next chapter: your home in your messages.</strong> In-app chat works now. Optional iMessage pairing requires a configured Mac bridge.</p></div><button type="button" className="demo-resume" onClick={()=>go(0)}>Edit this world ↗</button></>}
        {step<4&&saveNotice&&<p className="demo-fine" role="status">{saveNotice}</p>}
      </div></section>
      <aside className="demo-world-column" aria-label="Your world preview">
        <div className={`demo-world-frame demo-biome-${region.theme}`}><div className="demo-world-caption"><span><b>{region.city.toUpperCase()}</b><small>{region.country} · {homes.find(home=>home.id===profile.residenceType)?.name}</small></span><span>✦ YOUR LITTLE WORLD</span></div><div className="demo-scene"><HouseholdScene3D selected={selected} onSelect={setSelected} hour={step===4?hour:14} activeIds={step===4?activeIds:[]} scrollProgress={.5} regionTheme={region.theme} residenceType={profile.residenceType} visibleAppliances={step>=3?profile.applianceIds:[]} additionalApplimons={step>=3?additional.map(device=>device.id):[]} construction={{level:Math.min(step,3) as 0|1|2|3,replayKey}} onFinishBuild={step===4&&hasActualWeather?enterHome:undefined} finishBuildLabel={step===4?"Finish build & enter home":undefined} weatherKind={step>=2&&hasActualWeather?weatherKind(effectiveWeather.weatherCode):"clear"}/></div><div className="demo-world-footer"><span>{step===0?"Laying down roots…":step===1?"A home takes shape.":step===2?(hasActualWeather?`${profile.weatherLocation?.name} · ${Math.round(effectiveWeather.temperatureC)}°C · ${weatherName(effectiveWeather.weatherCode)}`:"Waiting for actual city weather"):`${teammateCount} / 10 TEAMMATES`}</span><span title={CITY_LANDMARKS[profile.regionId].description}>MINIATURE / {CITY_LANDMARKS[profile.regionId].shortName.toUpperCase()}</span></div></div>

        {step>=2&&hasActualWeather&&<button className="game-world-details-toggle" type="button" aria-expanded={showDetails} onClick={()=>setShowDetails(value=>!value)}>{showDetails?"Close world stats":"World stats +"}</button>}
        {showDetails&&hasActualWeather&&<dialog ref={worldDetailsDialog} className="game-world-details" aria-label="World energy details" onCancel={event=>{event.preventDefault();closeWorldDetails();}}><button type="button" onClick={closeWorldDetails}>Close stats ×</button><div className="demo-impact"><span className="demo-eyebrow">YOUR WORLD’S ENERGY</span><DemoDemand scenario={scenario}/><details><summary>Model assumptions</summary><ul>{[...scenario.assumptions,...scenario.backgroundDemand.assumptions].map((line,index)=><li key={index}>{line}</li>)}</ul></details></div>{step===4&&<div className="demo-live-panel"><label htmlFor="demo-time">PREVIEW CLOCK <strong>{timeLabel(hour)}</strong></label><input id="demo-time" type="range" min="0" max="48" step=".05" value={hour} onChange={event=>setHour(Number(event.target.value))}/><div>{profile.applianceIds.map(id=>{const reading=id==="chill"?acStats:stats[id];return <p key={id}><b>{team.find(member=>member.id===id)?.name}</b><span>{reading.currentPowerKw.toFixed(2)} kW · {reading.completedEnergyKwh.toFixed(2)} kWh</span></p>;})}</div></div>}</dialog>}
      </aside>
    </main></>}
    <div className="demo-dialogue-dock" hidden={completed}><TutorialNpc presentation="dock" onBack={step>0?()=>go(step-1):undefined} advanceLabel={["Build here","Place my home","Meet my team","Move in","Enter home"][step]} prompt={step===2?hasActualWeather?"This forecast comes from your selected city. Outdoor conditions shape our cooling estimate. Ready to meet your appliances?":profile.weatherLocation?"Let’s load your local weather before meeting your appliances. If the service is unavailable, use Retry forecast.":"Where’s your home? Search for your city or county, then pick the right place from the dropdown. I’ll fetch its local forecast.":undefined} step={step} regionId={profile.regionId} residenceType={profile.residenceType} applianceIds={[...profile.applianceIds,...additional.map(device=>device.id)]} onNavigate={showTutorialTarget} onAdvance={advance} canAdvance={(step!==2&&step!==4||hasActualWeather)&&(step!==3||teammateCount>0)} completed={completed}/></div>
    <dialog ref={recruitmentDialog} className="game-recruit-dialog" aria-label={recruited?"Your new Applimon":configuring?"Review appliance specifications":"Recruit from a photo"} onCancel={closeRecruitment}><div className="game-dialog-title"><strong>{recruited?"WELCOME TO THE PARTY":configuring?"REVIEW YOUR TEAMMATE":"PHOTO RECRUITMENT"}</strong><button type="button" onClick={closeRecruitment}>Close ×</button></div>{recruited&&<ApplimonReveal id={recruited} photoUrl={scanPhoto?.url} state="confirmed" label={`${getApplimon(recruited).name} joined your party!`} onContinue={closeRecruitment}/>} {configuring&&<ApplimonSpecCapture key={configuring} initialId={configuring} initialDevice={profile.applimons?.find(device=>device.id===configuring)} onConfirm={confirmDevice} onCancel={closeRecruitment}/>} {capture&&<ApplianceCapture catalogMode reviewSpecifications onPhotoSelected={rememberPhoto} onConfirm={recruit} existingIds={[...profile.applianceIds,...additional.map(device=>device.id)]}/>}</dialog>
    <footer className="demo-footer"><span>SIMULATED ACTIVITY · SYNTHETIC ENERGY RATES</span><Link href="/energy-parliament">Original scheduling lab ↗</Link></footer>
  </div>;
}

function DemoDemand({scenario}:{scenario:ReturnType<typeof buildDemoScenario>}) {
  return <><div className="demo-demand-numbers"><div><strong>{scenario.backgroundDemand.heatingKwh.toFixed(1)} kWh</strong><small>Illustrative heating / 24h</small></div><div><strong>{scenario.backgroundDemand.coolingKwh.toFixed(1)} kWh</strong><small>Illustrative cooling / 24h</small></div></div><p className="demo-fine">Background estimates are separate from flexible-appliance savings. Chill shows the cooling portion when recruited; it is never optimized or controlled.</p></>;
}
