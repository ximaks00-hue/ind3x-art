import { Archive, FolderOpen, History, Package } from "lucide-react";

import type { RecentProject } from "../../state/settingsStore";
import { Icon } from "../../ui/icons/Icon";
import { Button } from "../../ui/primitives/Button";
import styles from "./WelcomeScreen.module.css";

interface WelcomeScreenProps {
  variant?: "panel" | "hero";
  recentProjects?: RecentProject[];
  onOpenJar: () => void;
  onOpenFolder: () => void;
  onOpenRecent?: (path: string, kind: "jar" | "folder") => void;
  onTryDemo?: () => void;
}

function formatRecent(path: string) {
  const parts = path.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] || path;
}

export function WelcomeScreen({
  variant = "panel",
  recentProjects = [],
  onOpenJar,
  onOpenFolder,
  onOpenRecent,
  onTryDemo,
}: WelcomeScreenProps) {
  const hero = variant === "hero";

  return (
    <div className={hero ? styles.hero : styles.panel}>
      <div className={styles.mark} aria-hidden>
        <span className={styles.logoPulse} />
      </div>
      <h2 className={styles.title}>
        {hero ? "Welcome to inD3X Art" : "No project open"}
      </h2>
      <p className={styles.subtitle}>
        Open a mod JAR or resource pack folder to browse textures, models, and blockstates
        in a premium studio workflow.
      </p>

      <div className={styles.actions} data-tour="tour-open">
        <Button variant="primary" onClick={onOpenJar}>
          <Icon icon={Archive} size={16} />
          Open JAR
        </Button>
        <Button onClick={onOpenFolder}>
          <Icon icon={FolderOpen} size={16} />
          Open folder
        </Button>
        {onTryDemo && (
          <Button onClick={onTryDemo}>
            <Icon icon={Package} size={16} />
            Try demo pack
          </Button>
        )}
      </div>

      {recentProjects.length > 0 && (
        <section className={styles.recent} aria-label="Recent projects">
          <div className={styles.recentHeader}>
            <Icon icon={History} size={16} />
            <span>Recent</span>
          </div>
          <ul className={styles.recentList}>
            {recentProjects.slice(0, 6).map((project) => (
              <li key={project.path}>
                <button
                  type="button"
                  className={styles.recentItem}
                  onClick={() => onOpenRecent?.(project.path, project.kind)}
                  title={project.path}
                >
                  <span className={styles.recentKind}>
                    {project.kind === "jar" ? "JAR" : "Folder"}
                  </span>
                  <span className={styles.recentName}>{formatRecent(project.path)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {hero && (
        <p className={styles.hint}>
          Keyboard: Ctrl+K commands · Ctrl+F explorer · ? shortcuts · Ctrl+\ focus mode
        </p>
      )}
    </div>
  );
}
