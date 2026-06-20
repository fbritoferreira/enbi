# 51. Editorial Terminal design system; first-run registration; wysiwyg widget via CKEditor

- Status: Accepted
- Date: 2026-06-21

## Context

The admin UI shipped as a minimal functional interface with no visual design
language, no first-run onboarding, and no rich-text authoring. Three problems
needed addressing simultaneously:

1. **Visual coherence:** editors working in the admin need a calm, purposeful
   environment. The existing unstyled tables and plain inputs carried no brand
   identity and made scanning content tedious.

2. **First-run experience:** a fresh enbi deployment has zero users. The only
   way to create the first admin account was via the API directly — a poor
   experience. The admin needs to detect this state and surface a registration
   form automatically.

3. **Rich-text fields:** content authors frequently need to store formatted HTML
   (headings, bold, links). Without a field widget system, every field was a
   plain `<input>`, forcing authors to write raw HTML.

## Decision

### (A) Editorial Terminal design system

A design system implemented entirely as CSS custom properties and global styles
in `Admin.astro`. No external fonts, no CDN dependencies — fully offline-safe.

**Palette:**

- `--paper: #f4f1ea` — warm off-white canvas
- `--ink: #1a1714` — near-black text and sidebar background
- `--muted: #6b645c` — secondary labels and metadata
- `--rule: #d8d2c6` — hairline table borders and input borders
- `--accent: #e2452f` — vermilion; primary action colour
- `--on-accent: #fff`, `--ok: #2f7d4f`, `--danger: #b3361f`

**Font stacks (system-only):**

- `--font-display: ui-serif, Georgia, "Times New Roman", serif` — headings and brand wordmark
- `--font-body: system-ui, -apple-system, "Segoe UI", sans-serif` — body text and navigation
- `--font-mono: ui-monospace, "SF Mono", Menlo, monospace` — IDs, labels, column headers, metadata

**Layout:** fixed 200 px left sidebar (ink background, paper text, serif "enbi" wordmark) with
accent active-link indicator. Main content scrolls on the right with max-width ~64 rem,
paper background, and generous padding.

**Components:** hairline-bordered tables with mono column headers, comfortable padding, and
subtle row hover; form labels in uppercase mono; inputs with accent `:focus-visible` ring;
primary buttons in accent with hover lift + active press; secondary outline buttons; danger
red for destructive actions. Auth pages (login and register) render a centred card with a
faint CSS grain overlay (inline SVG `feTurbulence` data-URI at 3 % opacity) and a staggered
fade-in via `@keyframes fadeUp`.

All pages use the same `Admin.astro` layout. The `active` prop highlights the current
sidebar link via `aria-current="page"`.

### (B) First-run register flow

A new public endpoint `GET /api/admin_setup` returns `{ needsSetup: boolean }` — `true`
when zero users exist in the database. This is the only endpoint the admin calls before
authentication.

- `login.astro` and `index.astro` check this endpoint on load. If `needsSetup: true`,
  they immediately redirect to `/register`.
- `register.astro` (new page) renders a registration form (`#register`, `#email`,
  `#password`, `#name`, `#err`). On submit it POSTs `{ email, password, name }` to
  `POST /api/admin_auth/sign-up/email` and redirects to `/` on success.
- `register.astro` also checks the setup endpoint on load. If `needsSetup: false`,
  it redirects to `/login` — registration via the UI is first-run only.

The first user to register via this flow gains admin role through enbi's existing
bootstrap logic (first user → admin, ADR-0034).

### (C) `wysiwyg` field widget via CKEditor classic build

The collection metadata from `/api/admin_collections` may include a `widgets`
property per collection: `Record<field, "wysiwyg" | "text">`. When
`widgets[column] === "wysiwyg"`, the edit form renders:

1. A hidden `<input id="f_<column>" type="hidden" />` — preserves the existing
   submit logic that reads `document.getElementById("f_" + col).value`.
2. A `<div class="ck-container" data-field="<column>">` CKEditor mount point.
3. After form HTML is rendered, `ClassicEditor.create(container)` is called.
   `editor.setData(hiddenInput.value)` seeds the initial content.
   `editor.model.document.on("change:data", () => { hidden.value = editor.getData(); })`
   keeps the hidden input in sync.

`@ckeditor/ckeditor5-build-classic` is a pre-built UMD bundle with no postinstall
script. It is loaded via a dynamic `import()` inside the edit-page script — the
~700 KB (minified) bundle is only fetched when the edit page loads and at least one
wysiwyg column is present.

**XSS note:** wysiwyg fields store raw HTML. The consuming site is responsible for
sanitising or escaping this value at render time. The admin uses `editor.setData()`
(not `innerHTML`) to seed the editor, avoiding double-injection. Image upload into the
editor is not wired to the media library in this iteration.

## Consequences

- **Good:** the design system is zero-dependency and fully offline; zero external
  requests on page load.
- **Good:** first-run UX eliminates the need for API access to bootstrap a deployment.
- **Good:** wysiwyg fields integrate with zero changes to the existing submit path.
- **Bad:** CKEditor classic build adds ~700 KB to the edit-page bundle (minified). It
  loads lazily and only on edit pages with wysiwyg columns — acceptable for an admin tool.
- **Bad:** image upload inside the editor is not wired to the media library. Authors must
  upload files via the Media page and paste URLs manually. This is a future iteration.
- **Bad:** wysiwyg HTML is stored and returned as raw HTML; XSS responsibility shifts to
  the consuming site. Documented above.

## Non-goals

- Theming / customisation API for the design system — tokens are fixed.
- Markdown widget — wysiwyg covers the primary use case; markdown is a separate future
  decision.
- Image upload wiring inside CKEditor to the media library — future work.
- Per-locale or per-user design preferences.
