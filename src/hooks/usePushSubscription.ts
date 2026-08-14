import { useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

/**
 * §12 web push — registers the service worker and subscribes this browser to
 * push notifications. Silent no-op when VAPID keys aren't configured (the
 * query returns null) or the user declines permission.
 */
export function usePushSubscription(enabled: boolean) {
  const subscribe = useMutation(api.push.subscribe);
  const unsubscribe = useMutation(api.push.unsubscribe);
  const vapidKey = useQuery(api.push.vapidPublicKey);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const run = async () => {
      try {
        if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
        const reg = await navigator.serviceWorker.register("/sw.js");
        await navigator.serviceWorker.ready;
        if (!vapidKey) return; // VAPID not configured — silent no-op
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: vapidKey as unknown as string,
        });
        if (cancelled) return;
        const json = sub.toJSON() as { p256dh?: string; auth?: string };
        await subscribe({
          endpoint: sub.endpoint,
          p256dh: json.p256dh ?? "",
          auth: json.auth ?? "",
        });
      } catch {
        // Permission denied or push unsupported — non-fatal.
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [enabled, subscribe, unsubscribe, vapidKey]);
}

/** Notify the current user via push (used by the Follow-ups beacon). */
export async function notifyViaPush(
  notify: (args: { title: string; body: string }) => Promise<unknown>,
  title: string,
  body: string,
) {
  try {
    await notify({ title, body });
  } catch {
    /* push is best-effort */
  }
}
