import { computed, onMounted, onUnmounted, ref, unref, watch } from "vue";
import {
  formatDeadlineLabel,
  getDeadlineRemaining,
  getDeadlineType,
} from "src/utils/deadline";
import { api } from "boot/axios";

export function useDeadlineTimer(dossierRef, authStore) {
  const remainingSec = ref(null);
  const isPaused = ref(false);
  const label = ref("");
  let interval = null;

  /** Jours fériés chargés depuis l'API */
  const jourFeries = ref([]);

  async function loadJourFeries() {
    try {
      const { data } = await api.get("/jours-feries");
      jourFeries.value = data.map((j) => j.date_ferie);
    } catch {
      // La route peut ne pas encore exister
      jourFeries.value = [];
    }
  }

  function recompute() {
    const dossier = unref(dossierRef);
    if (!dossier) {
      remainingSec.value = null;
      label.value = "";
      return;
    }

    const type = getDeadlineType(dossier, authStore.role, authStore.user?.id);
    if (!type) {
      remainingSec.value = null;
      label.value = "";
      return;
    }

    const result = getDeadlineRemaining(
      dossier,
      type,
      null,
      null,
      jourFeries.value,
    );
    remainingSec.value = result.remainingSec;
    isPaused.value = result.isPaused;
    label.value = formatDeadlineLabel(result.remainingSec, result.isPaused);
  }

  watch(() => unref(dossierRef), recompute, { deep: true, immediate: true });

  onMounted(async () => {
    await loadJourFeries();
    recompute();
    interval = setInterval(recompute, 1000);
  });

  onUnmounted(() => {
    if (interval) clearInterval(interval);
  });

  const color = computed(() => {
    if (remainingSec.value == null) return "grey";
    if (remainingSec.value <= 0) return "negative";
    if (isPaused.value) return "grey-7";
    if (remainingSec.value < 3600) return "warning";
    return "info";
  });

  return { remainingSec, isPaused, label, color, recompute };
}
