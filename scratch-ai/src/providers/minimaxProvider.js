import { config } from "../config.js";
import { systemPrompt } from "../prompt.js";
import { parseProviderResponse } from "./index.js";
import { MinimaxAuth } from "./minimaxAuth.js";

export async function askMinimaxProvider({ question, modeName, sessionContext = [] }) {
  const auth = new MinimaxAuth();

  // Check if we have valid cached credentials first
  const credentials = await auth.getCredentials();

  if (!credentials) {
    console.log("\n📝 MiniMax OAuth login required...");
    console.log("   Use 'mmx auth login' in terminal to authenticate, or set MINIMAX_API_KEY in .env\n");

    throw new Error(
      "MiniMax authentication required. Run 'mmx auth login' in terminal, or set MINIMAX_API_KEY in .env"
    );
  }

  const { modes } = await import("../modes.js");
  const { buildQuestionWithContext } = await import("../sessionContext.js");

  const mode = modes[modeName] || modes.normal;
  const questionWithContext = buildQuestionWithContext(question, sessionContext);

  const baseUrl = auth.getBaseUrl(credentials);
  const model = mode.model || "MiniMax-M3";

  const payload = {
    model,
    system: systemPrompt,
    messages: [{ role: "user", content: questionWithContext }],
    max_tokens: 4096,
    ...(mode.tools?.length > 0 && { tools: transformToolsForMinimax(mode.tools) }),
  };

  function transformToolsForMinimax(tools) {
    return tools.map((tool) => {
      if (tool.type === "web_search") {
        return {
          name: "web_search",
          description: "Search the web for current information",
          input_schema: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "The search query",
              },
            },
            required: ["query"],
          },
        };
      }
      return tool;
    });
  }

  const headers = {
    "Authorization": `Bearer ${credentials.access_token}`,
    "Content-Type": "application/json",
    "anthropic-version": "2023-06-01",
  };

  const response = await fetch(`${baseUrl}/messages`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  if (response.status === 401) {
    // Token expired, try refresh
    const refreshed = await auth.refreshCredentials();
    if (refreshed) {
      // Retry with new token
      headers.Authorization = `Bearer ${refreshed.access_token}`;
      const retryResponse = await fetch(`${baseUrl}/messages`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });

      if (!retryResponse.ok) {
        const errorText = await retryResponse.text();
        throw new Error(`MiniMax API error: HTTP ${retryResponse.status} ${errorText}`);
      }

      const data = await retryResponse.json();
      return parseProviderResponse("minimax", data, "minimax");
    }
    throw new Error("MiniMax authentication expired. Please re-authenticate with 'mmx auth login'");
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`MiniMax API error: HTTP ${response.status} ${errorText}`);
  }

  const data = await response.json();

  if (data.type === "error") {
    throw new Error(`MiniMax API error: ${data.error?.message || JSON.stringify(data)}`);
  }

  const result = parseProviderResponse("minimax", data, "minimax");

  if (!result.answer && mode.tools?.length > 0) {
    console.log("[MiniMax debug] response content blocks:", JSON.stringify(data.content, null, 2));
  }

  return result;
}