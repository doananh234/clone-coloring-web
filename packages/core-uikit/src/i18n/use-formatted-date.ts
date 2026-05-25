import { useCallback } from "react";
import { useTranslation } from "react-i18next";

type DateStyle = "full" | "long" | "medium" | "short";

export function useFormattedDate() {
  const { i18n } = useTranslation();
  const locale = i18n.language;

  const formatDate = useCallback(
    (date: Date | string | number, style: DateStyle = "medium") => {
      const d = date instanceof Date ? date : new Date(date);
      return new Intl.DateTimeFormat(locale, { dateStyle: style }).format(d);
    },
    [locale]
  );

  const formatDateTime = useCallback(
    (date: Date | string | number, dateStyle: DateStyle = "medium", timeStyle: DateStyle = "short") => {
      const d = date instanceof Date ? date : new Date(date);
      return new Intl.DateTimeFormat(locale, { dateStyle, timeStyle }).format(d);
    },
    [locale]
  );

  const formatRelative = useCallback(
    (date: Date | string | number) => {
      const d = date instanceof Date ? date : new Date(date);
      const diff = Date.now() - d.getTime();
      const seconds = Math.floor(diff / 1000);

      const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

      if (seconds < 60) return rtf.format(-seconds, "second");
      const minutes = Math.floor(seconds / 60);
      if (minutes < 60) return rtf.format(-minutes, "minute");
      const hours = Math.floor(minutes / 60);
      if (hours < 24) return rtf.format(-hours, "hour");
      const days = Math.floor(hours / 24);
      if (days < 30) return rtf.format(-days, "day");
      const months = Math.floor(days / 30);
      if (months < 12) return rtf.format(-months, "month");
      return rtf.format(-Math.floor(months / 12), "year");
    },
    [locale]
  );

  return { formatDate, formatDateTime, formatRelative };
}
