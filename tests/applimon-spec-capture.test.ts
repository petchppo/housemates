import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as catalog from "../src/domain/applimon-catalog";
import { parseNameplateText } from "../src/domain/nameplate";

type View={type:unknown;props:Record<string,unknown>};
function harness() {
  const state:unknown[]=[],refs:{current:unknown}[]=[],effects:{deps:unknown[];cleanup:void|(()=>void)}[]=[];
  const pending:(()=>void)[]=[],confirmed:catalog.ApplimonDevice[]=[],revoked:string[]=[];
  const confirmedPhotos:unknown[]=[],canceled: boolean[]=[];
  const timers=new Map<number,()=>void>();
  let si=0,ri=0,ei=0,tree:View,timerId=0,imports=0,deferInitialization=false,failInitialization=false;
  const initResolvers:((worker:FakeWorker)=>void)[]=[];
  const workers:FakeWorker[]=[];
  class FakeWorker {
    terminated=false;
    pending:((value:{data:{text:string}})=>void)|null=null;
    recognize(){return new Promise<{data:{text:string}}>(resolve=>{this.pending=resolve;});}
    async terminate(){this.terminated=true;}
    resolve(text:string){this.pending?.({data:{text}});}
  }
  const react={
    useRef(value:unknown){const i=ri++;return refs[i]??(refs[i]={current:value});},
    useState(value:unknown){const i=si++;if(!(i in state))state[i]=value;return[state[i],(next:unknown)=>{state[i]=typeof next==="function"?next(state[i]):next;}];},
    useEffect(effect:()=>void|(()=>void),deps:unknown[]){const i=ei++,old=effects[i];if(!old||deps.some((value,j)=>value!==old.deps[j]))pending.push(()=>{old?.cleanup?.();effects[i]={deps,cleanup:effect()};});},
  };
  const jsx=(type:unknown,props:Record<string,unknown>)=>({type,props});
  const testModule:{exports:unknown}={exports:{}};
  const source=ts.transpileModule(readFileSync(resolve(process.cwd(),"src/components/applimon-spec-capture.tsx"),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  runInNewContext(source,{
    module:testModule,exports:testModule.exports,
    URL:{createObjectURL:()=>`blob:nameplate-${Math.random()}`,revokeObjectURL:(url:string)=>revoked.push(url)},
    setTimeout:(callback:()=>void)=>{timers.set(++timerId,callback);return timerId;},clearTimeout:(id:number)=>timers.delete(id),
    require(name:string){
      if(name==="react")return react;
      if(name==="react/jsx-runtime")return{jsx,jsxs:jsx};
      if(name==="@/domain/applimon-catalog")return catalog;
      if(name==="@/domain/nameplate")return{parseNameplateText};
      if(name==="./applimon-sprite")return{ApplimonSprite:()=>null};
      if(name.endsWith(".css"))return{};
      if(name==="tesseract.js"){imports++;return{async createWorker(){if(failInitialization)throw Error("Network failed");const worker=new FakeWorker();workers.push(worker);if(deferInitialization)return new Promise<FakeWorker>(resolve=>initResolvers.push(resolve));return worker;}};}
      throw Error(`Unexpected specification dependency ${name}`);
    },
  });
  function render(){si=ri=ei=0;tree=(testModule.exports as {ApplimonSpecCapture:(props:unknown)=>View}).ApplimonSpecCapture({initialId:"spin",onConfirm:(device:catalog.ApplimonDevice,photo?:unknown)=>{confirmed.push(device);confirmedPhotos.push(photo);},onCancel:()=>canceled.push(true)});pending.splice(0).forEach(effect=>effect());}
  function nodes(value:unknown):View[]{if(Array.isArray(value))return value.flatMap(nodes);if(!value||typeof value!=="object")return[];const n=value as View;return[n,...nodes(n.props?.children)];}
  function text(value:unknown):string{if(Array.isArray(value))return value.map(text).join("");if(value&&typeof value==="object")return text((value as View).props?.children);return typeof value==="string"||typeof value==="number"?String(value):"";}
  function find(predicate:(node:View)=>boolean){const node=nodes(tree).find(predicate);assert.ok(node);return node;}
  function visible(value:unknown):View[]{if(Array.isArray(value))return value.flatMap(visible);if(!value||typeof value!=="object")return[];const node=value as View;if(node.props?.hidden)return[];return[node,...visible(node.props?.children)];}
  function button(label:string){return find(node=>node.type==="button"&&text(node).startsWith(label));}
  function click(label:string){const node=button(label);assert.notEqual(node.props.disabled,true);const promise=(node.props.onClick as ()=>unknown)();render();return promise;}
  function labelControl(label:string,type="input"){return nodes(find(node=>node.type==="label"&&text(node).startsWith(label))).find(node=>node.type===type)!;}
  function change(label:string,value:unknown,type="input"){const node=labelControl(label,type);(node.props.onChange as (event:unknown)=>void)({target:{value,checked:value}});render();}
  function upload(file={type:"image/png",name:"label.png",size:10000}){const node=find(node=>node.type==="input"&&node.props.type==="file");(node.props.onChange as (event:unknown)=>void)({target:{files:[file],value:"file"}});render();(find(node=>node.type==="img").props.onLoad as (event:unknown)=>void)({currentTarget:{naturalWidth:800,naturalHeight:600}});render();}
  render();
  return{render,button,click,change,upload,confirmed,confirmedPhotos,canceled,workers,revoked,timers,find,labelControl,text:()=>text(tree),imports:()=>imports,visible:()=>visible(tree),
    defer(){deferInitialization=true;},fail(){failInitialization=true;},finishInit(){initResolvers.shift()?.(workers.at(-1)!);},
    unmount(){effects.forEach(effect=>effect.cleanup?.());},
  };
}
async function flush(){for(let i=0;i<12;i++)await Promise.resolve();}

test("specifications are blank until entered or explicitly loaded, and confirmation is invalidated by edits",()=>{
  const h=harness();assert.equal(h.button("Confirm Spin").props.disabled,true);assert.equal(h.imports(),0);
  h.click("Use illustrative demo settings");assert.equal(h.button("Confirm Spin").props.disabled,true);
  h.change("I reviewed",true);h.click("Confirm Spin");
  assert.equal(h.confirmed.length,1);assert.equal(h.confirmed[0].specSource,"demo-defaults");assert.equal(h.confirmed[0].energyKwh,.7);
  h.change("Electrical input rating","2200");assert.equal(h.button("Confirm Spin").props.disabled,true);
  h.change("I reviewed",true);h.click("Confirm Spin");assert.equal(h.confirmed[1].specSource,"manual");
});

test("rated watts estimate is opt-in and changing category cannot silently reuse previous specifications",()=>{
  const h=harness();h.click("Use illustrative demo settings");
  h.change("I only know rated watts",true);h.change("I reviewed",true);h.click("Confirm Spin");
  assert.equal(h.confirmed[0].energyBasis,"rated-power-estimate");assert.equal(h.confirmed[0].energyKwh,2.5);
  h.change("Appliance category","frost","select");
  assert.equal(h.labelControl("Electrical input rating").props.value,"");
  assert.equal(h.button("Confirm Frost").props.disabled,true);assert.match(h.text(),/Food storage stays powered/);
});

test("nameplate photo alone starts no OCR; results remain candidate text until user applies and reviews",async()=>{
  const h=harness();h.upload();assert.equal(h.imports(),0);assert.deepEqual(h.confirmed,[]);
  const job=h.click("Read label on this device");await flush();assert.equal(h.imports(),1);
  h.workers[0].resolve("Electrical input 2200 W\nEnergy per cycle 0.8 kWh");await job;h.render();
  assert.equal(h.labelControl("Electrical input rating").props.value,"");assert.equal(h.button("Confirm Spin").props.disabled,true);
  h.click("Use 2200 W");h.click("Use 0.8 kWh");
  assert.equal(h.labelControl("Electrical input rating").props.value,"2200");
  assert.equal(h.labelControl("Energy per run").props.value,"0.8");assert.deepEqual(h.confirmed,[]);
  assert.equal(h.workers[0].terminated,true);assert.equal(h.timers.size,0);
  h.unmount();assert.equal(h.revoked.length,1);
});

test("cancel, late initialization and unmount cannot apply stale OCR results or leave workers running",async()=>{
  const h=harness();h.upload();h.defer();const job=h.click("Read label on this device");await flush();
  h.click("Cancel reading");h.finishInit();await job;h.render();
  assert.equal(h.workers[0].terminated,true);assert.match(h.text(),/Reading canceled/);assert.equal(h.timers.size,0);
  const second=harness();second.upload();const reading=second.click("Read label on this device");await flush();
  second.unmount();assert.equal(second.workers[0].terminated,true);second.workers[0].resolve("Input 999 W");await reading;
  assert.equal(second.confirmed.length,0);assert.equal(second.revoked.length,1);
});

test("OCR startup failure and timeout retain manual entry without claiming a recognized specification",async()=>{
  const failed=harness();failed.upload();failed.fail();await failed.click("Read label on this device");failed.render();
  assert.match(failed.text(),/OCR could not finish/);failed.click("Use illustrative demo settings");failed.change("I reviewed",true);failed.click("Confirm Spin");assert.equal(failed.confirmed[0].specSource,"demo-defaults");
  const slow=harness();slow.upload();const job=slow.click("Read label on this device");await flush();
  [...slow.timers.values()][0]();slow.render();assert.match(slow.text(),/timed out/);assert.equal(slow.workers[0].terminated,true);
  slow.workers[0].resolve("Input 900 W");await job;slow.render();assert.equal(slow.labelControl("Electrical input rating").props.value,"");
});


test("three-step navigation preserves edits and exposes confirmation only in the reviewed routine step",()=>{
  const h=harness();
  const shown=(label:string)=>h.visible().includes(h.button(label));
  assert.equal(shown("Confirm Spin"),false);
  h.click("Use illustrative demo settings");
  h.change("Electrical input rating","2200");
  h.change("Energy per run","0.8");
  h.click("Set routine");
  assert.equal(shown("Confirm Spin"),true);
  assert.equal(h.button("Confirm Spin").props.disabled,true);
  h.change("Earliest available start","9","select");
  h.click("1Scan label");
  assert.equal(shown("Confirm Spin"),false);
  h.click("2Energy");
  assert.equal(h.labelControl("Electrical input rating").props.value,"2200");
  assert.equal(h.labelControl("Energy per run").props.value,"0.8");
  h.click("3Routine");
  assert.equal(h.labelControl("Earliest available start","select").props.value,"9");
  // The following UI events mutate this array; do not narrow its length across them.
  assert.equal(Number(h.confirmed.length),0);
  h.change("I reviewed",true);h.click("2Energy");
  h.change("Energy per run","0.9");h.click("3Routine");
  assert.equal(h.button("Confirm Spin").props.disabled,true,"Editing another step invalidates previous review");
  h.change("I reviewed",true);h.click("Confirm Spin");
  assert.equal(h.confirmed.length,1);assert.equal(h.confirmed[0].energyKwh,.9);assert.equal(h.confirmed[0].earliestStartHour,9);
});

test("confirmation forwards only the current photo and releases its own preview without persisting an image",()=>{
  const h=harness();const first={type:"image/png",name:"old.png",size:10000},current={type:"image/png",name:"current.png",size:10001};
  h.upload(first);const oldUrl=String(h.find(node=>node.type==="img").props.src);
  h.upload(current);assert.deepEqual(h.revoked,[oldUrl]);
  const currentUrl=String(h.find(node=>node.type==="img").props.src);
  h.click("Use illustrative demo settings");h.click("Set routine");h.change("I reviewed",true);h.click("Confirm Spin");
  assert.equal(h.confirmedPhotos[0],current);assert.equal("photo" in h.confirmed[0],false);
  assert.deepEqual(h.revoked,[oldUrl,currentUrl]);
  h.unmount();assert.equal(h.revoked.length,2,"Cleanup never revokes an already released preview twice");
});

test("canceling specification review never confirms and releases the photo when the parent closes it",()=>{
  const h=harness();h.upload();const url=String(h.find(node=>node.type==="img").props.src);
  h.click("3Routine");h.click("Cancel");assert.equal(h.canceled.length,1);assert.deepEqual(h.confirmed,[]);
  h.unmount();assert.deepEqual(h.revoked,[url]);assert.equal(h.imports(),0);
});


test("EV setup requires independent vehicle confirmation; example values and category switches cannot bypass it",()=>{
  const h=harness();
  h.change("Appliance category","evie","select");h.click("Use illustrative demo settings");
  h.change("I reviewed",true);assert.equal(h.button("Confirm Evie").props.disabled,true);
  h.change("This is an EV",true);assert.equal(h.button("Confirm Evie").props.disabled,true);
  h.change("I reviewed",true);h.click("Confirm Evie");
  assert.equal(h.confirmed.length,1);assert.equal(h.confirmed[0].id,"evie");
  assert.equal(h.confirmed[0].ratedPowerW,7000);assert.equal(h.confirmed[0].energyKwh,12);
  h.change("Appliance category","spin","select");h.change("Appliance category","evie","select");
  h.click("Use illustrative demo settings");h.change("I reviewed",true);
  assert.equal(h.button("Confirm Evie").props.disabled,true);
  assert.equal(h.labelControl("This is an EV").props.checked,false);
});
