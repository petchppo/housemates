import Link from "next/link";
import { LandingWorld } from "@/components/landing-world";
import { PhoneStory } from "@/components/phone-story";
import { PixelAppliance } from "@/components/pixel-appliance";
import "@/components/landing-page.css";

export default function Home() {
  return <div className="landing-page">
    <header className="landing-nav">
      <Link href="/" className="landing-brand" aria-label="Housemates home"><span aria-hidden="true">⌂</span>housemates<span className="landing-brand-dot">.</span></Link>
      <Link href="/demo" className="landing-cta">Join the demo <span aria-hidden="true">↗</span></Link>
    </header>
    <main>
      <LandingWorld/>
      <PhoneStory minimal/>
      <section className="landing-finale" aria-labelledby="landing-finale-title">
        <div className="landing-crew" aria-hidden="true"><PixelAppliance id="evie"/><PixelAppliance id="bubbles"/><PixelAppliance id="chill"/></div>
        <p className="landing-eyebrow">YOUR EVERYDAY. A LITTLE MORE CONNECTED.</p>
        <h2 id="landing-finale-title">A thoughtful home starts<br/>with a little teamwork.</h2>
        <p>Build your world. Meet your applimon. Make a plan together.</p>
        <Link href="/demo" className="landing-cta">Join the demo <span aria-hidden="true">↗</span></Link>
        <p className="landing-disclosure">A simulated household with working energy calculations.<br/>Synthetic prices and activity. No appliances connected.</p>
      </section>
    </main>
    <footer className="landing-footer"><span>Housemates · Stanford CleanTech prototype</span><Link href="/energy-parliament">Explore the calculation lab ↗</Link></footer>
  </div>;
}
