"use client";

import { useId, useState, type FormEvent } from "react";
import "./household-world.css";

type Character = "evie" | "bubbles" | "chill";
const characters = {
  evie: { name: "Evie", role: "THE EARLY BIRD", color: "lime", line: "Big plans. Small footprint.", description: "An ambitious little EV with a morning deadline and a soft spot for a smarter charging window." },
  bubbles: { name: "Bubbles", role: "THE TEAM PLAYER", color: "peach", line: "Good things come to those who rinse.", description: "A cheerful dishwasher who can shift the chores around your day. One uninterrupted cycle, plenty of personality." },
  chill: { name: "Chill", role: "THE COMFORT KEEPER", color: "blue", line: "Let’s keep our cool.", description: "Your calm AC companion. Comfort is protected: Chill is not optimized or counted in estimated savings." },
} as const;

function CharacterSprite({ character, small = false }: { character: Character; small?: boolean }) {
  return <svg viewBox="0 0 160 140" fill="none" aria-hidden="true" className={`hw-sprite${small ? " hw-sprite-small" : ""}`}>
    {character === "evie" ? <>
      <ellipse cx="81" cy="121" rx="64" ry="12" fill="#282136" opacity=".12"/>
      <path d="m24 80 53-31 64 29-53 33z" fill="#7d9b5c" stroke="#282136" strokeWidth="2.5"/>
      <path d="m24 80 64 31v19l-64-31z" fill="#d8ee91" stroke="#282136" strokeWidth="2.5"/>
      <path d="m88 111 53-33v20l-53 32z" fill="#9fb965" stroke="#282136" strokeWidth="2.5"/>
      <path d="m45 68 20-31 39 18 15 35-31 18z" fill="#e5f4b2" stroke="#282136" strokeWidth="2.5"/>
      <path d="m65 37 24-14 40 19-25 13z" fill="#f0f7d3" stroke="#282136" strokeWidth="2.5"/>
      <path d="m104 55 25-13 12 36-22 12z" fill="#b9d17e" stroke="#282136" strokeWidth="2.5"/>
      <path d="m66 44 32 15 9 26-54-25z" fill="#536272" stroke="#282136" strokeWidth="2"/>
      <path d="m109 58 17-10 8 26-18 11z" fill="#7a969d" stroke="#282136" strokeWidth="2"/>
      <path d="m28 86 14 7v8l-14-7zm35 17 14 7v8l-14-7z" fill="#fff8d4"/>
      <path d="m47 103 8 4" stroke="#282136" strokeWidth="3" strokeLinecap="round"/>
      <ellipse cx="43" cy="110" rx="8" ry="12" fill="#282136" transform="rotate(-22 43 110)"/>
      <ellipse cx="119" cy="109" rx="8" ry="12" fill="#282136" transform="rotate(22 119 109)"/>
      <path d="m64 57 1 7m18 0 1 7" stroke="#f7f4eb" strokeWidth="4" strokeLinecap="round"/>
      <path d="m77 89 5-6-1 7 5 2-7 7 2-8z" fill="#648143"/>
    </> : character === "bubbles" ? <>
      <ellipse cx="81" cy="126" rx="46" ry="10" fill="#282136" opacity=".12"/>
      <path d="m38 35 26-15 60 28-27 16z" fill="#ffdfcf" stroke="#282136" strokeWidth="2.5"/>
      <path d="m38 35 59 29v65l-59-29z" fill="#f4b89e" stroke="#282136" strokeWidth="2.5"/>
      <path d="m97 64 27-16v65l-27 16z" fill="#d9927e" stroke="#282136" strokeWidth="2.5"/>
      <path d="m45 55 43 21v43l-43-21z" fill="#ffe7d5" stroke="#282136" strokeWidth="2"/>
      <path d="m38 49 59 29m-49-32 4 2m5 2 4 2m10 5 13 6" stroke="#282136" strokeWidth="2" strokeLinecap="round"/>
      <ellipse cx="67" cy="86" rx="15" ry="19" fill="#f7f4eb" stroke="#b97e70" strokeWidth="2" transform="rotate(-24 67 86)"/>
      <path d="m59 81 1 4m13 3 1 4m-12 2 7 3" stroke="#282136" strokeWidth="2.5" strokeLinecap="round"/>
      <path d="m102 83 17-10m-17 17 17-10" stroke="#b77b6d" strokeWidth="2"/>
      <circle cx="118" cy="26" r="8" fill="#f7f4eb" stroke="#b0b7cb" strokeWidth="2"/>
      <circle cx="137" cy="10" r="5" fill="#e1eff0" stroke="#b0b7cb" strokeWidth="2"/>
      <path d="m47 107-2 10m39 6-1 11" stroke="#282136" strokeWidth="5" strokeLinecap="round"/>
    </> : <>
      <ellipse cx="80" cy="121" rx="49" ry="10" fill="#282136" opacity=".12"/>
      <path d="m29 49 33-20 69 32-34 21z" fill="#e5f3f3" stroke="#282136" strokeWidth="2.5"/>
      <path d="m29 49 68 33v43l-68-33z" fill="#cee6ed" stroke="#282136" strokeWidth="2.5"/>
      <path d="m97 82 34-21v43l-34 21z" fill="#9bc2ce" stroke="#282136" strokeWidth="2.5"/>
      <path d="m38 81 49 24m-49-17 49 24" stroke="#7296a5" strokeWidth="3"/>
      <path d="m49 72 1 4m23 8 1 4m-18-5 8 4" stroke="#282136" strokeWidth="3" strokeLinecap="round"/>
      <path d="m105 86 18-11m-18 19 18-11m-18 19 18-11" stroke="#7296a5" strokeWidth="2"/>
      <path d="m44 107-3 13m18-7-2 17m19-9-1 15" stroke="#8eb9c5" strokeWidth="3" strokeLinecap="round"/>
      <path d="M68 16v12m-6-6h12m35-13v10m-5-5h10" stroke="#93bdc8" strokeWidth="2"/>
    </>}
  </svg>;
}

