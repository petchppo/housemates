import type { ApplimonId } from "@/domain/applimon-catalog";
import { getApplimon } from "@/domain/applimon-catalog";
import { PixelAppliance } from "./pixel-appliance";

/** Original code-native pixel portraits; core characters retain their established artwork. */
export function ApplimonSprite({ id, className = "" }: { id: ApplimonId; className?: string }) {
  const entry=getApplimon(id);
  if(entry.legacyId)return <PixelAppliance id={entry.legacyId} className={className}/>;
  const body=entry.color,accent=entry.accent,ink="#41384b",light="#fff7e9";
  return <svg className={className} viewBox="0 0 32 32" role="img" aria-label={`${entry.name}, ${entry.category}`} style={{imageRendering:"pixelated"}} shapeRendering="crispEdges">
    <path d="M6 29H26V31H6Z" fill="#b4aa9b" opacity=".3"/>
    {entry.shape==="vacuum"?<><path d="M6 12H26V15H29V24H26V27H6V24H3V15H6Z" fill={ink}/><path d="M7 14H25V16H27V23H24V25H8V23H5V16H7Z" fill={body}/><path d="M12 10H20V15H12Z" fill={accent}/><path d="M8 21H24V23H8Z" fill={accent}/></>:entry.shape==="fan"?<><path d="M12 24H20V29H24V31H8V29H12Z" fill={accent}/><path d="M9 2H23V5H27V9H30V19H27V23H23V26H9V23H5V19H2V9H5V5H9Z" fill={ink}/><path d="M10 4H22V7H25V10H28V18H25V21H22V24H10V21H7V18H4V10H7V7H10Z" fill={body}/><path d="M12 7H20V13H25V17H20V22H12V17H7V13H12Z" fill={accent}/></>:<><path d={entry.shape==="tank"?"M10 2H22V4H25V28H22V30H10V28H7V4H10Z":"M6 3H26V29H6Z"} fill={ink}/><path d={entry.shape==="tank"?"M11 4H21V6H23V26H21V28H11V26H9V6H11Z":"M8 5H24V27H8Z"} fill={body}/><path d="M9 6H23V9H9Z" fill={light}/>{entry.shape==="washer"||entry.shape==="dryer"?<><path d="M12 12H20V14H22V22H20V24H12V22H10V14H12Z" fill={accent}/><path d="M13 14H19V16H20V21H18V22H13V20H12V16H13Z" fill={entry.shape==="dryer"?"#f5dc96":"#b7d6df"}/></>:entry.shape==="fridge"?<><path d="M8 14H24V16H8Z" fill={accent}/><path d="M21 10H23V13H21ZM21 17H23V22H21Z" fill={ink}/></>:entry.shape==="dehumidifier"?<><path d="M10 19H22V21H10ZM10 23H22V25H10Z" fill={accent}/><path d="M14 10H18V14H20V17H12V14H14Z" fill="#e6f6f6"/></>:<><path d="M13 9H19V18H13Z" fill={accent}/><path d="M14 20H18V25H14Z" fill="#f4a26f"/></>}<path d="M9 29H13V31H9ZM19 29H23V31H19Z" fill={accent}/></>}
    <path d={entry.shape==="vacuum"?"M10 17H13V20H10ZM19 17H22V20H19Z":entry.shape==="fan"?"M10 12H13V15H10ZM19 12H22V15H19Z":"M10 10H12V12H10ZM20 10H22V12H20Z"} fill={ink}/>
    <path d={entry.shape==="vacuum"?"M15 20H18V21H15Z":entry.shape==="fan"?"M14 17H18V18H14Z":"M14 12H18V13H14Z"} fill={ink}/>
  </svg>;
}
