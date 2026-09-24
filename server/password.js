import { hash, verify } from '@node-rs/argon2';
import { randomBytes, createHash } from 'node:crypto';
import { fail } from './http.js';

export function username(value) {
  if (typeof value !== 'string') fail(400, 'INVALID_USERNAME');
  const normalized = value.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_.-]{2,31}$/.test(normalized)) fail(400, 'INVALID_USERNAME');
  return normalized;
}
export function validatePassword(value) {
  if (
    typeof value !== 'string' ||
    [...value].length < 15 ||
    [...value].length > 128 ||
    Buffer.byteLength(value) > 512
  )
    fail(400, 'INVALID_PASSWORD');
  return value;
}
export const hashPassword = (value) =>
  hash(validatePassword(value), {
    algorithm: 2,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
    outputLen: 32,
  });
export const verifyPassword = (encoded, value) => verify(encoded, value);
export const secretToken = () => randomBytes(32).toString('base64url');
export const tokenHash = (token) => createHash('sha256').update(token).digest('hex');
let dummy;
export const dummyHash = () => (dummy ||= hashPassword(secretToken()));
