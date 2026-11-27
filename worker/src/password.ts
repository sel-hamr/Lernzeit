/**
 * Password hashing with PBKDF2-SHA256. It uses only WebCrypto, `btoa` and `atob`, so the same code
 * runs in the Worker and in Node (`npm run cloud:owner` hashes the owner's password with it).
 */

/** The most iterations Workers' WebCrypto allows for PBKDF2; more throws. */
export const PBKDF2_ITERATIONS = 100_000
const SALT_BYTES = 16
const HASH_BITS = 256

export interface StoredPassword {
  /** Base64 of the 32-byte hash. */
  hash: string
  /** Base64 of the 16-byte salt. */
  salt: string
  iterations: number
}

/** Hashes a password with the given base64 salt, or a new random one. */
export async function hashPassword(password: string, saltB64?: string, iterations = PBKDF2_ITERATIONS): Promise<StoredPassword> {
  const salt = saltB64 === undefined ? crypto.getRandomValues(new Uint8Array(SALT_BYTES)) : fromBase64(saltB64)
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, HASH_BITS)
  return { hash: toBase64(new Uint8Array(bits)), salt: toBase64(salt), iterations }
}

/** Whether the password matches the stored hash. The comparison takes the same time wherever they differ. */
export async function verifyPassword(password: string, stored: StoredPassword): Promise<boolean> {
  const { hash } = await hashPassword(password, stored.salt, stored.iterations)
  return equalInConstantTime(fromBase64(hash), fromBase64(stored.hash))
}

function equalInConstantTime(a: Uint8Array, b: Uint8Array): boolean {
  let difference = a.length ^ b.length
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ (b[i % b.length] ?? 0)
  return difference === 0
}

function toBase64(bytes: Uint8Array): string {
  let text = ''
  for (const byte of bytes) text += String.fromCharCode(byte)
  return btoa(text)
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}
