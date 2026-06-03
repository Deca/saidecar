import { config } from "./config.js";
import { buildQuestionWithContext } from "./sessionContext.js";

export const SEARCH_UNKNOWN = "unknown";
export const SEARCH_SUCCESS = "success";
export const SEARCH_NO_RESULTS = "no_results";
export const SEARCH_ERROR = "error";

class WebSearchError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "WebSearchError";
    this.status = status;
  }
}

// SearXNG search instance URL - can be configured via env or uses public instances
function getSearchUrls() {
  const configured = process.env.SEARXNG_URL;
  if (configured) {
    return [configured];
  }
  // Try multiple public instances - first one that works wins
  return [
    "https://searxng.privacydev.net/search",
    "https://search.fossho.st/search",
    "https://search.projectsegfau.lt/search",
    "https://searx.organics.org/search",
  ];
}

async function searxngSearch(query, count = 10) {
  const searchUrls = getSearchUrls();
  const params = new URLSearchParams({
    q: query,
    format: "json",
    engines: "google,duckduckgo,bing",
    per_page: count,
  });

  let lastError;
  for (const searchUrl of searchUrls) {
    try {
      const response = await fetch(`${searchUrl}?${params.toString()}`, {
        headers: {
          "Accept": "application/json",
        },
      });

      if (response.ok) {
        const data = await response.json();

        if (!data.results || data.results.length === 0) {
          return { status: SEARCH_NO_RESULTS, results: [], answer: "No search results found." };
        }

        const results = data.results.slice(0, count).map((r) => ({
          title: r.title || "Untitled",
          url: r.url || "",
          snippet: r.content || r.snippet || "",
          engine: r.engine || "unknown",
        }));

        return { status: SEARCH_SUCCESS, results, answer: null };
      }
      lastError = `HTTP ${response.status}`;
    } catch (err) {
      lastError = err.message;
    }
  }

  throw new WebSearchError(`All SearXNG instances failed. Last error: ${lastError}`, 404);
}

function formatSearchResults(query, results) {
  if (!results || results.length === 0) {
    return `No search results found for: "${query}"`;
  }

  let output = `Search results for: "${query}"\n\n`;

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    output += `${i + 1}. ${r.title}\n   ${r.url}\n`;
    if (r.snippet) {
      const snippet = r.snippet.length > 200 ? r.snippet.slice(0, 200) + "..." : r.snippet;
      output += `   ${snippet}\n`;
    }
    output += "\n";
  }

  return output;
}

export async function askWebSearch({ question, modeName, sessionContext = [] }) {
  const questionWithContext = buildQuestionWithContext(question, sessionContext);

  try {
    const searchResult = await searxngSearch(question, 10);

    if (searchResult.status === SEARCH_NO_RESULTS) {
      return {
        answer: searchResult.answer,
        raw: searchResult,
        usage: null,
        backend: "searxng",
      };
    }

    if (searchResult.status === SEARCH_ERROR) {
      throw new WebSearchError(searchResult.answer, 500);
    }

    // Format results for the model
    const formattedResults = formatSearchResults(question, searchResult.results);

    // Create a prompt that includes search results for the model to synthesize
    const prompt = `Based on the following web search results, answer the user's question.

Search results:
${formattedResults}

User question: ${question}

Please provide a helpful answer based on the search results above. Include relevant citations to the sources.`;

    // Use the provider directly to synthesize results (avoid circular import with modelClient)
    const provider = config.provider || "openai";

    if (provider === "minimax") {
      const { askMinimaxProvider } = await import("./providers/minimaxProvider.js");
      const result = await askMinimaxProvider({ question: prompt, modeName: "normal", sessionContext: [] });
      return { ...result, backend: "searxng" };
    }

    if (provider === "deepseek") {
      const { askDeepSeekProvider } = await import("./providers/deepseekProvider.js");
      const result = await askDeepSeekProvider({ question: prompt, modeName: "normal", sessionContext: [] });
      return { ...result, backend: "searxng" };
    }

    if (provider === "anthropic") {
      const { askAnthropicProvider } = await import("./providers/anthropicProvider.js");
      const result = await askAnthropicProvider({ question: prompt, modeName: "normal", sessionContext: [] });
      return { ...result, backend: "searxng" };
    }

    // Default: use OpenAI
    const { askOpenAIProvider } = await import("./providers/openaiProvider.js");
    const result = await askOpenAIProvider({ question: prompt, modeName: "normal", sessionContext: [] });
    return { ...result, backend: "searxng" };
  } catch (error) {
    if (error instanceof WebSearchError) {
      throw error;
    }
    throw new WebSearchError(`Web search failed: ${error.message}`, 500);
  }
}