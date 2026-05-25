import { toast, type ExternalToast } from "sonner";
import i18n from "i18next";
import { notificationStore } from "./store";

type NotifyOptions = ExternalToast & {
  /** i18n key for description (from "errors" or "common" namespace) */
  descriptionKey?: string;
  /** Interpolation params for i18n */
  descriptionParams?: Record<string, string | number>;
  /** If true, show toast only — don't add to notification bell store */
  silent?: boolean;
};

/**
 * Unified notification API.
 *
 * Usage:
 *   notify.success("User created")
 *   notify.error("errors:networkError")    // auto-translates i18n keys with ":"
 *   notify.info("Check your email")
 *   notify.warning("Session expiring soon")
 *   notify.promise(fetchData(), { loading: "Loading...", success: "Done", error: "Failed" })
 */
function resolveMessage(message: string): string {
  // If message contains ":", treat as i18n namespace:key
  if (message.includes(":") && i18n.isInitialized) {
    const translated = i18n.t(message);
    if (translated !== message) return translated;
  }
  return message;
}

export const notify = {
  success(message: string, options?: NotifyOptions) {
    const title = resolveMessage(message);
    const description = options?.descriptionKey
      ? resolveMessage(options.descriptionKey)
      : options?.description;
    toast.success(title, { ...options, description });
    if (!options?.silent)
      notificationStore.add({
        type: "success",
        title,
        description: typeof description === "string" ? description : undefined,
      });
  },

  error(message: string, options?: NotifyOptions) {
    const title = resolveMessage(message);
    const description = options?.descriptionKey
      ? resolveMessage(options.descriptionKey)
      : options?.description;
    toast.error(title, { ...options, description });
    if (!options?.silent)
      notificationStore.add({
        type: "error",
        title,
        description: typeof description === "string" ? description : undefined,
      });
  },

  info(message: string, options?: NotifyOptions) {
    const title = resolveMessage(message);
    const description = options?.descriptionKey
      ? resolveMessage(options.descriptionKey)
      : options?.description;
    toast.info(title, { ...options, description });
    if (!options?.silent)
      notificationStore.add({
        type: "info",
        title,
        description: typeof description === "string" ? description : undefined,
      });
  },

  warning(message: string, options?: NotifyOptions) {
    const title = resolveMessage(message);
    const description = options?.descriptionKey
      ? resolveMessage(options.descriptionKey)
      : options?.description;
    toast.warning(title, { ...options, description });
    if (!options?.silent)
      notificationStore.add({
        type: "warning",
        title,
        description: typeof description === "string" ? description : undefined,
      });
  },

  loading(message: string, options?: NotifyOptions) {
    return toast.loading(resolveMessage(message), options);
  },

  dismiss(id?: string | number) {
    toast.dismiss(id);
  },

  promise<T>(
    promise: Promise<T>,
    messages: {
      loading: string;
      success: string | ((data: T) => string);
      error: string | ((err: unknown) => string);
    },
  ) {
    return toast.promise(promise, {
      loading: resolveMessage(messages.loading),
      success:
        typeof messages.success === "string"
          ? resolveMessage(messages.success)
          : (data: T) => (resolveMessage as any)(messages.success)(data) as string,
      error:
        typeof messages.error === "string"
          ? resolveMessage(messages.error)
          : (err: unknown) => {
              const msg = (messages.error as (e: unknown) => string)(err);
              return resolveMessage(msg);
            },
    });
  },
};
