export type ApiErrorType =
  | "NetworkError"
  | "BadRequest"
  | "Unauthorized"
  | "Forbidden"
  | "NotFound"
  | "Conflict"
  | "TooManyRequests"
  | "ServerError"
  | "Timeout"
  | "Unknown";

export function classifyError(status: number): ApiErrorType {
  const map: Record<number, ApiErrorType> = {
    400: "BadRequest",
    401: "Unauthorized",
    403: "Forbidden",
    404: "NotFound",
    408: "Timeout",
    409: "Conflict",
    429: "TooManyRequests",
    500: "ServerError",
  };
  return map[status] ?? "Unknown";
}
