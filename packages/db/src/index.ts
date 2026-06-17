// @enbi/db — Drizzle config surface. Logic lands in its own sub-project (ADR-0003).
export type EnbiDbDialect = "postgres" | "sqlite" | "mysql";
export type EnbiDbConfig = { dialect: EnbiDbDialect };
export const ENBI_DB_PLACEHOLDER = true as const;
