import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import crypto from "node:crypto";
import chalk from "chalk";
import { askModel } from "./modelClient.js";
import { config, validateConfig } from "./config.js";
import { wrapText } from "./textUtils.js";
import { appendLog, getLogFilePath, triggerAutoFilterAndWait } from "./logger.js";
import { modes, parseInput } from "./modes.js";
import { providerModels, providerBaseUrl } from "./providers/index.js";
import { renderMarkdownForTerminal } from "./terminalMarkdown.js";
import { annotateEntry } from "./annotations.js";
import { formatDoctorChecks, runDoctorChecks } from "./doctor.js";
import {
  DEFAULT_CONTEXT_CHARS,
  DEFAULT_CONTEXT_EXCHANGES,
  selectSessionContext,
} from "./sessionContext.js";

const ui = {
  accent: chalk.hex("#C084FC"),
  user: chalk.hex("#7DD3A8"),
  web: chalk.hex("#60A5FA"),
  deepweb: chalk.hex("#67E8F9"),
  muted: chalk.hex("#8A8F98"),
  dim: chalk.hex("#626872"),
  text: chalk.hex("#E5E7EB"),
  userBlock: chalk.bgHex("#12352D").hex("#D9FBE8"),
  retroRed: chalk.hex("#B65A36"),
  retroGold: chalk.hex("#C8793B"),
  retroGreen: chalk.hex("#D39A45"),
  retroBlue: chalk.hex("#D8B15A"),
};

const session = {
  id: crypto.randomUUID().replace(/-/g, ""),
  startedAt: new Date(),
  exchanges: 0,
  errors: 0,
  webCalls: 0,
  transcriptChars: 0,
  lastMode: null,
  lastDurationMs: null,
  lastModel: null,
  lastUsage: null,
  lastTiming: null,
  totalUsage: {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
  },
  contextEnabled: true,
  history: [],
  currentModel: config.activeModel,
  currentProvider: config.provider,
};

function estimateTokens(text) {
  return Math.ceil((text || "").length / 4);
}

function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  }

  return `${remainingSeconds}s`;
}

function usageValue(usage, key) {
  return usage?.[key] || usage?.[key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)] || 0;
}

function modeColor(modeName) {
  if (modeName === "think") {
    return ui.accent;
  }

  if (modeName === "web") {
    return ui.web;
  }

  if (modeName === "deepweb") {
    return ui.deepweb;
  }

  return ui.user;
}

function sectionTitle(label) {
  return ui.accent.bold(label);
}

function keyValue(label, value, valueColor = chalk.white) {
  console.log(`${ui.dim(label.padEnd(14))}${valueColor(value)}`);
}

function printBlockDivider() {
  console.log(ui.dim("-".repeat(Math.min(process.stdout.columns || 72, 88))));
}

function printSoftDivider() {
  console.log(ui.dim(".".repeat(Math.min(process.stdout.columns || 72, 88))));
}

function printUserBlock(text) {
  const width = Math.min(process.stdout.columns || 72, 88);
  const innerWidth = Math.max(24, width - 4);
  const lines = wrapText(text, innerWidth);

  for (const line of lines) {
    const padded = `  ${line.padEnd(innerWidth)}  `;
    console.log(ui.userBlock(padded));
  }
}

function startThinkingAnimation(modeName) {
  const frames = [
    "[o_o] thinking",
    "[O_o] thinking.",
    "[o_O] thinking..",
    "[o_o] thinking...",
  ];
  let index = 0;

  if (!process.stdout.isTTY) {
    console.log(ui.dim("Thinking...\n"));
    return () => {};
  }

  const color = modeColor(modeName);
  const render = () => {
    const frame = frames[index % frames.length];
    process.stdout.write(`\r${color(frame)}${ui.dim("  Ctrl+C to stop")}`);
    index += 1;
  };

  render();
  const timer = setInterval(render, 220);

  return () => {
    clearInterval(timer);
    process.stdout.write(`\r${" ".repeat(Math.min(process.stdout.columns || 72, 88))}\r`);
  };
}

