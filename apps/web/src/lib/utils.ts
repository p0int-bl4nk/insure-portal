export { cn } from "cn";

/**
 * Mobile input after the fixed +971 prefix: at most 9 digits, shown as "50 123 4567".
 * Accepts pasted "+971 50…", "00971 50…" or "050…" by dropping the prefix.
 */
export const formatMobileInput = (raw: string): string => {
  let digits = raw.replaceAll(/\D/gu, "");

  if (digits.startsWith("00971")) {
    digits = digits.slice(5);
  } else if (digits.startsWith("971") && digits.length > 9) {
    digits = digits.slice(3);
  } else if (digits.startsWith("0")) {
    digits = digits.slice(1);
  }

  digits = digits.slice(0, 9);

  return [digits.slice(0, 2), digits.slice(2, 5), digits.slice(5)]
    .filter(Boolean)
    .join(" ");
};

/** Emirates ID shown as 784-YYYY-NNNNNNN-N. */
export const formatEmiratesIdInput = (raw: string): string => {
  const digits = raw.replaceAll(/\D/gu, "").slice(0, 15);

  return [
    digits.slice(0, 3),
    digits.slice(3, 7),
    digits.slice(7, 14),
    digits.slice(14),
  ]
    .filter(Boolean)
    .join("-");
};

/** After the 8th digit, a separator the user typed starts the one-digit part. */
const VISA_TYPE_PART = /^(?:\D*\d){8}\D/u;

/**
 * Visa file number shown as 201/2020/1234567, or 201/2020/1/1234567 when the
 * user types a separator (/, . or space) after the single-digit part.
 */
export const formatVisaFileInput = (raw: string): string => {
  const hasTypePart = VISA_TYPE_PART.test(raw);
  const digits = raw.replaceAll(/\D/gu, "").slice(0, hasTypePart ? 15 : 14);
  const parts = hasTypePart
    ? [
        digits.slice(0, 3),
        digits.slice(3, 7),
        digits.slice(7, 8),
        digits.slice(8),
      ]
    : [digits.slice(0, 3), digits.slice(3, 7), digits.slice(7)];
  const formatted = parts.filter(Boolean).join("/");

  // Keep the separator just typed so the next digit lands in the last part.
  return hasTypePart && digits.length === 8 ? `${formatted}/` : formatted;
};
