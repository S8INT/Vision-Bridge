/**
 * Expo Push Notification helper — sends to the Expo Push Service HTTP API.
 * No SDK required; a simple fetch is sufficient.
 * If the token is blank/null the call is silently skipped.
 */

export interface PushPayload {
  token: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default" | null;
  badge?: number;
}

export async function sendExpoPush(payload: PushPayload): Promise<void> {
  if (!payload.token) return;

  try {
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
      },
      body: JSON.stringify({
        to: payload.token,
        title: payload.title,
        body: payload.body,
        data: payload.data ?? {},
        sound: payload.sound ?? "default",
        badge: payload.badge,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`[push] Expo API error ${res.status}: ${text}`);
    } else {
      const json = (await res.json()) as { data?: { status?: string } };
      const status = json?.data?.status;
      if (status && status !== "ok") {
        console.warn(`[push] Expo delivery status: ${status} for token ${payload.token.slice(0, 20)}…`);
      }
    }
  } catch (err) {
    console.error("[push] sendExpoPush failed:", err);
  }
}

export async function sendExpoPushMany(payloads: PushPayload[]): Promise<void> {
  const valid = payloads.filter((p) => !!p.token);
  if (!valid.length) return;
  await Promise.allSettled(valid.map(sendExpoPush));
}
