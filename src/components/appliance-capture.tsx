"use client";

/* Local object URLs are intentionally rendered directly; photos never reach an image service. */
/* eslint-disable @next/next/no-img-element */
import { useEffect, useId, useRef, useState, type ChangeEvent } from "react";
import type { ApplianceId } from "@/domain/appliances";
import { interpretApplianceMatches, type ApplianceSuggestion } from "@/domain/appliance-recognition";
import { interpretSiglipApplimonPhoto, type ApplimonSuggestion } from "@/domain/applimon-recognition";
import { APPLIMON_CATALOG, type ApplimonId } from "@/domain/applimon-catalog";
import { ApplimonSprite } from "./applimon-sprite";
import { PixelAppliance } from "./pixel-appliance";
import { ApplimonReveal } from "./applimon-reveal";
import "./appliance-capture.css";

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const legacyChoices: { id: ApplianceId; name: string; kind: string }[] = [
  { id: "evie", name: "Evie", kind: "EV charging setup" },
  { id: "bubbles", name: "Bubbles", kind: "Dishwasher" },
  { id: "chill", name: "Chill", kind: "Air conditioner" },
];

type CaptureProps = {existingIds?:readonly ApplimonId[];reviewSpecifications?:boolean;onPhotoSelected?:(file:File|null)=>void} & ({catalogMode?:false;onConfirm:(id:ApplianceId)=>void}|{catalogMode:true;onConfirm:(id:ApplimonId)=>void});
export function ApplianceCapture(props:CaptureProps) {
  const {existingIds=[],reviewSpecifications=false}=props;
  const downloadMb = props.catalogMode ? 250 : 190;
  const choices=props.catalogMode?APPLIMON_CATALOG.map(entry=>({id:entry.id,name:entry.name,kind:entry.category})):legacyChoices;
  const uid = useId();
  const camera = useRef<HTMLInputElement>(null);
  const upload = useRef<HTMLInputElement>(null);
  const firstChoice = useRef<HTMLInputElement>(null);
  const focusManual = useRef(false);
  const worker = useRef<Worker | null>(null);
  const job = useRef(0);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [photo, setPhoto] = useState<{ url: string; name: string; file: File } | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [selected, setSelected] = useState<ApplimonId | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [recognizing, setRecognizing] = useState(false);
  const [modelLoaded, setModelLoaded] = useState(false);
  const [recognitionStatus, setRecognitionStatus] = useState("");
  const [recognitionPercent, setRecognitionPercent] = useState<number | null>(null);
  const [suggestion, setSuggestion] = useState<ApplimonSuggestion | ApplianceSuggestion | null>(null);

  useEffect(() => () => {
    job.current++;
    worker.current?.terminate();
    if (timeout.current) clearTimeout(timeout.current);
  }, []);

  useEffect(() => {
    const url = photo?.url;
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [photo]);

  useEffect(() => {
    if (manualOpen && focusManual.current) {
      focusManual.current = false;
      firstChoice.current?.focus();
    }
  }, [manualOpen]);

  function stopRecognition() {
    job.current++;
    worker.current?.terminate();
    worker.current = null;
    if (timeout.current) clearTimeout(timeout.current);
    timeout.current = null;
    setRecognizing(false);
    setRecognitionPercent(null);
  }
  function clearPhoto(preserveHandoff = false) {
    stopRecognition();
    setSuggestion(null);
    setRecognitionStatus("");
    setPhoto(null);
    setManualOpen(false);
    if (!preserveHandoff) props.onPhotoSelected?.(null);
    if (camera.current) camera.current.value = "";
    if (upload.current) upload.current.value = "";
  }
  function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = "";
    setNotice("");
    setError("");
    if (!/^image\/(jpeg|png|webp|gif|avif|heic|heif)$/i.test(file.type)) {
      setError("Choose a JPEG, PNG, WebP, GIF, AVIF, or supported phone photo. This file type cannot be previewed.");
      return;
    }
    if (file.size === 0 || file.size > MAX_PHOTO_BYTES) {
      setError("Choose a photo between 1 byte and 10 MB, or continue without a photo.");
      return;
    }
    try {
      const url = URL.createObjectURL(file);
      stopRecognition();
      setSuggestion(null);
      setRecognitionStatus("");
      setSelected(null);
      setPhoto({ url, name: file.name.slice(0, 120), file });
      props.onPhotoSelected?.(file);
      setManualOpen(false);
      setNotice("Photo ready. Scan it or choose a category.");
    } catch {
      setError("This browser could not open the photo. Try another image or continue without one.");
    }
  }
  function imageFailed() {
    clearPhoto();
    setNotice("");
    setError("This photo could not be displayed. Try a JPEG or PNG, or continue without a photo.");
  }
  function cancel() {
    clearPhoto();
    setSelected(null);
    setError("");
    setNotice("Photo and selection cleared. Nothing was added.");
  }
  function confirm() {
    if (!selected) return;
    const id = selected;
    clearPhoto(true);
    setSelected(null);
    setNotice(reviewSpecifications ? "Category selected. Review electrical specifications before adding this teammate." : `${choices.find(choice => choice.id === id)!.name} confirmed as a simulated housemate.`);
    if(props.catalogMode)props.onConfirm(id);
    else if(legacyChoices.some(choice=>choice.id===id))props.onConfirm(id as ApplianceId);
  }

  function recognize() {
    if (!photo) return;
    stopRecognition();
    setError("");
    setSuggestion(null);
    setSelected(null);
    setRecognizing(true);
    setNotice("");
    setRecognitionStatus("Starting the background recognizer…");
    const requestId = job.current;
    function fail(message: string) {
      if (requestId !== job.current) return;
      stopRecognition();
      setRecognitionStatus("");
      setError(message);
    }
    try {
      const instance = new Worker(new URL("../workers/appliance-recognition.worker.ts", import.meta.url), { type: "module" });
      worker.current = instance;
      instance.onmessage = ({ data }) => {
        if (requestId !== job.current || data.requestId !== requestId) return;
        if (data.status === "complete") {
          try {
            const result = props.catalogMode?interpretSiglipApplimonPhoto(data.matches, data.photoMatches, data.imageEvidence):interpretApplianceMatches(data.matches);
            stopRecognition();
            setSuggestion(result);
            setModelLoaded(true);
            if (!result.applianceId) setManualOpen(true);
            setRecognitionStatus("");
          } catch { fail("The model returned an unreadable result. Retry or choose an appliance manually."); }
        } else if (data.status === "error") {
          fail(`On-device recognition could not finish. ${String(data.message).slice(0, 240)} You can retry or choose manually.`);
        } else if (data.status === "download") {
          setModelLoaded(false);
          const percent = Number(data.percent);
          setRecognitionPercent(Number.isFinite(percent) ? Math.min(100, Math.max(0, percent)) : null);
          const bytes = Number(data.loaded);
          setRecognitionStatus(`Downloading ${String(data.file).split("/").at(-1)?.slice(0, 60)}${Number.isFinite(bytes) ? ` · ${(bytes / 1_000_000).toFixed(1)} MB` : ""}. The photo stays on this device.`);
        } else if (data.status === "loading" || data.status === "running") {
          setRecognitionPercent(null);
          if (data.status === "running") setModelLoaded(true);
          setRecognitionStatus(String(data.message).slice(0, 180));
        }
      };
      instance.onerror = () => fail("The background recognizer could not start. Check your connection and browser support, then retry or choose manually.");
      timeout.current = setTimeout(() => fail("Recognition took too long. The download or device may be slow. Retry or choose manually."), 300_000);
      instance.postMessage({ requestId, photo: photo.file, ...(props.catalogMode?{catalogMode:true}:{}) });
    } catch { fail("This browser could not start on-device recognition. You can still choose an appliance manually."); }
  }

  const revealId = selected ?? suggestion?.applianceId;
  const needsCategory = Boolean(suggestion && !suggestion.applianceId && !selected);
  const reviewedSuggestion = suggestion && "reviewRequired" in suggestion ? suggestion : null;
  const recovery = reviewedSuggestion?.recoveryReason ?? (suggestion?.status === "unsupported" ? "unsupported" : "uncertain");
  const alternatives = reviewedSuggestion?.alternatives ?? [];
  const conditionalVehicle = needsCategory && reviewedSuggestion?.requiresEvConfirmation;
  const recoveryTitle = conditionalVehicle ? "Vehicle found" : recovery === "unsupported" ? "Not in this team yet" : recovery === "low-detail" ? "We need a little more detail" : alternatives.length ? "Which one is yours?" : "Scan complete. Choose a category.";
  const recoveryText = conditionalVehicle ? "Is this an EV or plug-in hybrid you charge?" : recovery === "unsupported" ? `We model ${choices.length} appliance types. Choose manually if the match is wrong.` : recovery === "low-detail" ? "This image has too little detail to match. Choose your appliance or try another image." : "The scan is unsure. Choose your appliance to continue.";
  function focusCategories() {
    if (manualOpen) { firstChoice.current?.focus(); return; }
    focusManual.current = true;
    setManualOpen(true);
  }
  return <section className="hm-capture" aria-labelledby={`${uid}-title`}>
    <header><p className="hm-capture-eyebrow">APPLIMON SCANNER</p><h2 id={`${uid}-title`}>Find your next teammate.</h2><p>One appliance. One photo. A little more personality.</p></header>
    <ol className="hm-capture-pipeline" aria-label="Appliance recruitment steps"><li aria-current={!photo && !selected ? "step" : undefined}><b>01</b> Photo</li><li aria-current={photo && !selected ? "step" : undefined}><b>02</b> Match</li><li aria-current={selected ? "step" : undefined}><b>03</b> Review</li></ol>
    <input ref={camera} type="file" accept="image/*" capture="environment" onChange={choosePhoto} hidden aria-label="Take an appliance photo"/>
    <input ref={upload} type="file" accept="image/*" onChange={choosePhoto} hidden aria-label="Choose an appliance photo"/>
    {needsCategory && <div className="hm-capture-result-banner" role="status"><div><strong>{recoveryTitle}</strong><p>{recoveryText}</p></div><button type="button" onClick={focusCategories}>Select appliance ↓</button></div>}
    <div className={`hm-capture-scanner ${recognizing ? "is-scanning" : ""} ${needsCategory ? "needs-category" : ""}`} aria-busy={recognizing}>
      {revealId && !recognizing ? <ApplimonReveal id={revealId} photoUrl={photo?.url} state="candidate" label={revealId === "evie" ? "EV charging setup? Confirm EV or plug-in hybrid status and charging details next." : selected ? "Your category choice. Review before adding." : "A photo suggestion. Check the category before adding."} onContinue={!selected ? () => { setSelected(revealId); setNotice("Category chosen. Review it below before continuing."); } : undefined}/> : photo ? <div className="hm-capture-preview"><img src={photo.url} alt="Your locally selected appliance photo" onError={imageFailed} onLoad={event => { const image = event.currentTarget; if (image.naturalWidth * image.naturalHeight > 40_000_000) { clearPhoto(); setNotice(""); setError("That photo is too large to preview comfortably. Choose a smaller image or continue without one."); } }}/><span className="hm-capture-frame" aria-hidden="true"/>{recognizing && <div className="hm-capture-scanline" aria-hidden="true"/>}<p className="hm-capture-frame-label">{recognizing ? "SCANNER ACTIVE" : suggestion ? "CHOOSE YOUR APPLIANCE" : "READY TO SCAN"}</p></div> : <div className="hm-capture-empty"><div className="hm-capture-empty-crew" aria-hidden="true"><ApplimonSprite id="spin"/><ApplimonSprite id="evie"/><ApplimonSprite id="breeze"/></div><span className="hm-capture-frame" aria-hidden="true"/><p>Who’s hiding in your home?</p><small>Frame one appliance clearly.</small></div>}
    </div>
    {needsCategory && alternatives.length > 0 && <div className="hm-capture-alternatives" aria-label="Possible appliance categories">{alternatives.map(id => { const choice = choices.find(entry => entry.id === id); return choice ? <button key={id} type="button" onClick={() => { stopRecognition(); setSelected(id); setNotice("Category chosen by you. Review its details before adding."); }}><ApplimonSprite id={id}/><span>Choose {choice.name}<small>{choice.kind}</small></span></button> : null; })}</div>}
    <div className="hm-capture-photo-actions"><button type="button" onClick={() => camera.current?.click()}>Take a photo <span aria-hidden="true">↗</span></button><button type="button" onClick={() => upload.current?.click()}>{photo ? "Change photo" : "Choose a photo"}</button></div>
    <p className="hm-capture-download">Photos stay local. Nothing is added automatically.</p>
    {photo && <div className="hm-capture-recognition">
      <div className="hm-capture-recognition-actions"><button type="button" className="hm-capture-primary" disabled={recognizing} onClick={recognize}>{suggestion ? "Try suggestion again" : "Suggest appliance · scan photo"}<span aria-hidden="true"> ◇</span></button>{recognizing ? <button type="button" onClick={() => { stopRecognition(); setRecognitionStatus("Recognition canceled. Choose manually or retry when ready."); }}>Cancel recognition</button> : <button type="button" className="hm-capture-text-button" onClick={() => { clearPhoto(); setNotice("Photo removed. You can still choose an appliance below."); }}>Remove photo</button>}</div>
      {!modelLoaded && <p className="hm-capture-download">Optional local scan · first use downloads about {downloadMb} MB. Your photo stays on this device.</p>}
      {recognitionStatus && <p className="hm-capture-recognition-status" role="status">{recognitionStatus}</p>}{recognizing && recognitionPercent !== null && <progress aria-label="Current model file download" max={100} value={recognitionPercent}/>}
    </div>}
    {suggestion && <div className={`hm-capture-suggestion ${needsCategory ? "is-abstained" : ""}`} role="status">{!needsCategory && <><strong>{selected ? `Your choice: ${choices.find(choice => choice.id === selected)!.kind}` : suggestion.applianceId ? `Suggested match: ${choices.find(choice => choice.id === suggestion.applianceId)!.kind}` : "Choose your appliance"}</strong><p>{selected ? "Review this category and its energy details before adding it." : suggestion.applianceId ? "Looks familiar? Choose this category or pick another below." : "Choose a supported category if the scan is wrong."}</p></>}<details><summary>Why this result?</summary><p>{needsCategory ? "The model can miss clearly photographed appliances. You can choose the correct category without taking another photo." : suggestion.reason}</p>{reviewedSuggestion && <><p>Category scores compare the supported choices. Image style is advisory; simple pixel checks can flag very low-detail images. None of these checks verifies identity or energy use.</p>{reviewedSuggestion.reviewNotes.map(note => <p key={note}>{note}</p>)}</>}<ul>{suggestion.matches.map(match => <li key={match.label}>{match.label}: {match.score.toFixed(3)}</li>)}</ul><p>Relative matches, not probabilities or verified identity.</p></details></div>}
    {error && <p role="alert" className="hm-capture-error">{error}</p>}
    <details className="hm-capture-manual" open={manualOpen} onToggle={event => setManualOpen(event.currentTarget.open)}><summary>{selected ? "Change category" : `Choose from ${choices.length} appliance types`}<span aria-hidden="true"> +</span></summary><fieldset className="hm-capture-choices"><legend>Pick your teammate</legend>{choices.map((choice, index) => <label key={choice.id} className={selected === choice.id ? "is-selected" : ""}><input ref={index === 0 ? firstChoice : undefined} type="radio" name={`${uid}-appliance`} value={choice.id} checked={selected === choice.id} onChange={() => { stopRecognition(); setSelected(choice.id); }}/>{props.catalogMode?<ApplimonSprite id={choice.id}/>:<PixelAppliance id={choice.id as ApplianceId}/>}<span><strong>{choice.name}</strong><small>{choice.kind}{existingIds.includes(choice.id) ? " · on your team" : suggestion?.applianceId === choice.id ? " · suggested" : ""}</small></span></label>)}</fieldset></details>
    {!photo && !selected && <button type="button" className="hm-capture-text-button" onClick={() => { clearPhoto(); setManualOpen(true); setError(""); setNotice("No photo needed. Choose an appliance type to continue."); }}>Continue without a photo</button>}
    {selected && <p className="hm-capture-selection-note">{existingIds.includes(selected) ? "Already on your team. We’ll review its details." : "Category selected. Let’s review its energy needs."}</p>}
    <div className="hm-capture-confirm"><button type="button" className="hm-capture-primary" disabled={!selected} onClick={confirm}>{reviewSpecifications?"Review specifications":"Confirm housemate"} <span aria-hidden="true">→</span></button><button type="button" className="hm-capture-text-button" onClick={cancel}>Cancel selection</button></div>
    <p className="hm-capture-notice" role="status">{notice}</p>
    <details className="hm-capture-about"><summary>Privacy & scan limits</summary><p>Photos stay in this page’s memory, never uploaded or saved in your household. Optional scan downloads about {downloadMb} MB of model files on first use from Hugging Face and its runtime CDN; the browser may cache them. A photo cannot verify identity, vehicle powertrain, connectivity or energy use. You confirm the category and review electrical details. Supported types: {choices.map(choice => choice.kind).join(", ")}. Other appliances cannot be added as generic optimized loads.</p></details>
  </section>;
}
