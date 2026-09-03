import { onMounted, onUnmounted } from "vue";
import { useAuthStore } from "stores/auth";
import { getSocket } from "boot/socket";

export function usePresence(dossierIdRef = null) {
  const auth = useAuthStore();
  let interval = null;

  function sendHeartbeat(status = "online") {
    if (!auth.isAuthenticated) return;

    const socket = getSocket();
    if (socket?.connected) {
      socket.emit("presence:heartbeat", {
        status,
        dossier_id: dossierIdRef?.value || null,
      });
    }
  }

  function sendOffline() {
    const socket = getSocket();
    if (socket?.connected) {
      socket.emit("presence:heartbeat", { status: "offline", dossier_id: null });
    }
  }

  function onKeydown() {
    sendHeartbeat("typing");
  }

  // Throttle scroll : max 1 heartbeat toutes les 2 secondes
  let lastScrollHeartbeat = 0;
  function onScroll() {
    const now = Date.now();
    if (now - lastScrollHeartbeat > 2000) {
      lastScrollHeartbeat = now;
      sendHeartbeat(dossierIdRef?.value ? "scrolling" : "online");
    }
  }

  // Retour au "online" après 3 secondes d'inactivité de frappe
  let typingTimeout = null;
  function onKeydownWithReset() {
    sendHeartbeat("typing");
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
      sendHeartbeat("online");
    }, 3000);
  }

  function onBeforeUnload() {
    sendOffline();
  }

  function onVisibilityChange() {
    if (document.hidden) {
      sendHeartbeat("online");
    } else {
      sendHeartbeat("online");
    }
  }

  onMounted(() => {
    sendHeartbeat("online");
    // Heartbeat WebSocket toutes les 5 secondes
    interval = setInterval(() => sendHeartbeat("online"), 5000);
    window.addEventListener("keydown", onKeydownWithReset, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("visibilitychange", onVisibilityChange);
  });

  onUnmounted(() => {
    clearInterval(interval);
    clearTimeout(typingTimeout);
    window.removeEventListener("keydown", onKeydownWithReset);
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("beforeunload", onBeforeUnload);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    sendOffline();
  });

  return { sendHeartbeat, sendOffline };
}
