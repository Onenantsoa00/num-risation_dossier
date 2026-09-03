import { computed, onMounted, onUnmounted, ref, unref, watch } from "vue";
import {
  DEADLINE_WORKING_SECONDS,
  getDeadlineRemaining,
  getDeadlineType,
} from "src/utils/deadline";
import { api } from "boot/axios";

export function useDeadlineTimer(dossierRef, authStore) {
  const serverRemaining = ref(null);
  const serverTimestamp = ref(null); // timestamp du dernier fetch serveur
  const localRemaining = ref(null);
  const isPaused = ref(false);
  const waiting = ref(false);
  const label = ref("");
  let tickInterval = null;
  let syncInterval = null;

  /** Jours fériés chargés depuis l'API */
  const jourFeries = ref([]);

  async function loadJourFeries() {
    try {
      const { data } = await api.get("/jours-feries");
      jourFeries.value = data.map((j) => j.date_ferie);
    } catch {
      jourFeries.value = [];
    }
  }

  /**
   * Synchroniser avec le serveur.
   * Récupère le temps restant réel et le timestamp du serveur.
   */
  async function syncWithServer() {
    const dossier = unref(dossierRef);
    if (!dossier) {
      localRemaining.value = null;
      label.value = "";
      waiting.value = false;
      return;
    }

    // Si le backend indique "waiting" (FIFO), pas de timer
    if (dossier.deadline_waiting) {
      localRemaining.value = DEADLINE_WORKING_SECONDS;
      isPaused.value = true;
      waiting.value = true;
      label.value = "En attente (file FIFO)";
      serverRemaining.value = DEADLINE_WORKING_SECONDS;
      serverTimestamp.value = Date.now();
      return;
    }

    const type = getDeadlineType(dossier, authStore.role, authStore.user?.id);
    if (!type) {
      localRemaining.value = null;
      label.value = "";
      waiting.value = false;
      serverRemaining.value = null;
      return;
    }

    const result = getDeadlineRemaining(
      dossier,
      type,
      null,
      null,
      jourFeries.value,
    );

    serverRemaining.value = result.remainingSec;
    serverTimestamp.value = Date.now();
    localRemaining.value = result.remainingSec;
    isPaused.value = result.isPaused;
    waiting.value = false;
    label.value = formatLabel(result.remainingSec, result.isPaused);
  }

  /**
   * Tick local : décrémente d'1 seconde toutes les secondes
   * comme une vraie horloge numérique.
   */
  function tick() {
    if (waiting.value) return;
    if (isPaused.value) return;
    if (serverRemaining.value == null) return;
    if (localRemaining.value == null) return;
    if (localRemaining.value <= 0) return;

    // Décrémenter d'1 seconde
    localRemaining.value = Math.max(0, localRemaining.value - 1);
    label.value = formatLabel(localRemaining.value, isPaused.value);
  }

  function formatLabel(sec, paused) {
    if (sec <= 0) return "Dépassé";
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    const base = `${h}h ${String(m).padStart(2, "0")}min ${String(s).padStart(2, "0")}s`;
    return paused ? `${base} (pause)` : base;
  }

  // Resynchroniser avec le serveur quand le dossier change
  watch(
    () => unref(dossierRef),
    async () => {
      await syncWithServer();
    },
    { deep: true, immediate: true },
  );

  onMounted(async () => {
    await loadJourFeries();
    await syncWithServer();

    // Tick local toutes les secondes (horloge en temps réel)
    tickInterval = setInterval(tick, 1000);

    // Resynchroniser avec le serveur toutes les 30 secondes
    // pour corriger les dérives
    syncInterval = setInterval(syncWithServer, 30000);
  });

  onUnmounted(() => {
    if (tickInterval) clearInterval(tickInterval);
    if (syncInterval) clearInterval(syncInterval);
  });

  const remainingSec = computed(() => localRemaining.value);

  const color = computed(() => {
    if (waiting.value) return "warning";
    if (localRemaining.value == null) return "grey";
    if (localRemaining.value <= 0) return "negative";
    if (isPaused.value) return "grey-7";
    if (localRemaining.value < 1800) return "negative";
    if (localRemaining.value < 3600) return "warning";
    return "info";
  });

  return {
    remainingSec,
    isPaused,
    waiting,
    label,
    color,
    recompute: syncWithServer,
  };
}
