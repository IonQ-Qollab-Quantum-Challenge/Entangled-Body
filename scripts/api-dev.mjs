import {
  apiDir,
  ensureVenvExists,
  spawnForeground,
  venvPython,
} from "./runtime.mjs";

ensureVenvExists("api-dev");

const api = spawnForeground(
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
);

api.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  }
  process.exit(code ?? 0);
});
