import { readFile } from "node:fs/promises";

import {
  InputError,
  ResourceUnavailableError,
  UnsupportedFeatureError,
} from "./errors.js";
import type { SpaceInfo, TwitterClient } from "./types.js";

export function extractSpaceId(spaceUrl: string): string {
  const match = /(?:https?:\/\/)?x\.com\/i\/spaces\/(\w+)/.exec(spaceUrl.trim());
  if (!match) {
    throw new InputError(
      "Invalid space URL. Expected format: https://x.com/i/spaces/<space_id>",
    );
  }
  return match[1];
}

export async function getSpaceFromUrl(
  client: TwitterClient,
  spaceUrl: string,
): Promise<SpaceInfo> {
  const spaceId = extractSpaceId(spaceUrl);
  const metadata = await client.graphql.audioSpaceById(spaceId);
  return getSpaceFromMetadata(metadata);
}

export function getSpaceFromMetadata(metadata: unknown): SpaceInfo {
  const root = getAudioSpaceMetadata(metadata);
  const creator = getCreatorResult(root.creator_results);

  const startedAt = readText(root.started_at);
  if (!startedAt) {
    const scheduledStart = readText(root.scheduled_start);
    if (scheduledStart) {
      const formatted = new Date(Number(scheduledStart)).toISOString();
      throw new InputError(`Space should start at ${formatted}, try again later`);
    }
    throw new InputError("Space start time is not available");
  }

  const startDate = new Date(Number(startedAt)).toISOString().slice(0, 10);

  return {
    id: readText(root.rest_id),
    url: `https://x.com/i/spaces/${readText(root.rest_id)}`,
    title: readText(root.title),
    creatorName: readText(creator?.legacy?.name),
    creatorScreenName: readText(creator?.legacy?.screen_name),
    creatorId: readText(creator?.rest_id),
    creatorProfileImageUrl: readText(creator?.legacy?.profile_image_url_https),
    startDate,
    state: readText(root.state),
    availableForReplay: Boolean(root.is_space_available_for_replay),
    mediaKey: readText(root.media_key),
    rawMetadata: metadata,
  };
}

export async function getSpaceFromMetadataFile(path: string): Promise<SpaceInfo> {
  const content = await readFile(path, "utf8");
  return getSpaceFromMetadata(JSON.parse(content));
}

export function createPlaceholderSpace(): SpaceInfo {
  return {
    id: "",
    url: "",
    title: "",
    creatorName: "",
    creatorScreenName: "",
    creatorId: "",
    creatorProfileImageUrl: "",
    startDate: "",
    state: "Ended",
    availableForReplay: true,
    mediaKey: "",
  };
}

export function ensureEndedReplayableSpace(space: SpaceInfo): void {
  if (space.state === "Running") {
    throw new UnsupportedFeatureError("Live spaces are not supported in node v1");
  }

  if (space.state === "Ended" && !space.availableForReplay) {
    throw new ResourceUnavailableError(
      "Space has ended and is not available for replay",
    );
  }
}

function getAudioSpaceMetadata(metadata: unknown): Record<string, unknown> {
  const root =
    metadata &&
    typeof metadata === "object" &&
    "data" in metadata &&
    metadata.data &&
    typeof metadata.data === "object" &&
    "audioSpace" in metadata.data &&
    metadata.data.audioSpace &&
    typeof metadata.data.audioSpace === "object" &&
    "metadata" in metadata.data.audioSpace &&
    metadata.data.audioSpace.metadata;

  if (!root || typeof root !== "object") {
    throw new InputError("Audio space metadata is missing");
  }

  if (!("media_key" in root)) {
    throw new InputError("Media key is not available");
  }

  return root as Record<string, unknown>;
}

function getCreatorResult(creatorResults: unknown):
  | {
      rest_id?: unknown;
      legacy?: Record<string, unknown>;
    }
  | undefined {
  if (
    creatorResults &&
    typeof creatorResults === "object" &&
    "result" in creatorResults &&
    creatorResults.result &&
    typeof creatorResults.result === "object"
  ) {
    return creatorResults.result as {
      rest_id?: unknown;
      legacy?: Record<string, unknown>;
    };
  }
  return undefined;
}

function readText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "bigint") {
    return String(value);
  }

  return "";
}
