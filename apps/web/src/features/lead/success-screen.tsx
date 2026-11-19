import { CheckIcon } from "@phosphor-icons/react";

import { STEP_COUNT } from "./form";
import { BrandMark, WizardLayout } from "./wizard-layout";

interface SuccessScreenProps {
  firstName: string;
  mobile: string;
  reference: string;
  cover: string;
  members: string;
}

export const SuccessScreen = ({
  firstName,
  mobile,
  reference,
  cover,
  members,
}: SuccessScreenProps) => {
  const rows = [
    ["Reference", reference],
    ["Cover", cover],
    ["Members", members],
  ] as const;

  return (
    <WizardLayout step={STEP_COUNT}>
      <div className="flex min-h-svh flex-col md:min-h-0">
        <header className="px-5 py-4 md:px-8 md:pt-6 lg:hidden">
          <BrandMark />
        </header>
        <main className="flex flex-1 flex-col justify-center gap-7 px-5 pb-10 md:px-8 md:py-12">
          <div className="bg-primary text-primary-foreground flex size-12 items-center justify-center">
            <CheckIcon className="size-6" weight="bold" />
          </div>
          <div className="flex flex-col gap-2.5" aria-live="polite">
            <h1 className="text-[22px] leading-tight font-semibold text-balance">
              Thanks, {firstName}. We&apos;ve got your details.
            </h1>
            <p className="text-muted-foreground text-xs leading-relaxed">
              An advisor will contact you on{" "}
              <strong className="text-foreground font-semibold">
                {mobile}
              </strong>{" "}
              with plans that suit your family.
            </p>
          </div>
          <dl className="border-border flex flex-col border text-xs">
            {rows.map(([term, value]) => (
              <div
                key={term}
                className="border-border flex justify-between gap-4 border-b px-3.5 py-3 last:border-b-0"
              >
                <dt className="text-muted-foreground">{term}</dt>
                <dd className="text-right font-medium">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="text-muted-foreground text-[11px] leading-relaxed">
            Quote this reference if you contact us. You can close this page.
          </p>
        </main>
      </div>
    </WizardLayout>
  );
};
