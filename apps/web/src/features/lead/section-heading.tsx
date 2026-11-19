import type { ReactNode } from "react";

/** Heading for a group of fields: clearly above field labels (12px) in the hierarchy. */
export const SectionHeading = ({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) => (
  <h2 id={id} className="text-base leading-snug font-semibold tracking-tight">
    {children}
  </h2>
);
