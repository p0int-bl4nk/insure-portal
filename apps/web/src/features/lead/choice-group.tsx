import { cn } from "cn";
import type { ReactNode } from "react";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export interface Option<T extends string> {
  value: T;
  label: string;
}

interface ChoiceOption<T extends string> {
  value: T;
  label: ReactNode;
}

interface ChoiceGroupProps<T extends string> {
  options: readonly ChoiceOption<T>[];
  value: T | undefined;
  onChange: (value: T) => void;
  invalid?: boolean;
  /** Defaults to one row; fewer columns wrap the options onto several rows. */
  columns?: number;
  className?: string;
  "aria-labelledby"?: string;
}

/** Choice options from an option object (e.g. `Gender`), in declaration order. */
export const optionsFrom = <T extends string>(
  values: Record<string, T>,
  labels: Record<T, string>
): Option<T>[] =>
  Object.values(values).map((value) => ({ value, label: labels[value] }));

/** Segmented single choice. Selecting the active option again keeps it selected. */
export const ChoiceGroup = <T extends string>({
  options,
  value,
  onChange,
  invalid,
  columns,
  className,
  ...aria
}: ChoiceGroupProps<T>) => {
  const perRow = columns ?? options.length;

  return (
    <ToggleGroup
      variant="choice"
      size="touch"
      // Joined segments on one row; separate tiles once they wrap.
      spacing={perRow < options.length ? 2 : 0}
      value={value ? [value] : []}
      onValueChange={(next) => {
        // Selecting the active option again empties `next`; keep the current choice.
        const picked = options.find((option) => option.value === next[0]);
        if (picked) {
          onChange(picked.value);
        }
      }}
      className={cn("grid w-full", className)}
      style={{
        gridTemplateColumns: `repeat(${perRow}, minmax(0, 1fr))`,
      }}
      {...aria}
    >
      {options.map((option) => (
        <ToggleGroupItem
          key={option.value}
          value={option.value}
          aria-invalid={invalid || undefined}
        >
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
};

const YesNo = { Yes: "yes", No: "no" } as const;
type YesNo = (typeof YesNo)[keyof typeof YesNo];

const YES_NO_OPTIONS = [
  { value: YesNo.Yes, label: "Yes" },
  { value: YesNo.No, label: "No" },
];

type YesNoProps = Omit<
  ChoiceGroupProps<YesNo>,
  "options" | "value" | "onChange"
> & {
  value: boolean | undefined;
  onChange: (value: boolean) => void;
};

const toYesNo = (value: boolean | undefined) => {
  if (value === undefined) {
    return;
  }

  return value ? YesNo.Yes : YesNo.No;
};

export const YesNoChoice = ({ value, onChange, ...rest }: YesNoProps) => (
  <ChoiceGroup
    options={YES_NO_OPTIONS}
    value={toYesNo(value)}
    onChange={(v) => onChange(v === YesNo.Yes)}
    {...rest}
  />
);
