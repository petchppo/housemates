"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { ApplianceId } from "@/domain/appliances";
import type { RegionId, ResidenceType } from "@/data/demo-regions";
import { getTutorialChapter, getTutorialPrompt, type TutorialChapter, type TutorialTarget } from "@/data/tutorial-dialogue";
import { GuideMascot } from "./guide-mascot";
import "./tutorial-npc.css";
export type { TutorialTarget } from "@/data/tutorial-dialogue";

type TutorialNpcProps = {
  step: number;
  regionId: RegionId;
  residenceType: ResidenceType;
  applianceIds: readonly ApplianceId[];
  onNavigate: (target: TutorialTarget) => void;
  onAdvance?: () => void;
  canAdvance?: boolean;
  completed?: boolean;
};

function GuideDialogue({ chapter, onNavigate }: { chapter: TutorialChapter; onNavigate: TutorialNpcProps["onNavigate"] }) {
  const [topicId, setTopicId] = useState<string | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  const activeTopic = chapter.topics.find(topic => topic.id === topicId);
  const pages = activeTopic?.pages ?? chapter.pages;
  const page = pages[Math.min(pageIndex, pages.length - 1)];
  function turn(index: number) {
    const next = Math.max(0, Math.min(pages.length - 1, index));
    setPageIndex(next);
    setAnnouncement(`Guide page ${next + 1} of ${pages.length}. ${pages[next].title}. ${pages[next].text}`);
  }
  function chooseTopic(id: string | null) {
    const topic = chapter.topics.find(value => value.id === id);
    const first = (topic?.pages ?? chapter.pages)[0];
    setTopicId(id); setPageIndex(0);
    setAnnouncement(`${topic?.label ?? "Chapter guide"}. ${first.title}. ${first.text}`);
  }
  return <div className="hm-tutorial-dialogue">
    <div className="hm-tutorial-body">
      <div className="hm-tutorial-copy"><span className="hm-tutorial-topic">{activeTopic?.label ?? chapter.name}</span><h3>{page.title}</h3><p>{page.text}</p></div>
    </div>
    <div className="hm-tutorial-controls"><div className="hm-tutorial-paging"><button type="button" disabled={pageIndex === 0} onClick={() => turn(pageIndex - 1)} aria-label="Previous guide page">← Back</button><span aria-label={`Guide page ${pageIndex + 1} of ${pages.length}`}>{pageIndex + 1} / {pages.length}</span><button type="button" disabled={pageIndex >= pages.length - 1} onClick={() => turn(pageIndex + 1)} aria-label="Next guide page">Next →</button></div><button type="button" className="hm-tutorial-show" aria-label={page.action} onClick={() => onNavigate(page.target)}>Show me <span aria-hidden="true">↗</span></button></div>
    <details className="hm-tutorial-help"><summary>Ask Pip about…</summary><div>{chapter.topics.map(topic => <button type="button" key={topic.id} aria-pressed={topicId === topic.id} onClick={() => chooseTopic(topic.id)}>{topic.label}</button>)}{activeTopic && <button type="button" className="hm-tutorial-return" onClick={() => chooseTopic(null)}>Return to chapter guide</button>}</div></details>
    <p className="hm-tutorial-live" role="status" aria-live="polite" aria-atomic="true">{announcement}</p>
  </div>;
}

type Box = { left: number; top: number; right: number; bottom: number; width: number; height: number };
type Placement = { left: number; top: number; side: "above" | "below" | "left" | "right" | "edge"; tip: number };

