# Docs

A place to save Markdown and read it later, shown like a GitHub README. Docs are general reading: they belong to no topic or language, and reading them does not count as study time.

## Using it

1. Open **Docs** and go to a folder, or stay at the top level. On a phone, Docs is the page icon in the header, because the bottom bar fits eight items.
2. Press **New doc** and paste your Markdown.
3. Press **Save**, or Ctrl+S. The doc opens in the reader.

If the text has a `# Heading`, that fills in the title until you type your own. Without a title, the first line of the text is used.

Press **Copy Markdown** to take the text back out. Images you pasted only work inside Lernzeit, because the text points to the app's own storage.

## What it shows

GitHub-style Markdown: headings, lists, tables, task lists, quotes, footnotes, links, images and code blocks with colours and a Copy button.

- Docs with three or more headings get a table of contents.
- A `# Heading` at the very top that matches the title is hidden, because the page header already shows it.
- Task boxes are read-only, as in a README. Change them in **Edit**.
- Web links open in a new tab. A link to another file of a repository stays plain text, because it leads nowhere here.
- Text in a right-to-left language lines up on the right, paragraph by paragraph.

## Safe by default

[react-markdown](https://github.com/remarkjs/react-markdown) builds React elements and never uses `dangerouslySetInnerHTML`. Raw HTML in the text is not rendered, and links with `javascript:` are removed, so pasted text cannot run code. Only an image may use the app's own `image:` links, and only with a plain id.

## Where things live

| Part | File | Job |
|---|---|---|
| Helpers | [src/lib/docs.ts](../src/lib/docs.ts) | Titles, folder paths, image links, search and filters |
| Data | [src/data/docs.ts](../src/data/docs.ts) | Save, move and delete docs and folders, clean up images |
| Renderer | [src/features/docs/DocMarkdown.tsx](../src/features/docs/DocMarkdown.tsx) | Markdown to README-style elements |
| Headings | [src/features/docs/headings.ts](../src/features/docs/headings.ts) | Heading ids, shared by the renderer and the table of contents |
| Pages | [src/features/docs/](../src/features/docs) | Library and folder pages, reader, editor |
| Styles | [src/index.css](../src/index.css) | `.doc-prose` and the code colours |
| AI | [src/bridge/actions.ts](../src/bridge/actions.ts), [mcp/src/tools.ts](../mcp/src/tools.ts) | `list_docs`, `read_doc`, `create_doc` |

The Markdown code is a lazy route, so it loads only when Docs opens.

## Data

Two Dexie tables from schema version 8, both in backups. Backups made before docs still restore.

| Table | Fields | Indexes |
|---|---|---|
| `docFolders` | `id`, `name`, `parentId`, `createdAt`, `updatedAt` | `id, parentId` |
| `docs` | `id`, `folderId`, `title`, `body`, `tags`, `status`, `pinned`, `position`, `openedAt`, `createdAt`, `updatedAt` | `id, folderId, openedAt, updatedAt, *tags` |

- The top level is the id `root`, because IndexedDB cannot index `null`.
- `position` is how far down you read, from 0 to 1, so it still fits after the window changes size. Opening, pinning and marking as read do not change `updatedAt`.

## Images

A pasted or dropped image is shrunk to 1400px wide and saved in the `images` table, the same one cards use. The text gets `![name](image:<id>)`, and the image goes into backups with the rest.

An image is deleted when no doc or card uses it any more: after saving without it, after deleting its doc or folder, or when you leave the editor without keeping it.

## Leaving with unsaved changes

The editor asks first, both for links inside the app and for closing the tab. Asking inside the app needs `useBlocker`, which only works with a data router, so `App.tsx` uses `createBrowserRouter` with one catch-all route around the existing `<Routes>`.

## AI

| Tool | Does |
|---|---|
| `list_docs` | Lists folder paths and docs, without their text |
| `read_doc` | Returns one doc's Markdown |
| `create_doc` | Saves Markdown to a folder path such as `Recipes/Italian`, making missing folders |

Docs from the AI are tagged `ai`. Saving the same text in the same folder again adds nothing. The AI cannot change or delete docs.
