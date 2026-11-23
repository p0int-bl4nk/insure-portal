import {
  CATEGORY_LABELS,
  CONDITION_LABELS,
  CONSENT_VERSION,
  countryName,
  EMIRATE_LABELS,
  formatDmy,
  GENDER_LABELS,
  INCOME_RANGE_LABELS,
  leadHolder,
  leadSponsor,
  listMembers,
  MARITAL_STATUS_LABELS,
  OCCUPATION_LABELS,
  RELATION_LABELS,
} from "@insure/shared";
import type { Lead, MemberEntry, Sponsor } from "@insure/shared";

import { formatGst, toReference } from "./utils.ts";

export type Cell = string | number;

type Member = MemberEntry<Lead["members"]>;

interface LeadContext {
  lead: Lead;
  sponsor: Sponsor | undefined;
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

const fullName = (
  person:
    | { firstName: string; middleName?: string; lastName: string }
    | undefined
) =>
  person
    ? [person.firstName, person.middleName, person.lastName]
        .filter(Boolean)
        .join(" ")
    : "";

// Each column is its header plus how to fill it, so headers and values can't drift apart.
const LEAD_COLUMNS = [
  ["lead_id", ({ leadId }) => leadId],
  ["reference", ({ leadId }) => toReference(leadId)],
  ["submitted_at_gst", ({ submittedAt }) => formatGst(submittedAt)],
  ["category", ({ lead }) => CATEGORY_LABELS[lead.category]],

  ["contact_name", ({ lead }) => fullName(leadHolder(lead))],
  ["contact_mobile", ({ lead }) => lead.contact.mobile],
  ["contact_email", ({ lead }) => lead.contact.email],

  // Only under Family without Self, where the person filling in the form isn't covered.
  ["sponsor_first_name", ({ sponsor }) => sponsor?.firstName ?? ""],
  ["sponsor_middle_name", ({ sponsor }) => sponsor?.middleName ?? ""],
  ["sponsor_last_name", ({ sponsor }) => sponsor?.lastName ?? ""],
  [
    "sponsor_nationality",
    ({ sponsor }) => (sponsor ? countryName(sponsor.nationality) : ""),
  ],
  ["sponsor_emirates_id", ({ sponsor }) => sponsor?.emiratesId ?? ""],

  ["member_count", ({ members }) => members.length],
  ["any_ped", ({ lead }) => yesNo(lead.hasPed)],
  [
    "any_smoker",
    ({ members }) => yesNo(members.some(({ member }) => member.smoker)),
  ],
  [
    "any_pregnant",
    ({ members }) => yesNo(members.some(({ member }) => member.pregnant)),
  ],
  ["max_age", ({ members }) => Math.max(...members.map(({ age }) => age ?? 0))],

  ["policy_start_date", ({ lead }) => formatDmy(lead.policy.startDate)],
  [
    "previous_policy_expiry",
    ({ lead }) =>
      lead.policy.hasPreviousPolicy
        ? formatDmy(lead.policy.previousPolicyExpiry)
        : "",
  ],
  ["income_range", ({ lead }) => INCOME_RANGE_LABELS[lead.contact.incomeRange]],
  ["occupation", ({ lead }) => OCCUPATION_LABELS[lead.contact.occupation]],

  ["consent_version", () => CONSENT_VERSION],
] as const satisfies readonly (readonly [string, (ctx: LeadContext) => Cell])[];

const MEMBER_COLUMNS = [
  ["lead_id", (_, { leadId }) => leadId],
  ["member_no", (_, __, index) => index + 1],
  ["relation", ({ relation }) => RELATION_LABELS[relation]],

  ["first_name", ({ member }) => member.firstName],
  ["middle_name", ({ member }) => member.middleName ?? ""],
  ["last_name", ({ member }) => member.lastName],
  ["date_of_birth", ({ member }) => formatDmy(member.dateOfBirth)],
  ["age", ({ age }) => age ?? ""],
  ["gender", ({ gender }) => (gender ? GENDER_LABELS[gender] : "")],
  [
    "marital_status",
    ({ maritalStatus }) =>
      maritalStatus ? MARITAL_STATUS_LABELS[maritalStatus] : "",
  ],
  ["nationality", ({ member }) => countryName(member.nationality)],

  ["visa_emirate", ({ member }) => EMIRATE_LABELS[member.visaEmirate]],
  ["visa_file_number", ({ member }) => member.visaFileNumber],
  ["passport_number", ({ member }) => member.passportNumber],
  ["e_visa_only", ({ member }) => yesNo(member.documents.eVisaOnly)],
  [
    "emirates_id",
    ({ member: { documents } }) =>
      documents.eVisaOnly ? "" : documents.emiratesId,
  ],
  [
    "emirates_id_expiry",
    ({ member: { documents } }) =>
      documents.eVisaOnly ? "" : formatDmy(documents.emiratesIdExpiry),
  ],
  [
    "uid_number",
    ({ member: { documents } }) =>
      documents.eVisaOnly ? documents.uidNumber : "",
  ],

  ["height_cm", ({ member }) => member.heightCm],
  ["weight_kg", ({ member }) => member.weightKg],
  [
    "conditions",
    ({ member }) =>
      member.conditions.map((c) => CONDITION_LABELS[c]).join(", "),
  ],
  ["smoker", ({ member }) => yesNo(member.smoker)],
  ["pregnant", ({ member }) => yesNo(member.pregnant)],
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
  const members = listMembers(lead.members);
  const ctx: LeadContext = {
    lead,
    sponsor: leadSponsor(lead),
    leadId,
    submittedAt,
    members,
  };

  return {
    leadRow: LEAD_COLUMNS.map(([, value]) => value(ctx)),
    memberRows: members.map((entry, index) =>
      MEMBER_COLUMNS.map(([, value]) => value(entry, ctx, index))
    ),
  };
};
