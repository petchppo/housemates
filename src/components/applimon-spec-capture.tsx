"use client";

import { createDemoApplimon, getApplimon, validateApplimonDevice, type ApplimonDevice, type ApplimonId } from "@/domain/applimon-catalog";
import { ApplimonSprite } from "./applimon-sprite";
import "./applimon-spec-capture.css";

/** Recruitment uses authored demo settings; a photo never supplies electrical specs. */
export function ApplimonSpecCapture({initialId="spin",initialDevice,onConfirm,onCancel}:{initialId?:ApplimonId;initialDevice?:ApplimonDevice;onConfirm:(device:ApplimonDevice,photo?:File)=>void;onCancel?:()=>void}) {
  const saved = validateApplimonDevice(initialDevice);
  const device = saved ?? createDemoApplimon(initialId);
  const entry = getApplimon(device.id);
  const synthetic = device.specSource === "demo-defaults";

  return <section className="applimon-specs" aria-label="Confirm your Applimon">
    <header><ApplimonSprite id={device.id}/><div><p className="spec-eyebrow">{saved ? "YOUR TEAMMATE" : "YOUR NEXT TEAMMATE"}</p><h2 tabIndex={-1}>{entry.name} is ready.</h2><p>{entry.category} · {entry.role}</p></div></header>
    <div className="spec-demo-ready"><span aria-hidden="true">✦</span><div><strong>{synthetic ? "Demo stats equipped" : "Saved settings equipped"}</strong><p>{synthetic ? "Synthetic energy and routine. No spec sheet needed." : "Your previously saved settings stay unchanged."}</p></div></div>
    <p className="spec-policy">{entry.schedulingPolicy === "protected" ? "Protected teammate. We never shift its operation." : entry.schedulingPolicy === "fixed" ? "Fixed routine. No time-shifting savings." : "Ready to explore better timing in the simulator."}</p>
    <div className="spec-actions"><button type="button" onClick={() => onConfirm(device)}>{saved ? `Keep ${entry.name} on my team` : `Add ${entry.name} to my team`} <span aria-hidden="true">→</span></button>{onCancel && <button type="button" onClick={onCancel}>Cancel</button>}</div>
    <p className="spec-note">Simulated activity only. No devices connected.</p>
  </section>;
}
