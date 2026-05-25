import { notify } from "./notify";
import { ApiError } from "../api/http-client";

const STATUS_TO_ERROR_KEY: Record<number, string> = {
  400: "errors:badRequest",
  401: "errors:unauthorized",
  403: "errors:forbidden",
  404: "errors:notFound",
  408: "errors:timeout",
  409: "errors:conflict",
  429: "errors:tooManyRequests",
  500: "errors:serverError",
};

/**
 * Show an error notification from an Error or ApiError.
 * Automatically maps HTTP status codes to i18n error messages.
 *
 * Usage:
 *   try { ... } catch (err) { notifyError(err); }
 */
export function notifyError(error: unknown): void {
  if (error instanceof ApiError) {
    const key = STATUS_TO_ERROR_KEY[error.status] ?? "errors:unknownError";
    notify.error(key);
    return;
  }

  if (error instanceof Error) {
    if (error.message === "Failed to fetch" || error.message === "NetworkError") {
      notify.error("errors:networkError");
      return;
    }
    notify.error(error.message);
    return;
  }

  notify.error("errors:unknownError");
}
