# Redesign: Software Eval Notes → single-column "Evals" workspace

## Goal
Replace the current 3-column app with a focused, single-column library + reading
flow, a ⌘K "Ask" command palette (instead of a permanent chat column), and a warm-cool
"mint orb" theme. **Backend stays as-is** — reuse all existing endpoints.

## Scope / files
- `software_eval/templates/index.html` — rewrite markup to the new structure
- `software_eval/templates/shared_note.html` — restyle to match (public read page)
- `software_eval/static/app.css` — replace theme + layout
- `software_eval/static/app.js` — reorganize view/routing logic (keep all fetch calls)
- No changes to `views.py`, `models.py`, or any `/api/*` route.

## Endpoints to reuse (unchanged)
- `GET /api/bootstrap` → `{notes, folders}` (also injected as `bootstrap` on first paint)
- `POST /api/notes`, `PUT/DELETE /api/notes/<id>`, `GET /api/notes/<id>` (returns `rendered_content`)
- `POST /api/folders`, `PUT/DELETE /api/folders/<id>`
- `POST /api/import` `{text}` → bulk paste
- `POST /api/markdown` `{content}` → `{html}` for live preview
- `POST /api/chat` `{question, history}` → streaming response (keep the stream reader)
- `GET /n/<id>` → public shared page

## Information architecture & flow
Three in-app views in ONE column (no left/right panels). Track view in JS state and
reflect it in the URL hash (`#/`, `#/note/<id>`, `#/note/<id>/edit`) so back/forward work.

1. **Library (`#/`)** — the home:
   - Sticky top bar: brand ("E" mark + "Evals" + note count), `Ask ⌘K` button, `+ New note`.
   - Big search input (filters titles + content client-side).
   - Horizontal **folder filter pills** (All / Unfiled / each folder, each with a count)
     + a "＋" pill to create a folder (`POST /api/folders`).
   - Controls row: Sort (Recent ↔ A–Z), Select (multi-select mode), Import.
   - **Note list** (single stacked column, divided rows — not cards):
     title (serif), a 2-line snippet, folder chip + tags, date, and a rating badge if the
     note's content contains a `Rating: N/10`. Row click → Note view. In Select mode, rows
     toggle a checkbox; a bulk action bar shows Move / Delete.
2. **Note view (`#/note/<id>`)** — full-width focused reading:
   - Sticky bar: `← Library`, then Ask-about, Share, Move, **Edit**, Delete.
   - Meta strip: folder · "Edited <relative date>" · rating.
   - Body rendered from `GET /api/notes/<id>` → `rendered_content` (or `/api/markdown`).
3. **Edit (`#/note/<id>/edit`)** — same canvas, Write/Preview tabs:
   - Formatting toolbar (bold, italic, H1–H3, bullet, numbered, quote, code) that wraps/
     prefixes the textarea selection.
   - Preview tab calls `POST /api/markdown`. Save → `PUT /api/notes/<id>`. Cancel reverts.
   - `+ New note` creates via `POST /api/notes` then opens this view focused.

### Ask command palette (replaces the old chat column)
- Centered modal overlay opened by `⌘K`/`Ctrl-K`, the `Ask` button, or per-note "ask about this".
- Textarea + suggested prompts when empty. Enter sends → `POST /api/chat` (stream the
  response, render markdown). Show a typing indicator while streaming. Render **source
  chips** under each answer that deep-link to `#/note/<id>`. `Esc` closes; `Clear` resets.

### Modals
- **Share**: copy `…/n/<id>`, "Open public page" → `/n/<id>`.
- **Move**: pick destination folder → `PUT /api/notes/<id>` with `folder_id` (or bulk).
- **Import**: paste multiple `# heading`-separated notes → `POST /api/import`, show detected count.
- **Toast** for save/copy/move/delete confirmations.

## Visual system

### Fonts (add to base.html `<head>`)
- **Newsreader** (serif) — note titles, reading body, headings, blockquotes
- **Hanken Grotesk** (sans) — all UI chrome
- **JetBrains Mono** — meta labels, kbd hints, code, ratings
```html
<link href="https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,500;6..72,600;6..72,700&family=Hanken+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
```

### Color tokens (define as CSS variables on `:root` / app root)
```css
--accent:#2E6E62; --accent-dk:#225349; --accent-sub:#D7E7E2; --accent-soft:#A6CCC4;
--ink:#2B2620; --ink-strong:#211D17;
--muted:#5C6864; --muted-2:#76817C; --muted-3:#525C58; --faint:#869089; --placeholder:#9BA6A0;
--surface:#F7FBFA;            /* cards, inputs, buttons */
--border:#D3E0DC; --border-2:#D2DFDB; --border-3:#DBE7E3;
--tag-bg:#DEE9E5; --tag-text:#616B66;
--code-bg:#DAE6E2; --code-text:#225349;
--danger:#B0392E;
```

### Background — light base with soft floating orbs (this is the look the user approved)
Apply to each full-height view container; keep it fixed so it doesn't scroll.
```css
.page {
  background:
    radial-gradient(40% 48% at 14% 16%, rgba(150,222,190,.42) 0%, rgba(255,255,255,0) 72%),
    radial-gradient(44% 52% at 88% 10%, rgba(178,221,233,.34) 0%, rgba(255,255,255,0) 72%),
    radial-gradient(48% 50% at 80% 88%, rgba(206,229,168,.32) 0%, rgba(255,255,255,0) 72%),
    radial-gradient(40% 46% at 24% 94%, rgba(166,224,205,.30) 0%, rgba(255,255,255,0) 72%),
    #F4F9F5;
  background-attachment: fixed;
}
/* frosted sticky headers over the orbs */
.page > header {
  background: color-mix(in srgb, #EFF6F0 84%, transparent);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--border);
}
```

### Type & spacing
- Content column max-width ~760px (reading) / ~880px (library), centered, generous padding.
- Note title in list: 18px Newsreader 600. Reading body: 19px/1.72 Newsreader.
- Reading headings: H1 2.2em/1.1 600; H2 1.4em 600 with a 1px bottom border; H3 1.14em.
- List markers, blockquote rule, and links use `--accent`.
- Primary buttons: `--accent` bg, white text; secondary: `--surface` bg + `--border`.
- Pills: active = `--accent` bg/white; idle = `--surface` + `--border`.
- Rating badge & source chips: `--accent-sub` bg, `--accent-dk` text.

## Behavior details
- Persist current view in the URL hash; restore on load.
- Search/sort/folder filtering is client-side over the bootstrap payload; refetch on mutations.
- Derive a row's rating badge by regexing `Rating:\s*([0-9]+\s*/\s*10)` from `content`.
- Relative dates ("Today", "Yesterday", "3d ago", then "Mon D").
- Keyboard: `⌘K`/`Ctrl-K` toggles Ask; `Esc` closes any overlay, else returns to Library.

## Acceptance checklist
- [ ] No `/api/*`, `views.py`, or `models.py` changes.
- [ ] Library, Note view, Edit, Ask palette, Share/Move/Import modals, shared page all work.
- [ ] Chat still streams and renders markdown with working source deep-links.
- [ ] Light orb background + teal-on-cool theme applied everywhere, including `/n/<id>`.
- [ ] Mobile: column stays single, headers sticky, hit targets ≥ 44px.