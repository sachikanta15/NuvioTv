import { useNavigate } from "react-router-dom";
import { ArrowLeft, Heart, Info, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";

const CREDITS = [
  { name: "Stremio add-on protocol", detail: "Community standard for catalogs, metadata and streams" },
  { name: "Cinemeta", detail: "Movie, series and curated Indian metadata" },
  { name: "OpenSubtitles v3", detail: "Subtitle provider add-on" },
  { name: "Real-Debrid & Premiumize", detail: "Optional torrent resolution" },
  { name: "Trakt", detail: "Optional scrobbling and history sync" },
  { name: "hls.js", detail: "HLS playback engine (Apache-2.0)" },
  { name: "dash.js", detail: "DASH playback engine (BSD-3-Clause)" },
  { name: "React", detail: "UI library (MIT)" },
  { name: "Tailwind CSS", detail: "Styling utilities (MIT)" },
  { name: "lucide", detail: "Icons (ISC)" },
];

export function AboutScreen() {
  const navigate = useNavigate();
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 pb-24 pt-6 sm:px-6 lg:px-8 lg:pb-16">
      <header className="flex items-center gap-3">
        <IconButton label="Back" onClick={() => navigate(-1)}>
          <ArrowLeft size={20} />
        </IconButton>
        <h1 className="text-2xl font-bold tracking-tight">About</h1>
      </header>

      <section className="rounded-panel-lg border border-white/8 bg-[rgb(var(--nuvio-card))] p-5 sm:p-6">
        <div className="flex items-center gap-4">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl accent-gradient text-2xl font-black text-on-accent">
            N
          </span>
          <div>
            <h2 className="text-xl font-bold">
              Nuvio<span className="text-[rgb(var(--nuvio-accent))]">TV</span> for the web
            </h2>
            <p className="text-sm text-text-secondary">Version 1.2.0 (web build)</p>
          </div>
        </div>
        <p className="mt-5 text-sm leading-relaxed text-text-secondary">
          An India-first browser port of the Nuvio TV Android TV client. Nuvio is a free,
          open-source media app that turns your own sources into a single library with artwork,
          ratings and your place saved on every screen. The landing page curates Indian cinema
          across eight languages, while the same Stremio add-on protocol brings in everything else
          you install.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <a href="https://nuvio.tv" target="_blank" rel="noreferrer">
            <Button variant="outline" icon={<Info size={16} />}>
              Website
            </Button>
          </a>
          <a
            href="https://github.com/NuvioMedia/NuvioTV"
            target="_blank"
            rel="noreferrer"
          >
            <Button variant="outline" icon={<Heart size={16} />}>
              Source code
            </Button>
          </a>
        </div>
      </section>

      <section className="rounded-panel-lg border border-white/8 bg-[rgb(var(--nuvio-card))] p-5 sm:p-6">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <ShieldCheck size={18} className="text-[rgb(var(--nuvio-accent))]" />
          Privacy & legal
        </h2>
        <ul className="mt-4 space-y-3 text-sm text-text-secondary">
          <li>
            Nuvio TV ships no content. It only connects to add-ons that <em>you</em> choose to
            install, and never proxies or stores media.
          </li>
          <li>
            Your add-ons, library, playback progress and settings are stored locally in this
            browser. Nothing is uploaded.
          </li>
          <li>
            Torrent sources can be played through an optional Real-Debrid or Premiumize key you add
            in Settings → Debrid. The key stays in this browser and is only sent to that provider.
          </li>
          <li>
            Trakt, Simkl and MDBList credentials are also stored locally; Nuvio never sees them.
          </li>
          <li>Released under the GNU General Public License v3.0.</li>
        </ul>
      </section>

      <section className="rounded-panel-lg border border-white/8 bg-[rgb(var(--nuvio-card))] p-5 sm:p-6">
        <h2 className="text-base font-semibold">Credits & attributions</h2>
        <ul className="mt-4 divide-y divide-white/5">
          {CREDITS.map((credit) => (
            <li key={credit.name} className="flex items-center justify-between gap-4 py-3">
              <span className="font-medium">{credit.name}</span>
              <span className="text-right text-sm text-text-tertiary">{credit.detail}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
