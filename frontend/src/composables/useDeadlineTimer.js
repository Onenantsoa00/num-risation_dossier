import { computed, onMounted, onUnmounted, ref, unref, watch } from "vue";
import { api } from "boot/axios";
import {
  deadlineColor,
  formatDeadlineLabel,
  isDeadlinePausedNow,
} from "src/utils/deadline";

/**
 * Chrono de deadline.
 *
 * Horloge universelle : le serveur (Madagascar) fait foi. Chaque réponse
 * enrichie contient deadline_server_now → on calcule un décalage
 * (serveur − PC) et TOUTES les décisions (pause, travail) utilisent
 * « maintenant virtuel » = horloge du PC + décalage. Ainsi, même si un
 * poste n'est pas à l'heure, le chrono suit l'horloge de Madagascar.
 *
 * Modèle « pile » : le backend fournit deadline_remaining_sec (budget de
 * travail restant de toute la file FIFO). Entre deux synchronisations, le
 * chrono décrémente 1 s/s tant qu'on n'est pas en pause ; les bascules
 * pause/reprise (12h, 14h, 16h, week-end, férié, congé) sont détectées à
 * la seconde grâce à l'horloge virtuelle.
 */
export function useDeadlineTimer(dossierRef) {
  const remainingSec = ref(null);
  const isPaused = ref(false);
  const waiting = ref(false);
  const label = ref("");
  const deadlineAt = ref(null);

  const congeDebut = ref(null);
  const congeFin = ref(null);
  const jourFeries = ref([]);

  // Décalage serveur − PC (ms). Mis à jour à chaque payload enrichi.
  let clockOffsetMs = 0;
  let tickInterval = null;
  let syncInterval = null;
  let lastFeriesLoad = 0;

  function virtualNow() {
    return new Date(Date.now() + clockOffsetMs);
  }

  async function loadJourFeries() {
    const now = Date.now();
    if (now - lastFeriesLoad < 5 * 60_000) return; // au plus toutes les 5 min
    try {
      const { data } = await api.get("/jours-feries");
      jourFeries.value = data.map((j) => String(j.date_ferie).slice(0, 10));
      lastFeriesLoad = Date.now();
    } catch {
      jourFeries.value = [];
    }
  }

  /**
   * Applique l'état « frais » renvoyé par le serveur (dossier enrichi).
   */
  function applyServerState(d) {
    if (!d) return;
    if (d.deadline_server_now) {
      const serverMs = Date.parse(d.deadline_server_now);
      if (!Number.isNaN(serverMs)) {
        clockOffsetMs = serverMs - Date.now();
      }
    }
    waiting.value = !!d.deadline_waiting;
    congeDebut.value = d.deadline_conge_debut || null;
    congeFin.value = d.deadline_conge_fin || null;
    deadlineAt.value = d.deadline_at || null;

    if (d.deadline_remaining_sec == null) {
      // Dossier non enrichi (pas le rôle/statut concerné) → pas de chrono
      remainingSec.value = null;
      isPaused.value = false;
      label.value = "";
      return;
    }

    remainingSec.value = Number(d.deadline_remaining_sec);
    isPaused.value = !!d.deadline_is_paused;
    label.value = waiting.value
      ? "En attente (file FIFO)"
      : formatDeadlineLabel(remainingSec.value, isPaused.value);
  }

  /** Récupère l'état le plus frais auprès du serveur. */
  async function syncWithServer() {
    const dossier = unref(dossierRef);
    if (!dossier?.id) return;

    await loadJourFeries();

    try {
      // Le serveur recalcule remaining/pause à l'instant T → source de vérité.
      const { data } = await api.get(`/dossiers/${dossier.id}`);
      applyServerState(data);
    } catch {
      // Hors ligne / erreur réseau → on garde le dernier état connu.
      applyServerState(dossier);
    }
  }

  /**
   * Tick local : décrément d'1 s chaque seconde tant qu'on n'est pas en
   * pause, avec détection pause/reprise à la seconde (horloge virtuelle).
   */
  function tick() {
    if (waiting.value) return;
    if (remainingSec.value == null) return;
    if (remainingSec.value <= 0) {
      if (label.value !== "Dépassé") label.value = "Dépassé";
      return;
    }

    const now = virtualNow();
    const pausedNow = isDeadlinePausedNow(
      congeDebut.value,
      congeFin.value,
      jourFeries.value,
      now,
    );

    if (pausedNow !== isPaused.value) {
      isPaused.value = pausedNow;
      label.value = formatDeadlineLabel(remainingSec.value, isPaused.value);
    }
    if (pausedNow) return;

    remainingSec.value = Math.max(0, remainingSec.value - 1);
    label.value = formatDeadlineLabel(remainingSec.value, isPaused.value);
  }

  watch(
    () => unref(dossierRef),
    (d) => applyServerState(d),
    { deep: true, immediate: true },
  );

  onMounted(async () => {
    await syncWithServer();
    tickInterval = setInterval(tick, 1000);
    // Resynchronisation périodique (corrige la dérive du PC + jours fériés)
    syncInterval = setInterval(syncWithServer, 60_000);
  });

  onUnmounted(() => {
    if (tickInterval) clearInterval(tickInterval);
    if (syncInterval) clearInterval(syncInterval);
  });

  /** Couleur d'aide visuelle (vert > 24h, jaune 3h–24h, rouge < 3h). */
  const color = computed(() =>
    deadlineColor(remainingSec.value, {
      waiting: waiting.value,
      paused: isPaused.value && !waiting.value,
    }),
  );

  return {
    remainingSec,
    isPaused,
    waiting,
    label,
    deadlineAt,
    color,
    recompute: syncWithServer,
  };
}