function Tree({ x, y, scale = 1, pink = false }: { x: number; y: number; scale?: number; pink?: boolean }) {
  return <g transform={`translate(${x} ${y}) scale(${scale})`}>
    <ellipse cx="0" cy="9" rx="24" ry="10" fill="#282136" opacity=".1"/>
    <path d="m-4-29 9-4v44l-9-4z" fill="#927772"/>
    <path d="m0-92-32 53 32 17 33-18z" fill={pink ? "#d9a4b6" : "#8aaa69"}/>
    <path d="M0-92v70l33-18z" fill={pink ? "#be8ca7" : "#668b5b"}/>
    <path d="m0-116-27 44 27 14 28-15z" fill={pink ? "#ebc0ca" : "#a8c482"}/>
    <path d="M0-116v58l28-15z" fill={pink ? "#d5a4bc" : "#7c9f68"}/>
  </g>;
}

function HomeLandscape({ dusk }: { dusk: boolean }) {
  const uid = useId().replace(/:/g, "");
  return <svg className="hw-landscape" viewBox="0 0 960 500" fill="none" aria-hidden="true">
    <defs><linearGradient id={`sky-${uid}`} x1="480" y1="0" x2="480" y2="500" gradientUnits="userSpaceOnUse"><stop stopColor={dusk ? "#d7c9ef" : "#e8efe6"}/><stop offset="1" stopColor={dusk ? "#e8c9bc" : "#f0eedf"}/></linearGradient><pattern id={`ground-${uid}`} width="42" height="24" patternUnits="userSpaceOnUse"><path d="M0 12 21 0l21 12-21 12z" stroke="#879c6c" strokeOpacity=".16"/></pattern></defs>
    <path d="M0 0h960v500H0z" fill={`url(#sky-${uid})`}/>
    <g className="hw-cloud hw-cloud-one" fill="#fffdf4" opacity=".9"><path d="M151 90h31V78h43v12h32v17H151z"/><path d="M684 84h21V71h35v13h32v16h-88z"/></g>
    <g className="hw-cloud hw-cloud-two" fill="#fffdf4" opacity=".65"><path d="M800 158h21v-11h33v11h24v14h-78z"/><path d="M58 196h32v-13h32v13h19v13H58z"/></g>
    <circle cx="803" cy="63" r="22" fill={dusk ? "#f4b89e" : "#e8d79a"}/>
    <path d="m163 371 337-171 308 163-328 116z" fill="#282136" opacity=".07"/>
    <path d="m116 285 352-177 377 181v26L493 491 116 311z" fill="#9b9c77" stroke="#56654c" strokeWidth="2"/>
    <path d="m116 285 352-177 377 181-352 177z" fill="#bdce9b" stroke="#718c5c" strokeWidth="2"/>
    <path d="m116 285 352-177 377 181-352 177z" fill={`url(#ground-${uid})`}/>
    <path d="m493 466 352-177v26L493 491z" fill="#7d9165"/>
    <path d="m116 311 377 180v-25L116 285z" fill="#a8b387"/>
    <path d="m389 411 37 18 227-114-36-19z" fill="#eee8d9"/>
    <path d="m465 310-123-61-57 29 123 61z" fill="#e4dfcf"/>
    <path d="m304 287 123 60m-99-73 122 61m-49 83 227-115m-209 124 226-114" stroke="#cac7b4" strokeWidth="2"/>
    <path d="m535 373 73 35 107-54-72-35z" fill="#d1bbac" stroke="#b19e92" strokeWidth="2"/>
    <path d="m550 372 94-47m-73 57 93-47m-73 57 93-47" stroke="#bba79a" strokeWidth="2"/>
    <Tree x={211} y={251} scale={.92}/><Tree x={684} y={235} scale={.76}/><Tree x={743} y={275} scale={.88} pink/>
    <path d="m312 207 157-80 169 83v120l-157 81-169-84z" fill="#f7f0dd" stroke="#6b5b6f" strokeWidth="2.5"/>
    <path d="m481 292 157-82v120l-157 81z" fill="#ded6d0" stroke="#6b5b6f" strokeWidth="2.5"/>
    <path d="m312 207 169 85v119l-169-84z" fill="#f7f0dd" stroke="#6b5b6f" strokeWidth="2.5"/>
    <path d="m293 209 165-84 44-79 161 82-25 94-157 82z" fill="#b09ec4" stroke="#574761" strokeWidth="2.5"/>
    <path d="m293 209 165-84 180 97-157 82z" fill="#c4b3d5" stroke="#574761" strokeWidth="2.5"/>
    <path d="m458 125 44-79 161 82-25 94z" fill="#93819e" stroke="#574761" strokeWidth="2.5"/>
    <path d="m322 208 163 80m-130-97 163 80m-129-97 162 80m-128-98 162 81m-128-97 162 80" stroke="#a490b7" strokeWidth="2"/>
    <path d="m515 74 34 16v-49l-34-16z" fill="#d1c0bd" stroke="#6b5b6f" strokeWidth="2"/>
    <path d="m549 90 19-10V31l-19 10z" fill="#aa969d" stroke="#6b5b6f" strokeWidth="2"/>
    <path d="m515 25 20-10 33 16-19 10z" fill="#efe5d4" stroke="#6b5b6f" strokeWidth="2"/>
    <path d="m354 197 58-29 102 50-57 29z" fill="#4c4a66" stroke="#302e48" strokeWidth="2"/>
    <path d="m374 186 103 51m-82-62 103 52m-115-27 58-29m-37 39 59-29m-38 39 59-29" stroke="#9199b4" strokeWidth="1.5"/>
    <path d="m338 252 48 24v48l-48-24z" fill={dusk ? "#f0ce8a" : "#b8d4d7"} stroke="#6b5b6f" strokeWidth="3"/>
    <path d="m362 264v48m-24-36 48 24" stroke="#f7f0dd" strokeWidth="4"/>
    <path d="m414 292 38 19v85l-38-19z" fill="#afbb8b" stroke="#6b5b6f" strokeWidth="2.5"/>
    <path d="m423 307 21 11v29l-21-11z" fill="#dfe4c5"/><path d="m443 359v7" stroke="#574761" strokeWidth="3"/>
    <path d="m523 285 72-38v44l-72 38z" fill={dusk ? "#e6bc7e" : "#a4bec9"} stroke="#6b5b6f" strokeWidth="3"/>
    <path d="m547 273v43m24-56v43m-48-3 72-38" stroke="#e9e5dc" strokeWidth="3"/>
    <path d="m421 396 29 15 29-15-28-14z" fill="#c6b2a4" stroke="#aa9990" strokeWidth="2"/>
    <g className="hw-spark" stroke="#e8f3b2" strokeWidth="4"><path d="M584 39v17m-8-9h16m-365 71v13m-6-7h12"/></g>
    <Tree x={174} y={333} scale={.7} pink/><Tree x={779} y={333} scale={.68}/>
    <g fill="#f3dfac"><path d="m279 361 7-4 7 4-7 4zm12 11 6-3 6 3-6 3zm427-79 7-4 7 4-7 4z"/></g>
    <g stroke="#7d9b5c" strokeWidth="3"><path d="m263 335 4-8 4 8m405 42 4-8 4 8m-170 59 4-8 4 8m-264-143 4-8 4 8"/></g>
    <path d="m661 397 13 6v-31l-13-6z" fill="#a48783"/><path d="m650 367 26-13 30 15-26 13z" fill="#d9a4b6" stroke="#6b5b6f" strokeWidth="2"/><path d="m650 367 30 15v15l-30-15z" fill="#ebc0ca" stroke="#6b5b6f" strokeWidth="2"/><path d="m680 382 26-13v15l-26 13z" fill="#be8ca7" stroke="#6b5b6f" strokeWidth="2"/>
    <path d="m665 378 9 5" stroke="#6b5b6f" strokeWidth="2"/>
  </svg>;
}

