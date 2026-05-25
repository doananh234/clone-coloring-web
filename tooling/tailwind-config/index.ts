// Shared Tailwind CSS v4 preset for all VX packages and apps.
// In Tailwind v4, configuration is done via CSS @theme directives.
// This file exports shared theme tokens for programmatic use.

export const colors = {
  primary: "hsl(var(--primary))",
  secondary: "hsl(var(--secondary))",
  destructive: "hsl(var(--destructive))",
  muted: "hsl(var(--muted))",
  accent: "hsl(var(--accent))",
  background: "hsl(var(--background))",
  foreground: "hsl(var(--foreground))",
  border: "hsl(var(--border))",
} as const;
