import { registerTranslations } from "@vx/core-uikit/i18n";
import enAuth from "./locales/en/auth.json";
import viAuth from "./locales/vi/auth.json";
import jaAuth from "./locales/ja/auth.json";

/**
 * Register auth module translations.
 * Call this once at app startup (before rendering).
 */
export function registerAuthTranslations(): void {
  registerTranslations("en", "auth", enAuth);
  registerTranslations("vi", "auth", viAuth);
  registerTranslations("ja", "auth", jaAuth);
}
