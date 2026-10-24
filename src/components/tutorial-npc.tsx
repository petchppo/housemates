"use client";

import { useId, useState } from "react";
import type { ApplianceId } from "@/domain/appliances";
import type { RegionId, ResidenceType } from "@/data/demo-regions";
import { getTutorialChapter, type TutorialChapter, type TutorialTarget } from "@/data/tutorial-dialogue";
import { GuideMascot } from "./guide-mascot";
import "./tutorial-npc.css";
export type { TutorialTarget } from "@/data/tutorial-dialogue";

type TutorialNpcProps = {
  step: number;
  regionId: RegionId;
  residenceType: ResidenceType;
  applianceIds: readonly ApplianceId[];
  onNavigate: (target: TutorialTarget) => void;
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

export function TutorialNpc({ onNavigate, ...context }: TutorialNpcProps) {
  const [minimized, setMinimized] = useState(false);
  const uid = useId();
  const chapter = getTutorialChapter(context);
  const contextKey = `${chapter.index}:${context.regionId}:${context.residenceType}:${[...context.applianceIds].sort().join(",")}`;
  return <section className={`hm-tutorial-npc${minimized ? " is-minimized" : ""}`} aria-labelledby={`${uid}-name`}>
    <header className="hm-tutorial-header"><div><span className="hm-tutorial-nameplate" id={`${uid}-name`}>PIP <span aria-hidden="true">✦</span></span><span className="hm-tutorial-subtitle">Your builder’s field guide</span></div><button type="button" aria-expanded={!minimized} aria-controls={`${uid}-dialogue`} onClick={() => setMinimized(value => !value)}>{minimized ? "Open guide +" : "Minimize −"}</button></header>
    <div id={`${uid}-dialogue`} hidden={minimized}><div className="hm-tutorial-chapter"><span>CHAPTER {String(chapter.index + 1).padStart(2, "0")} / 05</span><div aria-label={`Setup chapter ${chapter.index + 1} of 5`}>{Array.from({ length: 5 }, (_, index) => <i key={index} className={index <= chapter.index ? "is-filled" : ""} aria-hidden="true"/>)}</div></div><div className="hm-tutorial-reading"><div className="hm-tutorial-portrait"><GuideMascot mood={chapter.index === 4 ? "celebrate" : chapter.index === 2 ? "thinking" : "welcome"}/><span aria-hidden="true">FIELD GUIDE / 01</span></div><GuideDialogue key={contextKey} chapter={chapter} onNavigate={onNavigate}/></div><p className="hm-tutorial-note">Written guidance · explore freely · no live chat API</p></div>
  </section>;
}
