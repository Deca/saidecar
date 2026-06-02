import { config } from "./config.js";

export const modes = {
  normal: {
    label: "normal",
    model: config.defaultModel,
    reasoning: { effort: "none" },
    tools: [],
  },
  think: {
    label: "think",
    model: config.thinkModel,
    reasoning: { effort: "medium" },
    tools: [],
  },
  web: {
    label: "web",
    model: config.defaultModel,
    reasoning: { effort: "low" },
    tools: [{ type: "web_search" }],
  },
  deepweb: {
    label: "deepweb",
    model: config.thinkModel,
    reasoning: { effort: "medium" },
    tools: [{ type: "web_search" }],
  },
};

const commandMap = [
  { prefix: "/think ", alias: "/t ", mode: "think" },
  { prefix: "/web ", alias: "/w ", mode: "web" },
  { prefix: "/deepweb ", alias: "/dw ", mode: "deepweb" },
  { prefix: "/q ", alias: null, mode: "normal" },
];

export function parseInput(rawInput) {
  const input = rawInput.trim();

  if (!input) {
    return { type: "empty" };
  }

  if (input === "/exit" || input === ":q" || input.toLowerCase() === "quit") {
    return { type: "command", command: "exit" };
  }

  const simpleCommands = {
    "/help": "help",
    "?": "help",
    "/status": "status",
    "/session": "status",
    "/config": "config",
    "/log": "log",
    "/modes": "modes",
    "/history": "history",
    "/clear": "clear",
    "/reset": "reset",
  };

  if (simpleCommands[input]) {
    return { type: "command", command: simpleCommands[input] };
  }

  if (input === "/context") {
    return { type: "command", command: "context", action: "status" };
  }

  if (input.startsWith("/context ")) {
    const action = input.slice("/context ".length).trim().toLowerCase();
    if (["on", "off", "status"].includes(action)) {
      return { type: "command", command: "context", action };
    }

    return { type: "command", command: "unknown", input };
  }

  if (input.startsWith("/save ")) {
    const parts = input.slice("/save ".length).trim().split(/\s+/).filter(Boolean);
    return {
      type: "command",
      command: "save",
      index: Number.parseInt(parts[0], 10),
      tags: parts.slice(1),
    };
  }

  if (input.startsWith("/tag ")) {
    const parts = input.slice("/tag ".length).trim().split(/\s+/).filter(Boolean);
    return {
      type: "command",
      command: "tag",
      index: Number.parseInt(parts[0], 10),
      tags: parts.slice(1),
    };
  }

  for (const item of commandMap) {
    if (input.startsWith(item.prefix)) {
      return {
        type: "question",
        mode: item.mode,
        question: input.slice(item.prefix.length).trim(),
      };
    }

    if (item.alias && input.startsWith(item.alias)) {
      return {
        type: "question",
        mode: item.mode,
        question: input.slice(item.alias.length).trim(),
      };
    }
  }

  if (input.startsWith("/")) {
    return { type: "command", command: "unknown", input };
  }

  return {
    type: "question",
    mode: "normal",
    question: input,
  };
}
