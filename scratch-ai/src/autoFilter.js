import { config } from "./config.js";
import { askModel } from "./modelClient.js";
import { systemPrompt } from "./prompt.js";

export const FILTER_DECISION_KEEP = "keep";
export const FILTER_DECISION_CONDENSE = "condense";
export const FILTER_DECISION_DISCARD = "discard";

const SCORING_MODEL = "gpt-4o-mini";

const scoringSystemPrompt = `You are an auto-filter for a developer Q&A scratchpad. Your job is to classify each Q&A entry into one of three categories:

1. **keep** - Code snippets, references, decisions, complex explanations, useful to remember
2. **condense** - One-line summaries or brief notes, the full conversation is overkill
3. **discard** - Trivial questions, chitchat, repeated queries, one-off facts

Output ONLY a JSON object with no explanation:
{"decision": "keep|condense|discard", "reason": "brief reason", "condensedText": "one-line summary if condense, otherwise null"}`;

export async function scoreEntry({ question, answer, mode, model }) {
  if (!config.autoFilterEnabled) {
    return null;
  }

  const prompt = `Classify this Q&A:

Question: ${question}
Answer: ${answer}
Mode: ${mode}
Model: ${model}`;

  try {
    const response = await askModel({
      question: prompt,
      modeName: "normal",
      sessionContext: [],
    });

    const rawAnswer = response.answer.trim();

    try {
      const parsed = JSON.parse(rawAnswer);
      if (
        [FILTER_DECISION_KEEP, FILTER_DECISION_CONDENSE, FILTER_DECISION_DISCARD].includes(
          parsed.decision
        )
      ) {
        return {
          decision: parsed.decision,
          reason: typeof parsed.reason === "string" ? parsed.reason : "",
          condensedText:
            parsed.decision === FILTER_DECISION_CONDENSE && typeof parsed.condensedText === "string"
              ? parsed.condensedText
              : null,
        };
      }
    } catch {
      if (rawAnswer.startsWith("{")) {
        return null;
      }
    }

    return null;
  } catch (error) {
    console.error("Auto-filter scoring failed:", error.message);
    return null;
  }
}

export function formatAutoFilterMetadata(filterResult) {
  if (!filterResult) {
    return null;
  }

  return {
    decision: filterResult.decision,
    reason: filterResult.reason,
    condensedText: filterResult.condensedText,
  };
}