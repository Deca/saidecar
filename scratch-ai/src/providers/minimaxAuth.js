import { config } from "../config.js";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

const execAsync = promisify(exec);

const MMX_CONFIG_PATH = path.join(os.homedir(), ".mmx", "config.json");

export class MinimaxAuth {
  constructor() {
    this.region = this.detectRegion();
  }

  detectRegion() {
    // Check if API key starts with sk- (international) or has specific prefix
    const apiKey = config.minimaxApiKey;
    if (apiKey?.startsWith("sk-")) {
      return "global";
    }
    // Default to CN region
    return "cn";
  }

  getBaseUrl(credentials = null) {
    // Use region from OAuth credentials if available, otherwise fall back to detected region
    const region = credentials?.region || this.region;
    return region === "global"
      ? "https://api.minimax.io/anthropic/v1"
      : "https://api.minimaxi.com/anthropic/v1";
  }

  async getCredentials() {
    // Check auth mode preference from env
    const authMode = (config.minimaxAuthMode || "oauth").toLowerCase();

    // If API key mode explicitly requested, skip OAuth
    if (authMode === "api_key") {
      if (config.minimaxApiKey) {
        return {
          access_token: config.minimaxApiKey,
          refresh_token: null,
          expires_at: null,
        };
      }
      return null;
    }

    // Default: prioritize OAuth (mmx auth login)
    // First try: read from mmx config (OAuth tokens stored under "oauth" key)
    try {
      if (fs.existsSync(MMX_CONFIG_PATH)) {
        const content = fs.readFileSync(MMX_CONFIG_PATH, "utf-8");
        const data = JSON.parse(content);

        // Check if we have OAuth tokens (stored under "oauth" key in mmx config)
        const oauth = data.oauth || {};
        if (oauth.access_token) {
          // Check expiration
          const expiresAt = oauth.expires_at ? new Date(oauth.expires_at).getTime() : null;
          if (expiresAt && Date.now() > expiresAt) {
            // Token expired, try refresh
            const refreshed = await this.refreshCredentials();
            if (refreshed) {
              return refreshed;
            }
            // If refresh failed, fall through to try other methods
          } else {
            this.region = oauth.region || "global";
            return {
              access_token: oauth.access_token,
              refresh_token: oauth.refresh_token || null,
              expires_at: expiresAt,
            };
          }
        }
      }
    } catch (e) {
      // Ignore errors, fall through to next option
    }

    // Second try: use mmx CLI to get token status
    try {
      const { stdout } = await execAsync("mmx auth status --json", { timeout: 5000 });
      const status = JSON.parse(stdout);

      if (status.authenticated && status.api_key) {
        return {
          access_token: status.api_key,
          refresh_token: null,
          expires_at: null,
        };
      }
    } catch (e) {
      // mmx not available or not authenticated
    }

    // Third try: use API key from config env var (fallback only if no OAuth available)
    if (config.minimaxApiKey) {
      return {
        access_token: config.minimaxApiKey,
        refresh_token: null,
        expires_at: null,
      };
    }

    return null;
  }

  async refreshCredentials() {
    try {
      await execAsync("mmx auth refresh", { timeout: 10000 });
      return await this.getCredentials();
    } catch (e) {
      return null;
    }
  }

  async isAuthenticated() {
    const creds = await this.getCredentials();
    return creds !== null;
  }
}