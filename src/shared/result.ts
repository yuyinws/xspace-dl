import type { ApiResult, AppError } from './contracts'

export function ok<T>(data: T): ApiResult<T> {
  return { ok: true, data }
}

export function fail<T = never>(message: string, code = 'UNKNOWN_ERROR'): ApiResult<T> {
  return {
    ok: false,
    error: {
      code,
      message
    }
  }
}

export function toAppError(error: unknown): AppError {
  if (error instanceof Error) {
    return {
      code: error.name || 'UNKNOWN_ERROR',
      message: error.message
    }
  }

  return {
    code: 'UNKNOWN_ERROR',
    message: 'Unknown error'
  }
}