export function HouseholdWorld({ onAction, onInspect }: { onAction: (text: string) => void; onInspect: () => void }) {
  const [selected, setSelected] = useState<Character>("evie");
  const [dusk, setDusk] = useState(false);
  const [draft, setDraft] = useState("");
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const active = characters[selected];
  function submitPreview(event: FormEvent) {
    event.preventDefault();
    if (!draft.trim()) return;
    setSubmitted(draft.trim().slice(0, 500));
    setDraft("");
  }
  function runScenario(text: string, description: string) {
    onAction(text);
    setNotice(`${description} sent to the working local planner. Inspect the computed plan below.`);
  }
  return <section className="hw-world" aria-label="Interactive simulated household">
    <div className={`hw-scene ${dusk ? "hw-scene-dusk" : ""}`}>
      <HomeLandscape dusk={dusk}/>
      <div className="hw-world-hud"><span><i aria-hidden="true"/> HOME / 01</span><span>SIMULATED WORLD</span></div>
      <button className="hw-time-toggle" type="button" onClick={() => setDusk(value => !value)} aria-label={dusk ? "Show daytime scene" : "Show dusk scene"}>{dusk ? "☾ DUSK" : "☀ DAY"}<span aria-hidden="true">↻</span></button>
      {(["evie", "bubbles", "chill"] as const).map(character => <button type="button" key={character} className={`hw-character hw-character-${character}${selected === character ? " is-selected" : ""}`} aria-label={`Meet ${characters[character].name}`} aria-pressed={selected === character} onClick={() => setSelected(character)}>
        <span className="hw-selection-marker" aria-hidden="true">▼</span><CharacterSprite character={character}/><span className="hw-character-label">{characters[character].name}<span aria-hidden="true">↗</span></span>
      </button>)}
      <div className="hw-scene-caption"><span aria-hidden="true">✦</span> A small home. A shared adventure.</div>
      <div className="hw-scene-hint"><span aria-hidden="true">↖</span> SELECT A HOUSEMATE</div>
    </div>
    <div className="hw-dialogue">
      <div className={`hw-dialogue-portrait hw-color-${active.color}`}><CharacterSprite character={selected} small/></div>
      <div className="hw-dialogue-copy" key={selected}><p className="hw-micro">{active.name.toUpperCase()} <span>/ {active.role}</span></p><h3>{active.line}</h3><p>{active.description}</p></div>
      <span className="hw-dialogue-caret" aria-hidden="true">▼</span>
    </div>
    <div className="hw-preview-composer">
      <div className="hw-composer-heading"><label htmlFor="household-preview-message">What would you tell your housemates?</label><span>API NOT CONNECTED</span></div>
      <form onSubmit={submitPreview} className="hw-input-row"><input id="household-preview-message" value={draft} onChange={event => setDraft(event.target.value)} placeholder="“Let’s make tomorrow a little greener…”" maxLength={500}/><button type="submit" disabled={!draft.trim()} aria-label="Preview message">↗</button></form>
      {submitted ? <div className="hw-api-placeholder" role="status"><p><strong>Your preview:</strong> {submitted}</p><p><span aria-hidden="true">◇</span> Reply placeholder — the AI API is not connected yet. This message stays in this page’s preview and does not change your schedule.</p></div> : <p className="hw-composer-footnote">Try the interaction. AI replies will appear here once an API is connected.</p>}
    </div>
    <div className="hw-simulation-controls">
      <div className="hw-simulation-heading"><span className="hw-micro">THE REAL MATH, UNDER THE HOOD</span><span>LOCAL SIMULATION</span></div>
      <p>These demo controls run the working deterministic planner using synthetic energy data.</p>
      <div className="hw-action-row"><button type="button" onClick={() => runScenario("I need my EV charged by 7 AM and my dishes finished before breakfast. Minimize my energy costs.", "Morning scenario")}><span>01</span> Plan the morning <b aria-hidden="true">↗</b></button><button type="button" onClick={() => runScenario("I don't want the dishwasher running after 10 PM.", "Dishwasher cutoff")}><span>02</span> Set a quiet evening <b aria-hidden="true">↗</b></button><button type="button" className="hw-inspect-button" onClick={onInspect}>Inspect the math <b aria-hidden="true">→</b></button></div>
      {notice && <p className="hw-scenario-notice" role="status">{notice}</p>}
    </div>
  </section>;
}

