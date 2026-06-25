import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

import styles from "./primitives.module.css";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  children: ReactNode;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, children, className, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      className={[styles.iconButton, className].filter(Boolean).join(" ")}
      aria-label={label}
      title={label}
      {...props}
    >
      {children}
    </button>
  );
});
