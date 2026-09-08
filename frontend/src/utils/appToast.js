/**
 * Notifications « type WhatsApp » :
 *  1. Toast dans l'application (bas à droite) à chaque notification reçue.
 *  2. Notification système (OS) quand l'onglet n'est pas au premier plan.
 *
 * Importe Notify depuis "quasar" : fonctionne hors composant (store Pinia).
 */

import { Notify } from "quasar";

const TOAST_DEDUP_MS = 45_000;
const MAX_TOASTS_PER_SECOND = 3;
const MAX_NATIVE_EVERY_MS = 5_000;

const seenIds = new Map(); // id → timestamp (anti-doublon 45s)
let lastToastTimes = [];

function toastThrottled() {
  const now = Date.now();
  lastToastTimes = lastToastTimes.filter((t) => now - t < 1000);
  if (lastToastTimes.length >= MAX_TOASTS_PER_SECOND) return false;
  lastToastTimes.push(now);
  return true;
}

const iconMap = {
  info: "notifications_active",
  dossier: "folder",
  verification: "fact_check",
  validation: "verified",
  rejet: "cancel",
  systeme: "build",
};

/**
 * Petit toast en bas à droite (comme WhatsApp).
 * @param {{id?: number|string, message?: string, type?: string, id_dossier?: number|null}} notif
 */
export function showAppToast(notif) {
  if (!notif) return;
  const key = notif.id != null ? String(notif.id) : `${notif.message}_${Date.now()}`;
  const last = seenIds.get(key);
  if (last && Date.now() - last < TOAST_DEDUP_MS) return;
  seenIds.set(key, Date.now());
  // Nettoyage occasionnel du cache
  if (seenIds.size > 200) {
    for (const [k, t] of seenIds) {
      if (Date.now() - t > TOAST_DEDUP_MS) seenIds.delete(k);
    }
  }

  const message = notif.message || "Nouvelle notification";
  const type = (notif.type || "INFO").toLowerCase();

  if (toastThrottled()) {
    Notify.create({
      icon: iconMap[type] || iconMap.info,
      color: "dark",
      textColor: "white",
      position: "bottom-right",
      timeout: 6000,
      multiLine: true,
      group: false,
      message,
      caption: "FCE — Notification",
    });
  }

  // Notification système si l'application n'est pas au premier plan
  if (typeof window !== "undefined" && "Notification" in window) {
    const lastNative = window.__fceNativeNotified || 0;
    if (
      Date.now() - lastNative > MAX_NATIVE_EVERY_MS &&
      Notification.permission === "granted" &&
      !document.hasFocus()
    ) {
      try {
        const body = message.length > 180 ? `${message.slice(0, 177)}…` : message;
        const n = new Notification(
          `FCE — ${type === "systeme" ? "Système" : "Nouvelle notification"}`,
          {
            body,
            icon: "/fce.png",
            tag: `fce-${notif.id ?? Date.now()}`,
          },
        );
        window.__fceNativeNotified = Date.now();
        n.onclick = () => {
          window.focus();
          n.close();
        };
      } catch {
        // permission refusée / non disponible
      }
    }
  }
}

/**
 * Demande la permission de notification système.
 * À appeler après un geste utilisateur (clic) pour être accepté par le navigateur.
 */
export function ensureNotificationPermission() {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission === "default") {
    try {
      Notification.requestPermission();
    } catch {
      // certains navigateurs exigent un geste utilisateur
    }
  }
}