export function PhonePreview() {
  const [straight, setStraight] = useState(false);
  return <div className={`hw-phone-stage ${straight ? "hw-phone-straight" : ""}`}>
    <div className="hw-phone-decoration hw-phone-star" aria-hidden="true">✳</div><span className="hw-phone-decoration hw-phone-diamond" aria-hidden="true">◇</span>
    <div className="hw-phone-shadow"/>
    <div className="hw-phone" aria-label="Scripted sample conversation inside a three-dimensional phone illustration">
      <div className="hw-phone-screen">
        <div className="hw-phone-status"><span>9:41</span><span aria-hidden="true">▮▮▮ ▰</span></div><div className="hw-phone-island" aria-hidden="true"/>
        <div className="hw-phone-header"><span className="hw-phone-back" aria-hidden="true">‹</span><div className="hw-phone-house-icon" aria-hidden="true">⌂</div><div><strong>The home team</strong><p>Evie, Bubbles, Chill & you</p></div></div>
        <div className="hw-phone-sample-label">SCRIPTED PREVIEW · NOT LIVE</div>
        <div className="hw-phone-messages">
          <div className="hw-phone-user">A better time for chores?<span>You</span></div>
          <div className="hw-phone-message hw-phone-message-evie"><div className="hw-phone-avatar"><CharacterSprite character="evie" small/></div><div><strong>Evie</strong><p>I can wait. Morning deadline comes first. <span aria-hidden="true">↗</span></p></div></div>
          <div className="hw-phone-message hw-phone-message-bubbles"><div className="hw-phone-avatar"><CharacterSprite character="bubbles" small/></div><div><strong>Bubbles</strong><p>Teamwork makes the dishes work. I’m in!</p></div></div>
          <div className="hw-phone-message hw-phone-message-chill"><div className="hw-phone-avatar"><CharacterSprite character="chill" small/></div><div><strong>Chill</strong><p>And comfort stays on the agenda. Always.</p></div></div>
          <div className="hw-phone-system"><span aria-hidden="true">✧</span> A little coordination goes a long way.</div>
        </div>
        <div className="hw-phone-input"><span>Message your home…</span><b aria-hidden="true">↑</b></div><div className="hw-phone-home-indicator" aria-hidden="true"/>
      </div>
    </div>
    <div className="hw-phone-caption"><span className="hw-micro">YOUR FUTURE GROUP CHAT</span><p>Less appliance management.<br/>More household harmony.</p><button type="button" onClick={() => setStraight(value => !value)}>{straight ? "Give it a little dimension" : "View straight on"} <span aria-hidden="true">↗</span></button></div>
  </div>;
}
