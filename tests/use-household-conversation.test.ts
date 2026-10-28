import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as contract from "../src/domain/character-dialogue";
import * as casual from "../src/domain/casual-dialogue";
import type { ApplianceId } from "../src/domain/appliances";
import type { useHouseholdConversation } from "../src/components/use-household-conversation";

const source = ts.transpileModule(readFileSync(resolve("src/components/use-household-conversation.ts"), "utf8"), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const flush = () => new Promise<void>(resolve => setImmediate(resolve));
const prose = "Road-trip spirit, planner patience! What do you have in mind?";
function harness() {
  const states:unknown[]=[], refs:{current:unknown}[]=[], callbacks:{value:unknown;deps:unknown[]}[]=[], effects:{deps:unknown[];cleanup?:()=>void}[]=[];
  const layoutIndices = new Set<number>();
  const pending:(()=>void)[]=[], layout:(()=>void)[]=[], timers=new Map<number,()=>void>(), listeners=new Map<string,()=>void>();
  const requests:{init:RequestInit;resolve:(r:Response)=>void;reject:(e:Error)=>void}[]=[];
  let si=0,ri=0,ci=0,ei=0,writes=0,timerId=0;
  let props = { context: "world:idle" };
  const plannerCalls: { id: ApplianceId; text: string; source: string }[] = [];
  let plannerResult: string | undefined = "Local validated facts: 12.00 kWh; approval is explicit.";
  let plannerEffect: (() => void) | undefined;
  const planner = (id: ApplianceId, text: string, source: string) => { plannerCalls.push({ id, text, source }); plannerEffect?.(); return plannerResult; };
  const react={
    useState(initial:unknown){const i=si++;if(!(i in states))states[i]=typeof initial==="function"?initial():initial;return[states[i],(v:unknown)=>{states[i]=typeof v==="function"?v(states[i]):v;writes++;}];},
    useRef(initial:unknown){const i=ri++;return refs[i]??(refs[i]={current:initial});},
    useCallback(value:unknown,deps:unknown[]){const i=ci++,old=callbacks[i];if(!old||old.deps.length!==deps.length||deps.some((d,j)=>d!==old.deps[j]))callbacks[i]={value,deps};return callbacks[i].value;},
    useLayoutEffect(fn:()=>void|(()=>void),deps:unknown[]){ layoutIndices.add(ei); const before = pending.length; react.useEffect(fn,deps); layout.push(...pending.splice(before)); },
    useEffect(fn:()=>void|(()=>void),deps:unknown[]){const i=ei++,old=effects[i];if(!old||old.deps.length!==deps.length||deps.some((d,j)=>d!==old.deps[j]))pending.push(()=>{old?.cleanup?.();effects[i]={deps,cleanup:fn()||undefined};});},
  };
  const document={hidden:false,addEventListener:(name:string,fn:()=>void)=>listeners.set(name,fn),removeEventListener:(name:string)=>listeners.delete(name)};
  const fixture={exports:{}};
  runInNewContext(source,{module:fixture,exports:fixture.exports,document,AbortController,
    setTimeout:(fn:()=>void)=>{timers.set(++timerId,fn);return timerId;},clearTimeout:(id:number)=>timers.delete(id),
    fetch:(_url:string,init:RequestInit)=>new Promise<Response>((resolve,reject)=>requests.push({init,resolve,reject})),
    require:(name:string)=>{if(name==="react")return react;if(name==="@/domain/character-dialogue")return contract;if(name==="@/domain/casual-dialogue")return casual;throw Error(name);},
  });
  const hook=(fixture.exports as {useHouseholdConversation:typeof useHouseholdConversation}).useHouseholdConversation;
  function render(next:Partial<typeof props>={}, flushPassive=true){props={...props,...next};si=ri=ci=ei=0;const result=hook(props.context,planner);layout.splice(0).forEach(fn=>fn());if(flushPassive)pending.splice(0).forEach(fn=>fn());return result;}
  return {render,requests,timers,listeners,writes:()=>writes,document,plannerCalls,
    setPlannerResult(value: string | undefined) { plannerResult = value; },
    setPlannerEffect(value: () => void) { plannerEffect = value; },
    async configure(status="configured"){render();requests[0].resolve(Response.json({status}));await flush();return render();},
    hide(){document.hidden=true;listeners.get("visibilitychange")?.();},
    fireTimers(){const all=[...timers.values()];timers.clear();all.forEach(fn=>fn());},
    unmountLayout(){effects.forEach((e,i)=>{if(layoutIndices.has(i))e.cleanup?.();});},
    unmount(){effects.forEach(e=>e.cleanup?.());},
  };
}

const aiResponse = () => Response.json({ source: "openai", reply: prose });
const web = { origin: "web" } as const;

test("web and phone share a serialized planner, exact reply and preceding character history", async () => {
  const h = harness(), controller = await h.configure();
  const first = controller.dispatch("evie", "Hello from web", web);
  const phone = controller.dispatch("evie", "Remember my web greeting?", { origin: "imessage", messageId: "phone-1" });
  assert.equal(h.plannerCalls.length, 1); assert.equal(h.requests.length, 2);
  assert.equal(h.render().forCharacter("evie").history[0].text, "Hello from web");
  assert.equal(h.render().forCharacter("evie").loading, true);
  h.requests[1].resolve(aiResponse()); const firstReply = await first;
  assert.equal(h.plannerCalls.length, 2); assert.equal(h.requests.length, 3);
  const body = JSON.parse(String(h.requests[2].init.body));
  assert.deepEqual(body.history, [{ role: "user", text: "Hello from web" }, { role: "assistant", text: prose }]);
  assert.deepEqual(Object.keys(body).sort(), ["character", "history", "plannerReply", "text"]);
  assert.equal(h.render().forCharacter("evie").history.at(-1)?.origin, "imessage");
  h.requests[2].resolve(aiResponse()); const phoneReply = await phone;
  const final = h.render(), view = final.forCharacter("evie");
  assert.equal(view.reply, phoneReply?.text); assert.equal(view.source, phoneReply?.source);
  assert.deepEqual(firstReply, final.outboundTurns[0].reply); assert.deepEqual(phoneReply, final.outboundTurns[1].reply);
  assert.equal(final.outboundTurns[0].origin, "web"); assert.equal(final.outboundTurns[1].origin, "imessage");
  assert.notEqual(final.outboundTurns[0].id, final.outboundTurns[1].id);
  assert.match(final.outboundTurns[0].id, /^[\w-]{1,128}$/);
  assert.equal(view.history.length, 4); h.unmount();
});

test("selecting another character preserves independent histories while household turns remain serialized", async () => {
  const h = harness(), controller = await h.configure();
  const evie = controller.dispatch("evie", "Hello Evie", web);
  const bubbles = controller.dispatch("bubbles", "Hello Bubbles", web);
  assert.equal(controller.forCharacter("chill").history.length, 0);
  h.requests[1].resolve(aiResponse()); await evie;
  assert.equal(JSON.parse(String(h.requests[2].init.body)).character, "bubbles");
  assert.equal(JSON.parse(String(h.requests[2].init.body)).history.length, 0);
  h.requests[2].resolve(aiResponse()); await bubbles;
  const next = h.render(); assert.equal(next.forCharacter("evie").history.length, 2); assert.equal(next.forCharacter("bubbles").history.length, 2);
  const again = next.dispatch("evie", "Back again", web);
  assert.equal(JSON.parse(String(h.requests[3].init.body)).history[0].text, "Hello Evie");
  h.requests[3].resolve(aiResponse()); await again; h.unmount();
});

test("abort queued phone turn before planner mutation; in-flight abort releases queue even when fetch ignores abort", async () => {
  const h = harness(), view = await h.configure(), firstAbort = new AbortController(), queuedAbort = new AbortController();
  const first = view.dispatch("evie", "first", { ...web, signal: firstAbort.signal });
  const queued = view.dispatch("bubbles", "canceled queued", { origin: "imessage", signal: queuedAbort.signal, messageId: "phone-2" });
  const last = view.dispatch("chill", "surviving turn", web);
  queuedAbort.abort(); assert.equal(await queued, undefined); assert.equal(h.plannerCalls.length, 1);
  firstAbort.abort(); assert.equal(await first, undefined); await flush();
  assert.deepEqual(h.plannerCalls.map(call => call.id), ["evie", "chill"]);
  assert.equal(h.requests[1].init.signal?.aborted, true);
  h.requests[2].resolve(aiResponse()); await last;
  const before = h.writes(); h.requests[1].resolve(aiResponse()); await flush(); assert.equal(h.writes(), before);
  assert.equal(h.render().outboundTurns.length, 1); assert.equal(h.render().forCharacter("evie").history.length, 0); h.unmount();
});

test("context changes, manual invalidation, hidden pages and unmount cancel pending and queued turns", async () => {
  for (const action of ["context", "invalidate", "hide", "unmount"]) {
    const h = harness(), view = await h.configure();
    const first = view.dispatch("evie", "old", web), next = view.dispatch("bubbles", "must not plan", web);
    if (action === "context") h.render({ context: "different household:approved" });
    if (action === "invalidate") view.invalidate();
    if (action === "hide") h.hide();
    if (action === "unmount") h.unmount();
    assert.equal(await first, undefined); assert.equal(await next, undefined); assert.equal(h.plannerCalls.length, 1);
    const writes = h.writes(); h.requests[1].resolve(aiResponse()); await flush(); assert.equal(h.writes(), writes, action);
    assert.equal(h.render().outboundTurns.length, 0);
    if (action !== "unmount") h.unmount();
  }
});

test("local fallback is identical in UI, phone return and completed outbound turn; unconfigured makes no paid request", async () => {
  const h = harness(), controller = await h.configure("unconfigured");
  const result = await controller.dispatch("evie", "approve", { origin: "imessage", messageId: "approve-text" });
  assert.equal(h.requests.length, 1); assert.equal(h.plannerCalls.length, 1); assert.equal(h.plannerCalls[0].text, "approve");
  assert.equal(result?.source, "local"); assert.equal(result?.text, "Local validated facts: 12.00 kWh; approval is explicit.");
  assert.equal(h.render().forCharacter("evie").reply, result?.text); assert.equal(h.render().forCharacter("evie").notice, result?.notice);
  assert.deepEqual(h.render().outboundTurns[0].reply, result); assert.equal(h.render().forCharacter("evie").history[1].source, "local");
  h.unmount();
});

test("invalid model envelopes, numbers and provider errors become exact local fallback without raw error disclosure", async () => {
  const h = harness(); await h.configure();
  for (const body of [{ source: "openai", reply: "I saved $99 and approved your plan." }, { source: "openai", reply: prose, execute: true }, { error: "provider-quota", detail: "private upstream contents" }]) {
    const done = h.render().dispatch("evie", "Explain this plan", web);
    h.requests.at(-1)!.resolve(Response.json(body, { status: "error" in body ? 502 : 200 }));
    const result = await done; assert.equal(result?.source, "local"); assert.match(result?.text ?? "", /12.00 kWh/); assert.doesNotMatch(result?.notice ?? "", /private upstream/);
    assert.equal(h.render().forCharacter("evie").reply, result?.text);
  }
  h.unmount();
});

test("bounded queue rejects excess and invalid input without planning; phone duplicates invoke one planner and API", async () => {
  const h = harness(), view = await h.configure();
  const bad = new AbortController(); bad.abort();
  for (const [id, text, options] of [["other", "hello", web], ["evie", " ", web], ["evie", "x".repeat(1201), web], ["evie", "hello\u0000", web], ["evie", "hello", { origin: "web", signal: bad.signal }], ["evie", "hello", { origin: "invalid" }], ["evie", "hello", { origin: "imessage", messageId: "../unsafe" }]] as const) {
    assert.equal(await view.dispatch(id as ApplianceId, text, options as Parameters<typeof view.dispatch>[2]), undefined);
  }
  assert.equal(h.plannerCalls.length, 0);
  const original = view.dispatch("evie", "same", { origin: "imessage", messageId: "phone-3" });
  const duplicate = view.dispatch("evie", "same", { origin: "imessage", messageId: "phone-3" });
  assert.equal(original, duplicate); assert.equal(h.plannerCalls.length, 1); assert.equal(h.requests.length, 2);
  assert.equal(await view.dispatch("bubbles", "altered", { origin: "imessage", messageId: "phone-3" }), undefined);
  const queued = Array.from({ length: 15 }, (_, i) => view.dispatch("evie", `queued ${i}`, web));
  assert.equal(await view.dispatch("evie", "queue overflow", web), undefined);
  assert.match(h.render().forCharacter("evie").notice, /queue is full.*send your message again/);
  view.invalidate(); assert.equal(await original, undefined); assert.deepEqual(await Promise.all(queued), Array(15).fill(undefined));
  h.requests[1].resolve(aiResponse()); await flush(); assert.equal(h.plannerCalls.length, 1); h.unmount();
});

test("UI and outbound history are bounded, API sees last six turns, and IDs survive reset without reuse", async () => {
  const h = harness(); await h.configure();
  for (let i = 0; i < 18; i++) {
    const done = h.render().dispatch("evie", `hello ${i}`, { ...web, source: "voice" });
    const body = JSON.parse(String(h.requests.at(-1)!.init.body));
    assert.equal(body.history.length, Math.min(i * 2, 6));
    assert.ok(body.history.every((entry: {text:string}) => entry.text.length <= 600));
    h.requests.at(-1)!.resolve(aiResponse()); await done;
  }
  assert.equal(h.render().forCharacter("evie").history.length, 30); assert.equal(h.plannerCalls.at(-1)?.source, "voice");
  const priorId = h.render().outboundTurns.at(-1)!.id; h.render().invalidate();
  assert.equal(h.render().forCharacter("evie").history.length, 0);
  const reset = h.render().dispatch("evie", "after reset", web); h.requests.at(-1)!.resolve(aiResponse()); await reset;
  assert.notEqual(h.render().outboundTurns[0].id, priorId); h.unmount();
  const local = harness(), localView = await local.configure("unconfigured");
  for (let i = 0; i < 75; i++) await localView.dispatch("chill", `status ${i}`, web);
  assert.equal(local.render().outboundTurns.length, 60); assert.equal(local.render().forCharacter("chill").history.length, 30); local.unmount();
});

test("timeout releases serialization and returns local source even if transport never settles", async () => {
  const h = harness(), view = await h.configure();
  const first = view.dispatch("evie", "hello", web), second = view.dispatch("bubbles", "next", web);
  h.fireTimers(); const result = await first;
  assert.equal(result?.source, "local"); assert.match(result?.notice ?? "", /timed out/); assert.equal(h.requests[1].init.signal?.aborted, true);
  assert.equal(h.plannerCalls.length, 2); h.requests[2].resolve(aiResponse()); await second;
  const writes = h.writes(); h.requests[1].resolve(aiResponse()); await flush(); assert.equal(h.writes(), writes); h.unmount();
});

test("planner invalidation or unavailable oversized output cannot trigger inference or completion of stale work", async () => {
  const h = harness(), view = await h.configure();
  h.setPlannerEffect(() => view.invalidate());
  assert.equal(await view.dispatch("evie", "hello", web), undefined); assert.equal(h.requests.length, 1); assert.equal(h.render().outboundTurns.length, 0);
  h.setPlannerEffect(() => {});
  for (const output of [undefined, "x".repeat(5001)]) {
    h.setPlannerResult(output); const result = await h.render().dispatch("evie", "hello", web);
    assert.equal(result?.source, "local"); assert.match(result?.notice ?? "", /No AI request/); assert.equal(h.requests.length, 1);
  }
  h.unmount();
});


test("a newly committed context rejects saved dispatch and late completion before passive effects", async () => {
  const h = harness(), old = await h.configure();
  const first = old.dispatch("evie", "in flight", web);
  const queued = old.dispatch("bubbles", "queued old", web);
  h.render({ context: "replacement household" }, false);
  assert.equal(await old.dispatch("chill", "stale event handler", web), undefined);
  assert.equal(await first, undefined); assert.equal(await queued, undefined);
  assert.equal(h.plannerCalls.length, 1);
  const writes = h.writes(); h.requests[1].resolve(aiResponse()); await flush(); assert.equal(h.writes(), writes);
  assert.equal(h.render().outboundTurns.length, 0); h.unmount();
});


test("unmount cancels immediately at layout cleanup before passive cleanup or queued planner work", async () => {
  const h = harness(), view = await h.configure();
  const first = view.dispatch("evie", "active", web), queued = view.dispatch("bubbles", "queued", web);
  h.unmountLayout();
  assert.equal(await first, undefined); assert.equal(await queued, undefined);
  assert.equal(await view.dispatch("chill", "stale click after unmount", web), undefined);
  assert.equal(h.plannerCalls.length, 1);
  const writes = h.writes(); h.requests[1].resolve(aiResponse()); await flush(); assert.equal(h.writes(), writes);
  h.unmount();
});

test("a duplicate phone subscriber honors its own deadline without canceling the original turn", async () => {
  const h = harness(), view = await h.configure(), abort = new AbortController();
  const original = view.dispatch("evie", "same phone turn", { origin: "imessage", messageId: "same-phone-id" });
  const duplicate = view.dispatch("evie", "same phone turn", { origin: "imessage", messageId: "same-phone-id", signal: abort.signal });
  abort.abort(); assert.equal(await duplicate, undefined);
  assert.equal(h.requests[1].init.signal?.aborted, false); assert.equal(h.plannerCalls.length, 1);
  h.requests[1].resolve(aiResponse()); assert.equal((await original)?.text, prose);
  assert.equal(h.render().outboundTurns.length, 1); h.unmount();
});

test("phone Lol rejection becomes authored local small talk while a valid lmao AI reply still wins", async () => {
  const h = harness(), view = await h.configure();
  const plannerReply = "Try Find a cheaper plan, lower carbon, or finish by 10 PM. Review before approving.";
  h.setPlannerResult(plannerReply);
  const phone = view.dispatch("evie", "Lol!", { origin: "imessage", messageId: "phone-lol" });
  assert.equal(h.plannerCalls.length, 1); assert.equal(h.requests.length, 2);
  assert.equal(JSON.parse(String(h.requests[1].init.body)).plannerReply, plannerReply, "Authored chatter must never replace validated planner context sent to the model");
  h.requests[1].resolve(Response.json({ error: "unsafe-character-reply" }, { status: 502 }));
  const result = await phone;
  assert.equal(result?.source, "local"); assert.equal(result?.text, casual.casualFallback("evie", "Lol!"));
  assert.match(result?.notice ?? "", /fact and action checks/);
  assert.equal(h.render().forCharacter("evie").reply, result?.text);
  assert.equal(h.render().forCharacter("evie").history.at(-1)?.source, "local");
  assert.equal(h.render().forCharacter("evie").history.at(-1)?.text, result?.text);
  assert.deepEqual(h.render().outboundTurns[0].reply, result);

  const webReply = h.render().dispatch("evie", "lmao", web);
  assert.equal(h.plannerCalls.length, 2); assert.equal(h.requests.length, 3);
  const secondBody = JSON.parse(String(h.requests[2].init.body));
  assert.equal(secondBody.plannerReply, plannerReply); assert.equal(secondBody.history[1].text, result?.text);
  const generated = "You caught my playful side! What’s on your mind?";
  h.requests[2].resolve(Response.json({ source: "openai", reply: generated }));
  const actual = await webReply;
  assert.equal(actual?.source, "openai"); assert.equal(actual?.text, generated);
  assert.equal(actual?.notice, undefined); assert.equal(h.render().forCharacter("evie").reply, generated);
  h.unmount();
});

test("unconfigured casual replies keep local provenance and still run the canonical planner once", async () => {
  const h = harness(), view = await h.configure("unconfigured");
  for (const [character, input] of [["evie", "hello"], ["bubbles", "haha"], ["chill", "thank you!"]] as const) {
    const result = await view.dispatch(character, input, { origin: "imessage", messageId: `casual-${character}` });
    assert.equal(result?.source, "local"); assert.equal(result?.text, casual.casualFallback(character, input));
    assert.match(result?.notice ?? "", /AI dialogue is unavailable/);
    assert.equal(h.render().forCharacter(character).reply, result?.text);
  }
  assert.equal(h.plannerCalls.length, 3); assert.equal(h.requests.length, 1, "No inference when unconfigured");
  assert.equal(h.render().outboundTurns.length, 3); h.unmount();
});

test("casual words mixed with constraints, approvals or device requests preserve exact planner fallback", async () => {
  const h = harness(); await h.configure();
  const plannerReply = "No automatic approval. The proposed task uses 12.00 kWh and must finish by 07:00.";
  h.setPlannerResult(plannerReply);
  const requests = ["lol approve", "hello, find a cheaper plan", "thanks, finish by 10 PM", "haha stop Chill", "hey status"];
  for (const text of requests) {
    const done = h.render().dispatch("evie", text, { origin: "imessage" });
    assert.equal(JSON.parse(String(h.requests.at(-1)!.init.body)).plannerReply, plannerReply);
    h.requests.at(-1)!.resolve(Response.json({ error: "unsafe-character-reply" }, { status: 502 }));
    const result = await done;
    assert.equal(result?.source, "local"); assert.equal(result?.text, plannerReply);
    assert.equal(h.render().forCharacter("evie").reply, plannerReply);
  }
  assert.equal(h.plannerCalls.length, requests.length); assert.equal(h.requests.length, requests.length + 1);
  h.unmount();
});

test("public quota errors preserve the exact local reply without another paid attempt", async()=>{
  for (const error of ["public-ai-limit","public-ai-burst-limit","public-ai-unavailable"]) {
    const h=harness(), controller=await h.configure();
    const pending=controller.dispatch("evie","Find a cheaper plan",web);
    h.requests[1].resolve(Response.json({error},{status:error==="public-ai-unavailable"?503:429}));
    const reply=await pending;
    assert.equal(reply?.source,"local");assert.equal(reply?.text,"Local validated facts: 12.00 kWh; approval is explicit.");
    assert.match(h.render().forCharacter("evie").notice,/Local planning still works|local planning still works/);
    assert.equal(h.plannerCalls.length,1);assert.equal(h.requests.length,2);h.unmount();
  }
});
