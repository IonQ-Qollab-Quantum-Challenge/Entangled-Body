import {
  apiDir,
  ensureVenvExists,
  localBin,
  spawnForeground,
  venvPython,
  webDir,
} from "./runtime.mjs";

ensureVenvExists("dev");

const children = [
  spawnForeground(
    venvPython(),
    [
      "-m",
      "uvicorn",
      "main:app",
      "--host",
      "0.0.0.0",
      "--port",
      "8000",
      "--reload",
    ],
    { cwd: apiDir },
  ),
  spawnForeground(localBin("next"), ["dev", "-p", "3000"], { cwd: webDir }),
];

let shuttingDown = false;

function shutdown(code = 0) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  for (const child of children) {
    if (!child.killed) {
      child.kill();
    }
  }

  process.exit(code);
}

for (const child of children) {
  child.on("exit", (code) => shutdown(code ?? 0));
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
