import { describe, expect, it } from "vitest";

import { formatVisaFileInput } from "./utils";

describe(formatVisaFileInput, () => {
  it("adds slashes as digits are typed", () => {
    expect(formatVisaFileInput("201")).toBe("201");
    expect(formatVisaFileInput("2012")).toBe("201/2");
    expect(formatVisaFileInput("2012020")).toBe("201/2020");
    expect(formatVisaFileInput("20120201234567")).toBe("201/2020/1234567");
  });

  it("stops at the longest three-part number", () => {
    expect(formatVisaFileInput("201202012345678")).toBe("201/2020/1234567");
  });

  it("starts the one-digit part when a separator follows it", () => {
    expect(formatVisaFileInput("201/2020/1/")).toBe("201/2020/1/");
    expect(formatVisaFileInput("201/2020/1.")).toBe("201/2020/1/");
    expect(formatVisaFileInput("201/2020/1/1234567")).toBe(
      "201/2020/1/1234567"
    );
    expect(formatVisaFileInput("201 2020 1 1234567")).toBe(
      "201/2020/1/1234567"
    );
  });

  it("drops the one-digit part when its separator is deleted", () => {
    expect(formatVisaFileInput("201/2020/1")).toBe("201/2020/1");
  });

  it("reformats pasted numbers with other separators", () => {
    expect(formatVisaFileInput("201-2020-1234567")).toBe("201/2020/1234567");
  });
});
