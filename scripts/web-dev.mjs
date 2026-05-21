import { localBin, spawnForeground, webDir } from "./runtime.mjs";

const web = spawnForeground(localBin("next"), ["dev", "-p", "3000"], {
  cwd: webDir,
});

web.on("exit", (code) => {
  process.exit(code ?? 0);
});
