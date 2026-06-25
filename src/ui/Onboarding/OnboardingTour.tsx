import { useLayoutEffect, useState } from "react";

import { useProjectStore } from "../../state/projectStore";
import { useSettingsStore } from "../../state/settingsStore";
import { Button } from "../primitives";
import {
  CLASSIC_ONBOARDING_STEPS,
  STUDIO_IN_APP_ONBOARDING_STEPS,
  STUDIO_ONBOARDING_STEPS,
  type OnboardingStep,
} from "./onboardingSteps";
import styles from "./OnboardingTour.module.css";

function cardStyle(rect: DOMRect | undefined): React.CSSProperties {
  if (!rect) {
    return {
      left: "50%",
      bottom: "var(--space-6)",
      transform: "translateX(-50%)",
    };
  }
  const cardWidth = Math.min(440, window.innerWidth - 32);
  const left = Math.max(12, Math.min(rect.left, window.innerWidth - cardWidth - 12));
  const belowTop = rect.bottom + 12;
  if (belowTop + 180 < window.innerHeight) {
    return { top: belowTop, left, transform: "none", bottom: "auto", width: cardWidth };
  }
  const aboveBottom = window.innerHeight - rect.top + 12;
  return { bottom: aboveBottom, left, transform: "none", top: "auto", width: cardWidth };
}

function OnboardingTourBody({
  steps,
  step,
  onBack,
  onNext,
  onComplete,
  onSkip,
}: {
  steps: readonly OnboardingStep[];
  step: number;
  onBack: () => void;
  onNext: () => void;
  onComplete: () => void;
  onSkip: () => void;
}) {
  const current = steps[step];
  const [targetRect, setTargetRect] = useState<DOMRect | undefined>();

  useLayoutEffect(() => {
    if (!current) return;

    const measure = () => {
      const target = document.querySelector(`[data-tour~="${current.target}"]`);
      setTargetRect(target?.getBoundingClientRect());
    };

    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [current]);

  if (!current) return null;

  return (
    <div className={styles.overlay} role="presentation">
      {targetRect && (
        <div
          className={styles.spotlight}
          style={{
            top: targetRect.top - 8,
            left: targetRect.left - 8,
            width: targetRect.width + 16,
            height: targetRect.height + 16,
          }}
        />
      )}
      <div
        className={styles.card}
        style={cardStyle(targetRect)}
        role="dialog"
        aria-modal
        aria-label="Getting started"
      >
        <p className={styles.step}>
          Step {step + 1} of {steps.length}
        </p>
        <h2 className={styles.title}>{current.title}</h2>
        <p className={styles.body}>{current.body}</p>
        <div className={styles.actions}>
          <Button variant="ghost" onClick={onSkip}>
            Skip tour
          </Button>
          <div className={styles.spacer} />
          {step > 0 && (
            <Button variant="ghost" onClick={onBack}>
              Back
            </Button>
          )}
          {step < steps.length - 1 ? (
            <Button variant="primary" onClick={onNext}>
              Next
            </Button>
          ) : (
            <Button variant="primary" onClick={onComplete}>
              Done
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export function OnboardingTour() {
  const handle = useProjectStore((s) => s.handle);
  const indexStatus = useProjectStore((s) => s.indexStatus);
  const workspaceMode = useSettingsStore((s) => s.workspaceMode);
  const classicCompleted = useSettingsStore((s) => s.onboardingCompleted);
  const classicStep = useSettingsStore((s) => s.onboardingTourStep);
  const setClassicStep = useSettingsStore((s) => s.setOnboardingTourStep);
  const completeClassic = useSettingsStore((s) => s.completeOnboarding);
  const studioCompleted = useSettingsStore((s) => s.studioOnboardingCompleted);
  const studioStep = useSettingsStore((s) => s.studioOnboardingTourStep);
  const setStudioStep = useSettingsStore((s) => s.setStudioOnboardingTourStep);
  const completeStudio = useSettingsStore((s) => s.completeStudioOnboarding);
  const studioInAppCompleted = useSettingsStore((s) => s.studioInAppOnboardingCompleted);
  const studioInAppStep = useSettingsStore((s) => s.studioInAppOnboardingTourStep);
  const setStudioInAppStep = useSettingsStore((s) => s.setStudioInAppOnboardingTourStep);
  const completeStudioInApp = useSettingsStore((s) => s.completeStudioInAppOnboarding);

  if (
    handle &&
    workspaceMode === "studio" &&
    indexStatus === "done" &&
    !studioInAppCompleted &&
    studioInAppStep >= 0 &&
    studioInAppStep < STUDIO_IN_APP_ONBOARDING_STEPS.length
  ) {
    return (
      <OnboardingTourBody
        steps={STUDIO_IN_APP_ONBOARDING_STEPS}
        step={studioInAppStep}
        onBack={() => setStudioInAppStep(studioInAppStep - 1)}
        onNext={() => setStudioInAppStep(studioInAppStep + 1)}
        onComplete={completeStudioInApp}
        onSkip={completeStudioInApp}
      />
    );
  }

  if (handle) return null;

  if (workspaceMode === "studio") {
    if (
      studioCompleted ||
      studioStep < 0 ||
      studioStep >= STUDIO_ONBOARDING_STEPS.length
    ) {
      return null;
    }
    return (
      <OnboardingTourBody
        steps={STUDIO_ONBOARDING_STEPS}
        step={studioStep}
        onBack={() => setStudioStep(studioStep - 1)}
        onNext={() => setStudioStep(studioStep + 1)}
        onComplete={completeStudio}
        onSkip={completeStudio}
      />
    );
  }

  if (
    classicCompleted ||
    classicStep < 0 ||
    classicStep >= CLASSIC_ONBOARDING_STEPS.length
  ) {
    return null;
  }

  return (
    <OnboardingTourBody
      steps={CLASSIC_ONBOARDING_STEPS}
      step={classicStep}
      onBack={() => setClassicStep(classicStep - 1)}
      onNext={() => setClassicStep(classicStep + 1)}
      onComplete={completeClassic}
      onSkip={completeClassic}
    />
  );
}
