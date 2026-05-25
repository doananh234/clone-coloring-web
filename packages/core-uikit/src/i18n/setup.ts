import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import enCommon from "./locales/en/common.json";
import enErrors from "./locales/en/errors.json";
import enForms from "./locales/en/forms.json";

import viCommon from "./locales/vi/common.json";
import viErrors from "./locales/vi/errors.json";
import viForms from "./locales/vi/forms.json";

import jaCommon from "./locales/ja/common.json";
import jaErrors from "./locales/ja/errors.json";
import jaForms from "./locales/ja/forms.json";

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { common: enCommon, errors: enErrors, forms: enForms },
      vi: { common: viCommon, errors: viErrors, forms: viForms },
      ja: { common: jaCommon, errors: jaErrors, forms: jaForms },
    },
    defaultNS: "common",
    fallbackLng: "en",
    supportedLngs: ["en", "vi", "ja"],
    interpolation: { escapeValue: false },
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: "vx_locale",
      caches: ["localStorage"],
    },
  });

export { i18n };
