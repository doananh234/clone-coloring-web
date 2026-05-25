import React from "react";
import { I18nextProvider } from "react-i18next";
import { i18n } from "./setup";

type I18nProviderProps = {
  children: React.ReactNode;
  defaultLocale?: string;
};

export function I18nProvider({ children, defaultLocale }: I18nProviderProps) {
  if (defaultLocale && i18n.language !== defaultLocale) {
    i18n.changeLanguage(defaultLocale);
  }
  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}
