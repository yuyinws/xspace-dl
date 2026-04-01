export class TwspaceNodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class InputError extends TwspaceNodeError {}

export class AuthenticationError extends TwspaceNodeError {}

export class ApiError extends TwspaceNodeError {}

export class UnsupportedFeatureError extends TwspaceNodeError {}

export class ResourceUnavailableError extends TwspaceNodeError {}

export class FfmpegError extends TwspaceNodeError {}
