/**
 * Where an OAuth client may send the owner back to: the only hosts Lernzeit gives access to.
 * Claude on the web, desktop and phone calls back to claude.ai or claude.com; Claude Code and other
 * local apps call back to a port on this computer. Anything else is refused at registration and
 * on the authorize page, so a stranger cannot register "Claude" with their own redirect.
 *
 * `OAUTH_REDIRECT_HOSTS` in wrangler.jsonc lists them, separated by commas. A listed host must be
 * matched exactly and over https; a loopback host (localhost, 127.0.0.1, [::1]) also takes http,
 * on any port.
 */

export const DEFAULT_REDIRECT_HOSTS = 'claude.ai,claude.com,localhost,127.0.0.1,[::1]'

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]'])

/** The hosts in an `OAUTH_REDIRECT_HOSTS` value, lower-cased; the default when it is unset or empty. */
export function redirectHosts(value: string | undefined): string[] {
  const hosts = (value ?? '')
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean)
  return hosts.length > 0 ? hosts : redirectHosts(DEFAULT_REDIRECT_HOSTS)
}

/** Whether `uri` goes to one of `hosts`: the exact hostname, https, or http for a loopback host. */
export function redirectAllowed(uri: string, hosts: string[]): boolean {
  let url: URL
  try {
    url = new URL(uri)
  } catch {
    return false
  }
  if (url.username || url.password || !hosts.includes(url.hostname)) return false
  return url.protocol === 'https:' || (url.protocol === 'http:' && LOOPBACK.has(url.hostname))
}

/** The allowlist in words, for an error message. */
export function describeRedirectHosts(hosts: string[]): string {
  const secure = hosts.filter((host) => !LOOPBACK.has(host))
  const local = hosts.filter((host) => LOOPBACK.has(host))
  const parts = [...(secure.length ? [`https on ${secure.join(', ')}`] : []), ...(local.length ? [`http or https on ${local.join(', ')}`] : [])]
  return parts.join('; ')
}
