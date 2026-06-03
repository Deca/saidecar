import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { config, validateConfig, APP_DISPLAY_NAME } from "./config.js";

function check(name, ok, detail) {
  return { name, ok, detail };
}

function canWriteDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
  const probe = path.join(dirPath, `.saidecar-doctor-${Date.now()}.tmp`);
  fs.writeFileSync(probe, "ok", "utf8");
  fs.unlinkSync(probe);
}

export async function runDoctorChecks() {
  const checks = [];

  checks.push(
    check(
      "Node.js",
      Number.parseInt(process.versions.node.split(".")[0], 10) >= 22,
      `v${process.versions.node}`
    )
  );

  try {
    await import("node:sqlite");
    checks.push(check("node:sqlite", true, "available"));
  } catch (error) {
    checks.push(check("node:sqlite", false, error.message));
  }

  try {
    validateConfig();
    checks.push(check("backend config", true, `${config.backend}`));
  } catch (error) {
    checks.push(check("backend config", false, error.message));
  }

  try {
    canWriteDir(config.logDir);
    checks.push(check("log directory", true, config.logDir));
  } catch (error) {
    checks.push(check("log directory", false, `${config.logDir}: ${error.message}`));
  }

  try {
    canWriteDir(path.dirname(config.indexPath));
    checks.push(check("index directory", true, path.dirname(config.indexPath)));
  } catch (error) {
    checks.push(check("index directory", false, `${path.dirname(config.indexPath)}: ${error.message}`));
  }

  try {
    canWriteDir(config.annotationDir);
    checks.push(check("annotation directory", true, config.annotationDir));
  } catch (error) {
    checks.push(check("annotation directory", false, `${config.annotationDir}: ${error.message}`));
  }

  if (config.backend === "codex") {
    const authPath = path.join(os.homedir(), ".codex", "auth.json");
    checks.push(
      check(
        "Codex auth",
        fs.existsSync(authPath),
        fs.existsSync(authPath) ? authPath : "missing ~/.codex/auth.json; run `codex login`"
      )
    );
  }

  // Check SearXNG instance for web search
  const searxngUrl = (process.env.SEARXNG_URL || "http://localhost:8080").replace(/\/+$/, "");
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const response = await fetch(`${searxngUrl}/healthz`, {
      signal: controller.signal,
    }).catch(() => null);
    clearTimeout(timeout);
    checks.push(
      check(
        "SearXNG (web search)",
        !!(response && response.ok),
        response && response.ok
          ? searxngUrl
          : `${searxngUrl} unreachable; run SearXNG or set SEARXNG_URL`
      )
    );
  } catch (error) {
    checks.push(check("SearXNG (web search)", false, error.message));
  }

  return checks;
}

export function formatDoctorChecks(checks) {
  const lines = [`${APP_DISPLAY_NAME} doctor`, ""];

  for (const item of checks) {
    lines.push(`${item.ok ? "OK  " : "FAIL"} ${item.name} - ${item.detail}`);
  }

  const failed = checks.filter((item) => !item.ok).length;
  lines.push("");
  lines.push(failed ? `${failed} check${failed === 1 ? "" : "s"} failed.` : "All checks passed.");
  return `${lines.join("\n")}\n`;
}
