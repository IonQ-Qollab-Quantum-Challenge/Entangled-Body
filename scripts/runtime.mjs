import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
export const apiDir = path.join(rootDir, "apps", "api");
export const webDir = path.join(rootDir, "apps", "web");
export const venvDir = path.join(rootDir, ".venv");
export const isWindows = process.platform === "win32";

export function commandName(command) {
  return isWindows ? `${command}.cmd` : command;
}

export function venvPython() {
  return path.join(venvDir, isWindows ? "Scripts/python.exe" : "bin/python");
}

export function localBin(command) {
  return path.join(
    rootDir,
    "node_modules",
    ".bin",
    isWindows ? `${command}.cmd` : command,
  );
}

export function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    stdio: "inherit",
    shell: shouldUseShell(command),
    ...options,
  });

  if (result.error) {
    console.error(`[run] Failed to run ${command}: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

export function spawnForeground(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: rootDir,
    stdio: "inherit",
    shell: shouldUseShell(command),
    ...options,
  });

  child.on("error", (error) => {
    console.error(`[run] Failed to run ${command}: ${error.message}`);
    process.exit(1);
  });

  return child;
}

export function freePorts(ports, label) {
  for (const port of ports) {
    const pids = portPids(port);
    for (const pid of pids) {
      if (pid === process.pid) {
        continue;
      }
      console.log(`[${label}] Closing process ${pid} on port ${port}.`);
      killPid(pid);
    }
  }
}

function portPids(port) {
  if (isWindows) {
    const result = spawnSync("netstat", ["-ano", "-p", "tcp"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    if (result.status !== 0 || !result.stdout) {
      return [];
    }
    return uniquePids(
      result.stdout
        .split(/\r?\n/)
        .map((line) => line.trim().split(/\s+/))
        .filter((parts) => parts.length >= 5 && parts[1]?.endsWith(`:${port}`) && parts[3] === "LISTENING")
        .map((parts) => Number.parseInt(parts[4], 10)),
    );
  }

  const result = spawnSync("lsof", ["-ti", `tcp:${port}`, "-sTCP:LISTEN"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (result.status !== 0 || !result.stdout) {
    return [];
  }
  return uniquePids(
    result.stdout
      .split(/\s+/)
      .map((value) => Number.parseInt(value, 10)),
  );
}

function uniquePids(pids) {
  return [...new Set(pids.filter((pid) => Number.isInteger(pid) && pid > 0))];
}

function killPid(pid) {
  if (isWindows) {
    spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
    return;
  }
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    return;
  }
}

function shouldUseShell(command) {
  return isWindows && /\.(cmd|bat)$/i.test(command);
}

export function detectPython() {
  const candidates = isWindows
    ? [
        ["py", ["-3.12"]],
        ["py", ["-3.11"]],
        ["py", ["-3"]],
        ["python", []],
        ["python3", []],
      ]
    : [
        ["python3.12", []],
        ["python3.11", []],
        ["python3", []],
        ["python", []],
      ];

  for (const [command, baseArgs] of candidates) {
    const result = spawnSync(
      command,
      [
        ...baseArgs,
        "-c",
        "import sys; raise SystemExit(0 if sys.version_info >= (3, 11) else 1)",
      ],
      { stdio: "ignore" },
    );

    if (result.status === 0) {
      return { command, args: baseArgs };
    }
  }

  return null;
}

export function ensureVenvExists(label) {
  if (!existsSync(venvPython())) {
    console.error(`[${label}] Missing virtualenv. Run 'npm run setup' first.`);
    process.exit(1);
  }
}

export function printVenvFailureHelp() {
  if (isWindows) {
    console.error(
      [
        "[setup] Python virtualenv creation failed.",
        "[setup] Install Python 3.11+ from https://www.python.org/downloads/windows/ or the Microsoft Store, then run 'npm run setup' again.",
      ].join("\n"),
    );
    return;
  }

  console.error(
    [
      "[setup] Python virtualenv creation failed.",
      "[setup] On Debian/Ubuntu/WSL, install the matching venv package, then run 'npm run setup' again:",
      "[setup]   sudo apt update && sudo apt install python3-venv",
      "[setup] If you are using Python 3.12 specifically, the package may be python3.12-venv.",
    ].join("\n"),
  );
}
