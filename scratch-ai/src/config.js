import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import dotenv from "dotenv";

dotenv.config();

export function expandHome(inputPath) {
  if (!inputPath) {
    return inputPath;
  }

  if (inputPath === "~") {
    return os.homedir();
  }

  if (inputPath.startsWith("~/") || inputPath.startsWith("~\\")) {
    return path.join(os.homedir(), inputPath.slice(2));
  }

  return inputPath;
}

export const APP_BRAND = "saidecar";
export const APP_DISPLAY_NAME = "sAIdecar";
export const APP_HOME = path.join(os.homedir(), `.${APP_BRAND}`);
export const LEGACY_LOG_DIR = path.join(os.homedir(), "dev-brain", "inbox");
export const DEFAULT_LOG_DIR = path.join(APP_HOME, "logs");

function pathExists(candidate) {
  try {
    return fs.existsSync(candidate);
  } catch {
    return false;
  }
}

export function resolveDefaultLogDir(existsSync = pathExists) {
  if (existsSync(LEGACY_LOG_DIR)) {
    return LEGACY_LOG_DIR;
  }
  return DEFAULT_LOG_DIR;
}

function defaultIndexPath(logDir) {
  if (logDir === LEGACY_LOG_DIR) {
    return path.join(path.dirname(LEGACY_LOG_DIR), "scratch-ai.sqlite");
  }
  return path.join(path.dirname(logDir), `${APP_BRAND}.sqlite`);
}

function defaultSiblingPath(logDir, childDir) {
  return path.join(path.dirname(logDir), childDir);
}

function pickEnv(...names) {
  for (const name of names) {
    const value = process.env[name];
    if (value !== undefined && value !== "") {
      return value;
    }
  }
  return undefined;
}

const defaultLogDir = expandHome(resolveDefaultLogDir());

export const config = {
  apiKey: process.env.OPENAI_API_KEY,
  provider: (pickEnv("SAIDECAR_PROVIDER", "SCRATCH_AI_PROVIDER") || "openai").toLowerCase(),
  providerApiKey: process.env.PROVIDER_API_KEY,
  providerBaseUrl: process.env.PROVIDER_BASE_URL,
  minimaxApiKey: process.env.MINIMAX_API_KEY,
  minimaxBaseUrl: process.env.MINIMAX_BASE_URL,
  minimaxAuthMode: process.env.MINIMAX_AUTH_MODE,
  backend: (pickEnv("SAIDECAR_BACKEND", "SCRATCH_AI_BACKEND") || "openai").toLowerCase(),
  activeModel: pickEnv("SAIDECAR_MODEL", "SCRATCH_AI_MODEL") || "gpt-4o-mini",
  thinkModel:
    pickEnv("SAIDECAR_THINK_MODEL", "SCRATCH_AI_THINK_MODEL") ||
    pickEnv("SAIDECAR_MODEL", "SCRATCH_AI_MODEL") ||
    "gpt-4o-mini",
  codexCommand: pickEnv("SAIDECAR_CODEX_COMMAND", "SCRATCH_AI_CODEX_COMMAND") || "codex",
  codexTimeoutMs: Number.parseInt(
    pickEnv("SAIDECAR_CODEX_TIMEOUT_MS", "SCRATCH_AI_CODEX_TIMEOUT_MS") || "120000",
    10
  ),
  codexSearchModel: pickEnv("SAIDECAR_CODEX_SEARCH_MODEL", "SCRATCH_AI_CODEX_SEARCH_MODEL"),
  codexSearchBaseUrl:
    pickEnv("SAIDECAR_CODEX_SEARCH_BASE_URL", "SCRATCH_AI_CODEX_SEARCH_BASE_URL") ||
    "https://chatgpt.com/backend-api",
  codexSearchContextSize:
    pickEnv("SAIDECAR_CODEX_SEARCH_CONTEXT_SIZE", "SCRATCH_AI_CODEX_SEARCH_CONTEXT_SIZE") ||
    "medium",
  logDir: expandHome(pickEnv("SAIDECAR_LOG_DIR", "SCRATCH_AI_LOG_DIR") || defaultLogDir),
  indexPath: expandHome(
    pickEnv("SAIDECAR_INDEX_PATH", "SCRATCH_AI_INDEX_PATH") ||
      defaultIndexPath(defaultLogDir)
  ),
  annotationDir: expandHome(
    pickEnv("SAIDECAR_ANNOTATION_DIR", "SCRATCH_AI_ANNOTATION_DIR") ||
      defaultSiblingPath(defaultLogDir, "annotations")
  ),
  sessionDir: expandHome(
    pickEnv("SAIDECAR_SESSION_DIR", "SCRATCH_AI_SESSION_DIR") ||
      defaultSiblingPath(defaultLogDir, "sessions")
  ),
  project: pickEnv("SAIDECAR_PROJECT", "SCRATCH_AI_PROJECT") || "general",
  timezone: pickEnv("SAIDECAR_TIMEZONE", "SCRATCH_AI_TIMEZONE") || "Europe/Rome",
  autoFilterEnabled:
    pickEnv("SAIDECAR_AUTO_FILTER", "SCRATCH_AI_AUTO_FILTER") === "true",
  showThinking:
    pickEnv("SAIDECAR_SHOW_THINKING", "SCRATCH_AI_SHOW_THINKING") === "true",
  weeklySummaryEnabled:
    pickEnv("SAIDECAR_WEEKLY_SUMMARY", "SCRATCH_AI_WEEKLY_SUMMARY") === "true",
  weeklyAutoEnabled:
    pickEnv("SAIDECAR_WEEKLY_AUTO", "SCRATCH_AI_WEEKLY_AUTO") === "true",
};

import { PROVIDER_OPENAI, PROVIDER_DEEPSEEK, PROVIDER_ANTHROPIC, PROVIDER_MINIMAX, KNOWN_PROVIDERS } from "./providers/index.js";

export function validateConfig() {
  if (!["openai", "codex"].includes(config.backend)) {
    throw new Error('SCRATCH_AI_BACKEND or SAIDECAR_BACKEND must be either "openai" or "codex".');
  }

  if (!KNOWN_PROVIDERS.includes(config.provider)) {
    throw new Error(
      `SAIDECAR_PROVIDER (or SCRATCH_AI_PROVIDER) must be one of: ${KNOWN_PROVIDERS.join(", ")}.`
    );
  }

  if (config.backend === "openai" && config.provider === PROVIDER_OPENAI && !config.apiKey) {
    throw new Error(
      "Missing OPENAI_API_KEY. Add it to your environment or create .env from .env.example."
    );
  }

  if (config.provider === PROVIDER_DEEPSEEK && !config.providerApiKey) {
    throw new Error(
      "Missing DEEPSEEK_API_KEY (via PROVIDER_API_KEY). Add it to your environment or create .env from .env.example."
    );
  }

  if (config.provider === PROVIDER_ANTHROPIC && !config.providerApiKey) {
    throw new Error(
      "Missing ANTHROPIC_API_KEY (via PROVIDER_API_KEY). Add it to your environment or create .env from .env.example."
    );
  }

  if (config.provider === PROVIDER_MINIMAX) {
    // Skip validation - auth will be handled by MinimaxAuth class
    // which checks multiple sources: env var, mmx config, mmx CLI status
  }

  if (!Number.isFinite(config.codexTimeoutMs) || config.codexTimeoutMs < 1000) {
    throw new Error("SAIDECAR_CODEX_TIMEOUT_MS (or SCRATCH_AI_CODEX_TIMEOUT_MS) must be at least 1000.");
  }
}