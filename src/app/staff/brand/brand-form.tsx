"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/client";
import { Icon } from "@/components/icons";
import { Alert, Card, CardTitle, Checkbox } from "@/components/ui";
import { saveBrandKit, type BrandState } from "./actions";

type Props = {
  codePrefix: string;
  primary: string;
  accent: string;
  logoUrl: string | null;
  organizerLogoUrl: string | null;
  eventName: string;
  tagline: string;
  organizer: string;
  dates: string;
  venue: string;
  sampleHref: string;
};

/** Relative luminance (WCAG) of a #rrggbb colour. */
function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

const PRESETS = [
  { name: "Midnight", primary: "#141414", accent: "#2f3fe0" },
  { name: "Navy", primary: "#0b1535", accent: "#6d5dfc" },
  { name: "Forest", primary: "#0f3d2e", accent: "#22c55e" },
  { name: "Crimson", primary: "#3b0a14", accent: "#e11d48" },
  { name: "Ocean", primary: "#0c4a6e", accent: "#38bdf8" },
  { name: "Sunset", primary: "#431407", accent: "#f97316" },
];

export function BrandForm(p: Props) {
  const [state, action] = useActionState<BrandState, FormData>(saveBrandKit, {});
  const [primary, setPrimary] = useState(p.primary);
  const [accent, setAccent] = useState(p.accent);
  const [logo, setLogo] = useState<string | null>(p.logoUrl);
  const [orgLogo, setOrgLogo] = useState<string | null>(p.organizerLogoUrl);
  const e = state.fieldErrors ?? {};
  // The card picks white or ink text automatically; warn when the accent is hard to see on the background.
  const text = luminance(primary) > 0.55 ? "#111111" : "#ffffff";
  const accentVisible = contrast(accent, primary) >= 1.8;
  const onAccent = contrast(accent, "#ffffff") >= 4.5 ? "#ffffff" : "#111111";
  const previewFile = (setter: (v: string | null) => void) => (ev: React.ChangeEvent<HTMLInputElement>) => {
    const f = ev.target.files?.[0];
    setter(f ? URL.createObjectURL(f) : null);
  };

  return (
    <form action={action} className="grid gap-6 xl:grid-cols-[1fr_22rem]">
      <div className="space-y-6">
        {state.error && <Alert tone="red">{state.error}</Alert>}
        {state.ok && <Alert tone="green">{state.message}</Alert>}
        <Card>
          <CardTitle description="Shown on every ID card, your event page and registration form. PNG or JPG, up to 2 MB. A square logo on a transparent background looks best.">Logos</CardTitle>
          <div className="grid gap-6 md:grid-cols-2">
            <LogoInput name="logo" label="Hackathon logo" url={logo} error={e.logo} onChange={previewFile(setLogo)} hasSaved={Boolean(p.logoUrl)} />
            <LogoInput name="organizer_logo" label="Organiser logo" url={orgLogo} error={e.organizer_logo} onChange={previewFile(setOrgLogo)} hasSaved={Boolean(p.organizerLogoUrl)} />
          </div>
        </Card>
        <Card>
          <CardTitle description="The card background and the accent used for the role badge, team name and ID boxes.">Colours</CardTitle>
          <div className="grid gap-4 sm:grid-cols-2">
            <ColourInput name="primary_color" label="Card background" value={primary} onChange={setPrimary} error={e.primary_color} />
            <ColourInput name="accent_color" label="Accent" value={accent} onChange={setAccent} error={e.accent_color} />
          </div>
          {!accentVisible && (
            <div className="mt-4"><Alert tone="amber" title="Low contrast">The accent is very close to the background, so badges and ID boxes will be hard to see. Pick a lighter or darker accent.</Alert></div>
          )}
          <p className="mt-5 text-sm font-bold text-ink">Quick presets</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {PRESETS.map((s) => (
              <button key={s.name} type="button" onClick={() => { setPrimary(s.primary); setAccent(s.accent); }}
                className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md border-2 border-line bg-surface px-3 text-sm font-bold text-ink shadow-brutal-sm hover:bg-paper">
                <span className="flex" aria-hidden="true">
                  <span className="size-4 rounded-l-sm border-2 border-line" style={{ background: s.primary }} />
                  <span className="size-4 rounded-r-sm border-2 border-l-0 border-line" style={{ background: s.accent }} />
                </span>
                {s.name}
              </button>
            ))}
          </div>
        </Card>
        <div className="flex flex-wrap items-center justify-end gap-3">
          <a href={p.sampleHref} target="_blank" rel="noopener" className="text-sm font-bold text-brand underline-offset-4 hover:underline">Open a sample card PDF (saved brand kit)</a>
          <SubmitButton pendingText="Saving…">Save brand kit</SubmitButton>
        </div>
      </div>

      <aside className="xl:sticky xl:top-24 xl:self-start" aria-label="Live ID card preview">
        <p className="mb-2 text-sm font-bold text-ink">Live preview</p>
        <div className="mx-auto w-full max-w-[18rem] overflow-hidden rounded-xl border-2 border-line p-4 shadow-brutal-lg" style={{ background: primary, color: text }}>
          <div className="mx-auto mb-3 h-2.5 w-16 rounded-full border opacity-70" style={{ borderColor: text }} />
          <div className="flex items-center gap-3">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt="" className="size-11 rounded object-contain" />
            ) : (
              <span className="grid size-11 place-items-center rounded border-2" style={{ borderColor: accent, color: accent }}><Icon name="trophy" className="size-6" /></span>
            )}
            <div className="min-w-0">
              <p className="truncate font-heading text-sm font-bold uppercase">{p.eventName}</p>
              {p.tagline && <p className="truncate text-[10px] uppercase tracking-widest opacity-75">{p.tagline}</p>}
            </div>
          </div>
          <p className="mt-2 text-[10px] opacity-80">{[p.dates, p.venue].filter(Boolean).join(" · ")}</p>
          <span className="mt-3 inline-block rounded px-2 py-0.5 text-[10px] font-bold" style={{ background: accent, color: onAccent }}>TEAM LEADER</span>
          <p className="mt-1 font-heading text-xl font-bold">PRIYA RAMAN</p>
          <p className="text-sm font-bold" style={{ color: accent }}>Team Code Warriors</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="grid aspect-square place-items-center rounded bg-white text-[10px] font-bold text-ink">QR</div>
            <div className="space-y-1.5 text-[9px] font-bold">
              <p>TEAM ID</p>
              <p className="rounded px-1.5 py-1" style={{ background: accent, color: onAccent }}>{p.codePrefix}-T0015</p>
              <p>ACTIVATION CODE</p>
              <p className="rounded px-1.5 py-1" style={{ background: accent, color: onAccent }}>X7K9M2Q4</p>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-center gap-2 border-t pt-2 text-[9px] font-bold uppercase tracking-widest" style={{ borderColor: `${text}40` }}>
            {orgLogo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={orgLogo} alt="" className="h-4 w-auto" />
            )}
            {p.organizer ? `Organized by ${p.organizer}` : "Organized by —"}
          </div>
        </div>
        <p className="mt-3 text-xs text-muted">A close approximation of the printed card; the PDF follows the same colours.</p>
      </aside>
    </form>
  );
}

