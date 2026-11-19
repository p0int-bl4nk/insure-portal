// Dates are UTC midnights of a Gulf Standard Time calendar day, which is what
// <input type="date"> gives via `valueAsDate`. They travel as ISO strings in JSON.

const gstDay = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Dubai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Today in Dubai, as a UTC midnight. */
export const todayInDubai = (now = new Date()): Date =>
  new Date(`${gstDay.format(now)}T00:00:00Z`);

/** A valid Date from a Date or a date string (form value or JSON); undefined otherwise. */
export const toDate = (value: unknown): Date | undefined => {
  const date =
    value instanceof Date || typeof value === "string"
      ? new Date(value)
      : undefined;

  return date && !Number.isNaN(date.getTime()) ? date : undefined;
};

/** Date → "1990-12-31", the value format of <input type="date">. */
export const formatIso = (date: Date): string =>
  date.toISOString().slice(0, 10);

/** Date → "31/12/1990", the format written to the Sheet. */
export const formatDmy = (date: Date): string =>
  [
    String(date.getUTCDate()).padStart(2, "0"),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    date.getUTCFullYear(),
  ].join("/");

export const addDays = (date: Date, days: number): Date =>
  new Date(date.getTime() + days * 86_400_000);

export const addYears = (date: Date, years: number): Date => {
  const next = new Date(date);
  next.setUTCFullYear(next.getUTCFullYear() + years);

  return next;
};

/** Whole years between a date of birth and today (Dubai). */
export const ageFromDob = (
  dateOfBirth: unknown,
  today = todayInDubai()
): number | undefined => {
  const dob = toDate(dateOfBirth);
  if (!dob) {
    return undefined;
  }

  const hadBirthdayThisYear =
    today.getUTCMonth() > dob.getUTCMonth() ||
    (today.getUTCMonth() === dob.getUTCMonth() &&
      today.getUTCDate() >= dob.getUTCDate());

  return (
    today.getUTCFullYear() -
    dob.getUTCFullYear() -
    (hadBirthdayThisYear ? 0 : 1)
  );
};
