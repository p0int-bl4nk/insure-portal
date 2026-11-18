import { cn } from "cn";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

interface Option<T extends string> {
  value: T;
  label: string;
}

interface ChoiceGroupProps<T extends string> {
  options: readonly Option<T>[];
  value: T | undefined;
  onChange: (value: T) => void;
  invalid?: boolean;
  className?: string;
  "aria-labelledby"?: string;
}

/** Segmented single choice. Selecting the active option again keeps it selected. */
export const ChoiceGroup = <T extends string>({
  options,
  value,
  onChange,
  invalid,
  className,
  ...aria
}: ChoiceGroupProps<T>) => (
  <ToggleGroup
    variant="choice"
    size="touch"
    spacing={0}
    value={value ? [value] : []}
    onValueChange={(next) => {
      const picked = next[0] as T | undefined;
      if (picked) {
        onChange(picked);
      }
    }}
    className={cn("grid w-full", className)}
    style={{
      gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`,
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

const YES_NO = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
] as const;

type YesNoProps = Omit<
  ChoiceGroupProps<"yes" | "no">,
  "options" | "value" | "onChange"
> & {
  value: boolean | undefined;
  onChange: (value: boolean) => void;
};

const toYesNo = (value: boolean | undefined) => {
  if (value === undefined) {
    return;
  }
  return value ? "yes" : "no";
};

export const YesNoChoice = ({ value, onChange, ...rest }: YesNoProps) => (
  <ChoiceGroup
    options={YES_NO}
    value={toYesNo(value)}
    onChange={(v) => onChange(v === "yes")}
    {...rest}
  />
);
