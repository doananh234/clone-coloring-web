import { useTranslation } from "react-i18next";

type UseLocaleReturn = {
  locale: string;
  setLocale: (locale: string) => Promise<void>;
  supportedLocales: { code: string; label: string }[];
};

export function useLocale(): UseLocaleReturn {
  const { i18n } = useTranslation();

  const supportedLocales = [
    { code: "en", label: "English" },
    { code: "vi", label: "Tiếng Việt" },
    { code: "ja", label: "日本語" },
  ];

  const setLocale = async (locale: string) => {
    await i18n.changeLanguage(locale);
    localStorage.setItem("vx_locale", locale);
  };

  return {
    locale: i18n.language,
    setLocale,
    supportedLocales,
  };
}
