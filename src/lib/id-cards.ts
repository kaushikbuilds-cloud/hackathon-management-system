import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { appUrl } from "@/lib/env";
import { audit } from "@/lib/audit";
import type { Session } from "@/lib/auth";
import { teamPdfFileName } from "@/lib/domain/normalize";
import { resolveTemplateConfig, type TemplateConfig } from "@/lib/domain/template";
import { CardValidationError, generateTeamIdCardsPdf, validateCardInput, type CardInput, type CardValidation } from "@/lib/pdf/id-cards";
import { createServiceClient } from "@/lib/supabase/server";
import { BUCKETS, downloadObject, signedUrl, uploadObject } from "@/lib/storage";
import type { Hackathon, IdCardJob, IdCardTemplate, Participant, Team } from "@/lib/types";

export type TeamCardContext = {
  team: Team;
  members: Participant[];
  hackathon: Hackathon;
  template: IdCardTemplate | null;
  templateConfig: TemplateConfig;
  validation: CardValidation;
  fileName: string;
};

/**
 * Loads everything needed to render a team's cards using the caller's
 * RLS-scoped client (so only users who can see the team can generate it).
 */
export async function loadTeamCardContext(supabase: SupabaseClient, teamId: string): Promise<TeamCardContext | null> {
  const [{ data: team }, { data: members }, { data: hackathon }, { data: template }] = await Promise.all([
    supabase.from("teams").select("*").eq("id", teamId).maybeSingle<Team>(),
    supabase.from("participants").select("*").eq("team_id", teamId).order("role").order("participant_code").returns<Participant[]>(),
    supabase.from("hackathons").select("*").limit(1).maybeSingle<Hackathon>(),
    supabase.from("id_card_templates").select("*").eq("is_active", true).maybeSingle<IdCardTemplate>(),
  ]);
  if (!team || !hackathon) return null;
  const templateConfig = resolveTemplateConfig(template?.config);
  const memberList = members ?? [];
  const validation = validateCardInput({
    event: { name: hackathon.name, startsAt: hackathon.starts_at, venue: hackathon.venue },
    team: { name: team.name, teamCode: team.team_code },
    members: memberList.map(toCardMember),
    template: templateConfig,
  });
  if (!template) validation.errors.push({ field: "template", message: "No active ID card template. Publish one under ID Card Generation." });
  return { team, members: memberList, hackathon, template: template ?? null, templateConfig, validation, fileName: teamPdfFileName(team.name, team.team_code) };
}

function toCardMember(p: Participant) {
  return {
    participantCode: p.participant_code,
    fullName: p.full_name,
    role: p.role,
    college: p.college,
    department: p.department,
    academicYear: p.academic_year,
    qrToken: p.qr_token,
    qrRevoked: Boolean(p.qr_revoked_at),
  };
}

async function buildCardInput(ctx: TeamCardContext): Promise<CardInput> {
  const withPhotos = ctx.templateConfig.showPhoto;
  const photos = await Promise.all(ctx.members.map((m) => (withPhotos ? downloadObject(BUCKETS.photos, m.photo_path) : null)));
  return {
    event: {
      name: ctx.hackathon.name,
      tagline: ctx.hackathon.tagline,
      organizerName: ctx.hackathon.organizer_name,
      startsAt: ctx.hackathon.starts_at,
      endsAt: ctx.hackathon.ends_at,
      timezone: ctx.hackathon.timezone,
      venue: ctx.hackathon.venue,
      logo: await downloadObject(BUCKETS.branding, ctx.hackathon.logo_path),
    },
    team: { name: ctx.team.name, teamCode: ctx.team.team_code },
    members: ctx.members.map((m, i) => ({ ...toCardMember(m), photo: photos[i] })),
    template: ctx.templateConfig,
    templateVersion: ctx.template?.version ?? 0,
    verifyBaseUrl: appUrl(),
  };
}

/** Renders the PDF in memory (preview; nothing is stored). */
export async function renderTeamPdf(ctx: TeamCardContext) {
  if (ctx.validation.errors.length) throw new CardValidationError(ctx.validation.errors);
  return generateTeamIdCardsPdf(await buildCardInput(ctx));
}

export type GenerationResult =
  | { ok: true; job: IdCardJob; downloadUrl: string | null }
  | { ok: false; job: IdCardJob | null; error: string };

/**
 * Generates, stores and records a team PDF. The job row is created first so
 * failures are visible and can be retried; on success the team's PDF status
 * becomes "generated", on failure "failed".
 */
export async function generateAndStoreTeamPdf(session: Session, ctx: TeamCardContext): Promise<GenerationResult> {
  const service = createServiceClient(session.userId);
  const { data: job, error: jobError } = await service
    .from("id_card_jobs")
    .insert({
      team_id: ctx.team.id,
      template_id: ctx.template?.id ?? null,
      template_version: ctx.template?.version ?? null,
      member_count: ctx.members.length,
      page_count: 0,
      status: "processing",
      file_name: ctx.fileName,
      generated_by: session.userId,
    })
    .select("*")
    .single<IdCardJob>();
  if (jobError || !job) return { ok: false, job: null, error: "Could not create the generation record. Please retry." };

  try {
    const pdf = await renderTeamPdf(ctx);
    if (pdf.pageCount !== ctx.members.length) {
      throw new Error(`Page count mismatch: expected ${ctx.members.length}, got ${pdf.pageCount}`);
    }
    const filePath = `teams/${ctx.team.id}/${job.id}/${ctx.fileName}`;
    await uploadObject(BUCKETS.idCards, filePath, pdf.bytes, "application/pdf");
    const { data: done } = await service
      .from("id_card_jobs")
      .update({ status: "completed", page_count: pdf.pageCount, file_path: filePath, completed_at: new Date().toISOString() })
      .eq("id", job.id)
      .select("*")
      .single<IdCardJob>();
    await service.from("teams").update({ pdf_status: "generated" }).eq("id", ctx.team.id);
    await audit(session, "id_cards.generated", { type: "teams", id: ctx.team.id }, {
      job_id: job.id, team_code: ctx.team.team_code, member_count: ctx.members.length, page_count: pdf.pageCount,
      template_version: ctx.template?.version ?? null, file_name: ctx.fileName,
    });
    return { ok: true, job: done ?? job, downloadUrl: await signedUrl(BUCKETS.idCards, filePath, ctx.fileName) };
  } catch (e) {
    const message = e instanceof CardValidationError ? e.message : e instanceof Error ? e.message : "Unknown error";
    await service.from("id_card_jobs").update({ status: "failed", error: message.slice(0, 1000), completed_at: new Date().toISOString() }).eq("id", job.id);
    await service.from("teams").update({ pdf_status: "failed" }).eq("id", ctx.team.id);
    await audit(session, "id_cards.failed", { type: "teams", id: ctx.team.id }, { job_id: job.id, error: message.slice(0, 300) });
    return { ok: false, job, error: `PDF generation failed: ${message}` };
  }
}
