"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { ApplianceId } from "@/domain/appliances";
import { buildDemoScenario, DEFAULT_DEMO_PROFILE, formatDemoHour } from "@/domain/demo";
import { advanceDemoExecution, approveDemoCommand, createDemoCommandSession, requestDemoCommand, resetDemoCommandSession, type DemoCommandResult } from "@/domain/demo-commands";
import { suggestionCommand } from "@/domain/dialogue-contract";
import { buildPlanTradeoffs } from "@/domain/plan-tradeoffs";
import type { OptimizationMode } from "@/domain/scheduling";
import { CostCarbonTradeoff } from "./cost-carbon-tradeoff";
import { PixelAppliance } from "./pixel-appliance";
import { useJudgeDialogue } from "./use-judge-dialogue";
import "./judge-demo.css";

const objectives: Record<OptimizationMode, string> = { cost: "Find a cheaper plan", carbon: "Find a lower-carbon plan", balanced: "Make a balanced plan" };
const names = { evie: "Evie", bubbles: "Bubbles", chill: "Chill" };
const explanations = {
  cost: "Cost is computed from each interval’s energy and synthetic USD price. A cheaper plan can have higher modeled emissions.",
  carbon: "Modeled emissions use interval energy and synthetic grid intensity. They are estimates, not measured avoided emissions.",
  tradeoff: "Each point uses the same chores and current constraints. Cost-first and carbon-first can disagree; balanced normalizes both objectives. Some points coincide.",
  approval: "Only the current proposal’s approval button starts a simulated run. A model suggestion, chat message, or chart selection cannot approve it.",
};

