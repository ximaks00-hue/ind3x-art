import { useSettingsStore } from "../../state/settingsStore";
import { Button } from "../primitives";
import {
  CLASSIC_ONBOARDING_STEPS,
  STUDIO_ONBOARDING_STEPS,
  type OnboardingStep,
} from "./onboardingSteps";
import styles from "./OnboardingTour.module.css";

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
  if (!current) return null;

  const target = document.querySelector(`[data-tour~="${current.target}"]`);
  const rect = target?.getBoundingClientRect();

  return (
    <div className={styles.overlay} role="presentation">
      {rect && (
        <div
          className={styles.spotlight}
          style={{
            top: rect.top - 8,
            left: rect.left - 8,
            width: rect.width + 16,
            height: rect.height + 16,
          }}
        />
      )}
      <div className={styles.card} role="dialog" aria-modal aria-label="Getting started">
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
  const workspaceMode = useSettingsStore((s) => s.workspaceMode);

  const classicCompleted = useSettingsStore((s) => s.onboardingCompleted);
  const classicStep = useSettingsStore((s) => s.onboardingTourStep);
  const setClassicStep = useSettingsStore((s) => s.setOnboardingTourStep);
  const completeClassic = useSettingsStore((s) => s.completeOnboarding);

  const studioCompleted = useSettingsStore((s) => s.studioOnboardingCompleted);
  const studioStep = useSettingsStore((s) => s.studioOnboardingTourStep);
  const setStudioStep = useSettingsStore((s) => s.setStudioOnboardingTourStep);
  const completeStudio = useSettingsStore((s) => s.completeStudioOnboarding);

  if (workspaceMode === "studio") {
    if (studioCompleted || studioStep < 0 || studioStep >= STUDIO_ONBOARDING_STEPS.length) {
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

  if (classicCompleted || classicStep < 0 || classicStep >= CLASSIC_ONBOARDING_STEPS.length) {
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
