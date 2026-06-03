const FENCE_PATTERN = /^\s*(```|~~~)([^\s`~]*)\s*$/;

const DECISION_PATTERNS = [
  /\bdecid(e|ed|ing)\b/i,
  /\bdecision\b/i,
  /\bwe'?ll\s+(go\s+with|use|choose|adopt)\b/i,
  /\b(let'?s|we\s+should|we\s+will)\s+(go\s+with|use|choose|adopt)\b/i,
  /\b(plan|chose|chosen|agreed)\b/i,
  /\bshould\s+we\b/i,
  /\b(going\s+forward|from\s+now\s+on)\b/i,
];

const CODE_FENCE_RE = /```[^\n]*\n[\s\S]*?```|~~~[^\n]*\n[\s\S]*?~~~/g;
const INLINE_CODE_RE = /`[^`\n]+`/g;
const HASH_TAG_RE = /(^|[\s,;])(#([a-z0-9][a-z0-9_-]{1,40}))/gi;
const TOPIC_PREFIX_RE = /^\s*topic\s*:\s*([a-z0-9][a-z0-9_-]{1,40})/im;

const KNOWN_LANGUAGES = new Set([
  "js", "javascript", "ts", "typescript", "jsx", "tsx",
  "py", "python", "rb", "ruby", "go", "rs", "rust",
  "java", "kt", "kotlin", "swift", "c", "cpp", "c++", "cs", "csharp",
  "php", "lua", "perl", "r", "scala", "groovy", "dart",
  "sh", "bash", "shell", "zsh", "powershell", "ps1",
  "html", "css", "scss", "sass", "less", "xml", "svg",
  "json", "yaml", "yml", "toml", "ini", "env",
  "sql", "graphql", "proto",
  "md", "markdown",
  "dockerfile", "docker",
  "makefile", "make",
  "vim", "diff", "patch",
  "text", "txt", "plain", "plaintext",
]);

export const IMPORTANCE_HIGH = "high";
export const IMPORTANCE_MEDIUM = "medium";
export const IMPORTANCE_LOW = "low";

const IMPORTANCE_VALUES = [IMPORTANCE_HIGH, IMPORTANCE_MEDIUM, IMPORTANCE_LOW];

export function extractStructuredFields(entry) {
  const question = typeof entry?.question === "string" ? entry.question : "";
  const answer = typeof entry?.answer === "string" ? entry.answer : "";
  const project = typeof entry?.project === "string" ? entry.project : "";
  const sources = Array.isArray(entry?.sources) ? entry.sources : [];
  const combined = `${question}\n${answer}`;

  const language = extractLanguage(answer);
  const isCodeSnippet = detectCodeSnippet(answer);
  const isDecision = detectDecision(question, answer);
  const topic = extractTopic({ question, project });
  const importance = scoreImportance({
    isDecision,
    isCodeSnippet,
    sourceCount: sources.length,
    questionLength: question.length,
    answerLength: answer.length,
  });

  return {
    isDecision,
    isCodeSnippet,
    topic,
    language,
    importance,
  };
}

export function extractCodeBlocks(text) {
  if (typeof text !== "string" || !text) {
    return [];
  }

  const blocks = [];
  for (const match of text.matchAll(CODE_FENCE_RE)) {
    const raw = match[0];
    const firstNewline = raw.indexOf("\n");
    const fenceLine = firstNewline === -1 ? raw : raw.slice(0, firstNewline);
    const fenceMatch = fenceLine.match(FENCE_PATTERN);
    const language = fenceMatch ? normalizeLanguage(fenceMatch[2]) : null;
    const rawContent = firstNewline === -1 ? "" : raw.slice(firstNewline + 1, raw.length - 3);
    const content = rawContent.endsWith("\n") ? rawContent.slice(0, -1) : rawContent;
    blocks.push({ language, content });
  }
  return blocks;
}

export function extractLanguage(text) {
  const blocks = extractCodeBlocks(text);
  for (const block of blocks) {
    if (block.language) {
      return block.language;
    }
  }
  return null;
}

export function detectCodeSnippet(text) {
  if (typeof text !== "string" || !text) {
    return false;
  }

  if (CODE_FENCE_RE.test(text)) {
    return true;
  }

  const inlineMatches = text.match(INLINE_CODE_RE);
  if (inlineMatches && inlineMatches.length >= 2) {
    return true;
  }

  const lines = text.split(/\r?\n/);
  let codeishLines = 0;
  for (const line of lines) {
    if (looksLikeCodeLine(line)) {
      codeishLines += 1;
      if (codeishLines >= 2) {
        return true;
      }
    }
  }

  return false;
}

export function detectDecision(question, answer) {
  const combined = `${question || ""}\n${answer || ""}`;
  if (!combined.trim()) {
    return false;
  }

  return DECISION_PATTERNS.some((pattern) => pattern.test(combined));
}

export function extractTopic({ question, project } = {}) {
  if (typeof question === "string" && question) {
    const prefix = question.match(TOPIC_PREFIX_RE);
    if (prefix) {
      return normalizeTopic(prefix[1]);
    }

    const hashtags = [];
    for (const match of question.matchAll(HASH_TAG_RE)) {
      hashtags.push(match[3]);
    }
    if (hashtags.length > 0) {
      return normalizeTopic(hashtags[0]);
    }
  }

  if (typeof project === "string" && project.trim()) {
    return normalizeTopic(project);
  }

  return null;
}

export function scoreImportance({
  isDecision = false,
  isCodeSnippet = false,
  sourceCount = 0,
  questionLength = 0,
  answerLength = 0,
} = {}) {
  let score = 0;

  if (isCodeSnippet) score += 3;
  if (isDecision) score += 3;
  if (sourceCount > 0) score += Math.min(2, sourceCount);

  const total = (questionLength || 0) + (answerLength || 0);
  if (total > 1200) score += 2;
  else if (total > 300) score += 1;

  if (score >= 5) return IMPORTANCE_HIGH;
  if (score >= 2) return IMPORTANCE_MEDIUM;
  return IMPORTANCE_LOW;
}

export function isImportanceValue(value) {
  return IMPORTANCE_VALUES.includes(value);
}

function normalizeLanguage(raw) {
  if (!raw) return null;
  const cleaned = String(raw).trim().toLowerCase();
  if (!cleaned) return null;
  if (KNOWN_LANGUAGES.has(cleaned)) {
    return aliasLanguage(cleaned);
  }
  return cleaned.length <= 20 ? cleaned : null;
}

function aliasLanguage(value) {
  if (value === "js") return "javascript";
  if (value === "ts") return "typescript";
  if (value === "py") return "python";
  if (value === "rb") return "ruby";
  if (value === "rs") return "rust";
  if (value === "kt") return "kotlin";
  if (value === "cs" || value === "csharp") return "csharp";
  if (value === "cpp" || value === "c++") return "cpp";
  if (value === "sh" || value === "shell" || value === "zsh") return "bash";
  if (value === "ps1") return "powershell";
  if (value === "yml") return "yaml";
  if (value === "md") return "markdown";
  if (value === "docker") return "dockerfile";
  if (value === "make") return "makefile";
  if (value === "txt" || value === "plaintext") return "plain";
  return value;
}

function normalizeTopic(raw) {
  if (!raw) return null;
  const cleaned = String(raw).trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned || null;
}

function looksLikeCodeLine(line) {
  const trimmed = line.trim();
  if (trimmed.length < 6) return false;
  if (trimmed.length > 200) return false;

  if (/^(const|let|var|function|def|class|import|from|export|return|if|else|for|while|switch|case|break|continue|throw|try|catch|finally|new|async|await|yield)\b/.test(trimmed)) {
    return true;
  }

  if (/[{};]/.test(trimmed) && /[=:]/.test(trimmed)) {
    return true;
  }

  if (/^\s*([.#][\w-]+|\w[\w-]*\s*\(.*\)\s*[{;]?)/.test(line)) {
    return true;
  }

  return false;
}
