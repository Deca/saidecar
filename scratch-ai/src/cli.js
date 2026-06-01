import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import chalk from "chalk";
import { askModel } from "./modelClient.js";
import { config, validateConfig } from "./config.js";
import { appendLog, getLogFilePath } from "./logger.js";
import { modes, parseInput } from "./modes.js";

const ui = {
  accent: chalk.hex("#C084FC"),
  user: chalk.hex("#7DD3A8"),
  web: chalk.hex("#60A5FA"),
  deepweb: chalk.hex("#67E8F9"),
  muted: chalk.hex("#8A8F98"),
  dim: chalk.hex("#626872"),
  text: chalk.hex("#E5E7EB"),
  userBlock: chalk.bgHex("#12352D").hex("#D9FBE8"),
};

const session = {
  id: new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14),
  startedAt: new Date(),
  exchanges: 0,
  errors: 0,
  webCalls: 0,
  transcriptChars: 0,
  lastMode: null,
  lastDurationMs: null,
  lastModel: null,
  lastUsage: null,
  totalUsage: {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
  },
  history: [],
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

function wrapText(text, width) {
  const lines = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const words = rawLine.split(/\s+/).filter(Boolean);
    let line = "";

    if (words.length === 0) {
      lines.push("");
      continue;
    }

    for (const word of words) {
      if (!line) {
        line = word;
      } else if ((line + " " + word).length <= width) {
        line += ` ${word}`;
      } else {
        lines.push(line);
        line = word;
      }
    }

    if (line) {
      lines.push(line);
    }
  }

  return lines;
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

function printFooter(durationMs, usage) {
  const usageText = usage
    ? ` | tokens=${usageValue(usage, "totalTokens") || "?"}`
    : "";

  printSoftDivider();
  console.log(ui.dim(`[done ${formatDuration(durationMs)}${usageText}]\n`));
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
  /history
  /log
  /clear
  /reset
  /exit

${chalk.bold("Logs")}
  ${getLogFilePath()}
`);
}

function printIntro() {
  console.log(ui.accent.bold("scratch-ai"));
  keyValue("session", session.id, chalk.yellow);
  keyValue("backend", config.backend, chalk.yellow);
  keyValue("model", config.defaultModel, chalk.yellow);
  keyValue("think model", config.thinkModel, chalk.yellow);
  keyValue("context", "stateless per request", chalk.yellow);
  keyValue("project", config.project, chalk.yellow);
  keyValue("logs", getLogFilePath(), ui.dim);
  console.log(`Type ${chalk.bold("/help")} for commands. Type ${chalk.bold("/exit")} to quit.\n`);
}

function printStatus() {
  const uptimeMs = Date.now() - session.startedAt.getTime();
  const estimatedTranscriptTokens = estimateTokens(
    session.history.map((item) => `${item.question}\n${item.answer}`).join("\n")
  );

  console.log("");
  console.log(sectionTitle("Scratch AI status"));
  keyValue("session", session.id, chalk.yellow);
  keyValue("uptime", formatDuration(uptimeMs), chalk.white);
  keyValue("backend", config.backend, chalk.yellow);
  keyValue("model", config.defaultModel, chalk.yellow);
  keyValue("think model", config.thinkModel, chalk.yellow);
  keyValue("context", "stateless per request", chalk.yellow);
  keyValue("transcript", `~${estimatedTranscriptTokens} tokens; not resent automatically`, chalk.white);
  keyValue("exchanges", String(session.exchanges), chalk.white);
  keyValue("errors", String(session.errors), session.errors ? chalk.red : chalk.white);
  keyValue("web calls", String(session.webCalls), chalk.white);
  keyValue("last mode", session.lastMode || "-", session.lastMode ? modeColor(session.lastMode) : chalk.white);
  keyValue("last model", session.lastModel || "-", chalk.white);
  keyValue("last latency", session.lastDurationMs ? formatDuration(session.lastDurationMs) : "-", chalk.white);
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
  keyValue("model", config.defaultModel, chalk.yellow);
  keyValue("think model", config.thinkModel, chalk.yellow);
  keyValue("codex command", config.codexCommand, chalk.white);
  keyValue("codex timeout", `${config.codexTimeoutMs}ms`, chalk.white);
  keyValue("project", config.project, chalk.white);
  keyValue("timezone", config.timezone, chalk.white);
  keyValue("log file", getLogFilePath(), ui.dim);
  console.log("");
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
    console.log(`${ui.dim(String(item.index).padStart(2))}. ${modeColor(item.mode)(`[${item.mode}]`)} ${item.question}`);
  }
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
  session.totalUsage.inputTokens = 0;
  session.totalUsage.outputTokens = 0;
  session.totalUsage.totalTokens = 0;
  session.history = [];
  console.log(ui.dim("Session counters reset. Logs were not changed."));
}

async function handleQuestion(parsed) {
  if (!parsed.question) {
    console.log(chalk.red("Missing question."));
    return;
  }

  const startedAt = Date.now();
  printRequestHeader(parsed);

  const stopThinking = startThinkingAnimation(parsed.mode);
  let result;

  try {
    result = await askModel({
      question: parsed.question,
      modeName: parsed.mode,
    });
  } finally {
    stopThinking();
  }

  const durationMs = Date.now() - startedAt;
  const answer = result.answer.trim();
  const usage = result.usage || null;

  printAnswerHeader(result);
  console.log("");
  console.log(answer || chalk.yellow("(empty answer)"));
  printFooter(durationMs, usage);

  session.exchanges += 1;
  session.webCalls += parsed.mode === "web" || parsed.mode === "deepweb" ? 1 : 0;
  session.transcriptChars += parsed.question.length + answer.length;
  session.lastMode = parsed.mode;
  session.lastDurationMs = durationMs;
  session.lastModel = result.mode.model;
  session.lastUsage = usage;

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

  try {
    appendLog({
      backend: result.backend || config.backend,
      mode: parsed.mode,
      model: result.mode.model,
      question: parsed.question,
      answer,
      durationMs,
      usage,
    });
  } catch (error) {
    console.error(chalk.yellow(`Log warning: ${error.message}`));
  }
}

export async function runCli() {
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