/** Keep the coach beside a visible action. Offscreen actions use a viewport edge. */
export function getCoachmarkPosition(anchor: Box | null, width: number, height: number, viewportWidth: number, viewportHeight: number, exclusions: readonly Box[] = [], preferBelow = false): Placement {
  const pad = 10, gap = 14;
  const clamp = (value: number, maximum: number) => Math.max(pad, Math.min(value, maximum - pad));
  const center = anchor ? (anchor.left + anchor.right) / 2 : viewportWidth - width / 2 - pad;
  const left = clamp(center - width / 2, viewportWidth - width);
  const tip = Math.max(20, Math.min(width - 20, center - left));
  const visibleAnchor = anchor && anchor.bottom > pad && anchor.top < viewportHeight - pad;
  const candidates: Placement[] = [];
  if (visibleAnchor) {
    const above: Placement = { left, top: anchor.top - height - gap, side: "above", tip };
    const below: Placement = { left, top: anchor.bottom + gap, side: "below", tip };
    candidates.push(...(preferBelow ? [below, above] : [above, below]),
      { left: anchor.left - width - gap, top: clamp(anchor.top, viewportHeight - height), side: "left", tip: 30 },
      { left: anchor.right + gap, top: clamp(anchor.top, viewportHeight - height), side: "right", tip: 30 });
  }
  // Camera controls remain reachable even while the primary target scrolls offscreen.
  for (const box of exclusions) candidates.push(
    { left, top: box.top - height - gap, side: "edge", tip },
    { left, top: box.bottom + gap, side: "edge", tip });
  const right = clamp(viewportWidth - width - pad, viewportWidth - width);
  const bottom = clamp(viewportHeight - height - pad, viewportHeight - height);
  candidates.push({ left: right, top: bottom, side: "edge", tip }, { left: right, top: pad, side: "edge", tip },
    { left: pad, top: bottom, side: "edge", tip }, { left: pad, top: pad, side: "edge", tip });
  const obstacles = [...exclusions, ...(visibleAnchor ? [anchor] : [])];
  const intersects = (position: Placement, box: Box) => position.left < box.right && position.left + width > box.left && position.top < box.bottom && position.top + height > box.top;
  return candidates.find(position => position.left >= pad && position.top >= pad && position.left + width <= viewportWidth - pad && position.top + height <= viewportHeight - pad && obstacles.every(box => !intersects(position, box)))
    ?? { left: right, top: bottom, side: "edge", tip };
}

const subscribe = () => () => {};
const mountedSnapshot = () => true;
const serverSnapshot = () => false;

