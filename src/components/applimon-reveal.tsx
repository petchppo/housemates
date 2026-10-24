"use client";

/* Browser-owned local photos stay out of image services. The caller owns URL cleanup. */
/* eslint-disable @next/next/no-img-element */
import { getApplimon, type ApplimonId } from "@/domain/applimon-catalog";
import { ApplimonSprite } from "./applimon-sprite";
import "./applimon-reveal.css";

type Props = { id: ApplimonId; photoUrl?: string; state: "candidate" | "confirmed"; onContinue?: () => void; label?: string; continueLabel?: string };

/** Cosmetic reveal only. A parent supplies an actual candidate or a completed recruitment. */
export function ApplimonReveal({ id, photoUrl, state, onContinue, label, continueLabel }: Props) {
  const entry = getApplimon(id);
  return <section className={`applimon-reveal is-${state}`} aria-label={`${entry.name}: ${state === "confirmed" ? "recruited" : "category to review"}`}>
    <div className="applimon-reveal-stage" key={`${id}-${state}-${photoUrl ?? "manual"}`} aria-hidden="true">
      <div className="applimon-reveal-grid"/>
      {photoUrl && <img className="applimon-reveal-photo" src={photoUrl} alt=""/>}
      <div className="applimon-reveal-orbit"/>
      <div className="applimon-reveal-sprite"><ApplimonSprite id={id}/></div>
      <span className="applimon-reveal-spark spark-one">✦</span><span className="applimon-reveal-spark spark-two">✧</span>
      <span className="applimon-reveal-spark spark-three">+</span>
    </div>
    <div className="applimon-reveal-caption"><p>{state === "confirmed" ? "PARTY READY" : "MEET YOUR POSSIBLE TEAMMATE"}</p><h3>{entry.name}<span>{entry.category}</span></h3><p className="applimon-reveal-note">{label ?? (state === "confirmed" ? "Added to your simulated home." : "Check the category. You make the final call.")}</p></div>
    {onContinue && <button type="button" onClick={onContinue}>{continueLabel ?? (state === "confirmed" ? "Meet my team" : "Use this category")} <span aria-hidden="true">→</span></button>}
  </section>;
}
