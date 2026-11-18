import { cn } from "cn";

import { STEP_COUNT } from "./form";

export const BrandMark = () => (
  <div className="flex items-center gap-2">
    {/* Placeholder until the real logo is supplied. */}
    <div className="border-foreground flex size-7 items-center justify-center border text-[9px] font-bold">
      LOGO
    </div>
    <span className="text-xs font-semibold tracking-wider">HEALTH COVER</span>
  </div>
);

export const StepHeader = ({ step }: { step: number }) => (
  <header className="flex flex-col gap-3 px-5 pt-4">
    <div className="flex items-center justify-between">
      <BrandMark />
      <span className="text-muted-foreground text-[11px]">
        STEP {step + 1} / {STEP_COUNT}
      </span>
    </div>
    <div className="grid grid-cols-3 gap-1" aria-hidden="true">
      {Array.from({ length: STEP_COUNT }, (_, i) => (
        <div
          key={i}
          className={cn("h-0.5", i <= step ? "bg-primary" : "bg-border")}
        />
      ))}
    </div>
  </header>
);
