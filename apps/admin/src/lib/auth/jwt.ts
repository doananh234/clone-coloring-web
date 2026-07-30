import { SignJWT, jwtVerify } from "jose";

export interface SessionClaims {
  sub: string;
  username: string;
  role: string;
  name: string;
}

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_JWT_SECRET;
  if (!secret) throw new Error("AUTH_JWT_SECRET is not set");
  return new TextEncoder().encode(secret);
}

export async function signSessionToken(claims: SessionClaims): Promise<string> {
  return new SignJWT({ username: claims.username, role: claims.role, name: claims.name })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(secretKey());
}

export async function verifySessionToken(token: string): Promise<SessionClaims> {
  const { payload } = await jwtVerify(token, secretKey());
  return {
    sub: String(payload.sub ?? ""),
    username: String(payload.username ?? ""),
    role: String(payload.role ?? ""),
    name: String(payload.name ?? ""),
  };
}