function printRequestHeader(parsed) {
  const mode = modes[parsed.mode];
  const color = modeColor(parsed.mode);
  console.log("");
  printBlockDivider();
  console.log(`${ui.user.bold("You")} ${color(`[${parsed.mode}]`)}`);
  console.log(
    ui.dim(
      `model=${mode.model}  reasoning=${mode.reasoning.effort}  web=${mode.tools.length ? "yes" : "no"}`
    )
  );
  printUserBlock(parsed.question);
  printSoftDivider();
}

function printAnswerHeader(result) {
  const color = modeColor(result.mode.label);
  console.log(`${ui.accent.bold("Scratch AI")} ${color(`[${result.mode.label}]`)}`);
  console.log(ui.dim(`backend=${result.backend || config.backend}`));
}

function formatStageMs(ms) {
  if (!Number.isFinite(ms) || ms < 0) {
    return "0ms";
  }
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatTimingBreakdown(timing) {
  if (!timing) {
    return "";
  }

  const parts = [];
  if (timing.loginMs > 0) {
    parts.push(`login=${formatStageMs(timing.loginMs)}`);
  }
  if (timing.cliStartupMs > 0) {
    parts.push(`cli=${formatStageMs(timing.cliStartupMs)}`);
  }
  if (timing.modelMs > 0) {
    parts.push(`model=${formatStageMs(timing.modelMs)}`);
  }

  return parts.length > 0 ? ` | ${parts.join(" ")}` : "";
}

function printFooter(durationMs, usage, filterDecision, timing) {
  const usageText = usage
    ? ` | tokens=${usageValue(usage, "totalTokens") || "?"}`
    : "";

  const filterIndicator = filterDecision
    ? ` | ${filterDecision === "keep" ? chalk.green("●") : filterDecision === "condense" ? chalk.yellow("◐") : chalk.gray("○")}`
    : "";

  const timingText = formatTimingBreakdown(timing);

  printSoftDivider();
  console.log(ui.dim(`[done ${formatDuration(durationMs)}${usageText}${timingText}${filterIndicator}]\n`));
}

function printHelp() {
  console.log(`
${sectionTitle("Scratch AI commands")}

${chalk.bold("Ask normally")}
  why does Laravel queue:work ignore .env changes?
  /q same as normal, but explicit

${chalk.bold("Reasoning")}
  /think compare two architecture options
  /t compare two architecture options

${chalk.bold("Web")}
  /web latest OpenAI Responses API web search syntax
  /w latest OpenAI Responses API web search syntax

${chalk.bold("Reasoning + web")}
  /deepweb current CLI AI tools for developers
  /dw current CLI AI tools for developers

${chalk.bold("Session commands")}
  /help
  /status
  /config
  /modes
  /model [name|status]
  /provider [name|status]
  /history
  /context [on|off|status]
  /save <history-index> [tag...]
  /tag <history-index> <tag...>
  /log
  /clear
  /reset
  /exit
  /quit
  :q

${chalk.bold("Logs")}
  ${getLogFilePath()}
`);
}

function printSplash() {
  const logo = [
    [
      "███████╗",
      " █████╗ ██╗",
      "██████╗ ███████╗ ██████╗ █████╗ ██████╗",
    ],
    [
      "██╔════╝",
      "██╔══██╗██║",
      "██╔══██╗██╔════╝██╔════╝██╔══██╗██╔══██╗",
    ],
    [
      "███████╗",
      "███████║██║",
      "██║  ██║█████╗  ██║     ███████║██████╔╝",
    ],
    [
      "╚════██║",
      "██╔══██║██║",
      "██║  ██║██╔══╝  ██║     ██╔══██║██╔══██╗",
    ],
    [
      "███████║",
      "██║  ██║██║",
      "██████╔╝███████╗╚██████╗██║  ██║██║  ██║",
    ],
    [
      "╚══════╝",
      "╚═╝  ╚═╝╚═╝",
      "╚═════╝ ╚══════╝ ╚═════╝╚═╝  ╚═╝╚═╝  ╚═╝",
    ],
  ];
  const splashColors = [ui.retroRed, ui.retroGold, ui.retroGreen, ui.retroBlue];
  const aiColors = [
    chalk.hex("#F3F4F6"),
    chalk.hex("#D1D5DB"),
    chalk.hex("#9CA3AF"),
    chalk.hex("#6B7280"),
  ];

  console.log("");
  for (const [index, [s, ai, decar]] of logo.entries()) {
    const color = splashColors[index % splashColors.length];
    const aiColor = aiColors[index % aiColors.length];
    console.log(`${color.bold(s)}${aiColor.bold(ai)}${color.bold(decar)}`);
  }

  console.log(ui.dim("extra thinking room without taking the handlebars"));
  console.log("");
}

function printIntro() {
  printSplash();
  keyValue("session", session.id, chalk.yellow);
  keyValue("backend", config.backend, chalk.yellow);
  keyValue("provider", config.provider, chalk.yellow);
  keyValue("model", session.currentModel, chalk.green);
  keyValue("context", session.contextEnabled ? "session follow-ups on" : "stateless per request", chalk.yellow);
  keyValue("project", config.project, chalk.yellow);
  keyValue("logs", getLogFilePath(), ui.dim);
  console.log(`Type ${chalk.bold("/help")} for commands. Type ${chalk.bold("/exit")} to quit.\n`);
}

function printStatus() {
  const uptimeMs = Date.now() - session.startedAt.getTime();
  const contextEntries = currentSessionContext();
  const estimatedContextTokens = estimateTokens(
    contextEntries.map((item) => `${item.question}\n${item.answer}`).join("\n")
  );

  console.log("");
  console.log(sectionTitle("Scratch AI status"));
  keyValue("session", session.id, chalk.yellow);
  keyValue("uptime", formatDuration(uptimeMs), chalk.white);
  keyValue("backend", config.backend, chalk.yellow);
  keyValue("provider", session.currentProvider, chalk.yellow);
  keyValue("model", session.currentModel, chalk.green);
  keyValue("context", session.contextEnabled ? "on" : "off", chalk.yellow);
  keyValue(
    "follow-up",
    session.contextEnabled
      ? `${contextEntries.length} recent exchange(s), ~${estimatedContextTokens} tokens`
      : "disabled; questions are stateless",
    chalk.white
  );
  keyValue("exchanges", String(session.exchanges), chalk.white);
  keyValue("errors", String(session.errors), session.errors ? chalk.red : chalk.white);
  keyValue("web calls", String(session.webCalls), chalk.white);
  keyValue("last mode", session.lastMode || "-", session.lastMode ? modeColor(session.lastMode) : chalk.white);
  keyValue("last model", session.lastModel || "-", chalk.white);
  keyValue("last latency", session.lastDurationMs ? formatDuration(session.lastDurationMs) : "-", chalk.white);
  if (session.lastTiming) {
    keyValue(
      "last breakdown",
      formatTimingBreakdown(session.lastTiming).replace(/^\s\|\s/, ""),
      ui.dim
    );
  }
  keyValue(
    "api usage",
    session.totalUsage.totalTokens
      ? `${session.totalUsage.totalTokens} total tokens (${session.totalUsage.inputTokens} input, ${session.totalUsage.outputTokens} output)`
      : "unavailable for this backend",
    chalk.white
  );
  keyValue("log file", getLogFilePath(), ui.dim);
  console.log("");
}

function printConfig() {
  console.log("");
  console.log(sectionTitle("Scratch AI config"));
  keyValue("backend", config.backend, chalk.yellow);
  keyValue("provider", config.provider, chalk.yellow);
  keyValue("model", session.currentModel, chalk.green);
  keyValue("codex command", config.codexCommand, chalk.white);
  keyValue("codex timeout", `${config.codexTimeoutMs}ms`, chalk.white);
  keyValue("project", config.project, chalk.white);
  keyValue("timezone", config.timezone, chalk.white);
  keyValue("context", `${DEFAULT_CONTEXT_EXCHANGES} exchanges, ~${estimateTokens("x".repeat(DEFAULT_CONTEXT_CHARS))} token budget`, chalk.white);
  keyValue("log file", getLogFilePath(), ui.dim);
  console.log("");

  const availableModels = providerModels(config.provider);
  if (availableModels.length > 0) {
    console.log(sectionTitle("Available models"));
    for (const m of availableModels) {
      const marker = m === session.currentModel ? " →" : "  ";
      console.log(`${chalk.white(marker)} ${m}`);
    }
    console.log("");
  }
  console.log(ui.dim("Use /model <name> to switch at runtime"));
}

function currentSessionContext() {
  if (!session.contextEnabled) {
    return [];
  }

  return selectSessionContext(session.history, {
    maxExchanges: DEFAULT_CONTEXT_EXCHANGES,
    maxChars: DEFAULT_CONTEXT_CHARS,
  });
}

function printContextStatus() {
  const entries = currentSessionContext();
  const estimatedTokens = estimateTokens(
    entries.map((item) => `${item.question}\n${item.answer}`).join("\n")
  );

  console.log("");
  console.log(sectionTitle("Scratch AI context"));
  keyValue("status", session.contextEnabled ? "on" : "off", session.contextEnabled ? chalk.yellow : chalk.white);
  keyValue(
    "policy",
    `current terminal session only; max ${DEFAULT_CONTEXT_EXCHANGES} exchanges`,
    chalk.white
  );
  keyValue("queued", `${entries.length} exchange(s), ~${estimatedTokens} tokens`, chalk.white);
  keyValue("clear", "/clear keeps context; /reset clears it", ui.dim);
  console.log("");
}

function setContext(action) {
  if (action === "on") {
    session.contextEnabled = true;
    console.log(ui.dim("Session context enabled. Recent exchanges will be sent with new questions."));
    return;
  }

  if (action === "off") {
    session.contextEnabled = false;
    console.log(ui.dim("Session context disabled. New questions are stateless."));
    return;
  }

  printContextStatus();
}

function printModes() {
  console.log("");
  console.log(sectionTitle("Modes"));
  for (const [name, mode] of Object.entries(modes)) {
    const color = modeColor(name);
    const webStatus =
      mode.tools.length && config.backend === "codex"
        ? "codex web bridge"
        : mode.tools.length
          ? "yes"
          : "no";

    console.log(
      `${color(name.padEnd(8))}${ui.dim("model=")}${mode.model} ${ui.dim("reasoning=")}${mode.reasoning.effort} ${ui.dim("web=")}${webStatus}`
    );
  }
  console.log("");
}

function printHistory() {
  if (session.history.length === 0) {
    console.log(chalk.gray("No questions in this terminal session yet."));
    return;
  }

  console.log(sectionTitle("Recent questions"));
  for (const item of session.history.slice(-10)) {
    const ref = item.logRef ? ui.dim(` line=${item.logRef.lineNumber}`) : "";
    console.log(`${ui.dim(String(item.index).padStart(2))}. ${modeColor(item.mode)(`[${item.mode}]`)}${ref} ${item.question}`);
  }
}

function findHistoryEntry(index) {
  if (!Number.isFinite(index)) {
    throw new Error("Use a numeric history index, for example `/save 3 laravel`.");
  }

  const entry = session.history.find((item) => item.index === index);
  if (!entry) {
    throw new Error(`No history entry ${index}. Use /history to see recent entries.`);
  }

  if (!entry.logRef) {
    throw new Error(`History entry ${index} has not been logged yet.`);
  }

  return entry;
}

function saveHistoryEntry(index, tags = []) {
  const entry = findHistoryEntry(index);
  annotateEntry(
    {
      logFile: entry.logRef.logFile,
      lineNumber: entry.logRef.lineNumber,
      project: config.project,
    },
    { favorite: true, tags }
  );
  console.log(ui.dim(`Saved #${entry.index}${tags.length ? ` with tags: ${tags.join(", ")}` : ""}.`));
}

function tagHistoryEntry(index, tags = []) {
  if (!tags.length) {
    throw new Error("Add at least one tag, for example `/tag 3 laravel queue`.");
  }

  const entry = findHistoryEntry(index);
  annotateEntry(
    {
      logFile: entry.logRef.logFile,
      lineNumber: entry.logRef.lineNumber,
      project: config.project,
    },
    { tags }
  );
  console.log(ui.dim(`Tagged #${entry.index}: ${tags.join(", ")}.`));
}

function resetSessionStats() {
  session.exchanges = 0;
  session.errors = 0;
  session.webCalls = 0;
  session.transcriptChars = 0;
  session.lastMode = null;
  session.lastDurationMs = null;
  session.lastModel = null;
  session.lastUsage = null;
  session.lastTiming = null;
  session.totalUsage.inputTokens = 0;
  session.totalUsage.outputTokens = 0;
  session.totalUsage.totalTokens = 0;
  session.history = [];
  console.log(ui.dim("Session counters and live context reset. Logs were not changed."));
}

async function handleQuestion(parsed) {
  if (!parsed.question) {
    console.log(chalk.red("Missing question."));
    return;
  }

  const startedAt = Date.now();
  const sessionContext = currentSessionContext();
  printRequestHeader(parsed);

  const stopThinking = startThinkingAnimation(parsed.mode);
  let result;

  try {
    result = await askModel({
      question: parsed.question,
      modeName: parsed.mode,
      sessionContext,
    });
  } finally {
    stopThinking();
  }

  const durationMs = Date.now() - startedAt;
  const answer = result.answer.trim();
  const usage = result.usage || null;

  printAnswerHeader(result);
  console.log("");
  console.log(answer ? renderMarkdownForTerminal(answer) : chalk.yellow("(empty answer)"));

  // Show thinking if enabled and available
  if (result.thinking && config.showThinking) {
    console.log("");
    console.log(chalk.dim("--- thinking ---"));
    console.log(chalk.dim(renderMarkdownForTerminal(result.thinking)));
    console.log(chalk.dim("---"));
  }

  session.exchanges += 1;
  session.webCalls += parsed.mode === "web" || parsed.mode === "deepweb" ? 1 : 0;
  session.transcriptChars += parsed.question.length + answer.length;
  session.lastMode = parsed.mode;
  session.lastDurationMs = durationMs;
  session.lastModel = result.mode.model;
  session.lastUsage = usage;
  session.lastTiming = result.timing || null;

  if (usage) {
    const inputTokens = usageValue(usage, "inputTokens");
    const outputTokens = usageValue(usage, "outputTokens");
    const totalTokens = usageValue(usage, "totalTokens");

    session.totalUsage.inputTokens += inputTokens;
    session.totalUsage.outputTokens += outputTokens;
    session.totalUsage.totalTokens += totalTokens || inputTokens + outputTokens;
  }

  session.history.push({
    index: session.history.length + 1,
    mode: parsed.mode,
    model: result.mode.model,
    question: parsed.question,
    answer,
    durationMs,
  });

  let filterDecision = null;
  try {
    const logRef = appendLog({
      backend: result.backend || config.backend,
      mode: parsed.mode,
      model: result.mode.model,
      question: parsed.question,
      answer,
      durationMs,
      usage,
      context: {
        enabled: session.contextEnabled,
        exchanges: sessionContext.length,
      },
    }, { skipAutoFilter: true });
    session.history[session.history.length - 1].logRef = logRef;
    filterDecision = await triggerAutoFilterAndWait({
      question: parsed.question,
      answer,
      mode: parsed.mode,
      model: result.mode.model,
    });
  } catch (error) {
    console.error(chalk.yellow(`Log warning: ${error.message}`));
  }

  printFooter(durationMs, usage, filterDecision, result.timing);
}

export async function runCli() {
  if (process.argv.includes("doctor") || process.argv.includes("--doctor")) {
    const checks = await runDoctorChecks();
    console.log(formatDoctorChecks(checks));
    process.exit(checks.some((item) => !item.ok) ? 1 : 0);
  }

  validateConfig();

  const rl = readline.createInterface({ input, output });
  printIntro();

  while (true) {
    try {
      const raw = await rl.question(ui.user("> "));
      const parsed = parseInput(raw);

      if (parsed.type === "empty") {
        continue;
      }

      if (parsed.type === "command") {
        if (parsed.command === "exit") {
          console.log(chalk.gray("bye"));
          break;
        }

        if (parsed.command === "help") {
          printHelp();
          continue;
        }

        if (parsed.command === "status") {
          printStatus();
          continue;
        }

        if (parsed.command === "config") {
          printConfig();
          continue;
        }

        if (parsed.command === "model") {
          if (parsed.action === "status") {
            const availableModels = providerModels(session.currentProvider);
            console.log("");
            console.log(sectionTitle("Current model"));
            keyValue("provider", session.currentProvider, chalk.yellow);
            keyValue("model", session.currentModel, chalk.green);
            console.log("");
            if (availableModels.length > 0) {
              console.log(sectionTitle("Available models"));
              for (const m of availableModels) {
                const marker = m === session.currentModel ? " →" : "  ";
                console.log(`${chalk.white(marker)} ${m}`);
              }
              console.log("");
              console.log(ui.dim(`Use /model <name> to switch (e.g. /model ${availableModels[0]})`));
            }
          } else if (parsed.model) {
            const availableModels = providerModels(session.currentProvider);
            if (availableModels.length > 0 && !availableModels.includes(parsed.model)) {
              console.log(chalk.red(`Model '${parsed.model}' not available for provider '${session.currentProvider}'.`));
              console.log(`Available: ${availableModels.join(", ")}`);
            } else {
              session.currentModel = parsed.model;
              modes.normal.model = parsed.model;
              modes.web.model = parsed.model;
              console.log(chalk.green(`Model set to: ${parsed.model}`));
            }
          }
          continue;
        }

        if (parsed.command === "provider") {
          if (parsed.action === "status") {
            console.log("");
            console.log(sectionTitle("Current provider"));
            keyValue("provider", session.currentProvider, chalk.yellow);
            console.log("");
          } else if (parsed.provider) {
            session.currentProvider = parsed.provider;
            console.log(chalk.green(`Provider set to: ${parsed.provider}`));
            console.log(ui.dim("Restart app to use new provider"));
          }
          continue;
        }

        if (parsed.command === "log") {
          console.log(getLogFilePath());
          continue;
        }

        if (parsed.command === "modes") {
          printModes();
          continue;
        }

        if (parsed.command === "history") {
          printHistory();
          continue;
        }

        if (parsed.command === "context") {
          setContext(parsed.action);
          continue;
        }

        if (parsed.command === "save") {
          saveHistoryEntry(parsed.index, parsed.tags);
          continue;
        }

        if (parsed.command === "tag") {
          tagHistoryEntry(parsed.index, parsed.tags);
          continue;
        }

        if (parsed.command === "clear") {
          console.clear();
          printIntro();
          continue;
        }

        if (parsed.command === "reset") {
          resetSessionStats();
          continue;
        }

        if (parsed.command === "unknown") {
          console.log(chalk.red(`Unknown command: ${parsed.input}`));
          console.log(`Type ${chalk.bold("/help")} for commands.`);
          continue;
        }
      }

      if (parsed.type === "question") {
        await handleQuestion(parsed);
      }
    } catch (error) {
      if (error.code === "ERR_USE_AFTER_CLOSE" || /readline was closed/i.test(error.message)) {
        break;
      }

      console.error(chalk.red("\nError:"), error.message);
      session.errors += 1;

      try {
        appendLog({
          mode: "error",
          model: null,
          question: null,
          answer: null,
          error: {
            message: error.message,
            stack: error.stack,
          },
        });
      } catch (logError) {
        console.error(chalk.red("Log error:"), logError.message);
      }
    }
  }

  rl.close();
}
