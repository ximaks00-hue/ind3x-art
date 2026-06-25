import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import styles from "./Tooltip.module.css";

type TooltipSide = "top" | "bottom" | "left" | "right";

interface TooltipProps {
  text: string;
  children: ReactNode;
  side?: TooltipSide;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max));
}

export function Tooltip({ text, children, side = "top" }: TooltipProps) {
  const tooltipId = useId();
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (showTimerRef.current) {
      clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const measure = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const margin = 8;
    let top = rect.top - margin;
    let left = rect.left + rect.width / 2;

    if (side === "bottom") {
      top = rect.bottom + margin;
    } else if (side === "left") {
      top = rect.top + rect.height / 2;
      left = rect.left - margin;
    } else if (side === "right") {
      top = rect.top + rect.height / 2;
      left = rect.right + margin;
    }

    setCoords({
      top: clamp(top, margin, window.innerHeight - margin),
      left: clamp(left, margin, window.innerWidth - margin),
    });
  }, [side]);

  const scheduleShow = useCallback(() => {
    clearTimers();
    showTimerRef.current = setTimeout(() => {
      measure();
      setOpen(true);
      requestAnimationFrame(() => setVisible(true));
    }, 400);
  }, [clearTimers, measure]);

  const scheduleHide = useCallback(() => {
    clearTimers();
    hideTimerRef.current = setTimeout(() => {
      setVisible(false);
      window.setTimeout(() => setOpen(false), 100);
    }, 100);
  }, [clearTimers]);

  useLayoutEffect(() => {
    if (!open) return;
    measure();
    const onReflow = () => measure();
    window.addEventListener("resize", onReflow);
    window.addEventListener("scroll", onReflow, true);
    return () => {
      window.removeEventListener("resize", onReflow);
      window.removeEventListener("scroll", onReflow, true);
    };
  }, [open, measure]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  return (
    <>
      <span
        ref={anchorRef}
        className={styles.anchor}
        onMouseEnter={scheduleShow}
        onMouseLeave={scheduleHide}
        onFocus={scheduleShow}
        onBlur={scheduleHide}
        aria-describedby={open ? tooltipId : undefined}
      >
        {children}
      </span>
      {open
        ? createPortal(
            <div
              id={tooltipId}
              role="tooltip"
              className={`${styles.tooltip} ${styles[side]}${visible ? ` ${styles.visible}` : ""}`}
              style={{ top: coords.top, left: coords.left }}
            >
              {text}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
