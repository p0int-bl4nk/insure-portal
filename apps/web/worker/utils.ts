import { z } from "zod";

export const jsonText = z
  .string()
  .transform((text, ctx): unknown => {
    try {
      return JSON.parse(text);
    } catch {
      ctx.addIssue({ code: "custom", message: "Not valid JSON" });
      return z.NEVER;
    }
  })
  .describe(
    "JSON text → parsed value. Malformed JSON is reported as a schema issue."
  );

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
