import { appendFile, mkdtemp, mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import {
  FfmpegError,
  InputError,
  ResourceUnavailableError,
  UnsupportedFeatureError,
} from "./errors.js";
import { formatOutputPath } from "./format.js";
import { createPlaceholderSpace, ensureEndedReplayableSpace } from "./space.js";
import type {
  DownloadProgressUpdate,
  DownloadOptions,
  DownloadResult,
  ResolveMasterUrlOptions,
  SpaceInfo,
  TwitterClient,
} from "./types.js";

export async function resolveDynamicUrl(options: {
  client?: TwitterClient;
  space?: SpaceInfo;
  dynamicUrl?: string;
}): Promise<string> {
  if (options.dynamicUrl) {
    return options.dynamicUrl;
  }

  if (!options.client) {
    throw new InputError("Cookies are required to resolve dynamic URL");
  }

  if (!options.space) {
    throw new InputError("Space metadata is required to resolve dynamic URL");
  }

  ensureEndedReplayableSpace(options.space);
  if (!options.space.mediaKey) {
    throw new InputError("Space media key is missing");
  }

  const metadata = await options.client.liveVideoStream.status(options.space.mediaKey);
  const dynamicUrl = readNestedString(metadata, ["source", "location"]);
  if (!dynamicUrl) {
    throw new ResourceUnavailableError("Dynamic playlist URL is not available");
  }
  return dynamicUrl;
}

export async function resolveMasterUrl(
  options: ResolveMasterUrlOptions,
): Promise<string> {
  if (options.masterUrl) {
    return options.masterUrl;
  }

  const dynamicUrl = await resolveDynamicUrl({
    client: options.client,
    space: options.space,
    dynamicUrl: options.dynamicUrl,
  });

  return dynamicUrl.replace(/(?<=\/audio-space\/).*/, "master_playlist.m3u8");
}

export async function fetchPlaylistUrl(
  client: TwitterClient,
  masterUrl: string,
): Promise<string> {
  const masterText = await client.http.getText(masterUrl);
  const playlistSuffix = masterText.split(/\r?\n/)[3]?.trim();
  if (!playlistSuffix) {
    throw new ResourceUnavailableError("Playlist URL is missing from master playlist");
  }

  return new URL(playlistSuffix, masterUrl).toString();
}

export async function fetchPlaylistText(
  client: TwitterClient,
  masterUrl: string,
): Promise<string> {
  const playlistUrl = await fetchPlaylistUrl(client, masterUrl);
  const playlistText = await client.http.getText(playlistUrl);
  const masterBase = masterUrl.replace(/master_playlist\.m3u8.*$/, "");
  return playlistText.replace(/^chunk/gm, `${masterBase}chunk`);
}

export async function downloadEndedSpace(
  options: DownloadOptions,
): Promise<DownloadResult> {
  const space = options.space ?? createPlaceholderSpace();
  if (space.state === "Running") {
    throw new UnsupportedFeatureError("Live spaces are not supported in node v1");
  }

  if (!options.masterUrl && !options.dynamicUrl) {
    ensureEndedReplayableSpace(space);
  }

  if (!options.client) {
    throw new InputError(
      "A client is required unless you provide a fully resolved master URL",
    );
  }

  const masterUrl = await resolveMasterUrl({
    client: options.client,
    space,
    dynamicUrl: options.dynamicUrl,
    masterUrl: options.masterUrl,
  });

  const playlistText = await fetchPlaylistText(options.client, masterUrl);
  const totalDurationSeconds = getPlaylistDurationSeconds(playlistText);
  const outputBase = formatOutputPath(options.outputTemplate, space);
  const outputPath = `${outputBase}.m4a`;
  const tempRoot = options.tempRootDir ?? os.tmpdir();
  const tempDir = await mkdtemp(path.join(tempRoot, "twspace-node-"));
  const playlistPath = path.join(tempDir, `${path.basename(outputBase)}.m3u8`);
  const stitchedAudioPath = path.join(tempDir, `${path.basename(outputBase)}.aac`);
  const tempOutputPath = path.join(tempDir, `${path.basename(outputBase)}.m4a`);

  await writeFile(playlistPath, playlistText, "utf8");
  await mkdir(path.dirname(outputPath), { recursive: true });

  try {
    const ffmpegPath = options.ffmpegPath ?? "ffmpeg";
    options.onProgress?.({
      stage: "playlist",
      percent: 0,
      text: "Prepared playlist",
    });

    try {
      await runFfmpeg({
        ffmpegPath,
        playlistPath,
        outputPath: tempOutputPath,
        space,
        totalDurationSeconds,
        onProgress: options.onProgress,
      });
    } catch (error) {
      if (!(error instanceof FfmpegError) || !shouldFallbackToStitchedAudio(error)) {
        throw error;
      }

      await stitchPlaylistAudio(playlistText, stitchedAudioPath, options.onProgress);
      await runFfmpegForStitchedAudio({
        ffmpegPath,
        inputPath: stitchedAudioPath,
        outputPath: tempOutputPath,
        space,
        totalDurationSeconds,
        onProgress: options.onProgress,
      });
    }

    await rename(tempOutputPath, outputPath);
  } finally {
    if (!options.keepTempFiles) {
      await rm(tempDir, { recursive: true, force: true });
    }
  }

  return {
    outputPath,
    masterUrl,
    tempDir: options.keepTempFiles ? tempDir : undefined,
    playlistPath: options.keepTempFiles ? playlistPath : undefined,
  };
}

async function runFfmpeg(input: {
  ffmpegPath: string;
  playlistPath: string;
  outputPath: string;
  space: SpaceInfo;
  totalDurationSeconds: number;
  onProgress?: (update: DownloadProgressUpdate) => void;
}): Promise<void> {
  await executeFfmpeg(input.ffmpegPath, [
    "-y",
    "-stats",
    "-v",
    "warning",
    "-protocol_whitelist",
    "file,https,httpproxy,tls,tcp",
    "-i",
    input.playlistPath,
    "-c",
    "copy",
    "-metadata",
    `title=${input.space.title}`,
    "-metadata",
    `artist=${input.space.creatorName}`,
    "-metadata",
    `episode_id=${input.space.id}`,
    input.outputPath,
  ], {
    totalDurationSeconds: input.totalDurationSeconds,
    onProgress: input.onProgress,
    stage: "muxing",
  });
}

async function runFfmpegForStitchedAudio(input: {
  ffmpegPath: string;
  inputPath: string;
  outputPath: string;
  space: SpaceInfo;
  totalDurationSeconds: number;
  onProgress?: (update: DownloadProgressUpdate) => void;
}): Promise<void> {
  await executeFfmpeg(input.ffmpegPath, [
    "-y",
    "-stats",
    "-v",
    "warning",
    "-f",
    "aac",
    "-i",
    input.inputPath,
    "-c:a",
    "copy",
    "-metadata",
    `title=${input.space.title}`,
    "-metadata",
    `artist=${input.space.creatorName}`,
    "-metadata",
    `episode_id=${input.space.id}`,
    input.outputPath,
  ], {
    totalDurationSeconds: input.totalDurationSeconds,
    onProgress: input.onProgress,
    stage: "muxing",
  });
}

async function executeFfmpeg(
  ffmpegPath: string,
  args: string[],
  progress?: {
    totalDurationSeconds: number;
    onProgress?: (update: DownloadProgressUpdate) => void;
    stage: DownloadProgressUpdate["stage"];
  },
): Promise<void> {
  const resolvedFfmpegPath = await resolveFfmpegExecutablePath(ffmpegPath);

  await new Promise<void>((resolve, reject) => {
    const child = spawn(resolvedFfmpegPath, args, {
      stdio: ["ignore", "inherit", "pipe"],
    });

    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      stderr += text;
      process.stderr.write(chunk);
      if (progress) {
        emitFfmpegProgress(text, progress);
      }
    });

    child.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        reject(new FfmpegError("ffmpeg not installed"));
        return;
      }
      if (error.code === "UNKNOWN") {
        reject(
          new FfmpegError(
            `Unable to start ffmpeg at "${resolvedFfmpegPath}". Check that the selected path points to ffmpeg.exe and that Windows can execute it.`,
          ),
        );
        return;
      }
      reject(new FfmpegError(`${error.message} (${resolvedFfmpegPath})`));
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new FfmpegError(
          `ffmpeg failed with exit code ${code}${stderr ? `: ${stderr.trim()}` : ""}`,
        ),
      );
    });
  });
}

