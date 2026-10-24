"use client";

import { HouseholdScene3D } from "./household-scene-3d";
import { ScrollStage } from "./scroll-stage";

const noSelection = () => {};

/** A passive introduction. All scheduling and interactive controls live in the demo. */
export function LandingWorld() {
  return <ScrollStage label="Meet your little world" className="landing-world" travel={1.35}>{progress => {
    const hour = 8 + progress * 24;
    const caption = progress < .34 ? "A home full of familiar faces." : progress < .58 ? "A little coordination, around your day." : progress < .86 ? "Even little worlds need their rest." : "A new day. The same home team.";
    return <div className="landing-world-content">
      <div className="landing-world-heading">
        <p className="landing-eyebrow">SMALL APPLIANCES. BIG TEAM ENERGY.</p>
        <h1>Your home.<br/><em>A whole little team.</em></h1>
        <p>Meet the applimon behind a more thoughtful everyday.</p>
      </div>
      <div className="landing-world-model">
        <HouseholdScene3D selected="evie" onSelect={noSelection} hour={hour} activeIds={[]} scrollProgress={progress} presentation/>
      </div>
      <div className="landing-world-caption"><p>{caption}</p><span>SCROLL TO EXPLORE <b aria-hidden="true">↓</b></span></div>
    </div>;
  }}</ScrollStage>;
}
