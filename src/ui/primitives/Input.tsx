import type { InputHTMLAttributes } from "react";

import styles from "./primitives.module.css";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={styles.input} {...props} />;
}
