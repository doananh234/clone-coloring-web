"use client";

import React from "react";
import { I18nProvider, registerTranslations } from "@vx/core-uikit/i18n";
import { registerAuthTranslations } from "@vx/auth-module/i18n";
import { reportWebVitals } from "@vx/core-uikit/performance";

// Import all locale files
import enUsers from "@/i18n/locales/en/users.json";
import viUsers from "@/i18n/locales/vi/users.json";
import jaUsers from "@/i18n/locales/ja/users.json";
import enDashboard from "@/i18n/locales/en/dashboard.json";
import viDashboard from "@/i18n/locales/vi/dashboard.json";
import jaDashboard from "@/i18n/locales/ja/dashboard.json";
import enBooks from "@/i18n/locales/en/books.json";
import viBooks from "@/i18n/locales/vi/books.json";
import jaBooks from "@/i18n/locales/ja/books.json";
import enCategories from "@/i18n/locales/en/categories.json";
import viCategories from "@/i18n/locales/vi/categories.json";
import jaCategories from "@/i18n/locales/ja/categories.json";
import enAppHome from "@/i18n/locales/en/app-home.json";
import viAppHome from "@/i18n/locales/vi/app-home.json";
import jaAppHome from "@/i18n/locales/ja/app-home.json";
import enPurchases from "@/i18n/locales/en/purchases.json";
import viPurchases from "@/i18n/locales/vi/purchases.json";
import jaPurchases from "@/i18n/locales/ja/purchases.json";
import enWallets from "@/i18n/locales/en/wallets.json";
import viWallets from "@/i18n/locales/vi/wallets.json";
import jaWallets from "@/i18n/locales/ja/wallets.json";
import enCreditLedger from "@/i18n/locales/en/credit-ledger.json";
import viCreditLedger from "@/i18n/locales/vi/credit-ledger.json";
import jaCreditLedger from "@/i18n/locales/ja/credit-ledger.json";

let initialized = false;

function initTranslations() {
  if (initialized) return;
  initialized = true;

  registerAuthTranslations();
  registerTranslations("en", "users", enUsers);
  registerTranslations("vi", "users", viUsers);
  registerTranslations("ja", "users", jaUsers);
  registerTranslations("en", "dashboard", enDashboard);
  registerTranslations("vi", "dashboard", viDashboard);
  registerTranslations("ja", "dashboard", jaDashboard);
  registerTranslations("en", "books", enBooks);
  registerTranslations("vi", "books", viBooks);
  registerTranslations("ja", "books", jaBooks);
  registerTranslations("en", "categories", enCategories);
  registerTranslations("vi", "categories", viCategories);
  registerTranslations("ja", "categories", jaCategories);
  registerTranslations("en", "appHome", enAppHome);
  registerTranslations("vi", "appHome", viAppHome);
  registerTranslations("ja", "appHome", jaAppHome);
  registerTranslations("en", "purchases", enPurchases);
  registerTranslations("vi", "purchases", viPurchases);
  registerTranslations("ja", "purchases", jaPurchases);
  registerTranslations("en", "wallets", enWallets);
  registerTranslations("vi", "wallets", viWallets);
  registerTranslations("ja", "wallets", jaWallets);
  registerTranslations("en", "creditLedger", enCreditLedger);
  registerTranslations("vi", "creditLedger", viCreditLedger);
  registerTranslations("ja", "creditLedger", jaCreditLedger);

  if (typeof window !== "undefined") {
    reportWebVitals();
  }
}

export function I18nSetup({ children }: { children: React.ReactNode }) {
  initTranslations();
  return <I18nProvider defaultLocale="en">{children}</I18nProvider>;
}
