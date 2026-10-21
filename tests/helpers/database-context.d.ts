import "vitest";

declare module "vitest" {
  interface ProvidedContext {
    pgliteSnapshot: string;
  }
}
