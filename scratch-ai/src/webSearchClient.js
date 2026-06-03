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

// DuckDuckGo HTML search - reliable, no API key needed
async function duckduckgoSearch(query, count = 10) {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

  const response = await fetch(url, {
    headers: {
      "Accept": "text/html",
      "User-Agent": "Mozilla/5.0 (compatible; ScratchAI/1.0)",
    },
  });

  if (!response.ok) {
    throw new WebSearchError(`DuckDuckGo search failed: HTTP ${response.status}`, response.status);
  }

  const html = await response.text();

  // Parse results from DuckDuckGo HTML
  const results = [];
  const resultRegex = /<a class="result__a" href="([^"]+)"[^>]*>([^<]+)<\/a>/g;
  const snippetRegex = /<a class="result__snippet"[^>]*>([^<]+)<\/a>/g;

  // Simple HTML parsing for DuckDuckGo results
  const lines = html.split("\n");
  let currentUrl = "";
  let currentTitle = "";

  for (const line of lines) {
    // Match result URLs
    const urlMatch = line.match(/<a class="result__a" href="(https?:\/\/[^"]+)"/);
    if (urlMatch) {
      currentUrl = urlMatch[1];
    }

    // Match result titles (next line usually)
    const titleMatch = line.match(/>([^<]+)<\/a>/);
    if (titleMatch && currentUrl && !line.includes("result__a")) {
      currentTitle = titleMatch[1].trim();
    }

    // Match snippets
    const snippetMatch = line.match(/class="result__snippet"[^>]*>([^<]+)<\/a>/);
    if (snippetMatch && currentUrl) {
      results.push({
        title: currentTitle || "Untitled",
        url: currentUrl,
        snippet: snippetMatch[1].trim().replace(/<[^>]+>/g, ""),
        engine: "duckduckgo",
      });
      currentUrl = "";
      currentTitle = "";
      if (results.length >= count) break;
    }
  }

  return results;
}

// Fallback: use a simple API approach
async function fallbackSearch(query, count = 10) {
  // Try Wikipedia API as fallback
  const url = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=${count}&format=json`;

  const response = await fetch(url);
  if (!response.ok) {
    return [];
  }

  const data = await response.json();
  if (!data[1] || data[1].length === 0) {
    return [];
  }

  return data[1].map((title, i) => ({
    title,
    url: data[3][i] || `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`,
    snippet: "",
    engine: "wikipedia",
  }));
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
      output += `   ${r.snippet}\n`;
    }
    output += "\n";
  }

  return output;
}

export async function askWebSearch({ question, modeName, sessionContext = [] }) {
  const questionWithContext = buildQuestionWithContext(question, sessionContext);

  try {
    // Try DuckDuckGo first
    let results;
    try {
      results = await duckduckgoSearch(question, 10);
    } catch {
      // Fallback to Wikipedia
      results = await fallbackSearch(question, 10);
    }

    if (!results || results.length === 0) {
      return {
        answer: `No search results found for: "${question}"`,
        raw: { query: question },
        usage: null,
        backend: "websearch",
      };
    }

    // Format results for the model
    const formattedResults = formatSearchResults(question, results);

    // Create a prompt that includes search results for the model to synthesize
    const prompt = `Based on the following web search results, answer the user's question.

Search results:
${formattedResults}

User question: ${question}

Please provide a helpful answer based on the search results above. Include relevant citations to the sources.`;

    // Use the provider directly to synthesize results
    const provider = config.provider || "openai";

    if (provider === "minimax") {
      const { askMinimaxProvider } = await import("./providers/minimaxProvider.js");
      const result = await askMinimaxProvider({ question: prompt, modeName: "normal", sessionContext: [] });
      return { ...result, backend: "websearch" };
    }

    if (provider === "deepseek") {
      const { askDeepSeekProvider } = await import("./providers/deepseekProvider.js");
      const result = await askDeepSeekProvider({ question: prompt, modeName: "normal", sessionContext: [] });
      return { ...result, backend: "websearch" };
    }

    if (provider === "anthropic") {
      const { askAnthropicProvider } = await import("./providers/anthropicProvider.js");
      const result = await askAnthropicProvider({ question: prompt, modeName: "normal", sessionContext: [] });
      return { ...result, backend: "websearch" };
    }

    // Default: use OpenAI
    const { askOpenAIProvider } = await import("./providers/openaiProvider.js");
    const result = await askOpenAIProvider({ question: prompt, modeName: "normal", sessionContext: [] });
    return { ...result, backend: "websearch" };
  } catch (error) {
    if (error instanceof WebSearchError) {
      throw error;
    }
    throw new WebSearchError(`Web search failed: ${error.message}`, 500);
  }
}