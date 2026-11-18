import { zodResolver } from "@hookform/resolvers/zod";
import {
  EMIRATE_LABELS,
  leadSchema,
  listMembers,
  MaritalStatus,
  RELATION_LABELS,
} from "@insure/shared";
import type { Lead, SubmitError, SubmitResponse } from "@insure/shared";
import { Turnstile } from "@marsidev/react-turnstile";
import type { TurnstileInstance } from "@marsidev/react-turnstile";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { FormProvider, useForm } from "react-hook-form";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { submitLead } from "@/lib/api";

import { AboutStep } from "./about-step";
import {
  defaultValues,
  formMembers,
  genderField,
  memberField,
  pruneHealthAnswers,
  STEP_COUNT,
} from "./form";
import type { LeadFormValues } from "./form";
import { HealthStep } from "./health-step";
import { MembersStep } from "./members-step";
import { StepHeader } from "./step-header";
import { SuccessScreen } from "./success-screen";
import { WizardLayout } from "./wizard-layout";

const STEPS = [
  {
    title: "About you",
    intro:
      "Get health insurance quotes for you and your family. Takes about 2 minutes.",
  },
  {
    title: "Who should be covered?",
    intro: "Select everyone you want to insure. You can add up to 4 children.",
  },
  {
    title: "Health details",
    intro:
      "This helps us find plans that cover existing conditions. An advisor will go through details with you.",
  },
] as const;

const SUBMIT_ERRORS: Record<SubmitError, { title: string; body: string }> = {
  invalid: {
    title: "Some answers need checking",
    body: "Go back through the steps and check your answers, then try again.",
  },
  verification_failed: {
    title: "We couldn't verify you're human",
    body: "Complete the check below again, then tap Get my quotes.",
  },
  unavailable: {
    title: "Couldn't submit your details",
    body: "Something went wrong on our side. Your answers are still here — tap Get my quotes to try again.",
  },
};

const UAE_MOBILE_PARTS = /^\+971(?<a>\d{2})(?<b>\d{3})(?<c>\d{4})$/u;

/** "+971501234567" → "+971 50 123 4567" */
const formatUaeMobile = (mobile: string) => {
  const parts = mobile.match(UAE_MOBILE_PARTS)?.groups;

  return parts ? `+971 ${parts.a} ${parts.b} ${parts.c}` : mobile;
};

type Submitted = { lead: Lead } & Pick<
  Extract<SubmitResponse, { ok: true }>,
  "reference"
>;

