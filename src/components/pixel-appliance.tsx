import type { ApplianceId } from "../domain/appliances";

export type PixelApplianceProps = { id: ApplianceId; className?: string; sleeping?: boolean };

const ink = "#302b3c";

/** Original 32px appliance sprites. Parent controls supply accessible names. */
export function PixelAppliance({ id, className, sleeping = false }: PixelApplianceProps) {
  return <svg viewBox="0 0 32 32" width="32" height="32" className={className}
    shapeRendering="crispEdges" aria-hidden="true" focusable="false" fill="none">
    <path d="M5 28h22v2H5z" fill={ink} opacity=".12"/>
    {id === "evie" ? <>
      <path d="M9 5h14v2h3v7h3v11h-3v4h-6v-4h-8v4H6v-4H3V14h3V7h3z" fill={ink}/>
      <path d="M10 7h12v2h2v7h3v7H5v-7h3V9h2z" fill="#d4e98e"/>
      <path d="M10 9h12v6H10z" fill="#6d8790"/>
      <path d="M10 9h5v2h-5z" fill="#e9f4da"/>
      <path d="M5 18h22v5H5z" fill="#aac367"/>
      <path d="M5 18h4v3H5zm18 0h4v3h-4z" fill="#fff5ca"/>
      <path d={sleeping ? "M11 13h3v1h-3zm7 0h3v1h-3z" : "M12 11h2v3h-2zm6 0h2v3h-2z"} fill="#f7f4e8"/>
      <path d="M14 20h4v1h-4zM7 25h4v2H7zm14 0h4v2h-4z" fill={ink}/>
      <path d="M16 15h2l-2 2h2l-3 3v-3h-1z" fill="#f6f9d5"/>
    </> : id === "bubbles" ? <>
      <path d="M6 4h20v2h2v21h-3v2h-4v-2H11v2H7v-2H4V6h2z" fill={ink}/>
      <path d="M6 6h20v19H6z" fill="#efb299"/>
      <path d="M6 6h20v5H6z" fill="#ffdac1"/>
      <path d="M8 7h2v2H8zm4 0h2v2h-2zm8 1h4v1h-4zM6 11h20v1H6z" fill={ink}/>
      <path d="M11 14h10v2h2v5h-2v2H11v-2H9v-5h2z" fill="#cf8b7c"/>
      <path d="M12 14h8v2h2v4h-2v2h-8v-2h-2v-4h2z" fill="#fff0d9"/>
      <path d={sleeping ? "M12 17h3v1h-3zm6 0h3v1h-3z" : "M13 16h2v3h-2zm5 0h2v3h-2z"} fill={ink}/>
      <path d="M15 20h3v1h-3z" fill={ink}/>
      <path d="M27 1h3v3h-3zM1 9h2v2H1z" fill="#a4d0d8"/>
      <path d="M28 1h2v1h-2z" fill="#eef7ee"/>
    </> : <>
      <path d="M4 7h24v2h2v14h-2v2H4v-2H2V9h2z" fill={ink}/>
      <path d="M4 9h24v14H4z" fill="#a7cfdd"/>
      <path d="M4 9h24v10H4z" fill="#d8edf0"/>
      <path d="M5 10h22v2H5z" fill="#edf7ef"/>
      <path d={sleeping ? "M9 15h4v1H9zm10 0h4v1h-4z" : "M10 13h2v3h-2zm10 0h2v3h-2z"} fill={ink}/>
      <path d="M14 17h4v1h-4zM6 20h20v1H6zm0 2h20v1H6z" fill={ink}/>
      <path d="M8 26h2v3H8zm7 0h2v4h-2zm7 0h2v3h-2z" fill="#6e9aaa"/>
      <path d="M22 2h2v2h2v2h-2v2h-2V6h-2V4h2z" fill="#a7cfdd"/>
    </>}
    {sleeping && <path d="M1 1h5v1H4v1H3v1h3v1H1V4h2V3h1V2H1z" fill="#807095"/>}
  </svg>;
}
