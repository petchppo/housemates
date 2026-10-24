export type NameplateHints = { powerWatts: number[]; cycleEnergyKwh: number[]; warnings: string[] };

/** Extract candidates only. No voltage/current multiplication, identity inference or automatic acceptance. */
export function parseNameplateText(raw: unknown): NameplateHints {
  const warnings:string[]=[];
  if(typeof raw!=="string"||raw.length>20000)return {powerWatts:[],cycleEnergyKwh:[],warnings:["Nameplate text is missing or too long. Enter specifications manually."]};
  const powerWatts:number[]=[],cycleEnergyKwh:number[]=[];
  const normalized=raw.replaceAll("\u00a0"," ").replace(/[−–—]/g,"-");
  // Never take the final endpoint of a range or a separated negative sign as a rating.
  const ambiguousPrefix=(line:string,index:number)=> /(?:-|±|\bto)\s*$/i.test(line.slice(0,index));
  const thermal=/\b(cooling|heating)\s+(capacity|output)|\b(?:rated\s+)?output\b|\bBTU\b/i;
  const lowPower=/\bstand\s*-?\s*by\b|\boff[ -]?mode\b|\bdelay(?:ed)?[ -]start\b|\bsleep[ -](?:mode|power)\b/i;
  const electricalInput=/\b(?:electrical|rated|power)\s+input\b|\binput\s+power\b|\bconnection\s+rating\b/i;
  const lines=normalized.split(/[\r\n]+/);
  const periodQualified=/\b(annual|annum|yearly|year|daily|day)\b|100\s*(?:cycles|loads)|(?:per|\/)\s*(?:kg|lb|24\s*h)\b/i.test(normalized);
  for(let index=0;index<lines.length;index++) {
    const line=lines[index];
    if(/\d+(?:\.\d+)?\s*(?:kWh|kW|W)?\s*(?:-|±|\bto\b)\s*\d+(?:\.\d+)?\s*(?:kWh|kW|W)\b/i.test(line)) {
      warnings.push("A range or tolerance was found. Enter the rating for the specific operating mode manually.");
      continue;
    }
    const context=[lines[index-1]??"",line,lines[index+1]??""].join(" ");
    const hasExplicitInput=electricalInput.test(line);
    const nonOperating=lowPower.test(line)||(!hasExplicitInput&&lowPower.test(context));
    if(nonOperating) {
      if(/\d\s*(kW|W)\b/i.test(line))warnings.push("Standby, off-mode and delay-start ratings were ignored; they are not active operating power.");
    } else if(thermal.test(line)||(!hasExplicitInput&&thermal.test(context))) {
      if(/\d\s*(kW|W)\b/i.test(line))warnings.push("Thermal output/capacity was ignored; it is not electrical input power.");
    } else {
      for(const match of line.matchAll(/(?<![\w.,-])(\d+(?:\.\d+)?)\s*(kW|W)\b/gi)) {
        if(ambiguousPrefix(line,match.index??0))continue;
        const value=Number(match[1])*(match[2].toLowerCase()==="kw"?1000:1);
        if(value>=1&&value<=30000)powerWatts.push(value);
      }
    }
    if(periodQualified) {
      if(/kWh/i.test(line))warnings.push("Period- or weight-qualified energy was not treated as one cycle. Convert it yourself only when the label period and units are known.");
    } else for(const match of line.matchAll(/(?<![\w.,-])(\d+(?:\.\d+)?)\s*kWh\b/gi)) {
      if(ambiguousPrefix(line,match.index??0))continue;
      const value=Number(match[1]);
      if(value>=.001&&value<=200)cycleEnergyKwh.push(value);
    }
  }
  if(/\d,\d/.test(raw))warnings.push("Comma-formatted numbers need manual review; they may be decimals or thousands separators.");
  if(!powerWatts.length)warnings.push("No unambiguous electrical W/kW input was found. Voltage and current alone are not accepted as operating power.");
  if(!cycleEnergyKwh.length)warnings.push("No single-cycle kWh candidate was found. Rated watts alone do not measure cycle consumption.");
  if(new Set(powerWatts).size>1)warnings.push("Several power ratings were found. Choose the electrical input that matches your appliance and operating mode.");
  return {powerWatts:[...new Set(powerWatts)].slice(0,12),cycleEnergyKwh:[...new Set(cycleEnergyKwh)].slice(0,12),warnings:[...new Set(warnings)]};
}
