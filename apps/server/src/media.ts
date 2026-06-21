// @enbi/server — local-disk media store and /api/admin_media + /api/media routes.
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { type EnbiConfig, type EnbiDb, EnbiError } from "@enbi/db";
import type { AuthProvider } from "@enbi/auth";
import { eq } from "drizzle-orm";
import type { Hono } from "hono";
import { authorizeResource } from "./guard.ts";

const RESOURCE = "media";
const MEDIA_OPTS = { allowReadShorthand: false };

export interface MediaStore {
  put(id: string, bytes: Buffer): Promise<void>;
  get(id: string): Promise<Buffer>;
  delete(id: string): Promise<void>;
}

export function diskStore(dir: string): MediaStore {
  let ready: Promise<void> | null = null;

  function ensureDir(): Promise<void> {
    if (!ready) {
      ready = mkdir(dir, { recursive: true }).then(() => undefined);
    }
    return ready;
  }

  return {
    async put(id, bytes) {
      await ensureDir();
      await writeFile(join(dir, id), bytes);
    },
    async get(id) {
      await ensureDir();
      return readFile(join(dir, id));
    },
    async delete(id) {
      await ensureDir();
      await unlink(join(dir, id));
    },
  };
}

export function mountMedia(
  app: Hono,
  ctx: EnbiDb,
  roles: EnbiConfig["roles"],
  auth: AuthProvider,
  config: EnbiConfig,
): void {
  const dir = config.media?.dir ?? ".enbi/uploads";
  const store = diskStore(dir);

  const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
  const ALLOWED_MIME = new Set([
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/avif",
  ]);

  // POST /api/admin_media — upload a file (admin only)
  app.post("/api/admin_media", async (c) => {
    await authorizeResource(auth, roles, RESOURCE, "create", c.req.raw.headers, MEDIA_OPTS);
    const body = await c.req.parseBody();
    const file = body["file"];
    if (!file || !(file instanceof File)) {
      throw new EnbiError("validation", "`file` is required and must be a file upload.");
    }
    if (file.size > MAX_SIZE) {
      throw new EnbiError("too_large", "File exceeds the 10MB limit.");
    }
    if (!ALLOWED_MIME.has(file.type)) {
      throw new EnbiError(
        "unsupported_media",
        "File type is not allowed. Accepted: jpeg, png, gif, webp, avif.",
      );
    }
    const id = crypto.randomUUID();
    await store.put(id, Buffer.from(await file.arrayBuffer()));
    const row = {
      id,
      filename: file.name,
      mime: file.type || "application/octet-stream",
      size: file.size,
      createdAt: new Date().toISOString(),
    };
    await ctx.db.insert(ctx.media).values(row);
    return c.json(
      { id, filename: row.filename, mime: row.mime, size: row.size, url: `/api/media/${id}` },
      201,
    );
  });

  // GET /api/admin_media — list all media (admin only)
  app.get("/api/admin_media", async (c) => {
    await authorizeResource(auth, roles, RESOURCE, "read", c.req.raw.headers, MEDIA_OPTS);
    const rows = await ctx.db.select().from(ctx.media).orderBy(ctx.media.createdAt);
    return c.json(rows);
  });

  // DELETE /api/admin_media/:id — delete a media entry (admin only)
  app.delete("/api/admin_media/:id", async (c) => {
    await authorizeResource(auth, roles, RESOURCE, "delete", c.req.raw.headers, MEDIA_OPTS);
    const id = c.req.param("id");
    const existing = await ctx.db.select().from(ctx.media).where(eq(ctx.media.id, id));
    if (existing.length === 0) throw new EnbiError("not_found", "Media not found.");
    await ctx.db.delete(ctx.media).where(eq(ctx.media.id, id));
    await store.delete(id);
    return c.body(null, 204);
  });

  // GET /api/media/:id — serve a file publicly (no auth)
  app.get("/api/media/:id", async (c) => {
    const id = c.req.param("id");
    const rows = await ctx.db.select().from(ctx.media).where(eq(ctx.media.id, id));
    if (rows.length === 0) throw new EnbiError("not_found", "Media not found.");
    const row = rows[0]!;
    const bytes = await store.get(id);
    return c.body(new Uint8Array(bytes), 200, {
      "Content-Type": row.mime,
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
    });
  });
}
