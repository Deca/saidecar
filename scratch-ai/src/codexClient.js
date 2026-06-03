import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { config } from "./config.js";
import { modes } from "./modes.js";
import { systemPrompt } from "./prompt.js";
import { formatSessionContext } from "./sessionContext.js";

// How long a successful `codex login status` check is trusted before we re-verify.
// The login check itself costs ~1-2s per call, so re-checking on every question is wasteful.
const LOGIN_CHECK_TTL_MS = 10 * 60 * 1000;
const LOGIN_CHECK_TIMEOUT_MS = 10_000;

let lastSuccessfulLoginCheck = 0;
let loginCheckInflight = null;

// Allow tests to inject a fake `spawn`. Default uses node:child_process.
let spawnImpl = spawn;

export function _setSpawnForTests(fn) {
  spawnImpl = fn ?? spawn;
}

function codexInvocation(args) {
  if (process.platform !== "win32" || config.codexCommand !== "codex") {
    return {
      command: config.codexCommand,
      args,
    };
  }

  const scriptPath = path.join(
    process.env.APPDATA || "",
    "npm",
    "node_modules",
    "@openai",
    "codex",
    "bin",
    "codex.js"
  );

  if (fs.existsSync(scriptPath)) {
    return {
      command: process.execPath,
      args: [scriptPath, ...args],
    };
  }

  return {
    command: "codex.cmd",
    args,
    shell: true,
  };
}

function reasoningEffort(modeName) {
  if (modeName === "think" || modeName === "deepweb") {
    return "medium";
  }

  if (modeName === "web") {
    return "low";
  }

  return "none";
}

function buildPrompt({ question, modeName, sessionContext = [] }) {
  const webNote =
    modeName === "web" || modeName === "deepweb"
      ? "The wrapper requested web mode, but this Codex exec backend does not expose native web search. Do not claim to have browsed. If current information is required, say that this backend cannot browse."
      : "Do not use web search.";

  const context = formatSessionContext(sessionContext);

  return `${systemPrompt}

Codex backend constraints:
- You are running as a scratch Q&A sidecar, not as a coding agent.
- Do not inspect the current repository.
- Do not read local files.
- Do not run shell commands.
- Answer the user directly.
- ${webNote}

Mode: ${modeName}
${context ? `
Recent Scratch AI session context:
${context}

Use this recent context only when it helps answer the current question. If the current question is unrelated, ignore it.
` : ""}

Question:
${question}`;
}

function codexErrorMessage(stderr, stdout, exitCode) {
  const combined = `${stderr}\n${stdout}`.trim();

  if (
    /not logged in|401 Unauthorized|Missing bearer|authentication/i.test(combined)
  ) {
    return "Codex backend is not authenticated. Run `codex login` and choose Sign in with ChatGPT, then try again.";
  }

  return `Codex backend failed with exit code ${exitCode}.${
    combined ? `\n${combined}` : ""
  }`;
}

function runLoginCheck() {
  const invocation = codexInvocation(["login", "status"]);

  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    const child = spawnImpl(invocation.command, invocation.args, {
      cwd: os.tmpdir(),
      shell: invocation.shell || false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("Timed out while checking Codex login status."));
    }, LOGIN_CHECK_TIMEOUT_MS);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(
        new Error(
          `Unable to start Codex backend command "${config.codexCommand}": ${error.message}`
        )
      );
    });

    child.on("close", (exitCode) => {
      clearTimeout(timeout);

      if (exitCode === 0) {
        resolve();
        return;
      }

      reject(new Error(codexErrorMessage(stderr, stdout, exitCode)));
    });
  });
}

export function isLoginCheckFresh(now = Date.now()) {
  return now - lastSuccessfulLoginCheck < LOGIN_CHECK_TTL_MS;
}

export function resetLoginCheckCache() {
  lastSuccessfulLoginCheck = 0;
  loginCheckInflight = null;
}

async function ensureCodexLoggedIn() {
  if (isLoginCheckFresh()) {
    return;
  }

  if (loginCheckInflight) {
    await loginCheckInflight;
    if (isLoginCheckFresh()) {
      return;
    }
  }

  const promise = runLoginCheck()
    .then(() => {
      lastSuccessfulLoginCheck = Date.now();
    })
    .finally(() => {
      loginCheckInflight = null;
    });

  loginCheckInflight = promise;
  await promise;
}

export async function askCodex({ question, modeName, sessionContext = [] }) {
  const startedAt = Date.now();

  await ensureCodexLoggedIn();
  const loginMs = Date.now() - startedAt;

  const mode = modes[modeName] || modes.normal;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "scratch-ai-codex-"));
  const outputFile = path.join(tempDir, "answer.txt");
  const args = [
    "exec",
    "--skip-git-repo-check",
    "--ephemeral",
    "--ignore-rules",
    "--color",
    "never",
    "-s",
    "read-only",
    "-C",
    os.tmpdir(),
    "-c",
    "approval_policy='never'",
    "-c",
    `model_reasoning_effort='${reasoningEffort(modeName)}'`,
    "-m",
    mode.model,
    "-o",
    outputFile,
  ];

  args.push("-");

  const prompt = buildPrompt({ question, modeName, sessionContext });

  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    const spawnStartedAt = Date.now();
    let firstByteAt = null;
    const invocation = codexInvocation(args);
    const child = spawnImpl(invocation.command, invocation.args, {
      cwd: os.tmpdir(),
      shell: invocation.shell || false,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill();
        reject(
          new Error(
            `Codex backend timed out after ${config.codexTimeoutMs}ms.`
          )
        );
      }
    }, config.codexTimeoutMs);

    child.stdout.on("data", (chunk) => {
      if (firstByteAt === null) {
        firstByteAt = Date.now();
      }
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        reject(
          new Error(
            `Unable to start Codex backend command "${config.codexCommand}": ${error.message}`
          )
        );
      }
    });

    child.on("close", (exitCode) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);

      try {
        if (exitCode !== 0) {
          reject(new Error(codexErrorMessage(stderr, stdout, exitCode)));
          return;
        }

        const answer = fs.existsSync(outputFile)
          ? fs.readFileSync(outputFile, "utf8")
          : stdout;

        const closedAt = Date.now();
        const cliStartupMs = firstByteAt !== null ? firstByteAt - spawnStartedAt : closedAt - spawnStartedAt;
        const modelMs = firstByteAt !== null ? closedAt - firstByteAt : 0;

        resolve({
          answer: answer.trim(),
          raw: { stdout, stderr },
          usage: null,
          mode,
          backend: "codex",
          timing: {
            loginMs,
            cliStartupMs,
            modelMs,
            totalMs: closedAt - startedAt,
          },
        });
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    child.stdin.end(prompt);
  });
}
