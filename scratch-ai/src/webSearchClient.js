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

// Default to a self-hosted SearXNG instance (like odysseus project does).
// Users can override with SEARXNG_URL env var.
const SEARXNG_URL = (process.env.SEARXNG_URL || "http://localhost:8080").replace(/\/+$/, "");

// Default engines that work reliably (odysseus experience: google/duckduckgo/brave/startpage/wikipedia
// are commonly rate-limited / CAPTCHA-blocked, so pin to engines that actually respond).
const DEFAULT_ENGINES = process.env.SEARXNG_ENGINES || "bing,mojeek,presearch,wikipedia";

const NEWS_HINTS = ("news,nyheter,headlines,breaking,latest,today,idag").split(",");

const REQUEST_TIMEOUT = 15000;

async function searxngJsonSearch(query, count, options = {}) {
  const { timeRange, categories = "general", engines = DEFAULT_ENGINES, language = "en" } = options;

  const params = {
    q: query,
    format: "json",
  };
  if (language) params.language = language;
  if (timeRange) params.time_range = timeRange;
  if (categories) params.categories = categories;
  if (engines) params.engines = engines;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const response = await fetch(`${SEARXNG_URL}/search`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params).toString(),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new WebSearchError(`SearXNG HTTP ${response.status}`, response.status);
    }

    const data = await response.json();
    const results = (data.results || [])
      .filter((r) => r.url)
      .slice(0, count)
      .map((r) => ({
        title: r.title || "",
        url: r.url,
        snippet: r.content || r.snippet || "",
        engine: r.engine || "searxng",
      }));

    return { results, data };
  } finally {
    clearTimeout(timeout);
  }
}

function isNewsQuery(query, timeFilter) {
  if (timeFilter) return true;
  const q = query.toLowerCase();
  return NEWS_HINTS.some((h) => q.includes(h));
}

async function searxngSearch(query, count, timeFilter) {
  // Detect news queries - use 'news' category with time filter
  const isNews = isNewsQuery(query, timeFilter);
  const categories = isNews ? "news" : "general";
  // News queries do badly in general category; widen 'day' to 'week' for volume
  const timeRange = isNews
    ? (timeFilter === "day" || timeFilter === "week" || !timeFilter) ? "week" : timeFilter
    : null;

  let { results, data } = await searxngJsonSearch(query, count, {
    categories,
    timeRange,
    engines: DEFAULT_ENGINES,
    language: "en",
  });

  // Fallback 1: if news returned 0, retry with general engines
  if (results.length === 0 && isNews) {
    const retry = await searxngJsonSearch(query, count, {
      categories: "general",
      engines: DEFAULT_ENGINES,
      language: "en",
    });
    results = retry.results;
    data = retry.data;
  }

  // Fallback 2: if language-pinned search returned 0, retry without language
  if (results.length === 0) {
    const retry = await searxngJsonSearch(query, count, {
      categories,
      timeRange,
      engines: DEFAULT_ENGINES,
      language: null,
    });
    results = retry.results;
    data = retry.data;
  }

  // Fallback 3: if pinned engines returned 0, retry with default engines
  if (results.length === 0 && DEFAULT_ENGINES) {
    const retry = await searxngJsonSearch(query, count, {
      categories,
      timeRange,
      engines: null,
      language: "en",
    });
    results = retry.results;
    data = retry.data;
  }

  if (results.length === 0 && data?.unresponsive_engines) {
    console.log(`[websearch] SearXNG unresponsive engines: ${data.unresponsive_engines.join(", ")}`);
  }

  return results;
}

async function searxngHtmlSearch(query, count) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const response = await fetch(`${SEARXNG_URL}/search?q=${encodeURIComponent(query)}`, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new WebSearchError(`SearXNG HTML HTTP ${response.status}`, response.status);
    }

    const html = await response.text();
    const results = [];

    // Parse HTML using regex (Node.js has no built-in HTML parser)
    // Format: <article class="result">...<h3><a href="URL">TITLE</a></h3>...<p class="content">SNIPPET</p>...</article>
    const articleRegex = /<article[^>]*class="[^"]*result[^"]*"[\s\S]*?<h3[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h3>([\s\S]*?)<\/article>/g;
    let match;
    while ((match = articleRegex.exec(html)) !== null) {
      const url = match[1];
      const title = match[2].replace(/<[^>]+>/g, "").trim();
      const restBlock = match[3];
      const snippetMatch = restBlock.match(/<p[^>]*class="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/p>/);
      const snippet = snippetMatch ? snippetMatch[1].replace(/<[^>]+>/g, "").trim() : "";

      if (url && title) {
        results.push({ title, url, snippet, engine: "searxng-html" });
      }
      if (results.length >= count) break;
    }

    return results;
  } finally {
    clearTimeout(timeout);
  }
}

// DuckDuckGo HTML fallback (no API key needed)
async function duckduckgoSearch(query, count) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const response = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new WebSearchError(`DuckDuckGo HTTP ${response.status}`, response.status);
    }

    const html = await response.text();
    const results = [];

    // Format: <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=<encoded_url>...">TITLE</a>
    //         <a class="result__snippet">SNIPPET</a>
    const linkRegex = /<a[^>]*class="result__a"[^>]*href="[^"]*uddg=([^&"]+)[^"]*"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
    let match;
    while ((match = linkRegex.exec(html)) !== null) {
      const encodedUrl = match[1];
      const title = match[2].replace(/<[^>]+>/g, "").trim();
      const snippet = match[3].replace(/<[^>]+>/g, "").trim();

      let url;
      try {
        url = decodeURIComponent(encodedUrl);
      } catch {
        url = encodedUrl;
      }

      if (url && title) {
        results.push({ title, url, snippet, engine: "duckduckgo" });
      }
      if (results.length >= count) break;
    }

    return results;
  } finally {
    clearTimeout(timeout);
  }
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

function getSearxngError() {
  return `Could not reach SearXNG at ${SEARXNG_URL}.

To use web search, either:
1. Run a self-hosted SearXNG instance (recommended):
   docker run -d -p 8080:8080 -e SEARXNG_SECRET=random searxng/searxng
   Then set SEARXNG_URL=http://localhost:8080 in .env

2. Or set SEARXNG_URL to a public instance

3. Or configure a different search provider (see webSearchClient.js)`;
}

export async function askWebSearch({ question, modeName, sessionContext = [] }) {
  const questionWithContext = buildQuestionWithContext(question, sessionContext);

  let results;
  let lastError;

  // 1. Try SearXNG JSON API (primary)
  try {
    results = await searxngSearch(question, 10);
  } catch (e) {
    lastError = e.message;
  }

  // 2. Try SearXNG HTML fallback
  if (!results || results.length === 0) {
    try {
      results = await searxngHtmlSearch(question, 10);
    } catch (e) {
      lastError = e.message;
    }
  }

  // 3. Try DuckDuckGo as final fallback
  if (!results || results.length === 0) {
    try {
      results = await duckduckgoSearch(question, 10);
    } catch (e) {
      lastError = e.message;
    }
  }

  if (!results || results.length === 0) {
    throw new WebSearchError(getSearxngError(), 503);
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
}