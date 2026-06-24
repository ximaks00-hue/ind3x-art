import type { ButtonHTMLAttributes, ReactNode } from "react";

import styles from "./primitives.module.css";

type ButtonVariant = "default" | "primary" | "ghost" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: "sm" | "md";
  children: ReactNode;
}

export function Button({
  variant = "default",
  size = "md",
  type = "button",
  className,
  children,
  ...props
}: ButtonProps) {
  const classes = [
    styles.button,
    variant === "primary" ? styles.primary : "",
    variant === "ghost" ? styles.ghost : "",
    variant === "danger" ? styles.danger : "",
    size === "sm" ? styles.sm : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button type={type} className={classes} {...props}>
      {children}
    </button>
  );
}
