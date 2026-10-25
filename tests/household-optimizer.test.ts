import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as catalog from "../src/domain/applimon-catalog";
import * as demo from "../src/domain/demo";
import { optimizeApplimonTeam } from "../src/domain/applimon-planning";
import type { CoordinatedContext } from "../src/domain/household-optimization";
import { hourlyEnergy } from "../src/data/energy";

type Element = { type: unknown; props: Record<string,unknown> };
const jsx = (type: unknown, props: Element["props"]): Element => ({type,props});
function nodes(value: unknown): Element[] { if(Array.isArray(value))return value.flatMap(nodes);if(!value||typeof value!=="object"||!("props" in value))return [];const row=value as Element;return [row,...nodes(row.props.children)]; }
function text(value:unknown):string {if(Array.isArray(value))return value.map(text).join(" ");if(value&&typeof value==="object"&&"props" in value)return text((value as Element).props.children);return typeof value==="string"||typeof value==="number"?String(value):"";}
function fixture(empty=false) {
  let context:CoordinatedContext={inventory:empty?[]:catalog.APPLIMON_IDS.map(id=>catalog.createDemoApplimon(id)),coreRequests:[],energyProfile:[...hourlyEnergy],backgroundPowerKw:Array(48).fill(.3),backgroundTotals:{energyKwh:14.4,costUsd:2,carbonGrams:2400},weatherLabel:"Synthetic weather · one day repeated",weatherTemperaturesC:Array(48).fill(22),contextKey:"first",assumptions:["No device control."]};
  let active=false,dirty=false,tree:Element,si=0,ri=0,ei=0,li=0,timer=0;
  const layoutEffects:{deps:unknown[];cleanup?:()=>void}[]=[];
  const states:unknown[]=[],refs:{current:unknown}[]=[],effects:{deps:unknown[];cleanup?:()=>void}[]=[],pending:(()=>void)[]=[],timers=new Map<number,()=>void>();
  const calls:Record<string,unknown>[]=[];
  let outcome="feasible";
  const react={useLayoutEffect(fn:()=>void|(()=>void),deps:unknown[]){const i=li++,old=layoutEffects[i];if(!old||deps.some((value,j)=>!Object.is(value,old.deps[j]))){old?.cleanup?.();layoutEffects[i]={deps,cleanup:fn()||undefined};}},useState(initial:unknown){const i=si++;if(!(i in states))states[i]=initial;return[states[i],(value:unknown)=>{states[i]=typeof value==="function"?value(states[i]):value;dirty=true;}];},useRef(initial:unknown){const i=ri++;return refs[i]??(refs[i]={current:initial});},useEffect(fn:()=>void|(()=>void),deps:unknown[]){const i=ei++,old=effects[i];if(!old||deps.some((value,j)=>!Object.is(value,old.deps[j])))pending.push(()=>{old?.cleanup?.();effects[i]={deps,cleanup:fn()||undefined};});}};
  const source=ts.transpileModule(readFileSync(resolve(process.cwd(),"src/components/household-optimizer.tsx"),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const testModule:{exports:unknown}={exports:{}};
  runInNewContext(source,{module:testModule,exports:testModule.exports,window:{setTimeout(fn:()=>void){timers.set(++timer,fn);return timer;},clearTimeout(id:number){timers.delete(id);}},require(name:string){if(name==="react")return react;if(name==="react/jsx-runtime")return{jsx,jsxs:jsx};if(name==="@/domain/applimon-catalog")return catalog;if(name==="@/domain/demo")return demo;if(name==="./applimon-sprite")return{ApplimonSprite:"portrait"};if(name==="@/domain/coordinated-optimization")return{optimizeCoordinatedApplimons(input:Record<string,unknown>){calls.push(input);if(outcome==="throw")throw Error("Private error");const row=optimizeApplimonTeam(input.inventory,hourlyEnergy,input.mode as "cost");return {...row,status:outcome,issues:outcome==="feasible"?[]:["A required task cannot fit the modeled power budget."],schedules:outcome==="feasible"?row.schedules:[],solver:{optimal:outcome==="feasible"},peakModeledPowerKw:7.4};}};if(name.endsWith(".css"))return{};throw Error(name);}});
  const component=(testModule.exports as {HouseholdOptimizer:(props:unknown)=>Element}).HouseholdOptimizer;
  function render(flushPassive=true){si=ri=ei=li=0;dirty=false;tree=component({context,active,initialMode:"cost"});if(flushPassive)pending.splice(0).forEach(fn=>fn());}
  function settle(){for(let i=0;dirty&&i<15;i++)render();assert.equal(dirty,false);}
  function find(predicate:(node:Element)=>boolean){const node=nodes(tree).find(predicate);assert.ok(node);return node;}
  render();
  return {calls,text:()=>text(tree).replace(/\s+/g," "),nodes:()=>nodes(tree),timers,
    active(value:boolean){active=value;render();settle();}, hideBeforePassive(){active=false;render(false);}, detachLayout(){layoutEffects.forEach(effect=>effect.cleanup?.());},flush(){const queue=[...timers.values()];timers.clear();queue.forEach(fn=>fn());settle();},
    context(value:string){context={...context,contextKey:value};render();settle();},
    budget(value:string){(find(n=>n.props.type==="number").props.onChange as (e:unknown)=>void)({target:{value}});settle();},
    unlimited(){(find(n=>n.props.type==="checkbox").props.onChange as (e:unknown)=>void)({target:{checked:true}});settle();},
    submit(){(find(n=>n.type==="form").props.onSubmit as (e:unknown)=>void)({preventDefault(){}});settle();},
    click(label:string){(find(n=>n.type==="button"&&(text(n)===label||n.props["aria-label"]===label)).props.onClick as ()=>void)();settle();},
    outcome(value:string){outcome=value;},unmount(){layoutEffects.forEach(effect=>effect.cleanup?.());effects.forEach(effect=>effect.cleanup?.());},
  };
}

test("opening computes exactly three alternatives; mode selection never approves, executes or reruns",()=>{const ui=fixture();assert.equal(ui.calls.length,0);ui.active(true);ui.flush();assert.equal(ui.calls.length,3);assert.deepEqual(ui.calls.map(row=>row.mode),["cost","carbon","balanced"]);assert.ok(ui.calls.every(row=>row.modeledPowerLimitKw===8));ui.click("Lower carbon");assert.equal(ui.calls.length,3);for(const id of catalog.APPLIMON_IDS)assert.ok(ui.text().includes(catalog.getApplimon(id).name));assert.match(ui.text(),/Protected routines stay unchanged/);assert.match(ui.text(),/not a full household bill/);assert.equal(ui.nodes().filter(row=>row.type==="button"&&/Approve|Run|Start/i.test(text(row))).length,0);assert.equal(ui.nodes().filter(row=>row.type==="table").length,1);ui.unmount();});
test("context changes hide stale totals immediately and require explicit recalculation",()=>{const ui=fixture();ui.active(true);ui.flush();assert.match(ui.text(),/Original flexible tasks/);ui.context("new-weather");assert.doesNotMatch(ui.text(),/Original flexible tasks/);assert.match(ui.text(),/Inputs changed/);ui.flush();assert.equal(ui.calls.length,3);ui.submit();assert.equal(ui.calls.length,6);assert.match(ui.text(),/Original flexible tasks/);ui.unmount();});
test("budget boundaries do not call solver; no limit explicitly omits the modeled budget",()=>{const ui=fixture();ui.active(true);ui.flush();for(const value of ["","0","-1","101","Infinity","NaN"]){ui.budget(value);ui.submit();assert.equal(ui.calls.length,3);assert.match(ui.text(),/finite power budget/);}ui.unlimited();ui.submit();assert.equal(ui.calls.length,6);assert.ok(!("modeledPowerLimitKw" in ui.calls.at(-1)!));ui.unmount();});
test("search-limit and exceptions expose honest failure without a recommended schedule",()=>{const ui=fixture();ui.outcome("search-limit");ui.active(true);ui.flush();assert.match(ui.text(),/Search limit reached/);assert.match(ui.text(),/required task cannot fit/);assert.doesNotMatch(ui.text(),/Original flexible tasks/);ui.outcome("throw");ui.submit();assert.match(ui.text(),/could not be calculated/);assert.doesNotMatch(ui.text(),/Private error/);ui.unmount();});
test("empty roster, closing before initial calculation, and clearing leave no hidden automatic work",()=>{const empty=fixture(true);empty.active(true);empty.flush();assert.equal(empty.calls.length,0);assert.match(empty.text(),/Recruit an Applimon/);empty.unmount();const ui=fixture();ui.active(true);ui.active(false);ui.flush();assert.equal(ui.calls.length,0);ui.active(true);ui.click("Clear preview");ui.flush();assert.equal(ui.calls.length,0);ui.submit();assert.equal(ui.calls.length,3);ui.click("Clear preview");ui.active(false);ui.active(true);ui.flush();assert.equal(ui.calls.length,3);assert.doesNotMatch(ui.text(),/Original flexible tasks/);ui.unmount();});


test("committed hide or unmount blocks a queued solver before passive cleanup",()=>{
  const hidden=fixture();hidden.active(true);hidden.hideBeforePassive();hidden.flush();assert.equal(hidden.calls.length,0);hidden.unmount();
  const removed=fixture();removed.active(true);removed.detachLayout();removed.flush();assert.equal(removed.calls.length,0);removed.unmount();
});


test("party graphic shows every character while numeric settings remain in optional Details",()=>{
  const ui=fixture();ui.active(true);ui.flush();
  const details=ui.nodes().find(node=>node.type==="details"&&node.props.className==="ho-details");assert.ok(details);
  assert.equal(details.props.open,undefined);assert.match(text(details),/Modeled power budget/);
  assert.equal(nodes(details).filter(node=>node.type==="button").length,0);
  const weather=ui.nodes().find(node=>node.props.className==="ho-weather-summary");assert.ok(weather);assert.match(text(weather),/Synthetic weather/);assert.match(text(weather),/22.0/);
  assert.ok(ui.nodes().some(node=>node.props.className==="ho-time-axis"&&text(node).includes("Day 3")));
  assert.equal(ui.nodes().filter(node=>node.type==="portrait").length,10);
  assert.match(ui.text(),/Save coins/);assert.match(ui.text(),/Go greener/);assert.match(ui.text(),/Balance both/);
  assert.match(ui.text(),/estimates, not earned savings/);assert.match(ui.text(),/GUARD DUTY/);assert.match(ui.text(),/FIXED ROUTINE/);
  ui.unmount();
});
