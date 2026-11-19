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
