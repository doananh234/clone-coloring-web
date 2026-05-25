import { i18n } from "./setup";

export function registerTranslations(
  locale: string,
  namespace: string,
  resources: Record<string, unknown>,
): void {
  i18n.addResourceBundle(locale, namespace, resources, true, true);
}
