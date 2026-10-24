"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ApplianceCapture } from "./appliance-capture";
import { ApplimonSpecCapture } from "./applimon-spec-capture";
import { ApplimonReveal } from "./applimon-reveal";
import { ApplimonSprite } from "./applimon-sprite";
import { HouseholdScene3D } from "./household-scene-3d";
import { parseDemoProfile, type DemoProfile } from "@/domain/demo";
import { getDemoRegion } from "@/data/demo-regions";
import type { ApplianceId } from "@/domain/appliances";
import { APPLIMON_CATALOG, getApplimon, type ApplimonDevice, type ApplimonId } from "@/domain/applimon-catalog";
import { applianceTransferPath, DEMO_PROFILE_STORAGE_KEY, parseTransferredAppliance, recruitConfiguredApplimon } from "@/domain/appliance-recruitment";
import "./appliance-scan.css";

export function ApplianceScan() {
  const [profile, setProfile] = useState<DemoProfile | null>(null);
  const [ready, setReady] = useState(false);
  const [received, setReceived] = useState<ApplimonId | null>(null);
  const [confirmed, setConfirmed] = useState<ApplimonId | null>(null);
  const [editing, setEditing] = useState<ApplimonId | null>(null);
  const [photoSetup,setPhotoSetup]=useState(true);
  const [reveal,setReveal]=useState<ApplimonId|null>(null);
  const [scanPhoto,setScanPhoto]=useState<{file:File;url:string}|null>(null);
  useEffect(()=>{const url=scanPhoto?.url;return()=>{if(url)URL.revokeObjectURL(url);};},[scanPhoto]);
  function rememberPhoto(file:File|null){setScanPhoto(file?{file,url:URL.createObjectURL(file)}:null);}
  const [selected, setSelected] = useState<ApplianceId>("evie");
  const [notice, setNotice] = useState("");
  const [saved, setSaved] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [copyNotice, setCopyNotice] = useState("");

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      try { setProfile(parseDemoProfile(localStorage.getItem(DEMO_PROFILE_STORAGE_KEY))); }
      catch { setNotice("Browser storage is unavailable. You can review specifications and share a category, but no saved household can be changed here."); }
      setReceived(parseTransferredAppliance(window.location.search));
      setReady(true);
    });
    return () => { cancelled = true; };
  }, []);

  function beginReview(id:ApplimonId) {
    setEditing(id);setReceived(null);setPhotoSetup(false);setReveal(null);setNotice("");
  }
  function confirm(device: ApplimonDevice, photo?:File) {
    if(!scanPhoto&&photo)rememberPhoto(photo);
    const id=device.id,entry=getApplimon(id);
    setConfirmed(id);if(entry.legacyId)setSelected(entry.legacyId);setReceived(null);setCopyNotice("");setSaved(false);setEditing(null);
    setShareUrl(`${window.location.origin}${applianceTransferPath(id)}`);
    // Re-read at confirmation so another tab's latest profile is not overwritten.
    let latest = profile;
    try { latest = parseDemoProfile(localStorage.getItem(DEMO_PROFILE_STORAGE_KEY)); }
    catch {
      setNotice("Specifications reviewed, but browser storage is unavailable. Nothing was saved. Keep the category transfer link or return to setup.");
      return;
    }
    if (!latest) {
      setProfile(null);
      setNotice(`${entry.name} is reviewed. Build a world on this browser before adding it, or open the category transfer link on the device with your saved world. Specifications must be reviewed again there.`);
      return;
    }
    const result = recruitConfiguredApplimon(latest, device);
    setProfile(result.profile);
    if (result.status === "already-present") {
      setSaved(true);setReveal(id);
      setNotice(`${entry.name} is already on this team with these specifications. No duplicate model or extra energy load was added.`);
      return;
    }
    try {
      localStorage.setItem(DEMO_PROFILE_STORAGE_KEY, JSON.stringify(result.profile));
      setSaved(true);setReveal(id);
      setNotice(`${entry.name} ${result.status==="updated"?"has updated specifications in":"joined"} your saved home. Your household changed, so any earlier approved simulation must be reviewed again.`);
    } catch {
      setNotice(`${entry.name} appears in this page's preview only. Browser storage could not save the change; returning home will keep the previously saved team.`);
    }
  }
  async function copyLink() {
    try { await navigator.clipboard.writeText(shareUrl); setCopyNotice("Transfer link copied. Open it on your other device and review specifications there."); }
    catch { setCopyNotice("Copy is unavailable here. Select and copy the link below manually."); }
  }
  const teamIds=APPLIMON_CATALOG.filter(entry=>profile?.applimons?.some(device=>device.id===entry.id)||(entry.legacyId&&profile?.applianceIds.includes(entry.legacyId))).map(entry=>entry.id);

  return <main className="appliance-scan-page">
    <header className="scan-header"><Link href="/" className="scan-brand">⌂ housemates.</Link><Link href="/demo/home">Back to my home ↗</Link></header>
    <div className="scan-intro"><p className="scan-eyebrow">BUILD YOUR PARTY</p><h1>Find your <em>Applimon.</em></h1><p>Snap it. Check it. Bring it home.</p></div>
    {!ready ? <p role="status">Opening your saved team…</p> : <>
      {!profile && <aside className="scan-context"><strong>No saved world on this browser yet.</strong><p>Scan now. Build a world to save your teammate.</p><Link href="/demo">Build my world →</Link></aside>}
      {received && <section className="scan-transfer-review" aria-label="Review transferred category"><ApplimonSprite id={received}/><div><p className="scan-eyebrow">A CATEGORY ARRIVED / REVIEW REQUIRED</p><h2>{getApplimon(received).name} wants to join.</h2><p>Check the category and specs before adding it.</p><button type="button" onClick={() => beginReview(received)}>Review {getApplimon(received).name} specifications</button><button type="button" className="scan-quiet" onClick={() => setReceived(null)}>Dismiss</button></div></section>}
      <div className={`scan-workspace${editing?" is-reviewing":""}${reveal?" is-revealing":""}`}><div>
        {reveal?<ApplimonReveal id={reveal} photoUrl={scanPhoto?.url} state="confirmed" continueLabel="Keep recruiting" label={`${getApplimon(reveal).name} is on your team!`} onContinue={()=>{setReveal(null);rememberPhoto(null);setNotice("");}}/>:editing?<ApplimonSpecCapture key={editing} initialId={editing} initialDevice={profile?.applimons?.find(device=>device.id===editing)} onConfirm={confirm} onCancel={()=>{setEditing(null);rememberPhoto(null);setNotice("");}}/>:<>
          <div className="scan-mode-tabs" aria-label="Recruitment method"><button type="button" aria-pressed={photoSetup} onClick={()=>setPhotoSetup(true)}>▧ Scan an appliance</button><button type="button" aria-pressed={!photoSetup} onClick={()=>{setPhotoSetup(false);rememberPhoto(null);}}>Choose instead</button></div>
          {photoSetup?<ApplianceCapture catalogMode reviewSpecifications onPhotoSelected={rememberPhoto} onConfirm={beginReview} existingIds={teamIds}/>:<section className="scan-catalog" aria-label="Choose an Applimon category"><h2>Who’s joining?</h2><div>{APPLIMON_CATALOG.map(entry=><button type="button" key={entry.id} onClick={()=>{rememberPhoto(null);beginReview(entry.id);}}><ApplimonSprite id={entry.id}/><span><strong>{entry.name}</strong><small>{entry.category}</small><em>{teamIds.includes(entry.id)?"Edit specs":entry.schedulingPolicy==="flexible"?"Flexible":entry.schedulingPolicy==="protected"?"Protected":"Fixed routine"}</em></span><b aria-hidden="true">→</b></button>)}</div></section>}
        </>}
        {notice && <p className="scan-notice" role="status">{notice}</p>}</div>
        <aside className="scan-world" aria-label="Recruited household preview"><p className="scan-eyebrow">{profile ? `${getDemoRegion(profile.regionId).city.toUpperCase()} / YOUR TEAM` : "YOUR NEXT TEAMMATE"}</p>
          {profile ? <><div className="scan-scene"><HouseholdScene3D selected={selected} onSelect={setSelected} hour={14} scrollProgress={.5} regionTheme={getDemoRegion(profile.regionId).theme} residenceType={profile.residenceType} visibleAppliances={profile.applianceIds} additionalApplimons={profile.applimons?.filter(device=>!getApplimon(device.id).legacyId).map(device=>device.id)} activeIds={[]}/></div><div className="scan-team">{teamIds.map(id=><span key={id}><ApplimonSprite id={id}/>{getApplimon(id).name}</span>)}</div></> : <div className="scan-awaiting"><ApplimonSprite id={confirmed??"evie"}/><p>Your next teammate is waiting.</p></div>}
          {saved && <Link href="/demo/home" className="scan-primary-link">See my updated home →</Link>}
          {confirmed && <details className="scan-handoff"><summary>Move this category to another device</summary><p>Open the link there, then review its specs. Photos and household data stay here.</p><label htmlFor="scan-share-url">Category transfer link</label><input id="scan-share-url" value={shareUrl} readOnly onFocus={event=>event.target.select()}/><button type="button" onClick={copyLink}>Copy transfer link</button>{copyNotice&&<p role="status">{copyNotice}</p>}<p className="scan-small">Use a reachable app address on your phone. Localhost only works on this computer.</p></details>}
        </aside>
      </div>
      <footer className="scan-footer"><p>Photos stay on your device · Review every match · No device control</p><details><summary>How estimates work</summary><p>Photo matches suggest categories, not verified identity or watts. Read the label and review the inputs. Rated power × duration is an estimate; cycle energy is better when available. Only a separate approval starts a simulation.</p></details></footer>
    </>}
  </main>;
}
