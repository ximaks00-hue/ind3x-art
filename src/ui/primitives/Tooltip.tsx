import type { ReactNode } from "react";

interface TooltipProps {
  text: string;
  children: ReactNode;
}

/** Lightweight tooltip via native title until hover-positioned tooltips are needed. */
export function Tooltip({ text, children }: TooltipProps) {
  return <span title={text}>{children}</span>;
}
