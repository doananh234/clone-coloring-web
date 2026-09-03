// Minimal typings for the untyped `potrace` package (only what we use).
declare module "potrace" {
  export function trace(
    input: Buffer | string,
    options: Record<string, unknown>,
    cb: (err: Error | null, svg: string) => void,
  ): void;
}
