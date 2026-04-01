export interface TwitterCookies {
  authToken: string;
  ct0: string;
}

export interface CreateClientOptions {
  cookies: TwitterCookies;
}

export interface SpaceInfo {
  id: string;
  url: string;
  title: string;
  creatorName: string;
  creatorScreenName: string;
  creatorId: string;
  creatorProfileImageUrl: string;
  startDate: string;
  state: string;
  availableForReplay: boolean;
  mediaKey: string;
  rawMetadata?: unknown;
}

export interface ResolveMasterUrlOptions {
  client?: TwitterClient;
  space?: SpaceInfo;
  dynamicUrl?: string;
  masterUrl?: string;
}

export interface DownloadOptions {
  client?: TwitterClient;
  space?: SpaceInfo;
  dynamicUrl?: string;
  masterUrl?: string;
  outputTemplate?: string;
  ffmpegPath?: string;
  keepTempFiles?: boolean;
  tempRootDir?: string;
  onProgress?: (update: DownloadProgressUpdate) => void;
}

export interface DownloadResult {
  outputPath: string;
  masterUrl: string;
  tempDir?: string;
  playlistPath?: string;
}

export interface DownloadProgressUpdate {
  stage: "playlist" | "stitching" | "muxing";
  percent?: number;
  text: string;
}

export interface RawApiClient {
  getJson(path: string, params?: Record<string, string>): Promise<unknown>;
}

export interface TwitterClient {
  graphql: {
    audioSpaceById(spaceId: string): Promise<Record<string, unknown>>;
  };
  fleets: {
    avatarContent(...userIds: string[]): Promise<Record<string, unknown>>;
  };
  liveVideoStream: {
    status(mediaKey: string): Promise<Record<string, unknown>>;
  };
  http: {
    getText(url: string): Promise<string>;
  };
}
