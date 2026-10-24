"use client";

/* Nameplate previews use local object URLs, never an image-hosting service. */
/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import type { Worker as OcrWorker } from "tesseract.js";
import { APPLIMON_CATALOG, createDemoApplimon, getApplimon, validateApplimonDevice, type ApplimonDevice, type ApplimonId } from "@/domain/applimon-catalog";
import { parseNameplateText } from "@/domain/nameplate";
import { ApplimonSprite } from "./applimon-sprite";
import "./applimon-spec-capture.css";

type Fields = Record<"ratedPowerW"|"energyKwh"|"durationHours"|"earliestStartHour"|"latestStartHour"|"deadlineHour"|"baselineStartHour",string>;
function deviceFields(device:ApplimonDevice):Fields { return {ratedPowerW:String(device.ratedPowerW),energyKwh:String(device.energyKwh),durationHours:String(device.durationHours),earliestStartHour:String(device.earliestStartHour),latestStartHour:String(device.latestStartHour),deadlineHour:String(device.deadlineHour),baselineStartHour:String(device.baselineStartHour)}; }
const emptyFields:Fields={ratedPowerW:"",energyKwh:"",durationHours:"",earliestStartHour:"",latestStartHour:"",deadlineHour:"",baselineStartHour:""};

export function ApplimonSpecCapture({initialId="spin",initialDevice,onConfirm,onCancel}:{initialId?:ApplimonId;initialDevice?:ApplimonDevice;onConfirm:(device:ApplimonDevice,photo?:File)=>void;onCancel?:()=>void}) {
  const [step,setStep]=useState(0);
  const [id,setId]=useState<ApplimonId>(initialDevice?.id??initialId);
  const [fields,setFields]=useState<Fields>(initialDevice?deviceFields(initialDevice):emptyFields);
  const [basis,setBasis]=useState<ApplimonDevice["energyBasis"]>(initialDevice?.energyBasis??"cycle-energy");
  const [source,setSource]=useState<ApplimonDevice["specSource"]>(initialDevice?.specSource??"manual");
  const [reviewed,setReviewed]=useState(false);
  const [evConfirmed,setEvConfirmed]=useState(false);
  const [photo,setPhoto]=useState<{file:File;url:string}|null>(null);
  const [decoded,setDecoded]=useState(false);
  const [text,setText]=useState("");
  const [textFromOcr,setTextFromOcr]=useState(false);
  const [busy,setBusy]=useState(false);
  const [status,setStatus]=useState("");
  const [error,setError]=useState("");
  const worker=useRef<OcrWorker|null>(null);
  const generation=useRef(0);
  const timeout=useRef<ReturnType<typeof setTimeout>|null>(null);
  const fileInput=useRef<HTMLInputElement>(null);
  const entry=getApplimon(id);
  const hints=parseNameplateText(text);
  const numeric=Object.fromEntries(Object.entries(fields).map(([key,value])=>[key,value.trim()===""?NaN:Number(value)])) as Record<keyof Fields,number>;
  const duration=entry.jobKind==="charge"?numeric.energyKwh/(numeric.ratedPowerW/1000):numeric.durationHours;
  const energy=basis==="rated-power-estimate"&&entry.jobKind!=="charge"?numeric.ratedPowerW/1000*duration:numeric.energyKwh;
  const candidate=validateApplimonDevice({id,...numeric,durationHours:duration,energyKwh:energy,energyBasis:basis,specSource:source,confirmed:true});
  const valid=!!candidate&&reviewed&&!busy&&(id!=="evie"||evConfirmed);

  function stop() {
    generation.current++;
    const active=worker.current;worker.current=null;
    if(active)void active.terminate().catch(()=>{});
    if(timeout.current)clearTimeout(timeout.current);timeout.current=null;
    setBusy(false);
  }
  useEffect(()=>()=>{generation.current++;if(timeout.current)clearTimeout(timeout.current);void worker.current?.terminate().catch(()=>{});worker.current=null;},[]);
  useEffect(()=>{const url=photo?.url;return()=>{if(url)URL.revokeObjectURL(url);};},[photo]);

  function update(key:keyof Fields,value:string) {setFields(current=>({...current,[key]:value}));setReviewed(false);if(source==="demo-defaults")setSource("manual");}
  function changeCategory(next:ApplimonId) {stop();setId(next);setEvConfirmed(false);setStep(0);setFields(emptyFields);setBasis("cycle-energy");setSource("manual");setReviewed(false);setError("");setText("");setStatus("");setPhoto(null);setDecoded(false);}
  function choose(event:ChangeEvent<HTMLInputElement>) {
    const file=event.target.files?.[0];event.target.value="";if(!file)return;
    stop();setText("");setStatus("");setReviewed(false);setError("");setDecoded(false);setPhoto(null);
    if(!/^image\/(jpeg|png|webp|heic|heif|avif)$/i.test(file.type)||!file.size||file.size>10*1024*1024){setError("Choose a supported nameplate photo up to 10 MB, or enter the label manually.");return;}
    try{setPhoto({file,url:URL.createObjectURL(file)});}catch{setError("This browser could not open the photo. You can type the label or specifications instead.");}
  }
  async function recognize() {
    if(!photo||!decoded)return;
    stop();const job=generation.current;setBusy(true);setError("");setStatus("Loading the local OCR worker and English language files…");
    timeout.current=setTimeout(()=>{if(job===generation.current){stop();setStatus("");setError("Reading the label timed out. Retry or enter the numbers manually.");}},120000);
    try {
      const {createWorker}=await import("tesseract.js");
      if(job!==generation.current)return;
      const instance=await createWorker("eng",1,{workerPath:"https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/worker.min.js",corePath:"https://cdn.jsdelivr.net/npm/tesseract.js-core@7.0.0",logger:message=>{if(job===generation.current)setStatus(`${message.status} · ${Math.round(Math.max(0,Math.min(1,message.progress??0))*100)}%`);}});
      if(job!==generation.current){await instance.terminate();return;}
      worker.current=instance;
      const result=await instance.recognize(photo.file);
      if(job!==generation.current)return;
      setText(result.data.text.slice(0,20000));setTextFromOcr(true);setStatus("Text read locally. Check the original label and choose only the numbers that apply.");
      stop();
    } catch {if(job===generation.current){stop();setStatus("");setError("OCR could not finish. Network or browser support may be unavailable. Enter the label or specifications manually.");}}
  }
  function submit() {if(valid&&candidate){stop();setPhoto(null);setText("");onConfirm(candidate,photo?.file);}}
  const timeFields:readonly {key:keyof Fields;label:string}[]=[{key:"baselineStartHour",label:"Usual start"},{key:"earliestStartHour",label:"Earliest available start"},{key:"latestStartHour",label:"Latest allowed start"},{key:"deadlineHour",label:"Must finish by"}];

  return <section className="applimon-specs" aria-label="Review appliance specifications">
    <header><ApplimonSprite id={id}/><div><p className="spec-eyebrow">YOUR NEXT TEAMMATE</p><h2>Make {entry.name} yours.</h2><p>{["Snap the label. Find its power.","Check a few numbers.","When can your teammate help?"][step]}</p></div></header>
    <nav className="spec-steps" aria-label="Appliance setup steps">{["Scan label","Energy","Routine"].map((label,index)=><button key={label} type="button" aria-current={step===index?"step":undefined} onClick={()=>setStep(index)}><span>{index+1}</span>{label}</button>)}</nav>
    <div hidden={step!==0}>
    <label className="spec-category">Appliance category<select value={id} onChange={event=>changeCategory(event.target.value as ApplimonId)}>{APPLIMON_CATALOG.map(item=><option key={item.id} value={item.id}>{item.name} · {item.category}</option>)}</select></label>
    <details className="spec-guidance"><summary>About this teammate</summary><p><strong>{entry.schedulingPolicy==="protected"?"Protected operation":entry.schedulingPolicy==="fixed"?"Fixed routine":"Flexible task"}.</strong> {entry.guidance}</p></details>
    <div className="spec-ocr"><p className="spec-camera-hint">▧ A clear, close-up label works best.</p><p className="spec-privacy">Photo stays here. Reading downloads a local OCR model.</p><input ref={fileInput} type="file" accept="image/*" capture="environment" onChange={choose} aria-label="Nameplate photo"/><button type="button" onClick={()=>fileInput.current?.click()}>Take or choose nameplate photo</button>
      {photo&&<div className="spec-photo"><img src={photo.url} alt="Your local electrical nameplate" onLoad={event=>{if(event.currentTarget.naturalWidth*event.currentTarget.naturalHeight>16000000){stop();setPhoto(null);setError("Choose a smaller nameplate photo under 16 megapixels.");}else setDecoded(true);}} onError={()=>{stop();setPhoto(null);setDecoded(false);setError("This image cannot be decoded here. Try JPEG/PNG or enter the label manually.");}}/><button type="button" disabled={busy||!decoded} onClick={recognize}>Read label on this device</button><button type="button" onClick={()=>{stop();setPhoto(null);setDecoded(false);setText("");setStatus("Photo removed.");}}>Remove photo</button></div>}
      {busy&&<button type="button" onClick={()=>{stop();setStatus("Reading canceled. No fields were changed.");}}>Cancel reading</button>}
      {status&&<p role="status">{status}</p>}{error&&<p role="alert" className="spec-error">{error}</p>}
      <details className="spec-raw"><summary>View or paste label text</summary><label>Read or paste label text<textarea value={text} maxLength={20000} rows={4} onChange={event=>{setText(event.target.value);setTextFromOcr(false);setReviewed(false);}} placeholder="Example: Electrical input 1800 W. Energy per cycle 1.2 kWh."/></label></details>
      {text&&<div className="spec-hints"><p>Found on the label. Tap to use:</p>{hints.powerWatts.map(value=><button key={`p${value}`} type="button" onClick={()=>{update("ratedPowerW",String(value));setSource(textFromOcr?"ocr-reviewed":"manual");}}>Use {value} W</button>)}{hints.cycleEnergyKwh.map(value=><button key={`e${value}`} type="button" onClick={()=>{update("energyKwh",String(value));setBasis("cycle-energy");setSource(textFromOcr?"ocr-reviewed":"manual");}}>Use {value} kWh per run</button>)}<ul>{hints.warnings.map(warning=><li key={warning}>{warning}</li>)}</ul></div>}
    </div>
    <div className="spec-actions"><button type="button" onClick={()=>setStep(1)}>{text?"Check energy →":"Enter numbers myself →"}</button></div>
    <div className="spec-defaults"><button type="button" onClick={()=>{setFields(deviceFields(createDemoApplimon(id)));setBasis("cycle-energy");setSource("demo-defaults");setReviewed(false);setStep(1);}}>Use illustrative demo settings</button><p>{source==="demo-defaults"?"Example values—not read from your appliance.":"Or explore with example values."}</p></div>
    </div>
    <div hidden={step!==1}>
    <div className="spec-numbers"><label>Electrical input rating (W)<input type="number" inputMode="decimal" min="1" max="30000" step="1" value={fields.ratedPowerW} onChange={event=>update("ratedPowerW",event.target.value)} placeholder="e.g. 1800"/></label>
      <label>{entry.jobKind==="charge"?"Energy needed (kWh)":"Energy per run / stated period (kWh)"}<input type="number" inputMode="decimal" min=".001" max="200" step=".001" disabled={basis==="rated-power-estimate"&&entry.jobKind!=="charge"} value={basis==="rated-power-estimate"&&entry.jobKind!=="charge"?(Number.isFinite(energy)?String(Number(energy.toFixed(4))):""):fields.energyKwh} onChange={event=>update("energyKwh",event.target.value)} placeholder="e.g. 1.2"/></label>
      <label>{entry.jobKind==="charge"?"Charging hours (calculated)":"Run / averaging duration (hours)"}<input type="number" inputMode="decimal" min=".05" max="48" step=".05" disabled={entry.jobKind==="charge"} value={entry.jobKind==="charge"?(Number.isFinite(duration)?String(Number(duration.toFixed(3))):""):fields.durationHours} onChange={event=>update("durationHours",event.target.value)} placeholder="e.g. 2"/></label></div>
    {entry.jobKind!=="charge"&&<label className="spec-checkbox"><input type="checkbox" checked={basis==="rated-power-estimate"} onChange={event=>{setBasis(event.target.checked?"rated-power-estimate":"cycle-energy");setReviewed(false);if(source==="demo-defaults")setSource("manual");}}/><span>I only know rated watts. Estimate full-power energy.</span></label>}
    {id==="evie"&&<p className="spec-note">Use your charger’s input power and energy needed for this charge—not motor power or total battery capacity.</p>}
    <p className="spec-note">{basis==="rated-power-estimate"?"Full-power estimate: actual consumption may be much lower.":"Use cycle energy from your manual or meter. Rated watts are peak power."}</p>
    <div className="spec-actions"><button type="button" onClick={()=>setStep(2)}>Set routine →</button></div>
    </div>
    <div hidden={step!==2}>
    <fieldset className="spec-times"><legend>{entry.schedulingPolicy==="flexible"?"When can this task run?":"When does your stated usage occur?"}</legend><p>Pick today or tomorrow. Your usual start is the comparison.</p><div>{timeFields.map(field=><label key={field.key}>{field.label}<select value={fields[field.key]} onChange={event=>update(field.key,event.target.value)}><option value="">Choose a time</option>{Array.from({length:49},(_,hour)=><option key={hour} value={hour}>{hour===48?"End of tomorrow":`${hour<24?"Today":"Tomorrow"} · ${String(hour%24).padStart(2,"0")}:00`}</option>)}</select></label>)}</div></fieldset>
    {!candidate&&Object.values(fields).some(Boolean)&&<p className="spec-error">Check your energy and times. Energy must fit the power × duration; latest start must follow earliest start.</p>}
    {id==="evie"&&<label className="spec-checkbox spec-review"><input type="checkbox" checked={evConfirmed} onChange={event=>{setEvConfirmed(event.target.checked);setReviewed(false);}}/><span>This is an EV or plug-in hybrid I charge from this setup.</span></label>}
    <label className="spec-checkbox spec-review"><input type="checkbox" checked={reviewed} onChange={event=>setReviewed(event.target.checked)}/><span>I reviewed these estimates and my routine.</span></label>
    <p className="spec-note">{source==="demo-defaults"?"Example specs":"Reviewed inputs"} · simulated appliance, no device control.</p>
    <div className="spec-actions"><button type="button" disabled={!valid} onClick={submit}>Confirm {entry.name} & specifications →</button>{onCancel&&<button type="button" onClick={()=>{stop();onCancel();}}>Cancel</button>}</div>
    </div>
  </section>;
}