/** Isolated session-only workbench: never reads or writes the user's household memory. */
export function JudgeDemo() {
  const scenario = useMemo(() => buildDemoScenario({ ...DEFAULT_DEMO_PROFILE, regionId: "bangkok", applianceIds: ["evie", "bubbles", "chill"], weatherMode: "synthetic" }), []);
  const [session, setSession] = useState(() => createDemoCommandSession(scenario));
  const current = useRef(session);
  const [selected, setSelected] = useState<ApplianceId>("evie");
  const [draft, setDraft] = useState("Find a cheaper plan");
  const [reply, setReply] = useState("Choose an objective or type a request to create a calculated proposal.");
  const [bridge, setBridge] = useState("Not checked. No message is sent by this diagnostic.");
  const [checking, setChecking] = useState(false);
  const bridgeRequest = useRef<AbortController | null>(null);
  const bridgeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const active = session.pending ?? session.approved;
  const assistant = useJudgeDialogue(`${session.contextFingerprint}:${session.nextProposalId}:${session.status}:${selected}`);
  const comparison = useMemo(() => buildPlanTradeoffs({ requests: active?.requests ?? session.requests, energyProfile: scenario.energyProfile }), [active, session.requests, scenario]);
  const mode = active?.mode ?? session.mode;

  useEffect(() => () => {
    bridgeRequest.current?.abort(); bridgeRequest.current = null;
    if (bridgeTimer.current !== null) clearTimeout(bridgeTimer.current);
    bridgeTimer.current = null;
  }, []);
  function commit(result: DemoCommandResult) {
    assistant.clear(); current.current = result.session; setSession(result.session); setReply(result.reply);
  }
  function send(text: string, target = selected) {
    commit(requestDemoCommand(current.current, scenario, target, text));
  }
  function submit(event: FormEvent) { event.preventDefault(); send(draft); }
  function reset() {
    assistant.clear();
    const next = resetDemoCommandSession(current.current, scenario);
    current.current = next; setSession(next);
    setReply("Judge session reset. Your saved household is untouched. No plan is approved.");
  }
  async function checkBridge() {
    bridgeRequest.current?.abort();
    if (bridgeTimer.current !== null) clearTimeout(bridgeTimer.current);
    const abort = new AbortController(); bridgeRequest.current = abort;
    setChecking(true);
    bridgeTimer.current = setTimeout(() => {
      if (bridgeRequest.current !== abort) return;
      abort.abort(); bridgeRequest.current = null; bridgeTimer.current = null;
      setChecking(false); setBridge("Connection check timed out. No message was sent.");
    }, 12_000);
    try {
      const response = await fetch("/api/imessage/preflight", { method: "POST", signal: abort.signal });
      const data: unknown = await response.json();
      if (bridgeRequest.current !== abort || abort.signal.aborted) return;
      const status = data && typeof data === "object" && "status" in data ? data.status : null;
      setBridge(response.ok && status === "reachable"
        ? "BlueBubbles is reachable. Pairing and actual phone receipt have not been verified here."
        : response.ok && status === "unconfigured"
          ? "BlueBubbles is not configured. Add the private server settings before testing reachability."
          : "BlueBubbles could not be verified. Check the server configuration; no message was sent.");
    } catch {
      if (bridgeRequest.current === abort) setBridge("Connection check stopped or timed out. No message was sent.");
    } finally {
      if (bridgeRequest.current === abort) {
        if (bridgeTimer.current !== null) clearTimeout(bridgeTimer.current);
        bridgeTimer.current = null; bridgeRequest.current = null; setChecking(false);
      }
    }
  }
  const suggestion = assistant.suggestion;

  return <main className="jd-shell">
    <nav className="jd-nav" aria-label="Judge demo navigation"><Link href="/">HOUSEMATES</Link><Link href="/demo/home">Your home ↗</Link><Link href="/energy-parliament">Energy lab ↗</Link></nav>
    <header className="jd-hero"><p className="jd-eyebrow">JUDGE WORKBENCH / SYNTHETIC SCENARIO</p><h1>One household.<br />Three ways to plan.</h1><p>Compare cost and modeled carbon, negotiate a deadline, then explicitly approve a simulation.</p><p className="jd-note">Bangkok comparison scenario · USD · EV + dishwasher only. Chill is protected. This session is separate from your saved home and resets on refresh.</p></header>
    <div className="jd-grid">
      <section className="jd-card" aria-labelledby="judge-chat-title">
        <p className="jd-eyebrow">01 / ASK THE CREW</p><h2 id="judge-chat-title">Make your case.</h2>
        <div className="jd-party" aria-label="Choose an appliance">{(["evie", "bubbles", "chill"] as const).map(id => <button key={id} type="button" aria-pressed={selected === id} onClick={() => { assistant.clear(); setSelected(id); }}><PixelAppliance id={id} /><span>{names[id]}</span></button>)}</div>
        <form onSubmit={submit}><label htmlFor="judge-request">Request for {names[selected]}</label><textarea id="judge-request" rows={3} maxLength={1200} value={draft} onChange={event => { assistant.clear(); setDraft(event.target.value); }} /><p className="jd-note" id="judge-ai-disclosure">The local planner uses deterministic rules. Optional AI supports objective suggestions only and requires a configured provider. With OpenAI selected, this text is sent to OpenAI and may incur API usage charges. Photos, audio and saved household data are not sent. Neither path approves a run.</p><div className="jd-actions"><button type="submit" disabled={!draft.trim()}>Use local planner</button><button type="button" className="jd-secondary" aria-describedby="judge-ai-disclosure" disabled={!draft.trim() || assistant.loading || !!session.approved} onClick={() => void assistant.request(draft)}>{assistant.loading ? "Interpreting…" : "Ask optional AI"}</button>{assistant.loading && <button type="button" className="jd-secondary" onClick={assistant.clear}>Cancel AI request</button>}</div></form>

        <div className="jd-actions"><button className="jd-secondary" type="button" disabled={!!session.approved} onClick={() => send("Bubbles finished by 10 PM", "bubbles")}>Try: dishes finished by 10 PM</button></div>
        <div className="jd-reply" role="status"><strong>Calculated planner reply</strong><p>{reply}</p></div>
        {assistant.message && <div className="jd-ai" role="status"><strong>Optional assistant</strong><p>{assistant.message}</p>{suggestion?.kind === "plan" && <><p>Suggested objective: <strong>{suggestion.mode}</strong>. Existing constraints stay in place.</p><button type="button" disabled={!!session.approved} onClick={() => { const command = suggestionCommand(suggestion); if (command) send(command); }}>Use suggestion to create proposal</button></>}{suggestion?.kind === "explain" && <p>{explanations[suggestion.topic]}</p>}{suggestion?.kind === "clarify" && <p>Please request one objective: cheaper, lower-carbon, or balanced. Use the local planner for deadlines and operating windows.</p>}</div>}
      </section>
      <section className="jd-card jd-comparison" aria-labelledby="judge-compare-title"><p className="jd-eyebrow">02 / COMPARE THE MATH</p><h2 id="judge-compare-title">Every point is a real calculation.</h2><CostCarbonTradeoff comparison={comparison} selectedMode={mode} disabled={!!session.approved} onPropose={next => send(objectives[next], "evie")} /></section>
    </div>
    <section className="jd-card jd-execution" aria-labelledby="judge-execution-title"><div><p className="jd-eyebrow">03 / REVIEW & APPROVE</p><h2 id="judge-execution-title">Your simulated run</h2><p role="status">State: <strong>{session.status}</strong> · Clock: {formatDemoHour(session.executionHour)}</p><p className="jd-note">The clock moves only with the explicit advance button here. No background run, devices, audio, or household memory.</p></div><div>{active ? <><p>{active.mode} objective · {session.approved ? "Approved" : "For review"}</p><ul>{active.plan.schedules.map(row => <li key={row.applianceId}>{names[row.applianceId]}: {formatDemoHour(row.startHour)} → {formatDemoHour(row.endHour)}</li>)}</ul>{active.plan.status !== "feasible" && <p role="alert">{active.plan.issues.join(" ")}</p>}</> : <p>No proposal yet. Choose a graph objective or ask the crew.</p>}<div className="jd-actions"><button type="button" disabled={!session.pending || session.pending.plan.status !== "feasible"} onClick={() => { if (session.pending) commit(approveDemoCommand(current.current, scenario, session.pending.id)); }}>Approve current proposal</button><button type="button" className="jd-secondary" disabled={session.status !== "running"} onClick={() => commit(advanceDemoExecution(current.current, scenario, Math.min(48, current.current.executionHour + 1)))}>Advance simulation 1 hour</button><button type="button" className="jd-secondary" onClick={reset}>Reset judge session</button></div></div></section>
    <section className="jd-card jd-bridge" aria-labelledby="judge-bridge-title"><div><p className="jd-eyebrow">OPTIONAL / MESSAGE TRANSPORT</p><h2 id="judge-bridge-title">BlueBubbles connection check</h2><p className="jd-note">Checks the configured Mac bridge only. Pairing and real-message verification belong to the Messages card in your home.</p></div><div><p role="status">{bridge}</p><button type="button" disabled={checking} onClick={() => void checkBridge()}>{checking ? "Checking bridge…" : "Check bridge reachability"}</button></div></section>
    <footer className="jd-note">Synthetic prices and grid intensity; modeled estimates, never measured savings. Cost/carbon comparisons exclude AC and protected loads.</footer>
  </main>;
}
