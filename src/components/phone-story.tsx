"use client";

import { useState, type CSSProperties } from "react";
import { PixelAppliance } from "./pixel-appliance";
import { ScrollStage } from "./scroll-stage";
import "./phone-story.css";

const messages = [
  { id: "you", name: "You", text: "Can we find a better time for the chores?" },
  { id: "evie", name: "Evie", text: "I can wait. Let’s find a charging window before your morning drive." },
  { id: "bubbles", name: "Bubbles", text: "I’ll take the quiet evening shift. Teamwork makes the dishes work!" },
  { id: "chill", name: "Chill", text: "And comfort stays protected. Always." },
] as const;

function PhoneSequence({ progress }: { progress: number }) {
  const [manualStep, setManualStep] = useState<number | null>(null);
  const scrollStep = progress < .13 ? 0 : progress < .35 ? 1 : progress < .56 ? 2 : progress < .77 ? 3 : 4;
  const visible = manualStep ?? scrollStep;
  return <div className="hm-phone-story-content">
    <header className="hm-phone-story-heading"><p>PART 02 / THE HOME TEAM</p><h2>A little coordination.<br/><em>A happier home.</em></h2><span>Demo conversation · AI connection pending</span></header>
    <div className="hm-phone-story-view" style={{ "--phone-turn": `${-9 + progress * 12}deg`, "--phone-tilt": `${4 - progress * 5}deg` } as CSSProperties}>
      <div className="hm-story-phone">
        <div className="hm-story-phone-side" aria-hidden="true"/>
        <div className="hm-story-phone-screen">
          <div className="hm-story-status" aria-hidden="true"><span>9:41</span><i/><span>▮▮▮ ▰</span></div>
          <div className="hm-story-chat-header"><span aria-hidden="true">⌂</span><div><h3>The home team</h3><p>Evie, Bubbles, Chill & you</p></div><b aria-hidden="true">•••</b></div>
          <div className="hm-story-messages" aria-label="Sample household conversation">
            {visible === 0 && <div className="hm-story-empty"><span aria-hidden="true">✧</span><p>Your housemates are here.</p><small>Scroll or choose Next message.</small></div>}
            {messages.map((message, index) => <div key={message.id} className={`hm-story-message hm-story-message-${message.id}${visible > index ? " is-visible" : ""}`} aria-hidden={visible <= index}>
              {message.id !== "you" && <span className="hm-story-portrait"><PixelAppliance id={message.id}/></span>}
              <div><span className="hm-story-sender">{message.name}</span><p>{message.text}</p></div>
            </div>)}
          </div>
          <div className="hm-story-input" aria-hidden="true"><span>Message your home…</span><b>↑</b></div>
          <div className="hm-story-homebar" aria-hidden="true"/>
        </div>
      </div>
    </div>
    <div className="hm-phone-story-controls">
      <div className="hm-phone-story-progress" aria-label={`${visible} of 4 messages visible`}>{messages.map((message, index) => <span key={message.id} className={visible > index ? "is-filled" : ""} aria-hidden="true"/>)}</div>
      <div className="hm-phone-story-buttons"><button type="button" disabled={visible === 4} onClick={() => setManualStep(Math.min(4, visible + 1))}>Next message <span aria-hidden="true">→</span></button><button type="button" disabled={visible === 4} onClick={() => setManualStep(4)}>Show all</button><button type="button" onClick={() => setManualStep(0)}>Restart</button>{manualStep !== null && <button type="button" onClick={() => setManualStep(null)}>Follow scroll</button>}</div>
      <p role="status" className="hm-phone-story-announcement">{manualStep !== null ? `${visible} of 4 messages. ${visible ? `${messages[visible - 1].name}: ${messages[visible - 1].text}` : "Conversation restarted. Choose Next message."}` : ""}</p>
    </div>
  </div>;
}

export function PhoneStory() {
  return <ScrollStage label="Housemates phone conversation" className="hm-phone-story" travel={1.05}>{progress => <PhoneSequence progress={progress}/>}</ScrollStage>;
}
