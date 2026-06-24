import type { ButtonHTMLAttributes, ReactNode } from "react";

import styles from "./primitives.module.css";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  children: ReactNode;
}

export function IconButton({ label, children, className, ...props }: IconButtonProps) {
  return (
    <button
      type="button"
      className={[styles.iconButton, className].filter(Boolean).join(" ")}
      aria-label={label}
      title={label}
      {...props}
    >
      {children}
    </button>
  );
}
