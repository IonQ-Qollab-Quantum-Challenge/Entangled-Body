import { localBin, run, webDir } from "./runtime.mjs";

run(localBin("next"), ["build"], { cwd: webDir });
