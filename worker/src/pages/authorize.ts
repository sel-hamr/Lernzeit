/**
 * The page where the owner lets an app such as Claude use their Lernzeit: server-rendered HTML in
 * the app's style (SPEC §11), with no script at all. Every string from the client (its name, its
 * redirect host) is chosen by whoever registered it, so all of it goes through `escape`.
 */

export interface AuthorizePageProps {
  /** The client's self-chosen name. */
  clientName: string
  /** Where the access goes: the host of the client's redirect URI. */
  redirectHost: string
  /** The redirect goes to a local app (localhost), which any program on the computer could be. */
  redirectIsLoopback: boolean
  /** The one-time form handle from `beginConsent`. */
  handle: string
  /** A message from the last try, such as "Wrong password". */
  error?: string
}

/** What the tools can do, in the words of the page. */
const CAN = [
  'Read and add cards, decks, stories, grammar, questions, docs, tasks and study time',
  'Delete cards or decks when you ask it to',
]

/** HTML-escapes text for an element or a double- or single-quoted attribute. */
export function escape(text: string): string {
  return text.replace(/[&<>"']/g, (char) => ENTITIES[char])
}

const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

const STYLE = `
:root { color-scheme: light; }
* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px 16px;
  background: #F7F7F4; color: #1C211E; font: 15px/1.5 Geist, 'Helvetica Neue', system-ui, sans-serif; }
main { width: 100%; max-width: 420px; background: #FFFFFF; border: 1px solid #ECECE6; border-radius: 16px; padding: 28px 24px; }
.brand { margin: 0 0 20px; font-size: 13px; font-weight: 600; color: #70746F; display: flex; align-items: center; gap: 8px; }
.brand::before { content: ''; width: 8px; height: 8px; border-radius: 50%; background: #C8412F; }
h1 { margin: 0 0 8px; font-size: 20px; line-height: 1.3; font-weight: 600; overflow-wrap: anywhere; }
p { margin: 0 0 16px; color: #70746F; overflow-wrap: anywhere; }
strong { color: #1C211E; font-weight: 600; }
ul { margin: 0 0 20px; padding: 14px 16px 14px 32px; background: #FAFAF8; border: 1px solid #ECECE6; border-radius: 12px; }
li { margin: 4px 0; }
.warn { padding: 10px 12px; border-radius: 10px; background: #FAF5DC; color: #1C211E; }
.error { padding: 10px 12px; border-radius: 10px; background: #F7E5E0; color: #9A3A2A; font-weight: 500; }
label { display: block; margin: 0 0 6px; font-size: 13px; font-weight: 500; color: #3A3F3B; }
input[type=password] { width: 100%; padding: 10px 12px; font: inherit; color: inherit; background: #FFFFFF;
  border: 1px solid #DCDCD5; border-radius: 10px; }
input[type=password]:focus { outline: 2px solid #CFDDC2; border-color: #8FB27C; }
/* Allow comes first in the form, so Enter in the password field allows; it shows on the right. */
.actions { display: flex; flex-direction: row-reverse; gap: 8px; margin-top: 20px; }
button { flex: 1; padding: 10px 16px; font: inherit; font-weight: 500; border-radius: 999px; cursor: pointer; }
.allow { background: #22302A; color: #FFFFFF; border: 1px solid #22302A; }
.cancel { background: #FFFFFF; color: #1C211E; border: 1px solid #DCDCD5; }
button:focus-visible { outline: 2px solid #8FB27C; outline-offset: 2px; }
`

function page(title: string, body: string, nonce: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>${escape(title)}</title>
<style nonce="${escape(nonce)}">${STYLE}</style>
</head>
<body>
<main>
<p class="brand">Lernzeit</p>
${body}
</main>
</body>
</html>`
}

export function authorizePage(props: AuthorizePageProps, nonce: string): string {
  const name = escape(props.clientName)
  const host = escape(props.redirectHost)
  const items = CAN.map((line) => `<li>${escape(line)}</li>`).join('')
  const loopback = props.redirectIsLoopback
    ? '<p class="warn">This sends access to a program on your computer. Go on only if you just started connecting from it.</p>'
    : ''
  const error = props.error ? `<p class="error" role="alert">${escape(props.error)}</p>` : ''
  return page(
    `Allow ${props.clientName}?`,
    `<h1>Allow ${name} to use your Lernzeit?</h1>
<p>Access goes to <strong>${host}</strong>. ${name} named itself; Lernzeit cannot check that name.</p>
${loopback}<p>It will be able to:</p>
<ul>${items}</ul>
${error}<form method="post" action="/authorize">
<input type="hidden" name="handle" value="${escape(props.handle)}">
<label for="password">Your Lernzeit password</label>
<input id="password" type="password" name="password" autocomplete="current-password" required autofocus>
<div class="actions">
<button class="allow" type="submit" name="decision" value="allow">Allow</button>
<button class="cancel" type="submit" name="decision" value="cancel" formnovalidate>Cancel</button>
</div>
</form>`,
    nonce,
  )
}

export function errorPage(message: string, nonce: string): string {
  return page('Lernzeit', `<h1>This did not work</h1>\n<p>${escape(message)}</p>`, nonce)
}
