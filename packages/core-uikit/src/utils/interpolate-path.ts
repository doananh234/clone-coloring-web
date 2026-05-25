export function interpolatePath(
  template: string,
  params: Record<string, string>
): string {
  return template.replace(/:([a-zA-Z_]+)/g, (_, key) => {
    const value = params[key];
    if (value === undefined) {
      throw new Error(`Missing path parameter: ${key}`);
    }
    return encodeURIComponent(value);
  });
}
