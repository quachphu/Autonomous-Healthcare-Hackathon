import { Link } from "react-router-dom";
import logo from "../assets/logo.png";

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-nn-pale-sky via-white to-nn-mist">
      {/* Header */}
      <header className="flex items-center justify-between px-8 py-5">
        <div className="flex items-center gap-3">
          <img
            src={logo}
            alt="Materna logo"
            className="h-9 w-9 rounded-xl object-contain shadow-sm"
          />
          <span className="text-lg font-bold tracking-tight text-nn-navy">
            Materna
          </span>
        </div>
        <Link
          to="/dashboard"
          className="rounded-xl bg-nn-deep-blue px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-nn-deep-blue-hover transition-colors"
        >
          Open app
        </Link>
      </header>

      {/* Hero */}
      <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <div className="max-w-2xl">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-nn-soft-blue px-4 py-2">
            <img src={logo} alt="Materna" className="h-4 w-4 rounded-md object-cover" />
            <span className="text-xs font-semibold text-nn-deep-blue">
              Voice-first · AI-assisted · rPPG powered
            </span>
          </div>

          <h1 className="mb-5 text-5xl font-bold tracking-tight text-nn-navy">
            Pregnancy wellness,{" "}
            <span className="text-nn-deep-blue">every single day</span>
          </h1>
          <p className="mb-8 text-lg text-nn-navy-light leading-relaxed">
            Materna uses your webcam and remote photoplethysmography to track
            heart rate and respiratory rate. No wearables required! Stay
            connected with your care team and notice changes earlier!
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to="/dashboard"
              className="rounded-xl bg-nn-deep-blue px-8 py-4 text-base font-semibold text-white shadow-sm hover:bg-nn-deep-blue-hover transition-colors"
            >
              Try the demo
            </Link>
            <a
              href="#features"
              className="rounded-xl border border-nn-periwinkle bg-white px-8 py-4 text-base font-semibold text-nn-navy hover:bg-nn-pale-sky transition-colors"
            >
              Learn more
            </a>
          </div>
        </div>
      </main>

      {/* Feature grid */}
      <section
        id="features"
        className="mx-auto grid max-w-4xl grid-cols-1 gap-5 px-6 pb-20 sm:grid-cols-3"
      >
        {[
          {
            icon: (
              <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-7 w-7">
                <circle cx="24" cy="24" r="20" fill="#DBEAFE"/>
                <path d="M14 24 Q18 14 24 18 Q30 14 34 24 Q30 30 24 34 Q18 30 14 24Z" fill="#1D4ED8" opacity="0.15"/>
                <path d="M10 24 C10 24 16 12 24 12 C32 12 38 24 38 24" stroke="#1D4ED8" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
                <circle cx="24" cy="24" r="5" fill="#1D4ED8"/>
                <circle cx="24" cy="24" r="2.5" fill="white"/>
                <path d="M24 10 L24 14M24 34 L24 38M10 24 L14 24M34 24 L38 24" stroke="#1D4ED8" strokeWidth="2" strokeLinecap="round" opacity="0.5"/>
              </svg>
            ),
            title: "rPPG Vitals Monitoring",
            desc: "Camera-based heart rate and breathing estimation — no patches, no wearables, no hassle.",
          },
          {
            icon: (
              <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-7 w-7">
                <circle cx="24" cy="24" r="20" fill="#DBEAFE"/>
                <path d="M34 28 C34 32.4 30.4 36 26 36 C21.6 36 18 32.4 18 28 V16 L22 12 L22 14 L26 12 L26 14 L30 12 L30 16 C32.2 17.1 34 20.3 34 24 V28Z" fill="#1D4ED8" opacity="0.15"/>
                <rect x="14" y="17" width="20" height="17" rx="4" stroke="#1D4ED8" strokeWidth="2.2" fill="none"/>
                <path d="M19 24 L22 27 L29 21" stroke="#1D4ED8" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M18 14 L18 18M30 14 L30 18" stroke="#1D4ED8" strokeWidth="2.2" strokeLinecap="round"/>
              </svg>
            ),
            title: "Care Team Messaging",
            desc: "Direct messaging with your OB, midwife, or doula — with one-tap checkup summaries.",
          },
          {
            icon: (
              <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-7 w-7">
                <circle cx="24" cy="24" r="20" fill="#DBEAFE"/>
                <circle cx="24" cy="20" r="7" stroke="#1D4ED8" strokeWidth="2.2" fill="none"/>
                <path d="M14 38 C14 32.5 18.5 28 24 28 C29.5 28 34 32.5 34 38" stroke="#1D4ED8" strokeWidth="2.2" strokeLinecap="round" fill="none"/>
                <path d="M28 16 Q32 10 36 14" stroke="#1D4ED8" strokeWidth="1.8" strokeLinecap="round" fill="none" opacity="0.6"/>
                <circle cx="36" cy="14" r="2" fill="#1D4ED8" opacity="0.6"/>
              </svg>
            ),
            title: "AI Wellness Companion",
            desc: "Materna AI summarizes your checkup history and care notes — not a diagnosis, just support.",
          },
        ].map(({ icon, title, desc }) => (
          <div key={title} className="rounded-2xl bg-white p-6 shadow-sm border border-nn-mist/60 hover:shadow-md transition-shadow">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-nn-pale-sky">
              {icon}
            </div>
            <h3 className="mb-1.5 font-bold text-nn-navy">{title}</h3>
            <p className="text-sm text-nn-navy-light leading-relaxed">{desc}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
