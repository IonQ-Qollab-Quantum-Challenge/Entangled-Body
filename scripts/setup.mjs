import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import {
  apiDir,
  commandName,
  detectPython,
  printVenvFailureHelp,
  rootDir,
  run,
  venvDir,
  venvPython,
} from "./runtime.mjs";

const python = detectPython();

if (!python) {
  console.error("[setup] Python 3.11 or newer is required.");
  process.exit(1);
}

console.log("[setup] Installing root node dependencies...");
run(commandName("npm"), ["install"]);

if (!existsSync(venvPython())) {
  console.log(`[setup] Creating python virtualenv at ${venvDir}`);
  const result = runVenvCreate();
  if (result !== 0) {
    printVenvFailureHelp();
    process.exit(result);
  }
} else {
  console.log(`[setup] Reusing python virtualenv at ${venvDir}`);
}

console.log("[setup] Installing API python dependencies...");
run(venvPython(), ["-m", "pip", "install", "--upgrade", "pip"]);
run(venvPython(), [
  "-m",
  "pip",
  "install",
  "-r",
  path.join(apiDir, "requirements.txt"),
]);

console.log("[setup] Done. Next: run 'npm run dev'");

function runVenvCreate() {
  const result = spawnSync(
    python.command,
    [...python.args, "-m", "venv", venvDir],
    {
      cwd: rootDir,
      stdio: "inherit",
    },
  );

  if (result.error) {
    console.error(
      `[setup] Failed to run ${python.command}: ${result.error.message}`,
    );
    return 1;
  }

  return result.status ?? 1;
}
