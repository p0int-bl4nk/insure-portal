import { CheckIcon, LockSimpleIcon } from "@phosphor-icons/react";
import { cn } from "cn";
import type { ReactNode } from "react";

import { STEP_TITLES } from "./form";

const LogoBox = ({ className }: { className?: string }) => (
  // Placeholder until the real logo is supplied.
  <div
    className={cn(
      "flex size-7 items-center justify-center border text-[9px] font-bold",
      className
    )}
  >
    LOGO
  </div>
);

export const BrandMark = () => (
  <div className="flex items-center gap-2">
    <LogoBox className="border-foreground" />
    <span className="text-xs font-semibold tracking-wider">HEALTH COVER</span>
  </div>
);

const POINTS = [
  "Plans from licensed UAE insurers",
  "Cover yourself, your spouse, children and parents",
  "An advisor calls you — no obligation",
];

/** Desktop-only side panel: brand, where you are in the form, reassurance. */
const SidePanel = ({ step }: { step: number }) => (
  <aside className="bg-primary text-primary-foreground sticky top-0 hidden h-svh flex-col justify-between gap-10 p-10 lg:flex xl:p-14">
    <div className="flex items-center gap-2">
      <LogoBox className="border-primary-foreground" />
      <span className="text-xs font-semibold tracking-wider">HEALTH COVER</span>
    </div>

    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-3">
        <h2 className="text-2xl leading-tight font-semibold text-balance xl:text-3xl">
          Health insurance quotes for your family in the UAE
        </h2>
        <p className="text-primary-foreground/80 text-xs leading-relaxed">
          Answer a few questions and an advisor will contact you with plans that
          fit.
        </p>
      </div>

      <ol className="flex flex-col gap-4" aria-label="Form steps">
        {STEP_TITLES.map((title, i) => {
          const done = i < step;
          const current = i === step;
          return (
            <li
              key={title}
              aria-current={current ? "step" : undefined}
              className={cn(
                "flex items-center gap-3 text-xs",
                !(done || current) && "text-primary-foreground/60"
              )}
            >
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center border text-[11px] font-semibold",
                  current && "bg-primary-foreground text-primary",
                  done && "border-primary-foreground",
                  !(done || current) && "border-primary-foreground/40"
                )}
              >
                {done ? <CheckIcon weight="bold" /> : i + 1}
              </span>
              <span className={cn(current && "font-semibold")}>{title}</span>
            </li>
          );
        })}
      </ol>

      <ul className="border-primary-foreground/20 flex flex-col gap-2.5 border-t pt-6">
        {POINTS.map((point) => (
          <li key={point} className="flex items-start gap-2.5 text-xs">
            <CheckIcon className="mt-0.5 shrink-0" />
            {point}
          </li>
        ))}
      </ul>
    </div>

    <p className="text-primary-foreground/70 flex items-center gap-2 text-[11px]">
      <LockSimpleIcon />
      Your details are only shared with our licensed advisors.
    </p>
  </aside>
);

/**
 * Phone: full-width single column.
 * Tablet (md): centred card on a tinted background.
 * Desktop (lg): side panel on the left, form card on the right.
 */
export const WizardLayout = ({
  step,
  children,
}: {
  step: number;
  children: ReactNode;
}) => (
  <div className="bg-background md:bg-muted/50 min-h-svh lg:grid lg:grid-cols-[minmax(340px,5fr)_7fr]">
    <SidePanel step={step} />
    <div className="flex justify-center md:px-8 md:py-10 lg:items-start lg:py-14">
      <div className="bg-background md:border-border w-full max-w-md md:max-w-2xl md:border">
        {children}
      </div>
    </div>
  </div>
);
