/**
 * Suivi de présence utilisateur.
 *
 * Émet des heartbeat vers le backend (WebSocket si disponible,
 * sinon repli HTTP POST /users/presence) pour refléter l'activité :
 *  - "online"    : connecté / inactif → colonne « Activité » = connecté
 *  - "typing"    : l'utilisateur tape au clavier → « en train d'écrire »
 *  - "scrolling" : l'utilisateur fait défiler la page → « en scroll »
 *  - "offline"   : déconnexion (logout, fermeture de l'onglet…)
 *
 * Les listeners sont globaux et ne sont enregistrés qu'une seule fois,
 * même si plusieurs composants appellent usePresence().
 */

import { useAuthStore } from "stores/auth";
import { getSocket } from "boot/socket";
import { api } from "boot/axios";

const HEARTBEAT_MS = 5000; // heartbeat "online" périodique
const TYPING_RESET_MS = 3000; // retour à "online" après 3s sans frappe
const SCROLL_RESET_MS = 4000; // retour à "online" après 4s sans scroll
const SCROLL_THROTTLE_MS = 2000; // max 1 heartbeat scroll / 2s

let started = false;
let heartbeatInterval = null;
let typingResetTimer = null;
let scrollResetTimer = null;
let lastScrollEmit = 0;

function isAuthenticated() {
  return useAuthStore().isAuthenticated;
}

/**
 * Envoie un heartbeat (socket si possible, sinon HTTP).
 */
function emitStatus(status, dossierId = null) {
  if (!isAuthenticated()) return;

  const socket = getSocket();
  if (socket?.connected) {
    socket.emit("presence:heartbeat", {
      status,
      dossier_id: dossierId || null,
    });
    return;
  }

  // Repli HTTP : le WebSocket peut être indisponible
  // (démarrage du serveur, réseau, CORS…)
  api
    .post("/users/presence", {
      status,
      dossier_id: dossierId || null,
    })
    .catch(() => {});
}

function sendHeartbeat(status = "online") {
  emitStatus(status);
}

/** L'utilisateur tape au clavier → "en train d'écrire" */
function onKeydown() {
  emitStatus("typing");
  clearTimeout(typingResetTimer);
  typingResetTimer = setTimeout(() => emitStatus("online"), TYPING_RESET_MS);
}

/** L'utilisateur fait défiler (y compris dans les zones internes) → "en scroll" */
function onScroll() {
  const now = Date.now();
  if (now - lastScrollEmit >= SCROLL_THROTTLE_MS) {
    lastScrollEmit = now;
    emitStatus("scrolling");
  }
  clearTimeout(scrollResetTimer);
  scrollResetTimer = setTimeout(() => emitStatus("online"), SCROLL_RESET_MS);
}

/** Retour visible dans l'onglet → réaffirmer "online" */
function onVisibilityChange() {
  if (!document.hidden) {
    emitStatus("online");
  }
}

/** Fermeture / rechargement de la page → "offline" */
function onPageExit() {
  if (!isAuthenticated()) return;
  const socket = getSocket();
  if (socket?.connected) {
    socket.emit("presence:heartbeat", { status: "offline", dossier_id: null });
  }
  // Repli HTTP best-effort (sendBeacon n'ajoute pas de headers JWT ;
  // la fermeture du socket déclenche de toute façon la déconnexion douce)
}

function startGlobalListeners() {
  window.addEventListener("keydown", onKeydown, { capture: true, passive: true });
  window.addEventListener("scroll", onScroll, { capture: true, passive: true });
  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("beforeunload", onPageExit);
  window.addEventListener("pagehide", onPageExit);

  // Heartbeat périodique pour rester "connecté"
  heartbeatInterval = setInterval(() => emitStatus("online"), HEARTBEAT_MS);
}

export function usePresence() {
  if (!started) {
    started = true;
    startGlobalListeners();
  }

  // Affirmation immédiate au premier montage (après login/hydrate)
  emitStatus("online");

  return { sendHeartbeat, sendOffline: () => emitStatus("offline") };
}
