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
import { PixelAppliance } from "./pixel-appliance";
import "./demo-onboarding.css";

const STORAGE_KEY = "housemates-demo-v1";
const steps = ["Your region", "Your home", "The forecast", "Your team", "Move in"];
const initialProfile: DemoProfile = {version:1,regionId:"california",residenceType:"detached",applianceIds:[],weatherMode:"synthetic"};
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
    <div className="demo-card-top"><span>LOCAL CONDITIONS / SYNTHETIC WEATHER</span><span aria-hidden="true">{weatherKind(weather.weatherCode)==="clear"?"☀":weatherKind(weather.weatherCode)==="snow"?"❄":"☁"}</span></div>
    <div className="demo-weather-main"><strong>{Math.round(weather.temperatureC)}<span>°C</span></strong><div><b>{weatherName(weather.weatherCode)}</b><span>{weather.humidityPercent}% humidity</span></div></div>
    <svg viewBox="0 0 360 116" role="img" aria-label={`24 hourly temperature values, low ${low.toFixed(1)} and high ${high.toFixed(1)} degrees Celsius.`}><defs><linearGradient id="demo-temp-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#a589bc" stopOpacity=".35"/><stop offset="100%" stopColor="#a589bc" stopOpacity="0"/></linearGradient></defs><path d={`M12 106 L${points.replaceAll(" "," L")} L348 106 Z`} fill="url(#demo-temp-fill)"/><path d="M12 106H348 M12 60H348 M12 14H348" stroke="#b9acc633"/><polyline points={points} fill="none" stroke="#75538c" strokeWidth="3" strokeLinejoin="round"/></svg>
    <div className="demo-chart-axis"><span>{weather.hourly[0]?.time.slice(11,16)}</span><span>24 HOURLY VALUES</span><span>{weather.hourly[23]?.time.slice(11,16)}</span></div>
    <p className="demo-source">{weather.sourceLabel}</p>
    <p className="demo-source">Fictional day · {weather.timezone} · not today’s conditions</p>
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
  const weatherShift=profile.weatherOffsetC??0;
  const [replayKey,setReplayKey]=useState(0);
  const [capture,setCapture]=useState(false);
  const [saved,setSaved]=useState<DemoProfile|null>(null);
  const [saveNotice,setSaveNotice]=useState("");
  const [mode,setMode]=useState<OptimizationMode>("cost");
  const [hour,setHour]=useState(18);
  const [selected,setSelected]=useState<ApplianceId>("evie");
  const heading=useRef<HTMLHeadingElement>(null);
  const region=getDemoRegion(profile.regionId);
  const effectiveWeather=useMemo(()=>buildDemoWeather(profile),[profile]);
  const scenario=useMemo(()=>buildDemoScenario(profile,effectiveWeather,mode),[profile,effectiveWeather,mode]);
  const stats=useMemo(()=>getSimulationStats(scenario.plan?.schedules ?? [],hour),[scenario.plan,hour]);
  const acStats=getDemoAcStats(scenario.acActivity,hour);
  const activeIds:ApplianceId[]=Object.values(stats).filter(stat=>stat.status==="active").map(stat=>stat.applianceId);
  if(acStats.currentPowerKw>0)activeIds.push("chill");

  useEffect(()=>{let cancelled=false; queueMicrotask(()=>{
    if(cancelled)return;
    try {
      const restored=parseDemoProfile(localStorage.getItem(STORAGE_KEY)); setSaved(restored);
      if(startAtHome&&restored?.applianceIds.length){setProfile({...restored,weatherMode:"synthetic"});setStep(4);setMode(restored.planningMode??"cost");setCompleted(true);setSaveNotice("Your saved world is ready.");}
      else if(startAtHome)setSaveNotice("Build your world first, then enter your home.");
    } catch {setSaveNotice("Browser storage is unavailable. You can still complete the demo in this session.");}
    setLoadingHome(false);
  });return()=>{cancelled=true;};},[startAtHome]);

  function go(next:number) { setStep(next);setCapture(false); requestAnimationFrame(()=>{heading.current?.focus({preventScroll:true}); if(window.innerWidth<900)heading.current?.scrollIntoView({block:"start",behavior:"instant"});}); }
  function showTutorialTarget(target:TutorialTarget) {
    const controlGroup=document.getElementById(completed?"demo-dashboard-clock":`demo-${target}-controls`);
    if (!controlGroup) return;
    const control=controlGroup.querySelector<HTMLElement>('button:not(:disabled), input, select');
    control?.focus({preventScroll:true});
    controlGroup.scrollIntoView({block:"center",behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth"});
  }
  function editProfile(update:(value:DemoProfile)=>DemoProfile) {setSaveNotice("");setProfile(update);}
  function chooseRegion(id:RegionId) {editProfile(value=>({...value,regionId:id,weatherOffsetC:0,weatherCode:undefined}));setReplayKey(value=>value+1);}
  function recruit(id:ApplianceId) {editProfile(value=>({...value,applianceIds:value.applianceIds.includes(id)?value.applianceIds:[...value.applianceIds,id]}));setSelected(id);setCapture(false);}
  function toggleAppliance(id:ApplianceId) {editProfile(value=>({...value,applianceIds:value.applianceIds.includes(id)?value.applianceIds.filter(item=>item!==id):[...value.applianceIds,id]}));setSelected(id);}
  function finish() {try {localStorage.setItem(STORAGE_KEY,JSON.stringify(profile));setSaved(profile);setSaveNotice("Setup saved on this browser.");}catch{setSaveNotice("Your home is ready for this session. Browser storage could not save it.");}go(4);}
  function enterHome() {
    if(!profile.applianceIds.length){go(3);return;}
    try {
      localStorage.setItem(STORAGE_KEY,JSON.stringify({...profile,planningMode:mode}));setSaved({...profile,planningMode:mode});setSaveNotice("Setup saved on this browser.");
      if(startAtHome){setCompleted(true);window.scrollTo({top:0,behavior:"instant"});}else router.push("/demo/home");
    } catch {setSaveNotice("Your home is ready for this session. Browser storage could not save it.");setCompleted(true);window.scrollTo({top:0,behavior:"instant"});}
  }
  function advance() {if(completed){showTutorialTarget("plan");return;} if(step===4)enterHome();else if(step===3){if(profile.applianceIds.length)finish();}else go(step+1);}
  function restore() {if(!saved)return;setProfile({...saved,weatherMode:"synthetic"});setMode(saved.planningMode??"cost");setReplayKey(value=>value+1);setSaveNotice("Restored your saved setup.");go(saved.applianceIds.length?4:3);}

  const titles=["Every little world starts somewhere.","A place to call yours.","Meet your local atmosphere.","Good energy is a team sport.","Your home is ready."];
  const descriptions=["Choose a starting region. Watch its landscape take shape.","Pick the home that feels familiar. I’ll bring the pieces.","A synthetic forecast for your little world.","Recruit your appliances. Each one has a job, and a little personality.","One last step: finish your build and enter your energy dashboard."];


  if(loadingHome)return <main className="demo-shell" aria-busy="true"><p className="demo-fine">Opening your saved home…</p></main>;

  return <div className="demo-shell">
    <header className="demo-header"><Link href="/" className="demo-brand"><span aria-hidden="true">⌂</span>housemates<span className="demo-brand-dot">.</span></Link><span className="demo-edition">A LITTLE WORLD / DEMO 01</span><Link href="/household" className="demo-exit">Existing household ↗</Link></header>
    {completed?<DemoHomeDashboard scenario={scenario} mode={mode} notice={saveNotice} onEdit={()=>{setCompleted(false);go(0);}}/>:<>
    <nav className="demo-progress" aria-label="Demo setup progress">{steps.map((label,index)=><button key={label} type="button" disabled={index>step} aria-current={step===index?"step":undefined} onClick={()=>go(index)}><span>{index<step?"✓":String(index+1).padStart(2,"0")}</span><b>{label}</b></button>)}</nav>
    <main className="demo-layout">
      <section className="demo-setup" aria-label={steps[step]}>
        <div className="demo-step-heading"><p className="demo-eyebrow">CHAPTER {String(step+1).padStart(2,"0")} / {steps[step].toUpperCase()}</p><h1 ref={heading} tabIndex={-1}>{titles[step]}</h1><p>{descriptions[step]}</p></div>
        {step===0&&<><div id="demo-region-controls" className="demo-region-grid" aria-label="Choose a region">{DEMO_REGIONS.map(item=><button type="button" key={item.id} className={`demo-region demo-region-${item.theme}`} aria-pressed={profile.regionId===item.id} onClick={()=>chooseRegion(item.id)}><span className="demo-region-art" aria-hidden="true"><i/><i/><i/><b>{item.theme==="urban"?"▥":item.theme==="nordic"?"▲":item.theme==="tropical"?"✳":"⌂"}</b></span><span className="demo-region-copy"><strong>{item.city}</strong><small>{item.country}</small></span><span className="demo-check" aria-hidden="true">{profile.regionId===item.id?"✓":"+"}</span></button>)}</div><p className="demo-fine">Six city presets to explore. Scenery is stylized; energy prices and carbon profiles are synthetic.</p>{saved&&<button type="button" className="demo-resume" onClick={restore}>Continue saved {getDemoRegion(saved.regionId).city} home ↗</button>}</>}
        {step===1&&<div id="demo-home-controls" className="demo-home-options">{homes.map(home=><button type="button" key={home.id} aria-pressed={profile.residenceType===home.id} onClick={()=>editProfile(value=>({...value,residenceType:home.id}))}><span className="demo-home-symbol" aria-hidden="true">{home.icon}</span><span><strong>{home.name}</strong><small>{home.description}</small></span><span className="demo-check" aria-hidden="true">{profile.residenceType===home.id?"✓":"+"}</span></button>)}</div>}
        {step===2&&<><WeatherCard weather={effectiveWeather}/><div id="demo-weather-controls" className="demo-weather-sandbox"><label htmlFor="demo-weather-shift">TRY A DIFFERENT DAY <strong>{weatherShift>0?"+":""}{weatherShift}°C</strong></label><input id="demo-weather-shift" type="range" min="-10" max="10" step="1" value={weatherShift} onChange={event=>editProfile(value=>({...value,weatherOffsetC:Number(event.target.value)}))}/><div className="demo-weather-actions">{[{label:"Clear",code:0},{label:"Clouds",code:3},{label:"Rain",code:61},{label:"Snow",code:73}].map(item=><button key={item.code} type="button" aria-pressed={weatherKind(effectiveWeather.weatherCode)===weatherKind(item.code)} onClick={()=>editProfile(value=>({...value,weatherCode:item.code}))}>{item.label}</button>)}</div></div><p className="demo-fine">Authored demo weather, not a live forecast. Temperature and sky controls are independent what-if settings. No location or weather service is contacted.</p></>}
        {step===3&&<><div id="demo-team-controls" className="demo-team-options">{team.map(member=><button key={member.id} type="button" aria-pressed={profile.applianceIds.includes(member.id)} onClick={()=>toggleAppliance(member.id)}><PixelAppliance id={member.id}/><span><small>{member.role}</small><strong>{member.name}</strong><p>{member.description}</p></span><span className="demo-check" aria-hidden="true">{profile.applianceIds.includes(member.id)?"✓":"+"}</span></button>)}</div><button type="button" className="demo-photo-toggle" aria-expanded={capture} onClick={()=>setCapture(value=>!value)}>▧ {capture?"Close photo setup":"Add from a photo or camera"}</button>{capture&&<ApplianceCapture onConfirm={recruit}/>}<p className="demo-fine">Choose at least one teammate. Photos stay on this device. Confirm every match before adding it.</p></>}
        {step===4&&<><div className="demo-completion"><p className="demo-eyebrow">NEXT / YOUR HOME DASHBOARD</p><button id="demo-enter-home" type="button" className="demo-next" onClick={enterHome}>Finish build & enter home <span aria-hidden="true">→</span></button><p>See your team’s activity, compare original and optimized routines, and explore the grid’s daily rhythm.</p></div><div className="demo-ready-badge"><span aria-hidden="true">✦</span><div><strong>{region.city} / {homes.find(home=>home.id===profile.residenceType)?.name}</strong><p>{profile.applianceIds.length} teammates · {saveNotice||"Your saved demo setup"}</p></div></div><div className="demo-team-mini">{team.filter(member=>profile.applianceIds.includes(member.id)).map(member=><div key={member.id}><PixelAppliance id={member.id}/><span>{member.name}</span></div>)}</div><div id="demo-plan-controls" className="demo-quest"><p className="demo-eyebrow">YOUR FIRST ENERGY QUEST</p><label htmlFor="demo-objective">Choose your planning style</label><select id="demo-objective" value={mode} onChange={event=>setMode(event.target.value as OptimizationMode)}><option value="cost">Cost first</option><option value="carbon">Carbon first</option><option value="balanced">Balanced</option></select>{scenario.plan?.status==="feasible"?<><div className="demo-quest-numbers"><div><small>PLAN COST · USD</small><strong>${scenario.plan.proposed!.costUsd.toFixed(2)}</strong></div><div><small>MODELED CO₂e</small><strong>{(scenario.plan.proposed!.carbonGrams/1000).toFixed(2)}<em> kg</em></strong></div></div><p className="demo-savings">{scenario.plan.comparison!.costSavingsUsd<0?"Cost increase":"Cost reduction"}: ${Math.abs(scenario.plan.comparison!.costSavingsUsd).toFixed(2)} versus the fixed original schedule.</p><ul className="demo-schedules">{scenario.plan.schedules.map(schedule=><li key={schedule.applianceId}><b>{team.find(member=>member.id===schedule.applianceId)?.name}</b><span>{timeLabel(schedule.startHour)} → {timeLabel(schedule.endHour)}</span></li>)}</ul></>:<p className="demo-fine">{scenario.plan?.issues.join(" ")||"Chill protects comfort. Add Evie or Bubbles to try flexible energy scheduling."}</p>}<p className="demo-fine">Synthetic regional rates · USD comparison units · simulated appliances. No devices are controlled.</p></div><div className="demo-future"><span aria-hidden="true">↗</span><p><strong>Next chapter: your home in your messages.</strong> Messaging-platform integration is planned. There’s nothing to connect yet.</p></div><button type="button" className="demo-resume" onClick={()=>go(0)}>Edit this world ↗</button></>}
        {step<4&&<div className="demo-navigation">{step>0&&<button type="button" className="demo-back" onClick={()=>go(step-1)}>← Back</button>}<button id="demo-next-action" type="button" className="demo-next" disabled={step===3&&!profile.applianceIds.length} onClick={()=>step===3?finish():go(step+1)}>{["Build here","Place my home","Meet my team","Move in"][step]} <span aria-hidden="true">→</span></button></div>}
        {step<4&&saveNotice&&<p className="demo-fine" role="status">{saveNotice}</p>}
      </section>
      <aside className="demo-world-column" aria-label="Your world preview">
        <div className={`demo-world-frame demo-biome-${region.theme}`}><div className="demo-world-caption"><span><b>{region.city.toUpperCase()}</b> / {region.country}</span><span>SIMULATED WORLD</span></div><div className="demo-scene"><HouseholdScene3D selected={selected} onSelect={setSelected} hour={step===4?hour:14} activeIds={step===4?activeIds:[]} scrollProgress={.5} regionTheme={region.theme} residenceType={profile.residenceType} visibleAppliances={step>=3?profile.applianceIds:[]} construction={{level:Math.min(step,3) as 0|1|2|3,replayKey}} onFinishBuild={step===4?enterHome:undefined} finishBuildLabel={step===4?"Finish build & enter home":undefined} weatherKind={step>=2?weatherKind(effectiveWeather.weatherCode):"clear"}/></div><div className="demo-world-footer"><span>{step===0?"Laying down roots…":step===1?"A home takes shape.":step===2?`${Math.round(effectiveWeather.temperatureC)}°C outside · ${weatherName(effectiveWeather.weatherCode)}`:`${profile.applianceIds.length} / 3 TEAMMATES`}</span><span title={CITY_LANDMARKS[profile.regionId].description}>MINIATURE / {CITY_LANDMARKS[profile.regionId].shortName.toUpperCase()}</span></div></div>

        {step>=2&&<div className="demo-impact"><span className="demo-eyebrow">HOW YOUR WORLD CHANGES</span><p>{region.city} changes scenery and the synthetic electricity/carbon profile. Your home type and outdoor temperature change the illustrative background demand.</p><DemoDemand scenario={scenario}/><details><summary>Model assumptions</summary><ul>{[...scenario.assumptions,...scenario.backgroundDemand.assumptions].map((line,index)=><li key={index}>{line}</li>)}</ul></details></div>}
        {step===4&&<div className="demo-live-panel"><label htmlFor="demo-time">SIMULATION CLOCK <strong>{timeLabel(hour)}</strong></label><input id="demo-time" type="range" min="0" max="48" step=".05" value={hour} onChange={event=>setHour(Number(event.target.value))}/><div>{profile.applianceIds.map(id=>{const reading=id==="chill"?acStats:stats[id];return <p key={id}><b>{team.find(member=>member.id===id)?.name}</b><span>{reading.currentPowerKw.toFixed(2)} kW · {reading.completedEnergyKwh.toFixed(2)} kWh</span></p>;})}</div></div>}
      </aside>
    </main></>}
    <TutorialNpc step={step} regionId={profile.regionId} residenceType={profile.residenceType} applianceIds={profile.applianceIds} onNavigate={showTutorialTarget} onAdvance={advance} canAdvance={step!==3||profile.applianceIds.length>0} completed={completed}/>
    <footer className="demo-footer"><span>A SMALL WORLD. A THOUGHTFUL HOME.</span><Link href="/energy-parliament">Original scheduling lab ↗</Link></footer>
  </div>;
}

function DemoDemand({scenario}:{scenario:ReturnType<typeof buildDemoScenario>}) {
  return <><div className="demo-demand-numbers"><div><strong>{scenario.backgroundDemand.heatingKwh.toFixed(1)} kWh</strong><small>Illustrative heating / 24h</small></div><div><strong>{scenario.backgroundDemand.coolingKwh.toFixed(1)} kWh</strong><small>Illustrative cooling / 24h</small></div></div><p className="demo-fine">Background estimates are separate from flexible-appliance savings. Chill shows the cooling portion when recruited; it is never optimized or controlled.</p></>;
}