function ColourInput({ name, label, value, onChange, error }: { name: string; label: string; value: string; onChange: (v: string) => void; error?: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={name} className="block text-sm font-bold text-ink">{label}</label>
      <div className="flex items-center gap-3">
        <input id={name} name={name} type="color" value={value} onChange={(ev) => onChange(ev.target.value)}
          className="h-11 w-16 cursor-pointer rounded-md border-2 border-line bg-surface p-1" />
        <input aria-label={`${label} hex code`} value={value} onChange={(ev) => /^#[0-9a-fA-F]{0,6}$/.test(ev.target.value) && onChange(ev.target.value)}
          className="min-h-11 w-28 rounded-md border-2 border-line bg-surface px-3 font-mono text-sm text-ink" maxLength={7} />
      </div>
      {error && <p className="text-xs font-bold text-danger" role="alert">{error}</p>}
    </div>
  );
}

function LogoInput({ name, label, url, error, onChange, hasSaved }: {
  name: string; label: string; url: string | null; error?: string; onChange: (ev: React.ChangeEvent<HTMLInputElement>) => void; hasSaved: boolean;
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={name} className="block text-sm font-bold text-ink">{label}</label>
      <div className="grid h-24 place-items-center rounded-md border-2 border-dashed border-line bg-paper p-2">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={`${label} preview`} className="max-h-20 w-auto object-contain" />
        ) : (
          <span className="text-xs text-muted">No logo yet</span>
        )}
      </div>
      <input id={name} name={name} type="file" accept="image/png,image/jpeg" onChange={onChange}
        className="block w-full cursor-pointer text-sm text-ink-soft file:mr-3 file:min-h-11 file:cursor-pointer file:rounded-md file:border-2 file:border-line file:bg-surface file:px-3 file:font-bold file:text-ink" />
      {hasSaved && <Checkbox name={`remove_${name}`} label="Remove the saved logo" />}
      {error && <p className="text-xs font-bold text-danger" role="alert">{error}</p>}
    </div>
  );
}
