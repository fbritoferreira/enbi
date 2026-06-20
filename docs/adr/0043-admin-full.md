# 43. Admin full: provider buttons, user/role management, revision history, and richer search

- Status: Accepted
- Date: 2026-06-20

## Context

The admin UI needed several improvements to be production-ready. The login page had no way to
surface configured OAuth or SSO providers — users had to know provider IDs out of band. There was
no UI for managing who had access or what role they held. Editors had no way to browse or restore
previous versions of an entry. And the entries search required an exact ID match, making it
effectively unusable for real content workflows.

Concretely, the gaps were:

- **Social / SSO provider buttons on the login page** — configured providers were invisible in the
  UI; users had no button to click.
- **User and role management** — the better-auth admin plugin exposes the necessary API but there
  was no admin page consuming it.
- **Revision history browser and restore UI** — the server already stored snapshots, but editors
  had no way to view or roll back to them without direct database access.
- **Smarter entries search** — the search box performed equality filtering on the primary key,
  making it useless for finding entries by meaningful text.

## Decision

### Public `GET /api/admin_providers` endpoint

A new server endpoint (no auth required) returns `{ social: string[], sso: string[] }` by reading
the configured provider ids from the EnbiConfig. This lets the login page render provider buttons
without leaking credentials or requiring the client to have any prior knowledge of the deployment's
auth configuration. Implemented in `apps/server/src/providers.ts` and mounted before auth
middleware so unauthenticated requests can reach it.

### SSO/social login buttons on the login page

The login page fetches `/api/admin_providers` on load and renders a button per provider. On click,
it POSTs to `/api/admin_auth/sign-in/social` with `{ provider, callbackURL: "/" }` and follows
the returned `url` redirect. Generic OAuth SSO providers use the same social sign-in endpoint with
`provider=<providerId>`. If the fetch fails or no providers are configured, the section stays
empty — the email/password form is always present regardless.

### User and role management page (`/users`)

A new `/users` admin page fetches the user list via `GET /api/admin_auth/admin/list-users` (the
better-auth admin plugin endpoint). It renders a table with each user's email address, their
current role, an editable role input, and a Save button per row. Clicking Save calls
`POST /api/admin_auth/admin/set-role` with `{ userId, role }`. The page redirects to `/login` on
a 401 response so expired sessions are handled gracefully.

### Revision history and restore UI (`/revisions`)

A new `/revisions?c=<name>&id=<id>` page fetches `GET /api/<c>/<id>/revisions` and renders a
table of all saved snapshots ordered by version. Each row has a Restore button that POSTs
`{ version }` to `/api/<c>/<id>/restore` and then redirects back to the edit page for that entry.
A "History" link is shown on `edit.astro` only when editing an existing entry (i.e. when `id` is
not `new`), keeping the new-entry form uncluttered.

### Richer entries search

The entries search box now uses the `__like` operator from ADR-0042. The collection metadata
(fetched from `/api/admin_collections` once on load) provides the `title` column name; if `title`
is null the primary key column is used as the fallback. This means search filters on meaningful
text content rather than requiring the editor to type an exact ID.

## Consequences

- **Good:** administrators can now manage who has access to the admin and what role they hold,
  directly from the UI.
- **Good:** revision history is browsable and restorable from the UI without database access.
- **Good:** provider buttons on the login page remove the need for editors to know SSO provider IDs
  manually.
- **Good:** entries search is useful for real content — filtering by title rather than exact ID
  match.
- **Non-goal:** impersonation, ban/unban, and bulk-user operations are not included. The `/users`
  page is intentionally minimal.
- **Non-goal:** custom permission matrices are out of scope; the role model follows whatever
  better-auth admin plugin supports out of the box.
- **Non-goal:** bulk restore or diff-view between revisions is deferred.
