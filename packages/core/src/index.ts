// @enbi/core — full row snapshot versioning engine. Logic lands later (ADR-0004).
export type Revision = {
  id: string;
  entryId: string;
  snapshot: unknown;
  createdAt: string;
};
export const ENBI_CORE_PLACEHOLDER = true as const;
