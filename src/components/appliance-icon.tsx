import type { ApplianceId } from "@/domain/appliances";

export function ApplianceIcon({ id, className = "" }: { id: ApplianceId; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {id === "evie" ? <><path d="m10 22 4-10h20l4 10M8 22h32v15H8zM14 37v4m20-4v4M8 28h5m22 0h5"/><path d="m25 23-5 7h7l-4 7"/></>
        : id === "bubbles" ? <><rect x="10" y="7" width="28" height="35" rx="4"/><path d="M10 16h28m-21-5h1m4 0h1"/><circle cx="24" cy="29" r="9"/><path d="M16 29q4-4 8 0t8 0"/></>
        : <><rect x="5" y="8" width="38" height="17" rx="4"/><path d="M10 20h28M16 30v7m8-7v12m8-12v7m-20-4 4 4 4-4m8 0 4 4 4-4"/></>}
    </svg>
  );
}
