import type { ApiResult } from '@shared/contracts'
import { fail, toAppError } from '@shared/result'

export async function invokeIpc<TResult>(
  handler: () => Promise<ApiResult<TResult>>
): Promise<ApiResult<TResult>> {
  try {
    return await handler()
  } catch (error) {
    const appError = toAppError(error)
    return fail<TResult>(appError.message, appError.code)
  }
}
