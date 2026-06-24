import { spawn } from "node:child_process";

// Avoid shell:true to prevent command-injection via inherited env vars.
// On Windows, use the .cmd shim for npx; on POSIX, invoke directly.
const isWindows = process.platform === "win32";
const child = spawn(isWindows ? "npx.cmd" : "npx", ["vite"], {
  stdio: "inherit",
  shell: false,
  env: { ...process.env, VITE_E2E_MOCK: "true" },
});

child.on("error", (err) => {
  console.error("dev-mock: failed to start Vite:", err.message);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) process.exit(1);
  process.exit(code ?? 1);
});
