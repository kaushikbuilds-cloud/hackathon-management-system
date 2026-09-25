import { NextResponse } from "next/server";
import { contentDisposition, guardApi } from "@/lib/api";
import { audit } from "@/lib/audit";
import { toCsv } from "@/lib/domain/csv";
import { createClient } from "@/lib/supabase/server";
import type { Permission } from "@/lib/types";

type Report = { requirement: "super_admin" | Permission; build: (sb: Awaited<ReturnType<typeof createClient>>) => Promise<{ headers: string[]; rows: unknown[][] }> };

const REPORTS: Record<string, Report> = {
  teams: {
    requirement: "view_reports",
    async build(sb) {
      const { data } = await sb.from("team_overview").select("*").order("team_code");
      return {
        headers: ["Team ID", "Team name", "College", "Leader", "Leader email", "Members", "Present", "Registration status", "Payment status", "Fee amount", "UPI transaction ID", "PDF status", "Registered at"],
        rows: (data ?? []).map((t) => [t.team_code, t.name, t.college, t.leader_name, t.leader_email, t.member_count, t.present_count, t.status, t.payment_status, t.payment_amount, t.payment_utr, t.pdf_status, t.created_at]),
      };
    },
  },
  participants: {
    requirement: "view_participants",
    async build(sb) {
      const { data } = await sb.from("participant_overview").select("*").order("participant_code");
      return {
        headers: ["Participant ID", "Name", "Role", "Email", "Phone", "College", "Department", "Academic year", "Team ID", "Team name", "Attendance", "Checked in at"],
        rows: (data ?? []).map((p) => [p.participant_code, p.full_name, p.role, p.email, p.phone, p.college, p.department, p.academic_year, p.team_code, p.team_name, p.attendance_state, p.checked_in_at]),
      };
    },
  },
  attendance: {
    requirement: "view_attendance",
    async build(sb) {
      const { data } = await sb
        .from("attendance")
        .select("checked_in_at, status, method, session_key, corrected_at, correction_reason, participants(participant_code, full_name), teams(team_code, name), recorder:profiles!attendance_recorded_by_fkey(full_name), corrector:profiles!attendance_corrected_by_fkey(full_name)")
        .order("checked_in_at");
      type Row = { checked_in_at: string; status: string; method: string; session_key: string; corrected_at: string | null; correction_reason: string | null; participants: { participant_code: string; full_name: string } | null; teams: { team_code: string; name: string } | null; recorder: { full_name: string | null } | null; corrector: { full_name: string | null } | null };
      return {
        headers: ["Checked in at", "Participant ID", "Name", "Team ID", "Team", "Session", "Method", "Recorded by", "Status", "Corrected at", "Corrected by", "Correction reason"],
        rows: ((data ?? []) as unknown as Row[]).map((r) => [r.checked_in_at, r.participants?.participant_code, r.participants?.full_name, r.teams?.team_code, r.teams?.name, r.session_key, r.method, r.recorder?.full_name, r.status, r.corrected_at, r.corrector?.full_name, r.correction_reason]),
      };
    },
  },
  "team-attendance": {
    requirement: "view_reports",
    async build(sb) {
      const { data } = await sb.from("team_overview").select("team_code, name, member_count, present_count, attendance_state").order("team_code");
      return { headers: ["Team ID", "Team", "Members", "Present", "State"], rows: (data ?? []).map((t) => [t.team_code, t.name, t.member_count, t.present_count, t.attendance_state]) };
    },
  },
  support: {
    requirement: "manage_all_support",
    async build(sb) {
      const { data } = await sb.from("support_requests").select("*, teams(team_code, name), assignee:profiles!support_requests_assigned_to_fkey(full_name)").order("created_at");
      type Row = { created_at: string; updated_at: string; resolved_at: string | null; category: string; subject: string; status: string; teams: { team_code: string; name: string } | null; assignee: { full_name: string | null } | null };
      return {
        headers: ["Created", "Team ID", "Team", "Category", "Subject", "Status", "Assigned to", "Updated", "Resolved"],
        rows: ((data ?? []) as Row[]).map((r) => [r.created_at, r.teams?.team_code, r.teams?.name, r.category, r.subject, r.status, r.assignee?.full_name, r.updated_at, r.resolved_at]),
      };
    },
  },
  submissions: {
    requirement: "manage_registrations",
    async build(sb) {
      const { data } = await sb.from("registration_submissions").select("created_at, status, payload, errors, team_id").order("created_at");
      return {
        headers: ["Time", "Status", "Team name", "Members", "Error"],
        rows: (data ?? []).map((s) => [s.created_at, s.status, s.payload?.team_name, s.payload?.member_count, s.errors?.message ?? s.errors?.code ?? ""]),
      };
    },
  },
  audit: {
    requirement: "super_admin",
    async build(sb) {
      const { data } = await sb.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(5000);
      return {
        headers: ["Time", "Actor ID", "Actor role", "Action", "Entity type", "Entity ID", "Details"],
        rows: (data ?? []).map((a) => [a.created_at, a.actor_id, a.actor_role, a.action, a.entity_type, a.entity_id, JSON.stringify(a.details)]),
      };
    },
  },
};

export async function GET(_request: Request, ctx: RouteContext<"/api/reports/[kind]">) {
  const { kind } = await ctx.params;
  const report = REPORTS[kind];
  if (!report) return NextResponse.json({ error: "Unknown report" }, { status: 404 });
  const guard = await guardApi(report.requirement);
  if (guard.response) return guard.response;
  const { headers, rows } = await report.build(await createClient());
  await audit(guard.session, "report.exported", { type: "report", id: kind }, { rows: rows.length });
  const stamp = new Date().toISOString().slice(0, 10);
  // UTF-8 BOM so Excel detects the encoding of non-ASCII names.
  return new NextResponse("﻿" + toCsv(headers, rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": contentDisposition("attachment", `${kind}_${stamp}.csv`),
      "Cache-Control": "no-store",
    },
  });
}