export async function resolveFfmpegExecutablePath(ffmpegPath: string): Promise<string> {
  const normalizedPath = normalizeExecutablePath(ffmpegPath);
  if (normalizedPath === "ffmpeg") {
    return normalizedPath;
  }

  try {
    const file = await stat(normalizedPath);
    if (!file.isFile()) {
      throw new FfmpegError(`ffmpeg path is not a file: ${normalizedPath}`);
    }
    return normalizedPath;
  } catch (error) {
    if (error instanceof FfmpegError) {
      throw error;
    }

    throw new FfmpegError(`ffmpeg binary not found at: ${normalizedPath}`);
  }
}

export function normalizeExecutablePath(ffmpegPath: string): string {
  const trimmedPath = ffmpegPath.trim();
  if (!trimmedPath) {
    return "ffmpeg";
  }

  return trimmedPath.replace(/^"(.*)"$/, "$1");
}

async function stitchPlaylistAudio(
  playlistText: string,
  outputPath: string,
  onProgress?: (update: DownloadProgressUpdate) => void,
): Promise<void> {
  await writeFile(outputPath, Buffer.alloc(0));

  const chunkUrls = getChunkUrls(playlistText);
  const totalChunks = chunkUrls.length;

  for (const [index, chunkUrl] of chunkUrls.entries()) {
    const response = await fetch(chunkUrl);
    if (!response.ok) {
      throw new ResourceUnavailableError(
        `Audio chunk request failed with HTTP ${response.status}: ${chunkUrl}`,
      );
    }

    const chunkBuffer = Buffer.from(await response.arrayBuffer());
    const audioPayload = stripLeadingId3Tags(chunkBuffer);
    await appendFile(outputPath, audioPayload);

    onProgress?.({
      stage: "stitching",
      percent: totalChunks > 0 ? Math.round(((index + 1) / totalChunks) * 100) : undefined,
      text: `Downloading audio chunks ${index + 1}/${totalChunks}`,
    });
  }
}

