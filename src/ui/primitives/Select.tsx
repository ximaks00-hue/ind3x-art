import type { SelectHTMLAttributes, ReactNode } from "react";

import styles from "./primitives.module.css";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  children: ReactNode;
}

export function Select({ className, children, ...props }: SelectProps) {
  return (
    <select className={[styles.select, className].filter(Boolean).join(" ")} {...props}>
      {children}
    </select>
  );
}
