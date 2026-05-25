import { useCallback } from "react";
import { useTranslation } from "react-i18next";

export function useFormattedNumber() {
  const { i18n } = useTranslation();
  const locale = i18n.language;

  const formatNumber = useCallback(
    (value: number, options?: Intl.NumberFormatOptions) => {
      return new Intl.NumberFormat(locale, options).format(value);
    },
    [locale]
  );

  const formatCurrency = useCallback(
    (value: number, currency = "USD") => {
      return new Intl.NumberFormat(locale, {
        style: "currency",
        currency,
      }).format(value);
    },
    [locale]
  );

  const formatPercent = useCallback(
    (value: number, decimals = 1) => {
      return new Intl.NumberFormat(locale, {
        style: "percent",
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }).format(value);
    },
    [locale]
  );

  const formatCompact = useCallback(
    (value: number) => {
      return new Intl.NumberFormat(locale, { notation: "compact" }).format(value);
    },
    [locale]
  );

  return { formatNumber, formatCurrency, formatPercent, formatCompact };
}
