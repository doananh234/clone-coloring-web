import bcrypt from "bcryptjs";

const ROUNDS = 10;

export function hashPassword(pw: string): Promise<string> {
  return bcrypt.hash(pw, ROUNDS);
}

export function verifyPassword(pw: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pw, hash);
}
