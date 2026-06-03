#!/usr/bin/env node

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const sessionName = process.env.ZELLIJ_SESSION_NAME;
const zellijCommand = process.platform === "win32" ? "zellij.exe" : "zellij";

if (!process.env.ZELLIJ || !sessionName) {
  console.error(
    "zellij:pane must be run from inside a Zellij pane with ZELLIJ_SESSION_NAME set."
  );
  console.error("Use `npm run zellij:session` outside Zellij.");
  process.exit(1);
}

const args = [
  "run",
  "--name",
  "saidecar",
  "--direction",
  "right",
  "--width",
  "35%",
  "--",
  process.execPath,
  path.join(projectRoot, "bin", "saidecar.js"),
];

if (process.env.SAIDECAR_ZELLIJ_DEBUG) {
  console.error(`session: ${sessionName}`);
  console.error(`cwd: ${projectRoot}`);
  console.error(`command: ${zellijCommand} ${args.join(" ")}`);
}

const child = spawn(zellijCommand, args, {
  cwd: projectRoot,
  stdio: "inherit",
  shell: false,
});

child.on("exit", (code) => {
  process.exit(code ?? 1);
});
