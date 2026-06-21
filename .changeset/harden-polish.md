---
"@enbi/cli": minor
---

feat(cli): enbi user create / set-role — CLI user management (ADR-0053)

Adds `enbi user create <email> <password> [--role] [--name]` and
`enbi user set-role <email> <role>`. Password hashing is delegated to
better-auth's sign-up handler (in-process, no HTTP server required) so the
bcrypt pipeline is identical to a real sign-up. The `--role` flag applies a
direct drizzle UPDATE after creation. `set-role` throws a typed `not_found`
error when the email does not exist.
