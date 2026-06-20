// @enbi/server — outbound webhook emitter (ADR-0047).
// Fire-and-forget delivery: never throws into the request path.
import { createHmac } from "node:crypto";
import type { WebhookConfig, WebhookEvent, WebhookPayload } from "@enbi/db";

export type { WebhookPayload };

export type WebhookDelivery = {
  url: string;
  payload: WebhookPayload;
  signature?: string;
};

/** Transport abstraction — default does a fire-and-forget POST; injectable for tests. */
export type WebhookSink = (delivery: WebhookDelivery) => void;

function hmacSha256Hex(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

/** Default sink: POSTs JSON fire-and-forget, never throws. */
export const defaultWebhookSink: WebhookSink = (delivery) => {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (delivery.signature) {
    headers["X-Enbi-Signature"] = delivery.signature;
  }
  fetch(delivery.url, {
    method: "POST",
    headers,
    body: JSON.stringify(delivery.payload),
    signal: AbortSignal.timeout(5000),
  }).catch((e: unknown) => {
    let safe: string;
    try {
      const u = new URL(delivery.url);
      safe = u.origin + u.pathname;
    } catch {
      safe = "the webhook URL";
    }
    console.warn("[enbi:webhooks] delivery failed", safe, e);
  });
};

/**
 * Build an `emit` function that dispatches webhook deliveries for each
 * configured webhook endpoint whose event/collection filters match.
 */
export function makeWebhookEmitter(
  webhooks: WebhookConfig[] | undefined,
  sink: WebhookSink,
): (event: WebhookEvent, collection: string, id: string, data: unknown) => void {
  if (!webhooks || webhooks.length === 0) {
    return () => {};
  }

  return (event, collection, id, data) => {
    const payload: WebhookPayload = {
      event,
      collection,
      id,
      data,
      timestamp: new Date().toISOString(),
    };
    const body = JSON.stringify(payload);

    for (const wh of webhooks) {
      // Event filter: default is all three events.
      const allowedEvents = wh.events ?? (["create", "update", "delete"] as WebhookEvent[]);
      if (!allowedEvents.includes(event)) continue;

      // Collection filter: default is all collections.
      if (wh.collections && !wh.collections.includes(collection)) continue;

      const signature = wh.secret ? `sha256=${hmacSha256Hex(wh.secret, body)}` : undefined;

      sink({ url: wh.url, payload, signature });
    }
  };
}
