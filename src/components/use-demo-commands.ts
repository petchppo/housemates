"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { DemoScenario } from "@/domain/demo";
import type { ApplianceId } from "@/domain/appliances";
import type { OptimizationMode } from "@/domain/scheduling";
import { createDemoCommandSession, requestDemoCommand, approveDemoCommand, rejectDemoCommand, advanceDemoExecution, setDemoExecutionPaused, serializeDemoCommandSession, restoreDemoCommandSession, resetDemoCommandSession, getDemoExecutionStats, type DemoCommandSession } from "@/domain/demo-commands";
import type { ApplianceChatMessage } from "./appliance-chat";

const STORAGE_KEY = "housemates-demo-execution-v1";
const introduction: ApplianceChatMessage = {id:"welcome",role:"housemates",source:"system",text:"Your team is here. Ask for a cheaper plan, change an appliance deadline, or call a housemate. I’ll show a projection first. Only your approval starts a simulated run; no real device is connected."};

/** Chat and voice share one proposal gate; preview scrubbing never advances execution. */
export function useDemoCommands(scenario: DemoScenario, mode: OptimizationMode) {
  const initial=useMemo(()=>createDemoCommandSession(scenario,mode),[scenario,mode]);
  const [session,setSession]=useState(initial);
  const [messages,setMessages]=useState<ApplianceChatMessage[]>([introduction]);
  const [ready,setReady]=useState(false);
  const [storageNotice,setStorageNotice]=useState("");
  const current=useRef(session);
  const sequence=useRef(0);
  const context=useRef(initial.contextFingerprint);

  function append(role:ApplianceChatMessage["role"],text:string,source:ApplianceChatMessage["source"]="system") {
    const message={id:`chat-${++sequence.current}`,role,text,source};
    setMessages(value=>[...value,message].slice(-60));
  }
  function commit(next:DemoCommandSession) {
    current.current=next;setSession(next);
    if(next.approved)try{const stored=serializeDemoCommandSession(next,scenario);if(!stored)throw new Error("Invalid simulation snapshot");localStorage.setItem(STORAGE_KEY,stored);setStorageNotice("Approved plan and simulated progress saved on this browser. Audio and chat transcripts are not saved.");}
    catch{setStorageNotice("Simulation works for this session; browser storage could not save progress.");}
  }

  useEffect(()=>{
    let cancelled=false;
    queueMicrotask(()=>{
      if(cancelled)return;
      let next=initial;
      try{
        const restored=restoreDemoCommandSession(localStorage.getItem(STORAGE_KEY),scenario);
        if(restored){next=restored;setStorageNotice(restored.status==="completed"?"Restored completed simulation. Chat and audio are not saved.":"Restored approved simulation, paused. Resume explicitly to continue.");}
      }catch{setStorageNotice("Browser storage is unavailable. Calls, chat and simulation still work for this session.");}
      current.current=next;context.current=initial.contextFingerprint;setSession(next);setMessages([introduction]);setReady(true);
    });
    return()=>{cancelled=true;};
  },[initial,scenario]);

  useEffect(()=>{
    if(!ready||session.status!=="running")return;
    const save=(next:DemoCommandSession)=>{
      current.current=next;setSession(next);
      try{const stored=serializeDemoCommandSession(next,scenario);if(!stored)throw new Error("Invalid simulation snapshot");localStorage.setItem(STORAGE_KEY,stored);}
      catch{setStorageNotice("Simulation works for this session; browser storage could not save progress.");}
    };
    const timer=window.setInterval(()=>{
      if(document.hidden)return;
      const before=current.current;
      const result=advanceDemoExecution(before,scenario,Math.min(48,before.executionHour+.1));
      save(result.session);
      const previousStats=getDemoExecutionStats(before,scenario), nextStats=getDemoExecutionStats(result.session,scenario);
      const updates:ApplianceChatMessage[]=[];
      for(const id of ["evie","bubbles"] as const){
        const stat=nextStats[id];
        if(previousStats[id].status===stat.status)continue;
        if(stat.status==="active"||stat.status==="complete")updates.push({id:`chat-${++sequence.current}`,role:id,source:"system",text:stat.status==="active"?"My simulated task has started. The approved schedule is running.":`My simulated task is complete: ${stat.completedEnergyKwh.toFixed(2)} kWh, $${stat.accruedCostUsd.toFixed(2)} and ${(stat.accruedCarbonGrams/1000).toFixed(3)} kg modeled CO₂e. These are simulation results, not device measurements.`});
      }
      if(updates.length)setMessages(value=>[...value,...updates].slice(-60));
      if(before.status!=="completed"&&result.session.status==="completed"){
        const message:ApplianceChatMessage={id:`chat-${++sequence.current}`,role:"housemates",source:"system",text:result.reply};
        setMessages(value=>[...value,message].slice(-60));
      }
    },500);
    const visibility=()=>{if(document.hidden&&current.current.status==="running")save(setDemoExecutionPaused(current.current,scenario,true).session);};
    document.addEventListener("visibilitychange",visibility);
    return()=>{window.clearInterval(timer);document.removeEventListener("visibilitychange",visibility);};
  },[ready,session.status,scenario]);

  function send(appliance:ApplianceId,text:string,source:"text"|"voice") {
    if(!ready||!text.trim())return;
    append("user",text.slice(0,1200),source);
    const result=requestDemoCommand(current.current,scenario,appliance,text);
    commit(result.session);append(appliance,result.reply,source);
    return result.reply;
  }
  function approve(id:string) {
    if(!ready||context.current!==initial.contextFingerprint)return;
    const result=approveDemoCommand(current.current,scenario,id);
    commit(result.session);append("housemates",result.reply);
  }
  function reject(id:string) {
    if(current.current.pending?.id!==id)return;
    const result=rejectDemoCommand(current.current,scenario);commit(result.session);append("housemates",result.reply);
  }
  function pause(paused:boolean) {
    const result=setDemoExecutionPaused(current.current,scenario,paused);commit(result.session);append("housemates",result.reply);
  }
  function finishSimulation() {
    if(!current.current.approved||current.current.status==="completed")return;
    // Explicit demo acceleration, not a claim that physical tasks were performed.
    const resumed=setDemoExecutionPaused(current.current,scenario,false).session;
    if(!resumed.approved){commit(resumed);return;}
    const end=Math.max(...resumed.approved.plan.schedules.map(item=>item.endHour));
    const result=advanceDemoExecution(resumed,scenario,end);commit(result.session);append("housemates",result.reply);
  }
  function reset() {
    const next=resetDemoCommandSession(current.current,scenario);current.current=next;setSession(next);
    try{localStorage.removeItem(STORAGE_KEY);setStorageNotice("New simulation day. Previous run cleared on this browser.");}
    catch{setStorageNotice("New day for this session only. Storage could not clear the previous run; it may return after refresh.");}
    append("housemates",`A new simulated day starts at hour ${next.executionHour}. Ask for a plan, review the projection, then approve it. No completed savings have been carried into this new run.`);
  }
  return {session,messages,ready,storageNotice,send,approve,reject,pause,finishSimulation,reset};
}
