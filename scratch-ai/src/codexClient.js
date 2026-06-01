import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { config } from "./config.js";
import { modes } from "./modes.js";
import { systemPrompt } from "./prompt.js";

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

function buildPrompt({ question, modeName }) {
  const webNote =
    modeName === "web" || modeName === "deepweb"
      ? "The wrapper requested web mode, but this Codex exec backend does not expose native web search. Do not claim to have browsed. If current information is required, say that this backend cannot browse."
      : "Do not use web search.";

  return `${systemPrompt}

Codex backend constraints:
- You are running as a scratch Q&A sidecar, not as a coding agent.
- Do not inspect the current repository.
- Do not read local files.
- Do not run shell commands.
- Answer the user directly.
- ${webNote}

Mode: ${modeName}

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

async function ensureCodexLoggedIn() {
  const invocation = codexInvocation(["login", "status"]);

  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    const child = spawn(invocation.command, invocation.args, {
      cwd: os.tmpdir(),
      shell: invocation.shell || false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("Timed out while checking Codex login status."));
    }, 10000);

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

export async function askCodex({ question, modeName }) {
  await ensureCodexLoggedIn();

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

  const prompt = buildPrompt({ question, modeName });

  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    const invocation = codexInvocation(args);
    const child = spawn(invocation.command, invocation.args, {
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

        resolve({
          answer: answer.trim(),
          raw: { stdout, stderr },
          usage: null,
          mode,
          backend: "codex",
        });
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    child.stdin.end(prompt);
  });
}
