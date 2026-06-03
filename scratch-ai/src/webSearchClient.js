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

// DuckDuckGo Lite HTML search - reliable, less bot-protected
async function duckduckgoSearch(query, count = 10) {
  const url = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`;

  const response = await fetch(url, {
    headers: {
      "Accept": "text/html",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
  });

  if (!response.ok) {
    throw new WebSearchError(`DuckDuckGo search failed: HTTP ${response.status}`, response.status);
  }

  const html = await response.text();

  // Parse DuckDuckGo Lite results
  // Format: <a class='result-link' href='//duckduckgo.com/l/?uddg=<encoded_url>&...'>TITLE</a>
  //         <td class='result-snippet'>SNIPPET</td>

  const results = [];

  // Match all result-link elements
  const linkRegex = /<a[^>]*class=['"]result-link['"][^>]*href=['"][^'"]*uddg=([^&'"]+)[^'"]*['"][^>]*>([\s\S]*?)<\/a>/g;
  let match;

  while ((match = linkRegex.exec(html)) !== null) {
    const encodedUrl = match[1];
    const title = stripHtml(match[2]).trim();

    // Find the snippet that follows this link
    const afterLink = html.slice(match.index + match[0].length, match.index + match[0].length + 2000);
    const snippetMatch = afterLink.match(/<td[^>]*class=['"]result-snippet['"][^>]*>([\s\S]*?)<\/td>/);

    let snippet = "";
    if (snippetMatch) {
      snippet = stripHtml(snippetMatch[1]).trim();
    }

    // Decode the URL
    let actualUrl;
    try {
      actualUrl = decodeURIComponent(encodedUrl);
    } catch {
      actualUrl = encodedUrl;
    }

    if (actualUrl && title) {
      results.push({
        title,
        url: actualUrl,
        snippet,
        engine: "duckduckgo",
      });
    }

    if (results.length >= count) break;
  }

  return results;
}

function stripHtml(str) {
  return str
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ");
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