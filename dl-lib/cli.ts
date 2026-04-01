#!/usr/bin/env node

import { writeFile } from "node:fs/promises";
import process from "node:process";

import { createClient } from "./api.js";
import { loadCookiesFile } from "./cookies.js";
import { downloadEndedSpace, fetchPlaylistText, resolveMasterUrl } from "./downloader.js";
import { InputError } from "./errors.js";
import {
  createPlaceholderSpace,
  getSpaceFromMetadataFile,
  getSpaceFromUrl,
} from "./space.js";
import type { SpaceInfo, TwitterClient } from "./types.js";

interface ParsedArgs {
  command: string;
  options: Record<string, string | boolean>;
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));

  switch (parsed.command) {
    case "download":
      await handleDownload(parsed.options);
      return;
    case "url":
      await handleUrl(parsed.options);
      return;
    case "playlist":
      await handlePlaylist(parsed.options);
      return;
    case "metadata":
      await handleMetadata(parsed.options);
      return;
    case "help":
    case "--help":
    case "-h":
    case "":
      printHelp();
      return;
    default:
      throw new InputError(`Unknown command: ${parsed.command}`);
  }
}

async function handleDownload(options: Record<string, string | boolean>) {
  const { client, space } = await resolveSpaceContext(options);
  const result = await downloadEndedSpace({
    client,
    space,
    masterUrl: getStringOption(options, "master-url"),
    dynamicUrl: getStringOption(options, "dynamic-url"),
    outputTemplate: getStringOption(options, "output-template"),
    keepTempFiles: Boolean(options["keep-temp-files"]),
  });

  if (options["write-master-url"]) {
    await writeFile(String(options["write-master-url"]), `${result.masterUrl}\n`, "utf8");
  }

  if (options["write-playlist"]) {
    if (!client) {
      throw new InputError("Cookies are required to write playlist output");
    }
    const playlistText = await fetchPlaylistText(client, result.masterUrl);
    await writeFile(String(options["write-playlist"]), playlistText, "utf8");
  }

  if (options["write-metadata"]) {
    if (!space?.rawMetadata) {
      throw new InputError("Metadata is not available for this input");
    }
    await writeFile(
      String(options["write-metadata"]),
      `${JSON.stringify(space.rawMetadata, null, 2)}\n`,
      "utf8",
    );
  }

  process.stdout.write(`${result.outputPath}\n`);
}

async function handleUrl(options: Record<string, string | boolean>) {
  const { client, space } = await resolveSpaceContext(options);
  const masterUrl = await resolveMasterUrl({
    client,
    space,
    masterUrl: getStringOption(options, "master-url"),
    dynamicUrl: getStringOption(options, "dynamic-url"),
  });

  if (options.write) {
    await writeFile(String(options.write), `${masterUrl}\n`, "utf8");
    return;
  }

  process.stdout.write(`${masterUrl}\n`);
}

async function handlePlaylist(options: Record<string, string | boolean>) {
  const { client, space } = await resolveSpaceContext(options);
  if (!client) {
    throw new InputError("Cookies are required to resolve playlist output");
  }

  const masterUrl = await resolveMasterUrl({
    client,
    space,
    masterUrl: getStringOption(options, "master-url"),
    dynamicUrl: getStringOption(options, "dynamic-url"),
  });

  const playlistText = await fetchPlaylistText(client, masterUrl);
  if (options.write) {
    await writeFile(String(options.write), playlistText, "utf8");
    return;
  }

  process.stdout.write(playlistText);
}

async function handleMetadata(options: Record<string, string | boolean>) {
  const { space } = await resolveSpaceContext(options, { requireSpaceSource: true });
  if (!space?.rawMetadata) {
    throw new InputError("Metadata is not available for this input");
  }

  const payload = `${JSON.stringify(space.rawMetadata, null, 2)}\n`;
  if (options.write) {
    await writeFile(String(options.write), payload, "utf8");
    return;
  }

  process.stdout.write(payload);
}

async function resolveSpaceContext(
  options: Record<string, string | boolean>,
  settings: { requireSpaceSource?: boolean } = {},
): Promise<{ client?: TwitterClient; space?: SpaceInfo }> {
  const cookiesPath = getStringOption(options, "cookies");
  const needsApi = Boolean(getStringOption(options, "space-url"));
  const needsMetadataFile = Boolean(getStringOption(options, "metadata-file"));

  let client: TwitterClient | undefined;
  if (cookiesPath) {
    client = createClient({ cookies: await loadCookiesFile(cookiesPath) });
  }

  if (options["space-url"]) {
    if (!client) {
      throw new InputError("Cookies are required when using --space-url");
    }
    return {
      client,
      space: await getSpaceFromUrl(client, String(options["space-url"])),
    };
  }

  if (options["metadata-file"]) {
    return {
      client,
      space: await getSpaceFromMetadataFile(String(options["metadata-file"])),
    };
  }

  if (settings.requireSpaceSource) {
    throw new InputError("This command requires --space-url or --metadata-file");
  }

  if (needsApi || needsMetadataFile) {
    return { client };
  }

  return {
    client,
    space: createPlaceholderSpace(),
  };
}

function parseArgs(argv: string[]): ParsedArgs {
  const [command = "", ...rest] = argv;
  const options: Record<string, string | boolean> = {};

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith("--")) {
      throw new InputError(`Unexpected argument: ${token}`);
    }

    const key = token.slice(2);
    const next = rest[index + 1];
    if (!next || next.startsWith("--")) {
      options[key] = true;
      continue;
    }

    options[key] = next;
    index += 1;
  }

  return { command, options };
}

function getStringOption(
  options: Record<string, string | boolean>,
  key: string,
): string | undefined {
  const value = options[key];
  return typeof value === "string" ? value : undefined;
}

function printHelp() {
  process.stdout.write(`twspace-node

Usage:
  twspace-node download [options]
  twspace-node url [options]
  twspace-node playlist [options]
  twspace-node metadata [options]

Input options:
  --cookies <path>
  --space-url <url>
  --metadata-file <path>
  --master-url <url>
  --dynamic-url <url>

Download options:
  --output-template <template>
  --write-master-url <path>
  --write-playlist <path>
  --write-metadata <path>
  --keep-temp-files

Output options:
  --write <path>
`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Error: ${message}\n`);
  process.exitCode = 1;
});
