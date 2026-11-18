import { z } from "zod";

/** JSON text → parsed value. Malformed JSON is reported as a schema issue. */
export const jsonText = z.string().transform((text, ctx): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    ctx.addIssue({ code: "custom", message: "Not valid JSON" });
    return z.NEVER;
  }
});
