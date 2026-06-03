#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(`Usage:
  saidecar-zellij
  saidecar-zellij <session-name> <layout-file>

Examples:
  saidecar-zellij
  saidecar-zellij dev dev-with-saidecar.kdl`);
  process.exit(0);
}

const sessionName = process.argv[2] || "saidecar";
const layoutName = process.argv[3] || `${sessionName}.kdl`;
const layoutPath = path.join(projectRoot, "layouts", layoutName);
const zellijCommand = process.platform === "win32" ? "zellij.exe" : "zellij";
const currentSessionName = process.env.ZELLIJ_SESSION_NAME;

function runZellij(args) {
  const child = spawn(zellijCommand, args, {
    cwd: projectRoot,
    stdio: "inherit",
    shell: false,
  });

  child.on("exit", (code) => {
    process.exit(code ?? 1);
  });
}

const sessions = spawnSync(zellijCommand, ["list-sessions"], {
  cwd: projectRoot,
  encoding: "utf8",
  shell: false,
});

const sessionLine =
  sessions.status === 0
    ? sessions.stdout
        .split(/\r?\n/)
        .map((line) => line.replace(/\x1b\[[0-9;]*m/g, "").trim())
        .find((line) => line === sessionName || line.startsWith(`${sessionName} `))
    : undefined;
const sessionExists = Boolean(sessionLine);
const sessionExited = sessionLine?.includes("(EXITED");

function startNewSession() {
  runZellij(["--session", sessionName, "--new-session-with-layout", layoutPath]);
}

if (sessionExited) {
  spawnSync(zellijCommand, ["delete-session", sessionName], {
    cwd: projectRoot,
    stdio: "ignore",
    shell: false,
  });
}

if (sessionExists && !sessionExited && currentSessionName === sessionName) {
  console.log(`Already inside Zellij session "${sessionName}".`);
} else if (sessionExists && !sessionExited && process.env.ZELLIJ) {
  runZellij(["action", "switch-session", sessionName]);
} else if (sessionExists && !sessionExited) {
  runZellij(["attach", sessionName]);
} else if (process.env.ZELLIJ) {
  runZellij([
    "action",
    "switch-session",
    "--layout",
    layoutName,
    "--layout-dir",
    path.join(projectRoot, "layouts"),
    sessionName,
  ]);
} else {
  startNewSession();
}
