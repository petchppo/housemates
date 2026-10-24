"use client";

/* Local object URLs are intentionally rendered directly; photos never reach an image service. */
/* eslint-disable @next/next/no-img-element */
import { useEffect, useId, useRef, useState, type ChangeEvent } from "react";
import type { ApplianceId } from "@/domain/appliances";
import { interpretApplianceMatches, type ApplianceSuggestion } from "@/domain/appliance-recognition";
import { PixelAppliance } from "./pixel-appliance";
import "./appliance-capture.css";

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const choices: { id: ApplianceId; name: string; kind: string }[] = [
  { id: "evie", name: "Evie", kind: "EV charger" },
  { id: "bubbles", name: "Bubbles", kind: "Dishwasher" },
  { id: "chill", name: "Chill", kind: "Air conditioner" },
];

export function ApplianceCapture({ onConfirm }: { onConfirm: (id: ApplianceId) => void }) {
  const uid = useId();
  const camera = useRef<HTMLInputElement>(null);
  const upload = useRef<HTMLInputElement>(null);
  const firstChoice = useRef<HTMLInputElement>(null);
  const worker = useRef<Worker | null>(null);
  const job = useRef(0);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [photo, setPhoto] = useState<{ url: string; name: string; file: File } | null>(null);
  const [selected, setSelected] = useState<ApplianceId | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [recognizing, setRecognizing] = useState(false);
  const [recognitionStatus, setRecognitionStatus] = useState("");
  const [recognitionPercent, setRecognitionPercent] = useState<number | null>(null);
  const [suggestion, setSuggestion] = useState<ApplianceSuggestion | null>(null);

  useEffect(() => () => {
    job.current++;
    worker.current?.terminate();
    if (timeout.current) clearTimeout(timeout.current);
  }, []);

  useEffect(() => {
    const url = photo?.url;
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [photo]);

  function stopRecognition() {
    job.current++;
    worker.current?.terminate();
    worker.current = null;
    if (timeout.current) clearTimeout(timeout.current);
    timeout.current = null;
    setRecognizing(false);
    setRecognitionPercent(null);
  }
  function clearPhoto() {
    stopRecognition();
    setSuggestion(null);
    setRecognitionStatus("");
    setPhoto(null);
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
      setNotice("Photo ready. Choose its appliance type yourself, or request an on-device suggestion.");
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
    clearPhoto();
    setSelected(null);
    setNotice(`${choices.find(choice => choice.id === id)!.name} confirmed as a simulated housemate.`);
    onConfirm(id);
  }

  function recognize() {
    if (!photo) return;
    stopRecognition();
    setError("");
    setSuggestion(null);
    setRecognizing(true);
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
            const result = interpretApplianceMatches(data.matches);
            stopRecognition();
            setSuggestion(result);
            setRecognitionStatus("Comparison complete. Nothing has been added or selected automatically.");
          } catch { fail("The model returned an unreadable result. Retry or choose an appliance manually."); }
        } else if (data.status === "error") {
          fail(`On-device recognition could not finish. ${String(data.message).slice(0, 240)} You can retry or choose manually.`);
        } else if (data.status === "download") {
          const percent = Number(data.percent);
          setRecognitionPercent(Number.isFinite(percent) ? Math.min(100, Math.max(0, percent)) : null);
          const bytes = Number(data.loaded);
          setRecognitionStatus(`Downloading ${String(data.file).split("/").at(-1)?.slice(0, 60)}${Number.isFinite(bytes) ? ` · ${(bytes / 1_000_000).toFixed(1)} MB` : ""}. The photo stays on this device.`);
        } else if (data.status === "loading" || data.status === "running") {
          setRecognitionPercent(null);
          setRecognitionStatus(String(data.message).slice(0, 180));
        }
      };
      instance.onerror = () => fail("The background recognizer could not start. Check your connection and browser support, then retry or choose manually.");
      timeout.current = setTimeout(() => fail("Recognition took too long. The download or device may be slow. Retry or choose manually."), 300_000);
      instance.postMessage({ requestId, photo: photo.file });
    } catch { fail("This browser could not start on-device recognition. You can still choose an appliance manually."); }
  }

  return <section className="hm-capture" aria-labelledby={`${uid}-title`}>
    <header><p className="hm-capture-eyebrow">MEET YOUR NEXT HOUSEMATE</p><h2 id={`${uid}-title`}>Give an appliance a face.</h2><p>A photo is optional. Take one on your phone or choose an image from this device.</p></header>
    <input ref={camera} type="file" accept="image/*" capture="environment" onChange={choosePhoto} hidden aria-label="Take an appliance photo"/>
    <input ref={upload} type="file" accept="image/*" onChange={choosePhoto} hidden aria-label="Choose an appliance photo"/>
    {photo ? <div className="hm-capture-preview"><img src={photo.url} alt="Your locally selected appliance photo" onError={imageFailed} onLoad={event => { const image = event.currentTarget; if (image.naturalWidth * image.naturalHeight > 40_000_000) { clearPhoto(); setNotice(""); setError("That photo is too large to preview comfortably. Choose a smaller image or continue without one."); } }}/><div><span>{photo.name}</span><button type="button" onClick={() => { clearPhoto(); setNotice("Photo removed. You can still choose an appliance below."); }}>Remove photo</button></div></div> : <div className="hm-capture-empty" aria-hidden="true"><span>⌑</span><p>A new face for your home team</p></div>}
    <div className="hm-capture-photo-actions"><button type="button" onClick={() => camera.current?.click()}>Take a photo <span aria-hidden="true">↗</span></button><button type="button" onClick={() => upload.current?.click()}>Choose a photo</button><button type="button" className="hm-capture-text-button" onClick={() => { clearPhoto(); setError(""); setNotice("No photo needed. Choose an appliance type to continue."); firstChoice.current?.focus(); }}>Continue without a photo</button></div>
    <p className="hm-capture-privacy">Photos stay in this page’s memory. They are not uploaded or saved in your household.</p>
    <div className="hm-capture-recognition"><span aria-hidden="true">◇</span><div><p><strong>Optional on-device photo suggestion</strong><br/>First use downloads about 190 MB (154 MB model plus runtime and tokenizer) from Hugging Face and its runtime CDN. Model files may be cached by this browser. Your photo is processed locally and never uploaded.</p>{photo && <div className="hm-capture-recognition-actions"><button type="button" disabled={recognizing} onClick={recognize}>{suggestion ? "Try suggestion again" : "Suggest appliance on this device"}</button>{recognizing && <button type="button" onClick={() => { stopRecognition(); setRecognitionStatus("Recognition canceled. Choose manually or retry when ready."); }}>Cancel recognition</button>}</div>}<p className="hm-capture-recognition-status" role="status">{recognitionStatus}</p>{recognizing && <progress aria-label="Current model file download" max={100} value={recognitionPercent ?? undefined}/>}</div></div>
    {suggestion && <div className="hm-capture-suggestion" role="status"><strong>{suggestion.applianceId ? `Suggested match: ${choices.find(choice => choice.id === suggestion.applianceId)!.kind}` : "No reliable supported match"}</strong><p>{suggestion.reason}</p><details><summary>See relative candidate matches</summary><ul>{suggestion.matches.map(match => <li key={match.label}>{match.label}: {match.score.toFixed(3)}</li>)}</ul><p>These scores rank only the listed candidates. They are not calibrated probabilities or verified identification.</p></details></div>}
    {error && <p role="alert" className="hm-capture-error">{error}</p>}
    <fieldset className="hm-capture-choices"><legend>Choose the appliance yourself, then confirm</legend>{choices.map((choice, index) => <label key={choice.id} className={selected === choice.id ? "is-selected" : ""}><input ref={index === 0 ? firstChoice : undefined} type="radio" name={`${uid}-appliance`} value={choice.id} checked={selected === choice.id} onChange={() => setSelected(choice.id)}/><PixelAppliance id={choice.id}/><span><strong>{choice.name}</strong><small>{choice.kind}{suggestion?.applianceId === choice.id ? " · suggested" : ""}</small></span></label>)}</fieldset>
    <div className="hm-capture-confirm"><button type="button" className="hm-capture-primary" disabled={!selected} onClick={confirm}>Confirm housemate <span aria-hidden="true">→</span></button><button type="button" onClick={cancel}>Cancel selection</button></div>
    <p className="hm-capture-notice" role="status">{notice}</p>
  </section>;
}
