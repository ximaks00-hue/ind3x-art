import type { LucideIcon, LucideProps } from "lucide-react";

export type IconSize = 16 | 20;

interface IconProps extends Omit<LucideProps, "size"> {
  icon: LucideIcon;
  size?: IconSize;
}

export function Icon({
  icon: Lucide,
  size = 16,
  strokeWidth = 1.75,
  ...props
}: IconProps) {
  return <Lucide size={size} strokeWidth={strokeWidth} aria-hidden {...props} />;
}
