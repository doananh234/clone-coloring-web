export type RequestContext = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: unknown;
};

export type ResponseContext = {
  status: number;
  data: unknown;
  headers: Headers;
};

export type Middleware = {
  onRequest?: (ctx: RequestContext) => RequestContext | Promise<RequestContext>;
  onResponse?: (ctx: ResponseContext) => ResponseContext | Promise<ResponseContext>;
  onError?: (error: Error) => void;
};

const middlewares: Middleware[] = [];

export function addMiddleware(middleware: Middleware): () => void {
  middlewares.push(middleware);
  return () => {
    const idx = middlewares.indexOf(middleware);
    if (idx >= 0) middlewares.splice(idx, 1);
  };
}

export async function runRequestMiddleware(ctx: RequestContext): Promise<RequestContext> {
  let result = ctx;
  for (const mw of middlewares) {
    if (mw.onRequest) result = await mw.onRequest(result);
  }
  return result;
}

export async function runResponseMiddleware(ctx: ResponseContext): Promise<ResponseContext> {
  let result = ctx;
  for (const mw of middlewares) {
    if (mw.onResponse) result = await mw.onResponse(result);
  }
  return result;
}

export function runErrorMiddleware(error: Error): void {
  for (const mw of middlewares) {
    if (mw.onError) mw.onError(error);
  }
}
