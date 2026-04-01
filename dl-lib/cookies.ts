import { readFile } from "node:fs/promises";

import { InputError } from "./errors.js";
import type { TwitterCookies } from "./types.js";

const HEX_TEMPLATE = "(?:[0-9a-f]{2})";
const COOKIE_PATTERN = new RegExp(
  `\\s+(auth_token|ct0)\\s+(${HEX_TEMPLATE}{20}|${HEX_TEMPLATE}{80})$`,
  "gm",
);

const VALID_COOKIE_PATTERNS = {
  authToken: new RegExp(`^${HEX_TEMPLATE}{20}$`),
  ct0: new RegExp(`^${HEX_TEMPLATE}{80}$`),
} as const;

export function parseCookies(text: string): TwitterCookies {
  const found = Object.fromEntries(
    Array.from(text.matchAll(COOKIE_PATTERN), ([, key, value]) => [
      key === "auth_token" ? "authToken" : "ct0",
      value,
    ]),
  ) as Partial<TwitterCookies>;

  return validateCookies(found);
}

export async function loadCookiesFile(path: string): Promise<TwitterCookies> {
  try {
    const text = await readFile(path, "utf8");
    return parseCookies(text);
  } catch (error) {
    if (error instanceof InputError) {
      throw error;
    }
    throw new InputError(`Cannot load cookies from file: ${path}`);
  }
}

export function validateCookies(cookies: Partial<TwitterCookies>): TwitterCookies {
  if (!cookies.authToken || !cookies.ct0) {
    throw new InputError("Missing required cookies: auth_token and/or ct0");
  }

  if (!VALID_COOKIE_PATTERNS.authToken.test(cookies.authToken)) {
    throw new InputError("Invalid cookies: auth_token");
  }

  if (!VALID_COOKIE_PATTERNS.ct0.test(cookies.ct0)) {
    throw new InputError("Invalid cookies: ct0");
  }

  return {
    authToken: cookies.authToken,
    ct0: cookies.ct0,
  };
}
