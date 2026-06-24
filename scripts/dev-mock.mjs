import { spawn } from "node:child_process";

const child = spawn("npx", ["vite"], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, VITE_E2E_MOCK: "true" },
});

child.on("exit", (code) => process.exit(code ?? 0));
