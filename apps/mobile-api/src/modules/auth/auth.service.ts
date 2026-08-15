import { ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";

import { PrismaService } from "../../prisma/prisma.service";
import { hashPassword, verifyPassword } from "../../common/password";
import { signAccessToken, signRefreshToken, verifyAuthToken } from "../../common/jwt";
import type { LoginDto, RefreshDto, RegisterDto } from "./dto";

export interface PublicUser {
  id: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
  role: string;
  createdAt: Date;
}

interface AuthResult {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  private toPublicUser(u: {
    id: string; email: string | null; name: string | null;
    avatarUrl: string | null; role: string; createdAt: Date;
  }): PublicUser {
    return { id: u.id, email: u.email, name: u.name, avatarUrl: u.avatarUrl, role: u.role, createdAt: u.createdAt };
  }

  async register(dto: RegisterDto): Promise<AuthResult> {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException("Email already registered");
    const user = await this.prisma.user.create({
      data: { email: dto.email, name: dto.name ?? null, passwordHash: await hashPassword(dto.password) },
    });
    return this.issue(user);
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user?.passwordHash || !(await verifyPassword(dto.password, user.passwordHash))) {
      throw new UnauthorizedException("Invalid credentials");
    }
    return this.issue(user);
  }

  async refresh(dto: RefreshDto): Promise<{ accessToken: string }> {
    let claims;
    try {
      claims = await verifyAuthToken(dto.refreshToken, "refresh");
    } catch {
      throw new UnauthorizedException("Invalid refresh token");
    }
    return { accessToken: await signAccessToken(claims.sub, claims.role) };
  }

  private async issue(u: {
    id: string; email: string | null; name: string | null;
    avatarUrl: string | null; role: string; createdAt: Date;
  }): Promise<AuthResult> {
    return {
      user: this.toPublicUser(u),
      accessToken: await signAccessToken(u.id, u.role),
      refreshToken: await signRefreshToken(u.id, u.role),
    };
  }
}
