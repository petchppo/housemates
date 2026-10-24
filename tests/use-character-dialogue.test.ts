import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as contract from "../src/domain/character-dialogue";
import type { ApplimonId } from "../src/domain/applimon-catalog";
import type { useCharacterDialogue } from "../src/components/use-character-dialogue";

const source = ts.transpileModule(readFileSync(resolve("src/components/use-character-dialogue.ts"), "utf8"), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const flush = () => new Promise<void>(resolve => setImmediate(resolve));
const prose = "Road-trip spirit, planner patience! What do you have in mind?";
function harness() {
  const states:unknown[]=[], refs:{current:unknown}[]=[], callbacks:{value:unknown;deps:unknown[]}[]=[], effects:{deps:unknown[];cleanup?:()=>void}[]=[];
  const pending:(()=>void)[]=[], timers=new Map<number,()=>void>(), listeners=new Map<string,()=>void>();
  const requests:{init:RequestInit;resolve:(r:Response)=>void;reject:(e:Error)=>void}[]=[];
  let si=0,ri=0,ci=0,ei=0,writes=0,timerId=0;
  let props:{character:ApplimonId;context:string;active:boolean}={character:"evie",context:"world:idle",active:true};
  const react={
    useState(initial:unknown){const i=si++;if(!(i in states))states[i]=typeof initial==="function"?initial():initial;return[states[i],(v:unknown)=>{states[i]=typeof v==="function"?v(states[i]):v;writes++;}];},
    useRef(initial:unknown){const i=ri++;return refs[i]??(refs[i]={current:initial});},
    useCallback(value:unknown,deps:unknown[]){const i=ci++,old=callbacks[i];if(!old||old.deps.length!==deps.length||deps.some((d,j)=>d!==old.deps[j]))callbacks[i]={value,deps};return callbacks[i].value;},
    useEffect(fn:()=>void|(()=>void),deps:unknown[]){const i=ei++,old=effects[i];if(!old||old.deps.length!==deps.length||deps.some((d,j)=>d!==old.deps[j]))pending.push(()=>{old?.cleanup?.();effects[i]={deps,cleanup:fn()||undefined};});},
  };
  const document={hidden:false,addEventListener:(name:string,fn:()=>void)=>listeners.set(name,fn),removeEventListener:(name:string)=>listeners.delete(name)};
  const fixture={exports:{}};
  runInNewContext(source,{module:fixture,exports:fixture.exports,document,AbortController,
    setTimeout:(fn:()=>void)=>{timers.set(++timerId,fn);return timerId;},clearTimeout:(id:number)=>timers.delete(id),
    fetch:(_url:string,init:RequestInit)=>new Promise<Response>((resolve,reject)=>requests.push({init,resolve,reject})),
    require:(name:string)=>{if(name==="react")return react;if(name==="@/domain/character-dialogue")return contract;throw Error(name);},
  });
  const hook=(fixture.exports as {useCharacterDialogue:typeof useCharacterDialogue}).useCharacterDialogue;
  function render(next:Partial<typeof props>={}){props={...props,...next};si=ri=ci=ei=0;const result=hook(props.character,props.context,props.active);pending.splice(0).forEach(fn=>fn());return result;}
  return {render,requests,timers,listeners,writes:()=>writes,document,
    async configure(status="configured"){render();requests[0].resolve(Response.json({status}));await flush();return render();},
    hide(){document.hidden=true;listeners.get("visibilitychange")?.();},
    fireTimers(){const all=[...timers.values()];timers.clear();all.forEach(fn=>fn());},
    unmount(){effects.forEach(e=>e.cleanup?.());},
  };
}
const reply=()=>Response.json({source:"openai",reply:prose});

test("character chat sends only explicit typed text, selected persona, local facts and bounded ephemeral history",async()=>{
  const h=harness();let view=await h.configure();assert.equal(h.requests.length,1);assert.equal(h.requests[0].init.method,undefined);
  for(let i=0;i<4;i++){
    const done=view.request(`Hello Evie ${i}`,"Validated planner reply: projection only; $1.23.");
    const sent=h.requests.at(-1)!;const body=JSON.parse(String(sent.init.body));
    assert.deepEqual(Object.keys(body).sort(),["character","history","plannerReply","text"]);
    assert.equal(body.character,"evie");assert.equal(body.plannerReply,"Validated planner reply: projection only; $1.23.");
    assert.equal(body.history.length,Math.min(i*2,6));
    sent.resolve(reply());await done;view=h.render();assert.equal(view.reply,prose);assert.equal(view.loading,false);
  }
  assert.equal(view.history.length,6);assert.equal(h.requests.length,5);h.unmount();
});

test("unconfigured, checking or hidden dialogue uses local fallback without inference",async()=>{
  const h=harness();await h.render().request("hello","local");assert.equal(h.requests.length,1);
  h.requests[0].resolve(Response.json({status:"unconfigured"}));await flush();
  await h.render().request("hello","local");assert.equal(h.requests.length,1);assert.match(h.render().notice,/local planner/);
  h.unmount();
  const ready=harness();await ready.configure();ready.render({active:false});await ready.render().request("hello","local");assert.equal(ready.requests.length,1);ready.unmount();
});

test("character, plan revision, modal hiding, timeout, clear and unmount discard stale generated replies",async()=>{
  for(const action of ["character","context","inactive","hide","timeout","clear","unmount"]){
    const h=harness();const view=await h.configure();const done=view.request("hello","local");
    if(action==="character")h.render({character:"bubbles"});
    if(action==="context")h.render({context:"world:approved"});
    if(action==="inactive")h.render({active:false});
    if(action==="hide")h.hide();
    if(action==="timeout")h.fireTimers();
    if(action==="clear")view.clear();
    if(action==="unmount")h.unmount();
    const writes=h.writes();h.requests[1].resolve(reply());await done;
    assert.equal(h.writes(),writes,action);assert.equal(h.requests.length,2);assert.equal(h.requests[1].init.signal?.aborted,true);
    if(action!=="unmount"){assert.equal(h.render().reply,null);assert.equal(h.render().history.length,0);h.unmount();}
  }
});

test("a newer send wins even if the earlier transport ignores abort",async()=>{
  const h=harness();const view=await h.configure();const old=view.request("hello","old local"),current=view.request("how are you","current local");
  h.requests[2].resolve(reply());await current;h.requests[1].resolve(Response.json({source:"openai",reply:"Old road-trip chatter."}));await old;
  const next=h.render();assert.equal(next.reply,prose);assert.equal(next.history.length,2);assert.equal(next.history[0].text,"how are you");h.unmount();
});

test("error prose and fabricated numbers/actions cannot enter character dialogue or history",async()=>{
  const h=harness();await h.configure();
  for(const body of [{source:"openai",reply:"I saved $99 and approved your plan."},{source:"openai",reply:"I started charging."},{source:"unknown",reply:prose},{source:"openai",reply:prose,approve:true}]){
    const pending=h.render().request("hello","local");h.requests.at(-1)!.resolve(Response.json(body));await pending;
    // A source envelope with unknown action fields must not be accepted.
    assert.equal(h.render().reply,null);assert.equal(h.render().history.length,0);
  }
  const pending=h.render().request("hello","local");h.requests.at(-1)!.resolve(Response.json({error:"constructor",message:"private token"},{status:502}));await pending;
  assert.match(h.render().notice,/local planner/);assert.doesNotMatch(h.render().notice,/private token/);h.unmount();
});

test("deferred error JSON cannot update a new character or clear state",async()=>{
  const h=harness();const view=await h.configure();const pending=view.request("hello","local");
  let finish!:(body:unknown)=>void,started!:()=>void;
  const startedPromise=new Promise<void>(resolve=>{started=resolve;});
  const response=new Response(null,{status:502});response.json=()=>new Promise(resolve=>{finish=resolve;started();});
  h.requests[1].resolve(response);await startedPromise;h.render({character:"chill"});const writes=h.writes();
  finish({error:"provider-quota"});await pending;assert.equal(h.writes(),writes);assert.equal(h.render().notice,"");h.unmount();
});

test("configuration timeout resolves local mode even if fetch ignores abort",async()=>{
  const h=harness();h.render();h.fireTimers();assert.equal(h.render().status,"unconfigured");
  h.requests[0].resolve(Response.json({status:"configured"}));await flush();assert.equal(h.render().status,"unconfigured");h.unmount();
});
