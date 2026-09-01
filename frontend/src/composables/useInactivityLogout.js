import { onMounted, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "stores/auth";

const INACTIVITY_MS = 15 * 60 * 1000; // 15 minutes

export function useInactivityLogout() {
  const router = useRouter();
  const auth = useAuthStore();
  let timer = null;

  function resetTimer() {
    if (!auth.isAuthenticated) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      auth.logout();
      router.push({ name: "login", query: { reason: "inactivity" } });
    }, INACTIVITY_MS);
  }

  const events = ["click", "keydown", "scroll", "mousemove", "touchstart"];

  onMounted(() => {
    events.forEach((e) => window.addEventListener(e, resetTimer, { passive: true }));
    resetTimer();
  });

  onUnmounted(() => {
    clearTimeout(timer);
    events.forEach((e) => window.removeEventListener(e, resetTimer));
  });
}
