"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { BellOff, BellRing } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useFormAction } from "@/components/forms";
import { sendTestPush } from "@/server/actions/integrations";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

const noopSubscribe = () => () => {};

export function PushToggle({ configured, publicKey }: { configured: boolean; publicKey?: string }) {
  const supported = useSyncExternalStore(
    noopSubscribe,
    () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window,
    () => null,
  );
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const test = useFormAction(sendTestPush);

  useEffect(() => {
    if (!supported) return;
    navigator.serviceWorker.getRegistration("/").then((reg) => reg?.pushManager.getSubscription().then((s) => setSubscribed(Boolean(s))));
  }, [supported]);

  if (!configured) return <p className="text-xs text-muted-foreground">Web push keys (VAPID) are not configured on this deployment.</p>;
  if (supported === false) return <p className="text-xs text-muted-foreground">This browser doesn&apos;t support push notifications. On iPhone, add Orbit to the Home Screen first.</p>;

  async function enable() {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        toast.error("Notifications were blocked in the browser.");
        return;
      }
      const key = publicKey ?? (await fetch("/api/push/key").then((r) => r.json() as Promise<{ key: string }>)).key;
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) });
      const res = await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
      if (!res.ok) throw new Error("Server rejected the subscription");
      setSubscribed(true);
      toast.success("Notifications enabled on this device");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not enable notifications");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    const reg = await navigator.serviceWorker.getRegistration("/");
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await fetch("/api/push/subscribe", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
      await sub.unsubscribe();
    }
    setSubscribed(false);
    setBusy(false);
    toast.success("Notifications disabled on this device");
  }

  return (
    <div className="flex flex-wrap gap-2">
      {subscribed ? (
        <>
          <Button size="sm" variant="outline" onClick={disable} disabled={busy}>
            <BellOff /> Disable on this device
          </Button>
          <form action={test.formAction}>
            <Button size="sm" variant="ghost" type="submit" disabled={test.pending}>
              Send test
            </Button>
          </form>
        </>
      ) : (
        <Button size="sm" onClick={enable} disabled={busy || supported === null}>
          <BellRing /> Enable on this device
        </Button>
      )}
    </div>
  );
}
