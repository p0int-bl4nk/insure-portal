import { cn } from "cn";

import { STEP_COUNT } from "./form";
import { BrandMark } from "./wizard-layout";

export const StepHeader = ({ step }: { step: number }) => (
  <header className="flex flex-col gap-3 px-5 pt-4 md:px-8 md:pt-6">
    <div className="flex items-center justify-between">
      {/* On desktop the side panel carries the brand. */}
      <div className="lg:hidden">
        <BrandMark />
      </div>
      <span className="text-muted-foreground text-xs lg:ml-auto">
        STEP {step + 1} / {STEP_COUNT}
      </span>
    </div>
    <div
      className="grid gap-1"
      style={{ gridTemplateColumns: `repeat(${STEP_COUNT}, minmax(0, 1fr))` }}
      aria-hidden="true"
    >
      {Array.from({ length: STEP_COUNT }, (_, i) => (
        <div
          key={i}
          className={cn("h-0.5", i <= step ? "bg-primary" : "bg-border")}
        />
      ))}
    </div>
  </header>
);
