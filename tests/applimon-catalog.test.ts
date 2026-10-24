import assert from "node:assert/strict";
import test from "node:test";
import { APPLIMON_CATALOG, APPLIMON_IDS, createDemoApplimon, validateApplimonDevice, validateApplimonInventory } from "../src/domain/applimon-catalog";
import { parseNameplateText } from "../src/domain/nameplate";

test("ten distinct categories have reviewed example specs and protected operation stays explicit",()=>{
  assert.equal(APPLIMON_CATALOG.length,10);
  assert.equal(new Set(APPLIMON_CATALOG.map(row=>row.id)).size,10);
  for(const id of APPLIMON_IDS){const example=createDemoApplimon(id);assert.deepEqual(validateApplimonDevice(example),example);assert.equal(example.specSource,"demo-defaults");}
  assert.deepEqual(APPLIMON_CATALOG.filter(row=>row.schedulingPolicy==="protected").map(row=>row.id),["chill","ember","frost"]);
  assert.equal(APPLIMON_CATALOG.find(row=>row.id==="breeze")?.schedulingPolicy,"fixed");
});

test("confirmed-spec boundary rejects impossible units, silent estimates, duplicates and forged fields",()=>{
  const valid=createDemoApplimon("spin");
  for(const change of [{confirmed:false},{ratedPowerW:0},{ratedPowerW:Infinity},{energyKwh:300},{energyKwh:3},{durationHours:0},{earliestStartHour:.5},{latestStartHour:7},{deadlineHour:49},{energyBasis:"rated-power-estimate"},{specSource:"recognized"},{id:"__proto__"}])assert.equal(validateApplimonDevice({...valid,...change}),null);
  assert.equal(validateApplimonDevice({...createDemoApplimon("evie"),durationHours:2}),null);
  assert.equal(validateApplimonInventory([valid,valid]),null);
  assert.equal(validateApplimonInventory(new Array(1)),null);
  assert.deepEqual(validateApplimonDevice({...valid,photo:"private",recognizedModel:"untrusted"}),valid);
  assert.ok(validateApplimonDevice({...valid,deadlineHour:8}),"Infeasibility is reported by planning, not discarded as malformed preferences");
  assert.ok(validateApplimonDevice({...valid,energyBasis:"rated-power-estimate",energyKwh:2.5}));
});

test("nameplate candidates require explicit electrical units and never infer watts from voltage/current",()=>{
  const hints=parseNameplateText("Electrical input: 1.8 kW\nEnergy per cycle: 1.2 kWh\n230 V 10 A 50 Hz");
  assert.deepEqual(hints.powerWatts,[1800]);assert.deepEqual(hints.cycleEnergyKwh,[1.2]);
  assert.deepEqual(parseNameplateText("230 V 10 A 50 Hz").powerWatts,[]);
  assert.deepEqual(parseNameplateText("-500 W 1,800 W NaN W 40000 W").powerWatts,[]);
  assert.deepEqual(parseNameplateText("Input 100 W\nInput 200 W\nInput 100 W").powerWatts,[100,200]);
  assert.match(parseNameplateText("Input 100 W\nInput 200 W").warnings.join(" "),/Several power/);
});

test("nameplate parser abstains on thermal output and period/weight qualified energy, including stacked labels",()=>{
  for(const label of ["Cooling capacity 3.5 kW","Rated output 3500 W","Heating output\n3000 W","3500 W\nCooling capacity"]){assert.deepEqual(parseNameplateText(label).powerWatts,[],label);}
  for(const label of ["68 kWh\n100 cycles","120 kWh\nper annum","0.5 kWh/kg","Energy per year: 220 kWh","1.2 kWh/day","42 kWh per 100 loads"]){assert.deepEqual(parseNameplateText(label).cycleEnergyKwh,[],label);assert.match(parseNameplateText(label).warnings.join(" "),/Period-/);}
  assert.deepEqual(parseNameplateText(null).powerWatts,[]);
  assert.deepEqual(parseNameplateText("x".repeat(20001)).cycleEnergyKwh,[]);
});


test("actual OCR regressions separate standby/thermal ratings from explicit active electrical input",()=>{
  assert.deepEqual(parseNameplateText("Standby power: 2 W\nOff-mode: 1 W\nRated input: 2000 W").powerWatts,[2000]);
  assert.deepEqual(parseNameplateText("Network standby: 2 W\nDelay start: 4 W").powerWatts,[]);
  assert.deepEqual(parseNameplateText("Standby power\n2 W").powerWatts,[]);
  assert.deepEqual(parseNameplateText("Cooling output: 3500 W\nElectrical input: 1200 W").powerWatts,[1200]);
  assert.deepEqual(parseNameplateText("Electrical input: 1200 W\nCooling output: 3500 W").powerWatts,[1200]);
  assert.deepEqual(parseNameplateText("Cooling output 3500 W / electrical input 1200 W").powerWatts,[],"Ambiguous same-line mixed ratings require manual entry");
});

test("ranges, Unicode negative signs and separated minus signs never become single numeric candidates",()=>{
  for(const value of ["100 - 200 W","100 W - 200 W","100 W to 200 W","100–200 W","100 to 200 W","−500 W","- 500 W","1.5 ± 0.5 W"]){assert.deepEqual(parseNameplateText(value).powerWatts,[],value);}
  for(const value of ["0.5 - 1.2 kWh","0.5 kWh - 1.2 kWh","0.5 kWh to 1.2 kWh","0.5–1.2 kWh","−1.2 kWh","- 1.2 kWh"]){assert.deepEqual(parseNameplateText(value).cycleEnergyKwh,[],value);}
  assert.deepEqual(parseNameplateText("Input: 2000 W\nEnergy per cycle: 0.7 kWh").powerWatts,[2000]);
  assert.deepEqual(parseNameplateText("Input: 2000 W\nEnergy per cycle: 0.7 kWh").cycleEnergyKwh,[.7]);
});