export function stripLeadingId3Tags(input: Buffer): Buffer {
  let offset = 0;

  while (offset + 10 <= input.length && input.toString("ascii", offset, offset + 3) === "ID3") {
    const flags = input[offset + 5] ?? 0;
    const tagSize = readSyncSafeInteger(input.subarray(offset + 6, offset + 10));
    const footerSize = flags & 0x10 ? 10 : 0;
    offset += 10 + tagSize + footerSize;
  }

  return offset > 0 ? input.subarray(offset) : input;
}

function readSyncSafeInteger(bytes: Buffer): number {
  if (bytes.length !== 4) {
    return 0;
  }

  return (
    ((bytes[0] ?? 0) << 21) |
    ((bytes[1] ?? 0) << 14) |
    ((bytes[2] ?? 0) << 7) |
    (bytes[3] ?? 0)
  );
}

function shouldFallbackToStitchedAudio(error: FfmpegError): boolean {
  return /Changing ID3 metadata in HLS audio elementary stream/i.test(error.message);
}

function getChunkUrls(playlistText: string): string[] {
  return playlistText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}

function getPlaylistDurationSeconds(playlistText: string): number {
  return playlistText
    .split(/\r?\n/)
    .map((line) => line.match(/^#EXTINF:([\d.]+)/)?.[1])
    .reduce((total, value) => total + Number(value ?? 0), 0);
}

function emitFfmpegProgress(
  chunkText: string,
  input: {
    totalDurationSeconds: number;
    onProgress?: (update: DownloadProgressUpdate) => void;
    stage: DownloadProgressUpdate["stage"];
  },
): void {
  const lines = chunkText.split(/\r?\n/);

  for (const line of lines) {
    const timeMatch = /time=(\d{2}:\d{2}:\d{2}\.\d{2})/.exec(line);
    if (!timeMatch) {
      continue;
    }

    const currentSeconds = parseTimestampToSeconds(timeMatch[1]);
    const percent =
      input.totalDurationSeconds > 0
        ? Math.max(
            0,
            Math.min(100, Math.round((currentSeconds / input.totalDurationSeconds) * 100)),
          )
        : undefined;
    const speed = /speed=\s*([^\s]+)/.exec(line)?.[1];
    const percentLabel = typeof percent === "number" ? `${percent}%` : formatSeconds(currentSeconds);
    const speedLabel = speed ? ` at ${speed}` : "";

    input.onProgress?.({
      stage: input.stage,
      percent,
      text: `Downloading audio ${percentLabel}${speedLabel}`,
    });
  }
}

function parseTimestampToSeconds(value: string): number {
  const match = /^(\d{2}):(\d{2}):(\d{2}\.\d{2})$/.exec(value);
  if (!match) {
    return 0;
  }

  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

function formatSeconds(value: number): string {
  const wholeSeconds = Math.max(0, Math.round(value));
  const minutes = Math.floor(wholeSeconds / 60);
  const seconds = wholeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function readNestedString(
  root: unknown,
  pathSegments: string[],
): string {
  let current: unknown = root;
  for (const segment of pathSegments) {
    if (!current || typeof current !== "object" || !(segment in current)) {
      return "";
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return typeof current === "string" ? current : "";
}
