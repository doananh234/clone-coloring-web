import "@fortawesome/fontawesome-svg-core/styles.css";
import { config } from "@fortawesome/fontawesome-svg-core";
config.autoAddCss = false;

import type { Metadata } from "next";
import "./globals.css";
import { I18nSetup } from "./i18n-setup";

export const metadata: Metadata = {
  title: "VX Admin",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <I18nSetup>{children}</I18nSetup>
      </body>
    </html>
  );
}
