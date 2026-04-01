import { ApiError, AuthenticationError } from "./errors.js";
import type { TwitterCookies } from "./types.js";

const RETRYABLE_STATUS_CODES = new Set([500, 502, 503, 504]);
const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_RETRY_ATTEMPTS = 5;
const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

export class HttpClient {
  constructor(
    private readonly headers: Record<string, string> = {},
    private readonly cookies?: TwitterCookies,
  ) {}

  async getJson(
    url: string,
    params: Record<string, string> = {},
  ): Promise<unknown> {
    const response = await this.request(url, params);

    try {
      return JSON.parse(response);
    } catch {
      throw new ApiError("API response cannot be decoded as JSON");
    }
  }

  async getText(
    url: string,
    params: Record<string, string> = {},
  ): Promise<string> {
    return this.request(url, params);
  }

  private async request(
    url: string,
    params: Record<string, string>,
  ): Promise<string> {
    const targetUrl = new URL(url);
    for (const [key, value] of Object.entries(params)) {
      targetUrl.searchParams.set(key, value);
    }

    let lastError: unknown;
    for (let attempt = 1; attempt <= DEFAULT_RETRY_ATTEMPTS; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

      try {
        const response = await fetch(targetUrl, {
          headers: this.buildHeaders(),
          signal: controller.signal,
        });

        if (response.status === 401 || response.status === 403) {
          throw new AuthenticationError(
            `Authentication failed with status ${response.status}`,
          );
        }

        if (response.status === 429) {
          throw new ApiError("API rate limit exceeded");
        }

        if (!response.ok) {
          if (RETRYABLE_STATUS_CODES.has(response.status)) {
            throw new ApiError(`API request failed with HTTP ${response.status}`);
          }
          const responseText = await response.text();
          throw new ApiError(
            `API request failed with HTTP ${response.status}: ${responseText}`,
          );
        }

        return await response.text();
      } catch (error) {
        lastError = error;
        const retryable =
          error instanceof ApiError &&
          /HTTP (500|502|503|504)/.test(error.message);
        if (!retryable || attempt === DEFAULT_RETRY_ATTEMPTS) {
          throw error;
        }
        await sleep(200 * attempt);
      } finally {
        clearTimeout(timeout);
      }
    }

    throw lastError;
  }

  private buildHeaders(): HeadersInit {
    const cookieHeader = this.cookies
      ? `auth_token=${this.cookies.authToken}; ct0=${this.cookies.ct0}`
      : undefined;

    return {
      "user-agent": DEFAULT_USER_AGENT,
      ...(cookieHeader ? { cookie: cookieHeader } : {}),
      ...this.headers,
    };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
