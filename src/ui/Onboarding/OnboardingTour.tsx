import { useSettingsStore } from "../../state/settingsStore";
import { Button } from "../primitives";
import styles from "./OnboardingTour.module.css";

const STEPS = [
  {
    title: "Open a project",
    body: "Open a mod JAR, resource folder, or try the bundled demo pack to index textures and models.",
    target: "tour-open",
  },
  {
    title: "Select a texture",
    body: "Pick any texture in the explorer — block models and blockstates work too.",
    target: "tour-explorer",
  },
  {
    title: "Paint a face",
    body: "Press Space for Paint mode, click a face in the 3D viewer, then edit in the texture panel.",
    target: "tour-viewer",
  },
  {
    title: "Save your work",
    body: "Press Ctrl+S or use Save in the title bar. Backups are created automatically.",
    target: "tour-save",
  },
] as const;

export function OnboardingTour() {
  const completed = useSettingsStore((s) => s.onboardingCompleted);
  const step = useSettingsStore((s) => s.onboardingTourStep);
  const setStep = useSettingsStore((s) => s.setOnboardingTourStep);
  const complete = useSettingsStore((s) => s.completeOnboarding);

  if (completed || step < 0 || step >= STEPS.length) return null;

  const current = STEPS[step];
  const target = document.querySelector(`[data-tour="${current.target}"]`);
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
          Step {step + 1} of {STEPS.length}
        </p>
        <h2 className={styles.title}>{current.title}</h2>
        <p className={styles.body}>{current.body}</p>
        <div className={styles.actions}>
          <Button variant="ghost" onClick={complete}>
            Skip tour
          </Button>
          <div className={styles.spacer} />
          {step > 0 && (
            <Button variant="ghost" onClick={() => setStep(step - 1)}>
              Back
            </Button>
          )}
          {step < STEPS.length - 1 ? (
            <Button variant="primary" onClick={() => setStep(step + 1)}>
              Next
            </Button>
          ) : (
            <Button variant="primary" onClick={complete}>
              Done
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
