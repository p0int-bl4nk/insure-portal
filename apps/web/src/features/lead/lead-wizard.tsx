import { zodResolver } from "@hookform/resolvers/zod";
import {
  Category,
  CATEGORY_LABELS,
  coversSelf,
  leadHolder,
  leadSchema,
  listMembers,
  MaritalStatus,
  pruneHealthAnswers,
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
import type { FormEvent } from "react";
import { FormProvider, useForm, useWatch } from "react-hook-form";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { submitLead } from "@/lib/api";

import { ContactStep } from "./contact-step";
import { CoverStep } from "./cover-step";
import {
  defaultValues,
  detailFields,
  formMembers,
  memberLabel,
  newMember,
  STEP_COUNT,
} from "./form";
import type { LeadFormValues } from "./form";
import { HealthStep } from "./health-step";
import { MembersStep } from "./members-step";
import { PolicyStep } from "./policy-step";
import { StepHeader } from "./step-header";
import { SuccessScreen } from "./success-screen";
import { WizardLayout } from "./wizard-layout";

/** The Turnstile human check is off unless VITE_TURNSTILE_ENABLED=true. */
const TURNSTILE_ENABLED = import.meta.env.VITE_TURNSTILE_ENABLED === "true";

const Step = {
  Cover: 0,
  Contact: 1,
  Members: 2,
  Health: 3,
  Policy: 4,
} as const;

const STEPS = [
  {
    title: "Who are you buying for?",
    intro:
      "Get health insurance quotes for you and your family. Takes about 5 minutes.",
  },
  {
    title: "About you",
    intro: "How to reach you, and a little about your work.",
  },
  {
    title: "Member details",
    intro: "Fill in each member's tab as on their passport and Emirates ID.",
  },
  {
    title: "Health details",
    intro:
      "This helps us find plans that cover existing conditions. An advisor will go through details with you.",
  },
  {
    title: "Your policy",
    intro: "A few details insurers need to prepare your quotes.",
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

const scrollTop = () => window.scrollTo({ top: 0 });

/** Where focus goes once the next render lands. */
type FocusTarget = "heading" | "firstError" | "submitError";

const SubmitLabel = ({
  submitting,
  isLast,
  nextMember,
}: {
  submitting: boolean;
  isLast: boolean;
  /** Label of the next member tab, while there is one. */
  nextMember: string | undefined;
}) => {
  if (submitting) {
    return (
      <>
        <Spinner data-icon="inline-start" />
        Submitting
      </>
    );
  }

  if (isLast) {
    return "Get my quotes";
  }

  return (
    <>
      {nextMember ? `Next: ${nextMember}` : "Continue"}
      <ArrowRightIcon data-icon="inline-end" />
    </>
  );
};

type Submitted = { lead: Lead } & Pick<
  Extract<SubmitResponse, { ok: true }>,
  "reference"
>;

export const LeadWizard = () => {
  const [step, setStep] = useState<number>(Step.Cover);
  const [memberTab, setMemberTab] = useState(0);
  /** Member tabs that have passed their checks, by path ("self", "children.0"…). */
  const [checkedTabs, setCheckedTabs] = useState<ReadonlySet<string>>(
    new Set()
  );
  const [token, setToken] = useState<string | null>(null);
  const [tokenMissing, setTokenMissing] = useState(false);
  const [submitError, setSubmitError] = useState<SubmitError | null>(null);
  const [submitted, setSubmitted] = useState<Submitted | null>(null);
  // Wrapped in an object so asking for the same target again still refocuses.
  const [focusRequest, setFocusRequest] = useState<{ to: FocusTarget } | null>(
    null
  );
  /** Read out by screen readers when a step's checks fail. */
  const [announcement, setAnnouncement] = useState("");

  const startedAt = useRef(0);
  const honeypot = useRef<HTMLInputElement>(null);
  const turnstile = useRef<TurnstileInstance>(null);
  const main = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const submitAlert = useRef<HTMLDivElement>(null);

  useEffect(() => {
    startedAt.current = Date.now();
  }, []);

  // One schema for the whole lead; each step only checks its own fields (see `next`).
  const form = useForm<LeadFormValues, unknown, Lead>({
    defaultValues,
    resolver: zodResolver(leadSchema),
    mode: "onTouched",
  });

  const {
    handleSubmit,
    trigger,
    getValues,
    setValue,
    clearErrors,
    getFieldState,
    formState,
  } = form;

  const focus = (to: FocusTarget) => setFocusRequest({ to });

  // Runs after the render that shows the new step, tab or errors, so the
  // target exists (e.g. an invalid field on a member tab that just opened).
  useEffect(() => {
    if (!focusRequest) {
      return;
    }

    if (focusRequest.to === "heading") {
      heading.current?.focus({ preventScroll: true });
      return;
    }

    if (focusRequest.to === "submitError") {
      submitAlert.current?.scrollIntoView({ block: "center" });
      submitAlert.current?.focus({ preventScroll: true });
      return;
    }

    const errors =
      main.current?.querySelectorAll('[data-slot="field-error"]').length ?? 0;
    setAnnouncement(
      errors === 1
        ? "1 answer needs attention."
        : `${errors} answers need attention.`
    );

    const invalid = main.current?.querySelector<HTMLElement>(
      '[aria-invalid="true"]'
    );
    // Centred, so the sticky footer on mobile doesn't cover it.
    invalid?.scrollIntoView({ block: "center" });
    invalid?.focus({ preventScroll: true });
  }, [focusRequest]);

  const goTo = (next: number) => {
    setStep(next);
    setAnnouncement("");
    scrollTop();
    focus("heading");
  };

  /** Shows the first error of a failed check and says how many there are. */
  const showErrors = () => focus("firstError");

  const members = formMembers(
    useWatch({ control: form.control, name: "members" })
  );
  const tab = Math.min(memberTab, Math.max(members.length - 1, 0));
  const nextMember = members[tab + 1];

  /** Fits the members to the chosen category before it's checked. */
  const applyCategory = () => {
    const category = getValues("category");

    if (category === Category.SelfOnly) {
      setValue("members", { self: getValues("members.self"), children: [] });
    }

    setValue(
      "members.self",
      coversSelf(category)
        ? (getValues("members.self") ?? newMember())
        : undefined
    );

    // A spouse makes self Married; children rule out Single.
    const { self, spouse, children = [] } = getValues("members");
    if (self && spouse) {
      setValue("members.self.maritalStatus", MaritalStatus.Married);
    } else if (
      self &&
      children.length > 0 &&
      self.maritalStatus === MaritalStatus.Single
    ) {
      setValue("members.self.maritalStatus", undefined);
    }
  };

  /** Checks the open member tab; on the last tab, checks them all. */
  const checkMembers = async () => {
    const current = members[tab];
    if (current && nextMember) {
      if (await trigger(detailFields(current))) {
        setCheckedTabs((done) => new Set(done).add(current.path.join(".")));
        setMemberTab(tab + 1);
        setAnnouncement("");
        scrollTop();
        focus("heading");
      } else {
        showErrors();
      }
      return false;
    }

    if (await trigger(members.flatMap((entry) => detailFields(entry)))) {
      setCheckedTabs(new Set(members.map(({ path }) => path.join("."))));
      return true;
    }

    const firstInvalid = members.findIndex((entry) =>
      detailFields(entry).some((name) => getFieldState(name).invalid)
    );
    setMemberTab(Math.max(firstInvalid, 0));
    showErrors();
    return false;
  };

  const next = async () => {
    switch (step) {
      case Step.Cover: {
        applyCategory();
        if (!(await trigger("category"))) {
          showErrors();
          return;
        }
        clearErrors("members.children");
        setMemberTab(0);
        break;
      }

      case Step.Contact: {
        if (!(await trigger(["contact", "sponsor"]))) {
          showErrors();
          return;
        }
        break;
      }

      case Step.Members: {
        if (!(await checkMembers())) {
          return;
        }
        setValue("members", pruneHealthAnswers(getValues("members")));
        break;
      }

      case Step.Health: {
        if (!(await trigger(["hasPed", "members"]))) {
          showErrors();
          return;
        }
        break;
      }

      default:
    }

    goTo(step + 1);
  };

  const onSubmit = async (lead: Lead) => {
    setSubmitError(null);
    if (TURNSTILE_ENABLED && !token) {
      setTokenMissing(true);
      return;
    }

    const result = await submitLead({
      lead,
      turnstileToken: token ?? undefined,
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
    focus("submitError");
  };

  if (submitted) {
    const { lead, reference } = submitted;
    return (
      <SuccessScreen
        firstName={leadHolder(lead)?.firstName ?? ""}
        mobile={formatUaeMobile(lead.contact.mobile)}
        reference={reference}
        cover={CATEGORY_LABELS[lead.category]}
        members={[
          ...new Set(
            listMembers(lead.members).map(
              ({ relation }) => RELATION_LABELS[relation]
            )
          ),
        ].join(", ")}
      />
    );
  }

  const current = STEPS[step] ?? STEPS[0];
  const isLast = step === STEP_COUNT - 1;

  const handleFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (isLast) {
      return handleSubmit(onSubmit, showErrors)(event);
    }
    event.preventDefault();
    return next();
  };

  return (
    <WizardLayout step={step}>
      <FormProvider {...form}>
        <form
          noValidate
          onSubmit={handleFormSubmit}
          className="flex min-h-svh flex-col md:min-h-0"
        >
          <StepHeader step={step} />

          <main
            ref={main}
            className="flex flex-1 flex-col gap-6 px-5 pt-7 pb-6 md:px-8 md:pt-8 md:pb-8"
          >
            <p className="sr-only" aria-live="polite">
              {announcement}
            </p>

            {isLast && submitError && (
              <Alert
                ref={submitAlert}
                tabIndex={-1}
                variant="destructive"
                className="outline-none"
              >
                <WarningCircleIcon />
                <AlertTitle>{SUBMIT_ERRORS[submitError].title}</AlertTitle>
                <AlertDescription>
                  {SUBMIT_ERRORS[submitError].body}
                </AlertDescription>
              </Alert>
            )}

            <div className="flex flex-col gap-1.5">
              <h1
                ref={heading}
                tabIndex={-1}
                className="text-xl font-semibold tracking-tight outline-none"
              >
                {current.title}
              </h1>
              <p className="text-muted-foreground text-sm leading-relaxed">
                {current.intro}
              </p>
            </div>

            {step === Step.Cover && <CoverStep />}
            {step === Step.Contact && <ContactStep />}
            {step === Step.Members && (
              <MembersStep
                tab={tab}
                onTabChange={setMemberTab}
                checked={checkedTabs}
              />
            )}
            {step === Step.Health && <HealthStep />}
            {step === Step.Policy && <PolicyStep />}
            {isLast && TURNSTILE_ENABLED && (
              <div className="flex flex-col gap-2">
                <Turnstile
                  ref={turnstile}
                  siteKey={import.meta.env.VITE_TURNSTILE_SITE_KEY ?? ""}
                  options={{ size: "flexible", theme: "light" }}
                  onSuccess={(t) => {
                    setToken(t);
                    setTokenMissing(false);
                  }}
                  onExpire={() => setToken(null)}
                  onError={() => setToken(null)}
                />
                {tokenMissing && (
                  <FieldError role="alert">
                    Complete the check to continue.
                  </FieldError>
                )}
              </div>
            )}

            {/* Honeypot: invisible to people and skipped by keyboard and screen readers.
                The name means nothing to autofill (Chrome ignores autoComplete="off", and
                password managers fill anything that looks like "website"/"url"), and the
                data-* attributes opt out of 1Password, LastPass, Bitwarden and Dashlane.
                Sent to the API as `website`. */}
            <input
              ref={honeypot}
              name="hp_7f3a"
              type="text"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              data-1p-ignore="true"
              data-lpignore="true"
              data-bwignore="true"
              data-form-type="other"
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
                onClick={() => {
                  if (step === Step.Members && tab > 0) {
                    setMemberTab(tab - 1);
                    scrollTop();
                    focus("heading");
                    return;
                  }
                  goTo(step - 1);
                }}
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
              <SubmitLabel
                submitting={formState.isSubmitting}
                isLast={isLast}
                nextMember={
                  step === Step.Members && nextMember
                    ? memberLabel(nextMember)
                    : undefined
                }
              />
            </Button>
          </footer>
        </form>
      </FormProvider>
    </WizardLayout>
  );
};
