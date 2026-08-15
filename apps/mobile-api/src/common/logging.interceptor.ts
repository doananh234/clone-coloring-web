import { type CallHandler, type ExecutionContext, Injectable, type NestInterceptor } from "@nestjs/common";
import type { Observable } from "rxjs";
import { tap } from "rxjs/operators";

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest<{ method: string; url: string }>();
    const start = performance.now();
    return next.handle().pipe(
      tap(() => {
        const ms = Math.round(performance.now() - start);
        // eslint-disable-next-line no-console
        console.log(`[mobile-api] ${req.method} ${req.url} ${ms}ms`);
      }),
    );
  }
}