export const LeadWizard = () => {
  const [step, setStep] = useState(0);
  const [token, setToken] = useState<string | null>(null);
  const [tokenMissing, setTokenMissing] = useState(false);
  const [submitError, setSubmitError] = useState<SubmitError | null>(null);
  const [submitted, setSubmitted] = useState<Submitted | null>(null);

  const startedAt = useRef(0);
  const honeypot = useRef<HTMLInputElement>(null);
  const turnstile = useRef<TurnstileInstance>(null);

  useEffect(() => {
    startedAt.current = Date.now();
  }, []);

  // One schema for the whole lead; each step only checks its own fields (see `next`).
  const form = useForm<LeadFormValues, unknown, Lead>({
    defaultValues,
    resolver: zodResolver(leadSchema),
    mode: "onTouched",
  });

  const { handleSubmit, trigger, getValues, setValue, formState } = form;

  const goTo = (next: number) => {
    setStep(next);
    window.scrollTo({ top: 0 });
  };

  /** The fields shown on the current step, so Continue only checks those. */
  const stepFields = () => {
    if (step === 0) {
      return ["proposer" as const];
    }

    const entries = formMembers(
      getValues("members"),
      getValues("proposer.gender")
    );

    return entries.flatMap(({ path }) => {
      const gender = genderField(path);
      const age = memberField(path, "age");

      return gender ? [age, gender] : [age];
    });
  };

  const next = async () => {
    if (!(await trigger(stepFields()))) {
      return;
    }

    if (
      step === 0 &&
      getValues("proposer.maritalStatus") !== MaritalStatus.Married
    ) {
      // Spouse and children are only offered to married proposers.
      setValue("members.spouse", undefined);
      setValue("members.children", []);
    }

    if (step === 1) {
      setValue(
        "members",
        pruneHealthAnswers(
          getValues("members"),
          getValues("proposer.gender"),
          getValues("proposer.maritalStatus")
        )
      );
    }

    goTo(step + 1);
  };

  const onSubmit = async (lead: Lead) => {
    setSubmitError(null);
    if (!token) {
      setTokenMissing(true);
      return;
    }
    const result = await submitLead({
      lead,
      turnstileToken: token,
      website: honeypot.current?.value ?? "",
      startedAt: startedAt.current,
    });
    if (result.ok) {
      setSubmitted({ reference: result.reference, lead });
      window.scrollTo({ top: 0 });
      return;
    }
    // Turnstile tokens are single-use: get a fresh one for the retry.
    turnstile.current?.reset();
    setToken(null);
    setSubmitError(result.error);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (submitted) {
    const { lead, reference } = submitted;
    return (
      <SuccessScreen
        firstName={
          lead.proposer.fullName.split(" ")[0] ?? lead.proposer.fullName
        }
        mobile={formatUaeMobile(lead.proposer.mobile)}
        reference={reference}
        members={[
          ...new Set(
            listMembers(lead.members, lead.proposer.gender).map(
              ({ relation }) => RELATION_LABELS[relation]
            )
          ),
        ].join(", ")}
        emirate={EMIRATE_LABELS[lead.proposer.emirate]}
      />
    );
  }

  const current = STEPS[step] ?? STEPS[0];
  const isLast = step === STEP_COUNT - 1;

  const handleFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (isLast) {
      return handleSubmit(onSubmit)(event);
    }
    event.preventDefault();
    return next();
  };

  let submitLabel: ReactNode = (
    <>
      Continue
      <ArrowRightIcon data-icon="inline-end" />
    </>
  );
  if (formState.isSubmitting) {
    submitLabel = (
      <>
        <Spinner data-icon="inline-start" />
        Submitting
      </>
    );
  } else if (isLast) {
    submitLabel = "Get my quotes";
  }

  return (
    <WizardLayout step={step}>
      <FormProvider {...form}>
        <form
          noValidate
          onSubmit={handleFormSubmit}
          className="flex min-h-svh flex-col md:min-h-0"
        >
          <StepHeader step={step} />

          <main className="flex flex-1 flex-col gap-6 px-5 pt-7 pb-6 md:px-8 md:pt-8 md:pb-8">
            {isLast && submitError && (
              <Alert variant="destructive">
                <WarningCircleIcon />
                <AlertTitle>{SUBMIT_ERRORS[submitError].title}</AlertTitle>
                <AlertDescription>
                  {SUBMIT_ERRORS[submitError].body}
                </AlertDescription>
              </Alert>
            )}

            <div className="flex flex-col gap-1.5">
              <h1 className="text-xl font-semibold tracking-tight">
                {current.title}
              </h1>
              <p className="text-muted-foreground text-xs leading-relaxed">
                {current.intro}
              </p>
            </div>

            {step === 0 && <AboutStep />}
            {step === 1 && <MembersStep />}
            {step === 2 && (
              <>
                <HealthStep />
                <div className="flex flex-col gap-2">
                  <Turnstile
                    ref={turnstile}
                    siteKey={import.meta.env.VITE_TURNSTILE_SITE_KEY}
                    options={{ size: "flexible", theme: "light" }}
                    onSuccess={(t) => {
                      setToken(t);
                      setTokenMissing(false);
                    }}
                    onExpire={() => setToken(null)}
                    onError={() => setToken(null)}
                  />
                  {tokenMissing && (
                    <FieldError>Complete the check to continue.</FieldError>
                  )}
                </div>
              </>
            )}

            {/* Honeypot: invisible to people and skipped by keyboard and screen readers. */}
            <input
              ref={honeypot}
              name="website"
              type="text"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              className="absolute -left-[9999px] size-px opacity-0"
            />
          </main>

          <footer className="border-border bg-background sticky bottom-0 flex gap-2 border-t px-5 pt-4 pb-6 md:static md:justify-end md:px-8 md:py-5">
            {step > 0 && (
              <Button
                type="button"
                variant="outline"
                size="touch"
                className="w-24"
                onClick={() => goTo(step - 1)}
                disabled={formState.isSubmitting}
              >
                <ArrowLeftIcon data-icon="inline-start" />
                Back
              </Button>
            )}
            <Button
              type="submit"
              size="touch"
              className="flex-1 md:w-56 md:flex-none"
              disabled={formState.isSubmitting}
            >
              {submitLabel}
            </Button>
          </footer>
        </form>
      </FormProvider>
    </WizardLayout>
  );
};
