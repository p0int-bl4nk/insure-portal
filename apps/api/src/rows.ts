import {
  CONDITION_LABELS,
  CONSENT_VERSION,
  countryName,
  EMIRATE_LABELS,
  formatDmy,
  GENDER_LABELS,
  INCOME_RANGE_LABELS,
  listMembers,
  MARITAL_STATUS_LABELS,
  OCCUPATION_LABELS,
  RELATION_LABELS,
} from "@insure/shared";
import type { Lead, MemberEntry } from "@insure/shared";

export type Cell = string | number;

type Member = MemberEntry<Lead["members"]>;

interface LeadContext {
  lead: Lead;
  leadId: string;
  submittedAt: Date;
  members: Member[];
}

const yesNo = (value: boolean | undefined): string => {
  if (value === undefined) {
    return "";
  }

  return value ? "Yes" : "No";
};

const pregnantOf = ({ member }: Member) =>
  "pregnant" in member ? member.pregnant : undefined;

const gstFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Dubai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** "2026-11-18 14:05:33" in Gulf Standard Time (UTC+4). */
export const formatGst = (date: Date): string => {
  const p = Object.fromEntries(
    gstFormatter.formatToParts(date).map((part) => [part.type, part.value])
  );

  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
};

/** Short human reference derived from the lead ID, e.g. "7F3A-21C9". */
export const toReference = (leadId: string): string => {
  const hex = leadId.replaceAll("-", "").slice(0, 8).toUpperCase();

  return `${hex.slice(0, 4)}-${hex.slice(4)}`;
};

// Each column is its header plus how to fill it, so headers and values can't drift apart.
const LEAD_COLUMNS = [
  ["lead_id", ({ leadId }) => leadId],
  ["reference", ({ leadId }) => toReference(leadId)],
  ["submitted_at_gst", ({ submittedAt }) => formatGst(submittedAt)],

  ["first_name", ({ lead }) => lead.proposer.firstName],
  ["middle_name", ({ lead }) => lead.proposer.middleName ?? ""],
  ["last_name", ({ lead }) => lead.proposer.lastName],
  ["date_of_birth", ({ lead }) => formatDmy(lead.proposer.dateOfBirth)],
  ["gender", ({ lead }) => GENDER_LABELS[lead.proposer.gender]],
  [
    "marital_status",
    ({ lead }) => MARITAL_STATUS_LABELS[lead.proposer.maritalStatus],
  ],
  ["nationality", ({ lead }) => countryName(lead.proposer.nationality)],
  ["mobile", ({ lead }) => lead.proposer.mobile],
  ["email", ({ lead }) => lead.proposer.email],

  ["member_count", ({ members }) => members.length],
  ["any_ped", ({ lead }) => yesNo(lead.hasPed)],
  [
    "any_smoker",
    ({ members }) =>
      yesNo(members.some(({ member }) => member.smoker === true)),
  ],
  [
    "any_pregnant",
    ({ members }) => yesNo(members.some((entry) => pregnantOf(entry) === true)),
  ],
  ["max_age", ({ members }) => Math.max(...members.map(({ age }) => age ?? 0))],
  ["height_cm", ({ lead }) => lead.measurements.heightCm],
  ["weight_kg", ({ lead }) => lead.measurements.weightKg],

  ["policy_start_date", ({ lead }) => formatDmy(lead.policy.startDate)],
  [
    "previous_policy_expiry",
    ({ lead }) =>
      lead.policy.hasPreviousPolicy
        ? formatDmy(lead.policy.previousPolicyExpiry)
        : "",
  ],
  ["income_range", ({ lead }) => INCOME_RANGE_LABELS[lead.policy.incomeRange]],
  ["occupation", ({ lead }) => OCCUPATION_LABELS[lead.policy.occupation]],

  ["visa_emirate", ({ lead }) => EMIRATE_LABELS[lead.residency.emirate]],
  ["visa_file_number", ({ lead }) => lead.residency.visaFileNumber],
  ["passport_number", ({ lead }) => lead.residency.passportNumber],
  ["sponsor_first_name", ({ lead }) => lead.residency.sponsorFirstName],
  ["sponsor_last_name", ({ lead }) => lead.residency.sponsorLastName],
  ["e_visa_only", ({ lead }) => yesNo(lead.residency.eVisaOnly)],
  [
    "emirates_id",
    ({ lead }) => (lead.residency.eVisaOnly ? "" : lead.residency.emiratesId),
  ],
  [
    "emirates_id_expiry",
    ({ lead }) =>
      lead.residency.eVisaOnly
        ? ""
        : formatDmy(lead.residency.emiratesIdExpiry),
  ],
  [
    "uid_number",
    ({ lead }) => (lead.residency.eVisaOnly ? lead.residency.uidNumber : ""),
  ],

  ["consent_version", () => CONSENT_VERSION],
] as const satisfies readonly (readonly [string, (ctx: LeadContext) => Cell])[];

const MEMBER_COLUMNS = [
  ["lead_id", (_, { leadId }) => leadId],
  ["member_no", (_, __, index) => index + 1],
  ["relation", ({ relation }) => RELATION_LABELS[relation]],
  ["age", ({ age }) => age ?? ""],
  ["gender", ({ gender }) => (gender ? GENDER_LABELS[gender] : "")],
  [
    "conditions",
    ({ member }) =>
      member.conditions.map((c) => CONDITION_LABELS[c]).join(", "),
  ],
  ["smoker", ({ member }) => yesNo(member.smoker)],
  ["pregnant", (entry) => yesNo(pregnantOf(entry))],
] as const satisfies readonly (readonly [
  string,
  (entry: Member, ctx: LeadContext, index: number) => Cell,
])[];

export const LEAD_HEADERS = LEAD_COLUMNS.map(([header]) => header);
export const MEMBER_HEADERS = MEMBER_COLUMNS.map(([header]) => header);

export const leadToRows = (
  lead: Lead,
  leadId: string,
  submittedAt: Date
): { leadRow: Cell[]; memberRows: Cell[][] } => {
  const members = listMembers(lead.members, lead.proposer);
  const ctx: LeadContext = { lead, leadId, submittedAt, members };

  return {
    leadRow: LEAD_COLUMNS.map(([, value]) => value(ctx)),
    memberRows: members.map((entry, index) =>
      MEMBER_COLUMNS.map(([, value]) => value(entry, ctx, index))
    ),
  };
};
