export function createMcpError(code: number, message: string, data?: unknown): Error {
  const error = new Error(message) as Error & {code?: number; data?: unknown}
  error.code = code
  if (data) error.data = data
  return error
}
