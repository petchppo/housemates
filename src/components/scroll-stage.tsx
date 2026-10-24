"use client";

import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import "./scroll-stage.css";

type ScrollStageProps = {
  children: (progress: number) => ReactNode;
  label: string;
  onProgress?: (progress: number, staticMode: boolean) => void;
  className?: string;
  /** Additional viewport lengths of native scroll travel. */
  travel?: number;
};

/** Native sticky storytelling: no wheel/touch cancellation or focus trap. */
export function ScrollStage({ children, label, className = "", travel = 1.15, onProgress }: ScrollStageProps) {
  const outer = useRef<HTMLElement>(null);
  const exit = useRef<HTMLDivElement>(null);
  const exitId = useId();
  const [progress, setProgress] = useState(0);
  const [staticMode, setStaticMode] = useState(false);
  const safeTravel = Number.isFinite(travel) ? Math.min(3, Math.max(.25, travel)) : 1.15;

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce), (max-height: 620px)");
    let frame = 0;
    function measure() {
      frame = 0;
      const element = outer.current;
      if (!element) return;
      const rect = element.getBoundingClientRect();
      const sticky = element.firstElementChild;
      const viewport = sticky?.getBoundingClientRect().height ?? window.innerHeight;
      const distance = Math.max(1, rect.height - viewport);
      setStaticMode(media.matches);
      setProgress(media.matches ? 1 : Math.min(1, Math.max(0, -rect.top / distance)));
    }
    function schedule() {
      if (!frame) frame = window.requestAnimationFrame(measure);
    }
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    media.addEventListener("change", schedule);
    const observer = new ResizeObserver(schedule);
    if (outer.current) observer.observe(outer.current);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      media.removeEventListener("change", schedule);
      observer.disconnect();
    };
  }, []);

  useEffect(() => { onProgress?.(progress, staticMode); }, [onProgress, progress, staticMode]);

  function skip() {
    exit.current?.scrollIntoView({ block: "start", behavior: "instant" });
    exit.current?.focus({ preventScroll: true });
  }

  return <>
    <section ref={outer} aria-label={label} className={`hm-scroll-stage ${className}`} data-static={staticMode} style={{ "--stage-travel": `${safeTravel * 100}svh` } as CSSProperties}>
      <div className="hm-scroll-sticky">
        <button type="button" className="hm-scroll-skip" aria-label={`Skip ${label}`} aria-controls={exitId} onClick={skip}><span>Skip <b aria-hidden="true">↓</b></span></button>
        {children(progress)}
      </div>
    </section>
    <div ref={exit} id={exitId} tabIndex={-1} className="hm-scroll-exit"><span>End of {label}</span></div>
  </>;
}
