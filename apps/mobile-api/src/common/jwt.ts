import { SignJWT, jwtVerify, type JWTPayload } from "jose";

const encoder = new TextEncoder();
const AUD = "mobile";
export const ACCESS_TTL = "1h";
export const REFRESH_TTL = "30d";

export interface AuthClaims {
  sub: string;
  role: string;
  typ: "access" | "refresh";
}

function secret(): Uint8Array {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 16) throw new Error("JWT_SECRET missing or shorter than 16 chars");
  return encoder.encode(s);
}

async function sign(sub: string, role: string, typ: "access" | "refresh", ttl: string): Promise<string> {
  return new SignJWT({ role, typ })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(sub)
    .setAudience(AUD)
    .setIssuedAt()
    .setExpirationTime(ttl)
    .sign(secret());
}

export function signAccessToken(sub: string, role: string): Promise<string> {
  return sign(sub, role, "access", ACCESS_TTL);
}

export function signRefreshToken(sub: string, role: string): Promise<string> {
  return sign(sub, role, "refresh", REFRESH_TTL);
}

export async function verifyAuthToken(token: string, typ: "access" | "refresh"): Promise<AuthClaims> {
  const { payload } = await jwtVerify(token, secret(), { audience: AUD });
  const p = payload as JWTPayload & { role?: string; typ?: string };
  if (p.typ !== typ) throw new Error(`Expected ${typ} token`);
  if (typeof p.role !== "string") throw new Error("Invalid role claim");
  return { sub: String(p.sub), role: p.role, typ };
}
