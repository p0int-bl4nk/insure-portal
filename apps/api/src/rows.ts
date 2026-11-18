import {
  CONDITION_LABELS,
  CONSENT_VERSION,
  countryName,
  EMIRATE_LABELS,
  GENDER_LABELS,
  MARITAL_STATUS_LABELS,
  RELATION_LABELS,
  SALARY_BAND_LABELS,
} from "@insure/shared";
import type { Lead } from "@insure/shared";

export type Cell = string | number;

export const LEAD_HEADERS = [
  "lead_id",
  "reference",
  "submitted_at_gst",
  "full_name",
  "mobile",
  "email",
  "nationality",
  "visa_emirate",
  "salary_band",
  "gender",
  "marital_status",
  "member_count",
  "any_ped",
  "any_smoker",
  "any_pregnant",
  "max_age",
  "consent_version",
] as const;

export const MEMBER_HEADERS = [
  "lead_id",
  "member_no",
  "relation",
  "age",
  "gender",
  "conditions",
  "smoker",
  "pregnant",
] as const;

const yesNo = (value: boolean | undefined): string => {
  if (value === undefined) {
    return "";
  }
  return value ? "Yes" : "No";
};

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

export const leadToRows = (
  lead: Lead,
  leadId: string,
  submittedAt: Date
): { leadRow: Cell[]; memberRows: Cell[][] } => {
  const { proposer, members } = lead;

  const leadRow: Cell[] = [
    leadId,
    toReference(leadId),
    formatGst(submittedAt),
    proposer.fullName,
    proposer.mobile,
    proposer.email ?? "",
    countryName(proposer.nationality),
    EMIRATE_LABELS[proposer.emirate],
    SALARY_BAND_LABELS[proposer.salaryBand],
    GENDER_LABELS[proposer.gender],
    MARITAL_STATUS_LABELS[proposer.maritalStatus],
    members.length,
    yesNo(lead.hasPed),
    yesNo(members.some((m) => m.smoker === true)),
    yesNo(members.some((m) => m.pregnant === true)),
    Math.max(...members.map((m) => m.age)),
    CONSENT_VERSION,
  ];

  const memberRows: Cell[][] = members.map((m, i) => [
    leadId,
    i + 1,
    RELATION_LABELS[m.relation],
    m.age,
    GENDER_LABELS[m.gender],
    m.conditions.map((c) => CONDITION_LABELS[c]).join(", "),
    yesNo(m.smoker),
    yesNo(m.pregnant),
  ]);

  return { leadRow, memberRows };
};
