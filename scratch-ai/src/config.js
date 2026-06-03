import os from "node:os";
import path from "node:path";
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

function defaultIndexPath(logDir) {
  return path.join(path.dirname(logDir), "scratch-ai.sqlite");
}

function defaultBrainPath(logDir, childDir) {
  return path.join(path.dirname(logDir), childDir);
}

export const config = {
  apiKey: process.env.OPENAI_API_KEY,
  provider: (process.env.SCRATCH_AI_PROVIDER || "openai").toLowerCase(),
  providerApiKey: process.env.PROVIDER_API_KEY,
  providerBaseUrl: process.env.PROVIDER_BASE_URL,
  minimaxApiKey: process.env.MINIMAX_API_KEY,
  minimaxBaseUrl: process.env.MINIMAX_BASE_URL,
  minimaxAuthMode: process.env.MINIMAX_AUTH_MODE,
  backend: (process.env.SCRATCH_AI_BACKEND || "openai").toLowerCase(),
  activeModel: process.env.SCRATCH_AI_MODEL || "gpt-4o-mini",
  thinkModel:
    process.env.SCRATCH_AI_THINK_MODEL ||
    process.env.SCRATCH_AI_MODEL ||
    "gpt-4o-mini",
  codexCommand: process.env.SCRATCH_AI_CODEX_COMMAND || "codex",
  codexTimeoutMs: Number.parseInt(
    process.env.SCRATCH_AI_CODEX_TIMEOUT_MS || "120000",
    10
  ),
  codexSearchModel: process.env.SCRATCH_AI_CODEX_SEARCH_MODEL,
  codexSearchBaseUrl:
    process.env.SCRATCH_AI_CODEX_SEARCH_BASE_URL ||
    "https://chatgpt.com/backend-api",
  codexSearchContextSize:
    process.env.SCRATCH_AI_CODEX_SEARCH_CONTEXT_SIZE || "medium",
  logDir: expandHome(process.env.SCRATCH_AI_LOG_DIR || "~/dev-brain/inbox"),
  indexPath: expandHome(
    process.env.SCRATCH_AI_INDEX_PATH ||
      defaultIndexPath(expandHome(process.env.SCRATCH_AI_LOG_DIR || "~/dev-brain/inbox"))
  ),
  annotationDir: expandHome(
    process.env.SCRATCH_AI_ANNOTATION_DIR ||
      defaultBrainPath(expandHome(process.env.SCRATCH_AI_LOG_DIR || "~/dev-brain/inbox"), "annotations")
  ),
  sessionDir: expandHome(
    process.env.SCRATCH_AI_SESSION_DIR ||
      defaultBrainPath(expandHome(process.env.SCRATCH_AI_LOG_DIR || "~/dev-brain/inbox"), "sessions")
  ),
  project: process.env.SCRATCH_AI_PROJECT || "general",
  timezone: process.env.SCRATCH_AI_TIMEZONE || "Europe/Rome",
  autoFilterEnabled: process.env.SCRATCH_AI_AUTO_FILTER === "true",
  showThinking: process.env.SCRATCH_AI_SHOW_THINKING === "true",
  weeklySummaryEnabled: process.env.SCRATCH_AI_WEEKLY_SUMMARY === "true",
};

import { PROVIDER_OPENAI, PROVIDER_DEEPSEEK, PROVIDER_ANTHROPIC, PROVIDER_MINIMAX, KNOWN_PROVIDERS } from "./providers/index.js";

export function validateConfig() {
  if (!["openai", "codex"].includes(config.backend)) {
    throw new Error('SCRATCH_AI_BACKEND must be either "openai" or "codex".');
  }

  if (!KNOWN_PROVIDERS.includes(config.provider)) {
    throw new Error(
      `SCRATCH_AI_PROVIDER must be one of: ${KNOWN_PROVIDERS.join(", ")}.`
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
    throw new Error("SCRATCH_AI_CODEX_TIMEOUT_MS must be at least 1000.");
  }
}