export function TutorialNpc({ onNavigate, onAdvance, canAdvance = true, completed = false, ...context }: TutorialNpcProps) {
  const mounted = useSyncExternalStore(subscribe, mountedSnapshot, serverSnapshot);
  const [minimized, setMinimized] = useState(completed);
  const [help, setHelp] = useState(false);
  const [awayFromHomeControls, setAwayFromHomeControls] = useState(false);
  const [helpHeight, setHelpHeight] = useState(180);
  const [position, setPosition] = useState<Placement | null>(null);
  const coach = useRef<HTMLElement>(null);
  const uid = useId();
  const chapter = getTutorialChapter(context);
  const target = chapter.pages[0].target;
  const anchorId = completed ? "demo-dashboard-clock" : chapter.index === 4 ? "demo-enter-home" : "demo-next-action";
  const contextKey = `${chapter.index}:${context.regionId}:${context.residenceType}:${[...context.applianceIds].sort().join(",")}`;
  useEffect(() => {
    if (!mounted) return;
    let frame = 0;
    const anchor = document.getElementById(anchorId) ?? document.getElementById(`demo-${target}-controls`);
    const protectedControls = Array.from(document.querySelectorAll<HTMLElement>(".hm3d-toolbar, #demo-home-objective, .dh-toggle, .apc-composer, .apc-voice-controls, .apc-approval-actions, .dh-run-controls"));
    const update = () => {
      frame = 0;
      const element = coach.current;
      if (!element) return;
      const bounds = element.getBoundingClientRect();
      const viewport = window.visualViewport;
      const viewportHeight = viewport?.height ?? window.innerHeight;
      const viewportWidth = viewport?.width ?? window.innerWidth;
      const anchorBounds = anchor?.getBoundingClientRect() ?? null;
      // Setup guidance stays with the home controls, leaving conversations unobstructed.
      setAwayFromHomeControls(completed && !!anchorBounds && anchorBounds.bottom <= 0);
      const exclusions = Array.from(document.querySelectorAll<HTMLElement>(".hm3d-toolbar, #demo-home-objective, .dh-toggle, .apc-composer, .apc-voice-controls, .apc-approval-actions, .apc-transcript, .dh-run-controls")).map(control => control.getBoundingClientRect()).filter(box => box.bottom > 0 && box.top < viewportHeight && box.width > 0 && box.height > 0);
      if (help) {
        const expanded = element.querySelector<HTMLElement>(".hm-tutorial-expanded");
        const baseHeight = bounds.height - (expanded?.getBoundingClientRect().height ?? 0);
        const visibleAnchor = anchorBounds && anchorBounds.bottom > 10 && anchorBounds.top < viewportHeight - 10;
        const center = anchorBounds ? (anchorBounds.left + anchorBounds.right) / 2 : viewportWidth - bounds.width / 2 - 10;
        const left = Math.max(10, Math.min(center - bounds.width / 2, viewportWidth - bounds.width - 10));
        const obstacles = [...exclusions, ...(visibleAnchor ? [anchorBounds] : [])].filter(box => box.right > left && box.left < left + bounds.width).sort((a, b) => a.top - b.top);
        let cursor = 10, available = 0;
        for (const obstacle of obstacles) {
          available = Math.max(available, obstacle.top - 14 - cursor);
          cursor = Math.max(cursor, obstacle.bottom + 14);
        }
        available = Math.max(available, viewportHeight - 10 - cursor);
        setHelpHeight(Math.max(40, Math.min(250, available - baseHeight - 6)));
      }
      const placement = getCoachmarkPosition(anchorBounds, bounds.width, bounds.height, viewportWidth, viewportHeight, exclusions, completed);
      setPosition(old => old && Object.keys(placement).every(key => old[key as keyof Placement] === placement[key as keyof Placement]) ? old : placement);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    const observer = new ResizeObserver(schedule);
    if (coach.current) observer.observe(coach.current);
    if (anchor) observer.observe(anchor);
    protectedControls.forEach(control => observer.observe(control));
    window.addEventListener("scroll", schedule, { passive: true, capture: true });
    window.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("scroll", schedule);
    schedule();
    return () => {
      cancelAnimationFrame(frame); observer.disconnect();
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("scroll", schedule);
    };
  }, [mounted, anchorId, target, minimized, help, completed]);
  const message = getTutorialPrompt(context, completed);
  if (!mounted) return null;
  return createPortal(<aside ref={coach} className={`hm-tutorial-npc${minimized ? " is-minimized" : ""}`} data-side={position?.side ?? "edge"} style={{ left: position?.left ?? 10, top: position?.top ?? 10, visibility: position && !awayFromHomeControls ? "visible" : "hidden", "--pip-tip": `${position?.tip ?? 40}px`, "--pip-help-height": `${helpHeight}px` } as CSSProperties} aria-label="Pip’s setup guide" onKeyDown={event => {
    if (event.key !== "Escape") return;
    event.preventDefault(); event.stopPropagation();
    if (help) { setHelp(false); coach.current?.querySelector<HTMLButtonElement>(`[aria-controls="${uid}-help"]`)?.focus(); }
    else { setMinimized(true); coach.current?.querySelector<HTMLButtonElement>(`[aria-controls="${uid}-dialogue"]`)?.focus(); }
  }}>
    <div className="hm-tutorial-portrait"><GuideMascot mood={completed || chapter.index === 4 ? "celebrate" : chapter.index === 2 ? "thinking" : "welcome"}/></div>
    <div className="hm-tutorial-bubble">
      <header className="hm-tutorial-header"><span className="hm-tutorial-nameplate">PIP <span aria-hidden="true">✦</span></span><span className="hm-tutorial-step">{completed ? "YOUR FIELD GUIDE" : `${chapter.index + 1} / 5`}</span><button type="button" aria-label={minimized ? "Open Pip’s guide" : "Minimize Pip’s guide"} aria-expanded={!minimized} aria-controls={`${uid}-dialogue`} onClick={() => { setMinimized(value => !value); setHelp(false); }}>{minimized ? "+" : "−"}</button></header>
      <div id={`${uid}-dialogue`} hidden={minimized}>
        <p className="hm-tutorial-prompt">{message}</p>
        <div className="hm-tutorial-actions"><button type="button" className="hm-tutorial-advance" disabled={!completed && !canAdvance} onClick={() => { if (completed) onNavigate("plan"); else if (canAdvance) onAdvance?.(); }}>{completed ? "Show my controls" : chapter.index === 4 ? "Enter my home" : "Next step"}<span aria-hidden="true"> →</span></button><button type="button" aria-expanded={help} aria-controls={`${uid}-help`} onClick={() => setHelp(value => !value)}>{help ? "Less help" : "Help?"}</button></div>
        <div id={`${uid}-help`} className="hm-tutorial-expanded" hidden={!help}><GuideDialogue key={contextKey} chapter={chapter} onNavigate={onNavigate}/><p className="hm-tutorial-note">Written guidance · simulated home</p></div>
      </div>
    </div>
  </aside>, document.body);
}
