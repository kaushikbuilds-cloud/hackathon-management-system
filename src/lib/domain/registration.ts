import { z } from "zod";
import { cleanTeamName } from "./normalize";

export const OPTIONAL_MEMBER_FIELDS = ["phone", "department", "academic_year", "college"] as const;
export type OptionalMemberField = (typeof OPTIONAL_MEMBER_FIELDS)[number];

export type FieldSetting = { enabled: boolean; required: boolean };
export type FieldConfig = Record<OptionalMemberField, FieldSetting>;

export const OPTIONAL_FIELD_LABEL: Record<OptionalMemberField, string> = {
  phone: "Phone number",
  department: "Department",
  academic_year: "Academic year",
  college: "College (per member, defaults to team college)",
};

export const DEFAULT_FIELD_CONFIG: FieldConfig = {
  phone: { enabled: true, required: true },
  department: { enabled: true, required: true },
  academic_year: { enabled: true, required: true },
  college: { enabled: false, required: false },
};

export const customQuestionSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]{1,40}$/),
  label: z.string().trim().min(2).max(200),
  type: z.enum(["text", "textarea", "select"]),
  options: z.array(z.string().trim().min(1).max(100)).max(30).optional(),
  required: z.boolean().default(false),
});
export type CustomQuestion = z.infer<typeof customQuestionSchema>;

export function resolveFieldConfig(raw: unknown): FieldConfig {
  const config: FieldConfig = structuredClone(DEFAULT_FIELD_CONFIG);
  if (raw && typeof raw === "object") {
    for (const field of OPTIONAL_MEMBER_FIELDS) {
      const value = (raw as Record<string, unknown>)[field];
      if (value && typeof value === "object") {
        const v = value as Partial<FieldSetting>;
        const enabled = v.enabled ?? config[field].enabled;
        config[field] = { enabled: Boolean(enabled), required: Boolean(enabled && (v.required ?? config[field].required)) };
      }
    }
  }
  return config;
}

export function resolveCustomQuestions(raw: unknown): CustomQuestion[] {
  const parsed = z.array(customQuestionSchema).safeParse(raw);
  return parsed.success ? parsed.data : [];
}

export type RegistrationFormConfig = {
  min_team_size: number;
  max_team_size: number;
  field_config: unknown;
  custom_questions: unknown;
};

const PHONE = /^\+?[0-9][0-9 ()-]{6,19}$/;
// Letters (any script), spaces and common name punctuation.
const PERSON_NAME = /^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u;

function optionalText(setting: FieldSetting, label: string, max: number, pattern?: RegExp, patternMessage?: string) {
  const required = setting.enabled && setting.required;
  // "required" is checked first so an empty value reports the most useful message.
  let base = z.string().trim();
  if (required) base = base.min(1, `${label} is required`);
  base = base.max(max, `${label} is too long`);
  if (pattern) base = base.regex(pattern, patternMessage ?? `Invalid ${label.toLowerCase()}`);
  if (required) return base;
  return z.union([z.literal(""), base]).optional().transform((v) => v ?? "");
}

export function buildRegistrationSchema(form: RegistrationFormConfig) {
  const fields = resolveFieldConfig(form.field_config);
  const questions = resolveCustomQuestions(form.custom_questions);

  const member = z.object({
    full_name: z
      .string()
      .trim()
      .min(2, "Name is required")
      .max(100, "Name is too long")
      .regex(PERSON_NAME, "Name contains invalid characters"),
    email: z.string().trim().toLowerCase().max(254).email("Enter a valid email address"),
    phone: optionalText(fields.phone, "Phone number", 20, PHONE, "Enter a valid phone number (digits, optional +)"),
    department: optionalText(fields.department, "Department", 100),
    academic_year: optionalText(fields.academic_year, "Academic year", 30),
    college: optionalText(fields.college, "College", 150),
    role: z.enum(["leader", "member"]),
  });

  const answers = z.object(
    Object.fromEntries(
      questions.map((q) => {
        let s = z.string().trim().max(q.type === "textarea" ? 2000 : 300);
        if (q.type === "select" && q.options?.length) {
          const opts = q.options;
          s = s.refine((v) => v === "" || opts.includes(v), "Choose one of the options");
        }
        return [q.id, q.required ? s.min(1, "This question is required") : s.optional().transform((v) => v ?? "")];
      }),
    ),
  );

  return z
    .object({
      team_name: z
        .string()
        .transform(cleanTeamName)
        .pipe(
          z
            .string()
            .min(2, "Team name must be at least 2 characters")
            .max(80, "Team name must be at most 80 characters")
            .regex(/^[\p{L}\p{N}][\p{L}\p{N} &'._!-]*$/u, "Team name may contain letters, numbers, spaces and & ' . _ ! -"),
        ),
      college: z.string().trim().min(2, "College is required").max(150),
      members: z
        .array(member)
        .min(form.min_team_size, `At least ${form.min_team_size} member(s) required`)
        .max(form.max_team_size, `At most ${form.max_team_size} members allowed`),
      answers,
    })
    .superRefine((data, ctx) => {
      const leaders = data.members.filter((m) => m.role === "leader").length;
      if (leaders !== 1) {
        ctx.addIssue({ code: "custom", path: ["members"], message: "Exactly one member must be the team leader" });
      }
      const seen = new Map<string, number>();
      data.members.forEach((m, i) => {
        const prev = seen.get(m.email);
        if (prev !== undefined) {
          ctx.addIssue({ code: "custom", path: ["members", i, "email"], message: `Same email as member ${prev + 1}` });
        } else {
          seen.set(m.email, i);
        }
      });
    });
}

export type RegistrationPayload = z.infer<ReturnType<typeof buildRegistrationSchema>>;

/** Raw, untrusted values as typed by the applicant (echoed back after errors). */
export type RegistrationDraft = {
  team_name: string;
  college: string;
  members: { full_name: string; email: string; phone: string; department: string; academic_year: string; college: string; role: string }[];
  answers: Record<string, string>;
};

const MAX_MEMBERS_PARSED = 20;

/** Parses `FormData` using field names like `members.0.email` and `answers.track`. */
export function registrationDraftFromFormData(formData: FormData): RegistrationDraft {
  const get = (key: string) => {
    const v = formData.get(key);
    return typeof v === "string" ? v.slice(0, 5000) : "";
  };
  const count = Math.min(Math.max(Number(get("member_count")) || 0, 0), MAX_MEMBERS_PARSED);
  const leaderIndex = Number(get("leader_index"));
  const members = Array.from({ length: count }, (_, i) => ({
    full_name: get(`members.${i}.full_name`),
    email: get(`members.${i}.email`),
    phone: get(`members.${i}.phone`),
    department: get(`members.${i}.department`),
    academic_year: get(`members.${i}.academic_year`),
    college: get(`members.${i}.college`),
    role: i === leaderIndex ? "leader" : "member",
  }));
  const answers: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("answers.") && typeof value === "string" && Object.keys(answers).length < 50) {
      answers[key.slice("answers.".length)] = value.slice(0, 2000);
    }
  }
  return { team_name: get("team_name"), college: get("college"), members, answers };
}

/** Flattens zod issues into `{ "members.0.email": "message" }`. First message wins. */
export function flattenIssues(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}
