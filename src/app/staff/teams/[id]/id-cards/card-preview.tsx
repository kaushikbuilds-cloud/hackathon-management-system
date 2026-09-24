import type { TemplateConfig } from "@/lib/domain/template";
import type { Participant } from "@/lib/types";

/** HTML approximation of the printed card (the PDF is the source of truth). */
export function CardPreview({ eventName, organizer, member, teamName, teamCode, config }: {
  eventName: string; organizer: string; member: Participant; teamName: string; teamCode: string; config: TemplateConfig;
}) {
  const initials = member.full_name.split(/\s+/).filter(Boolean).map((p) => p[0]).filter((_, i, a) => i === 0 || i === a.length - 1).join("").toUpperCase();
  return (
    <div className="mx-auto flex aspect-[54/85.6] w-full max-w-56 flex-col overflow-hidden rounded-lg bg-white text-[#111827] shadow-lg ring-1 ring-black/10" aria-label={`Card preview for ${member.full_name}`}>
      <div className="px-3 pt-3 pb-2" style={{ background: config.headerColor }}>
        <p className="truncate text-sm font-bold text-white">{eventName}</p>
        <p className="truncate text-[9px] text-white/70">{organizer}</p>
      </div>
      <div className="h-1" style={{ background: config.accentColor }} />
      <div className="flex flex-1 flex-col items-center px-3 pt-2 text-center">
        {config.showPhoto && (
          <div className="grid h-14 w-12 place-items-center rounded-sm border text-lg font-bold" style={{ borderColor: config.accentColor, color: config.accentColor, background: `${config.accentColor}1f` }}>
            {initials}
          </div>
        )}
        <p className="mt-1 line-clamp-2 text-[13px] leading-tight font-bold">{member.full_name}</p>
        <span className="mt-1 rounded-sm px-2 text-[8px] font-bold" style={member.role === "leader" ? { background: config.accentColor, color: "white" } : { border: `1px solid ${config.accentColor}`, color: config.accentColor }}>
          {member.role === "leader" ? "TEAM LEADER" : "MEMBER"}
        </span>
        {config.showCollege && member.college && <p className="mt-1 line-clamp-1 text-[9px] font-semibold">{member.college}</p>}
        {config.showDepartment && member.department && <p className="line-clamp-1 text-[8px] text-slate-500">{member.department}{member.academic_year && ` · ${member.academic_year}`}</p>}
        <div className="mt-auto mb-2 flex w-full items-end justify-between gap-2 text-left">
          <div className="min-w-0">
            <p className="text-[6px] font-semibold text-slate-500">PARTICIPANT ID</p>
            <p className="text-[10px] font-bold">{member.participant_code}</p>
            <p className="mt-0.5 text-[6px] font-semibold text-slate-500">TEAM</p>
            <p className="line-clamp-2 text-[8px] font-bold leading-tight">{teamName}</p>
            <p className="text-[7px] font-semibold" style={{ color: config.accentColor }}>{teamCode}</p>
          </div>
          <div className="grid size-12 shrink-0 place-items-center border border-slate-300 bg-[repeating-linear-gradient(45deg,#111_0_2px,#fff_2px_4px)] text-[6px]" aria-label="QR code placeholder" />
        </div>
      </div>
      <div className="py-1 text-center text-[7px] font-semibold text-white" style={{ background: config.headerColor }}>
        {config.footerText || " "}
      </div>
    </div>
  );
}
