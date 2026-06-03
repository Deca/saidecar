import { APP_DISPLAY_NAME } from "./config.js";

export const DEFAULT_CONTEXT_EXCHANGES = 4;
export const DEFAULT_CONTEXT_CHARS = 8000;

export function selectSessionContext(
  history,
  {
    maxExchanges = DEFAULT_CONTEXT_EXCHANGES,
    maxChars = DEFAULT_CONTEXT_CHARS,
  } = {}
) {
  const selected = [];
  let usedChars = 0;

  for (const item of [...history].reverse()) {
    if (selected.length >= maxExchanges) {
      break;
    }

    const question = String(item.question || "").trim();
    const answer = String(item.answer || "").trim();

    if (!question || !answer) {
      continue;
    }

    const entryChars = question.length + answer.length;

    if (entryChars > maxChars) {
      break;
    }

    if (selected.length > 0 && usedChars + entryChars > maxChars) {
      break;
    }

    selected.push({
      index: item.index,
      mode: item.mode,
      question,
      answer,
    });
    usedChars += entryChars;
  }

  return selected.reverse();
}

export function formatSessionContext(entries) {
  if (!entries?.length) {
    return "";
  }

  return entries
    .map(
      (entry) => `Turn ${entry.index || "?"} [${entry.mode || "normal"}]
User: ${entry.question}
${APP_DISPLAY_NAME}: ${entry.answer}`
    )
    .join("\n\n");
}

export function buildQuestionWithContext(question, entries) {
  const context = formatSessionContext(entries);

  if (!context) {
    return question;
  }

  return `Use the following recent ${APP_DISPLAY_NAME} session context only when it helps answer the current question. If the current question is unrelated, ignore this context.

Recent session context:
${context}

Current question:
${question}`;
}
