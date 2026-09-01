import { onMounted, onUnmounted } from "vue";
import { api } from "boot/axios";
import { useAuthStore } from "stores/auth";

export function usePresence(dossierIdRef = null) {
  const auth = useAuthStore();
  let interval = null;

  async function sendHeartbeat(status = "online") {
    if (!auth.isAuthenticated) return;
    try {
      await api.post("/users/presence", {
        status,
        dossier_id: dossierIdRef?.value || null,
      });
    } catch {
      // silencieux
    }
  }

  function onKeydown() {
    sendHeartbeat("typing");
  }

  function onScroll() {
    sendHeartbeat(dossierIdRef?.value ? "scrolling" : "online");
  }

  onMounted(() => {
    sendHeartbeat("online");
    interval = setInterval(() => sendHeartbeat("online"), 30000);
    window.addEventListener("keydown", onKeydown, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
  });

  onUnmounted(() => {
    clearInterval(interval);
    window.removeEventListener("keydown", onKeydown);
    window.removeEventListener("scroll", onScroll);
    sendHeartbeat("offline");
  });

  return { sendHeartbeat };
}
