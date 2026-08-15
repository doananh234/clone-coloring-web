import { type CanActivate, type ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { IS_PUBLIC_KEY } from "./public.decorator";
import { verifyAuthToken } from "./jwt";

interface AuthedRequest {
  headers: Record<string, string | undefined>;
  auth?: { sub: string; role: string };
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const header = req.headers["authorization"];
    if (header?.startsWith("Bearer ")) {
      try {
        const claims = await verifyAuthToken(header.slice(7), "access");
        req.auth = { sub: claims.sub, role: claims.role };
        return true;
      } catch {
        throw new UnauthorizedException("Invalid token");
      }
    }

    if (process.env.NODE_ENV !== "production") {
      const id = req.headers["x-user-id"];
      if (id) {
        req.auth = { sub: id, role: "user" };
        return true;
      }
    }

    throw new UnauthorizedException("Missing authentication");
  }
}
