import { describe, expect, it } from 'vitest'
import { hashPassword, verifyPassword } from '../worker/src/password.ts'
import { checkEmail, checkPassword, ownerFromEnv, ownerSql, wranglerArgs } from './cloud-owner.ts'

const FIXED_SALT = 'AAECAwQFBgcICQoLDA0ODw==' // the bytes 0..15
// The same constant is asserted in worker/test/auth.test.ts inside Workers, so both runtimes agree.
const FIXED_HASH = 'ecl4blu17pBoxkrH63Kux00yUmxC0OKrKmdgPsjX0+A='

describe('password hashing in Node', () => {
  it('makes a known hash for a fixed salt, and verifyPassword accepts it', async () => {
    const stored = await hashPassword('correct horse 1', FIXED_SALT)
    expect(stored).toEqual({ hash: FIXED_HASH, salt: FIXED_SALT, iterations: 100_000 })
    expect(await verifyPassword('correct horse 1', stored)).toBe(true)
    expect(await verifyPassword('correct horse 2', stored)).toBe(false)
  })

  it('makes a new 16-byte salt and a 32-byte hash each time', async () => {
    const first = await hashPassword('correct horse 1')
    const second = await hashPassword('correct horse 1')
    expect(atob(first.salt)).toHaveLength(16)
    expect(atob(first.hash)).toHaveLength(32)
    expect(first.salt).not.toBe(second.salt)
    expect(first.hash).not.toBe(second.hash)
  })
})

describe('cloud:owner', () => {
  const stored = { hash: FIXED_HASH, salt: FIXED_SALT, iterations: 100_000 }

  it('replaces the owner and signs every device out', () => {
    expect(ownerSql('owner@example.com', stored, 1700000000000)).toBe(
      'DELETE FROM auth_tokens;\n' +
        'DELETE FROM owner;\n' +
        "INSERT INTO owner (id, email, pass_hash, pass_salt, iterations, created_at) VALUES ('owner', 'owner@example.com', " +
        `'${FIXED_HASH}', '${FIXED_SALT}', 100000, 1700000000000);\n`,
    )
  })

  it('escapes single quotes in the email', () => {
    expect(ownerSql("o'brien@example.com", stored, 1)).toContain("'o''brien@example.com'")
  })

  it('takes a trimmed, lower-case email and refuses one that is not an address', () => {
    expect(checkEmail('  Owner@Example.COM ')).toBe('owner@example.com')
    expect(() => checkEmail('owner')).toThrow()
    expect(() => checkEmail('own er@example.com')).toThrow()
    expect(() => checkEmail('owner@example.com\n')).not.toThrow()
    expect(() => checkEmail('owner@exa\u0000mple.com')).toThrow()
  })

  it('wants a password of at least 10 characters, typed the same twice', () => {
    expect(() => checkPassword('short', 'short')).toThrow(/10 characters/)
    expect(() => checkPassword('long enough 1', 'long enough 2')).toThrow(/do not match/)
    expect(() => checkPassword('long enough', 'long enough')).not.toThrow()
  })

  it('runs wrangler on the remote database unless --local is passed', () => {
    expect(wranglerArgs('/tmp/owner.sql', false)).toEqual(['d1', 'execute', 'lernzeit', '--remote', '--file', '/tmp/owner.sql'])
    expect(wranglerArgs('/tmp/owner.sql', true)).toEqual(['d1', 'execute', 'lernzeit', '--local', '--file', '/tmp/owner.sql'])
  })

  it('takes the owner from LERNZEIT_OWNER_EMAIL and LERNZEIT_OWNER_PASSWORD, only with --local', () => {
    const env = { LERNZEIT_OWNER_EMAIL: ' Owner@Example.com ', LERNZEIT_OWNER_PASSWORD: 'long enough' }
    expect(ownerFromEnv(env, true)).toEqual({ email: 'owner@example.com', password: 'long enough' })
    // The real cloud's password is only ever typed, never read from the environment.
    expect(ownerFromEnv(env, false)).toBeUndefined()
    expect(ownerFromEnv({}, true)).toBeUndefined()
    expect(ownerFromEnv({ LERNZEIT_OWNER_EMAIL: 'owner@example.com' }, true)).toBeUndefined()
    expect(() => ownerFromEnv({ ...env, LERNZEIT_OWNER_PASSWORD: 'short' }, true)).toThrow(/10 characters/)
    expect(() => ownerFromEnv({ ...env, LERNZEIT_OWNER_EMAIL: 'owner' }, true)).toThrow(/not an email/)
  })
})
