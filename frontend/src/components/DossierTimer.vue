<template>
  <div class="dossier-timer" :class="timerClass">
    <!-- Mode EN ATTENTE (FIFO) -->
    <div v-if="waiting" class="timer-waiting">
      <div class="timer-waiting-icon">
        <q-icon name="hourglass_top" size="24px" />
      </div>
      <div class="timer-waiting-text">En attente</div>
      <div class="timer-waiting-sub">File FIFO — le timer démarrera après le dossier précédent</div>
    </div>

    <!-- Mode DÉPASSÉ -->
    <div v-else-if="expired" class="timer-expired">
      <div class="timer-digits timer-digits--expired">
        <span class="digit-group">00</span>
        <span class="digit-sep">:</span>
        <span class="digit-group">00</span>
        <span class="digit-sep">:</span>
        <span class="digit-group">00</span>
      </div>
      <div class="timer-status timer-status--expired">
        <q-icon name="warning" size="16px" class="q-mr-xs" />
        DÉPASSÉ
      </div>
    </div>

    <!-- Mode PAUSE -->
    <div v-else-if="isPaused" class="timer-paused">
      <div class="timer-digits timer-digits--paused">
        <span class="digit-group">{{ paddedHours }}</span>
        <span class="digit-sep digit-sep--blink">:</span>
        <span class="digit-group">{{ paddedMinutes }}</span>
        <span class="digit-sep digit-sep--blink">:</span>
        <span class="digit-group">{{ paddedSeconds }}</span>
      </div>
      <div class="timer-status timer-status--paused">
        <q-icon name="pause_circle" size="16px" class="q-mr-xs" />
        PAUSE
      </div>
    </div>

    <!-- Mode NORMAL : countdown -->
    <div v-else class="timer-active">
      <div class="timer-digits" :class="urgencyClass">
        <span class="digit-group">{{ paddedHours }}</span>
        <span class="digit-sep">:</span>
        <span class="digit-group">{{ paddedMinutes }}</span>
        <span class="digit-sep">:</span>
        <span class="digit-group">{{ paddedSeconds }}</span>
      </div>
      <div class="timer-label">
        <q-icon name="timer" size="14px" class="q-mr-xs" />
        {{ timeLabel }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";

const props = defineProps({
  remainingSec: { type: Number, default: null },
  isPaused: { type: Boolean, default: false },
  waiting: { type: Boolean, default: false },
  color: { type: String, default: "grey" },
});

const hours = computed(() => {
  if (props.remainingSec == null) return 0;
  return Math.floor(props.remainingSec / 3600);
});

const minutes = computed(() => {
  if (props.remainingSec == null) return 0;
  return Math.floor((props.remainingSec % 3600) / 60);
});

const seconds = computed(() => {
  if (props.remainingSec == null) return 0;
  return props.remainingSec % 60;
});

const paddedHours = computed(() => String(hours.value).padStart(2, "0"));
const paddedMinutes = computed(() => String(minutes.value).padStart(2, "0"));
const paddedSeconds = computed(() => String(seconds.value).padStart(2, "0"));

const expired = computed(
  () => props.remainingSec != null && props.remainingSec <= 0 && !props.waiting,
);

const urgencyClass = computed(() => {
  if (expired.value) return "timer-digits--expired";
  if (props.remainingSec <= 1800) return "timer-digits--danger"; // 30 min
  if (props.remainingSec <= 3600) return "timer-digits--warning"; // 1h
  return "timer-digits--normal";
});

const timeLabel = computed(() => {
  if (hours.value > 0) return `${hours.value}h restant${hours.value > 1 ? "s" : ""}`;
  if (minutes.value > 0) return `${minutes.value}min restant${minutes.value > 1 ? "s" : ""}`;
  return `${seconds.value}s restant`;
});

const timerClass = computed(() => ({
  "dossier-timer--expired": expired.value,
  "dossier-timer--paused": props.isPaused && !props.waiting,
  "dossier-timer--waiting": props.waiting,
  "dossier-timer--danger": props.remainingSec <= 1800 && !expired.value && !props.waiting,
  "dossier-timer--warning": props.remainingSec <= 3600 && props.remainingSec > 1800 && !props.waiting,
}));
</script>

<style scoped>
.dossier-timer {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
  border-radius: 12px;
  padding: 12px 18px;
  min-width: 220px;
  box-shadow:
    0 4px 15px rgba(0, 0, 0, 0.3),
    inset 0 1px 0 rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

/* ── DIGITS ── */
.timer-digits {
  font-family: "JetBrains Mono", "Fira Code", "SF Mono", "Consolas", monospace;
  font-size: 36px;
  font-weight: 800;
  letter-spacing: 3px;
  line-height: 1;
  display: flex;
  align-items: center;
  gap: 2px;
}

.digit-group {
  background: rgba(255, 255, 255, 0.07);
  border-radius: 6px;
  padding: 4px 8px;
  min-width: 52px;
  text-align: center;
}

.digit-sep {
  font-size: 32px;
  color: rgba(255, 255, 255, 0.5);
  margin: 0 2px;
}

/* ── COULEURS PAR ÉTAT ── */
.timer-digits--normal {
  color: #4ade80; /* vert */
}

.timer-digits--warning {
  color: #fbbf24; /* jaune */
}

.timer-digits--danger {
  color: #f87171; /* rouge clair */
  animation: pulse-danger 1s ease-in-out infinite;
}

.timer-digits--expired {
  color: #ef4444; /* rouge */
  animation: pulse-expired 0.6s ease-in-out infinite;
}

.timer-digits--paused {
  color: #94a3b8; /* gris */
}

/* ── LABELS ── */
.timer-label {
  margin-top: 6px;
  font-size: 11px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.5);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.timer-status {
  margin-top: 6px;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1px;
  display: flex;
  align-items: center;
}

.timer-status--expired {
  color: #ef4444;
}

.timer-status--paused {
  color: #94a3b8;
}

/* ── MODE EN ATTENTE ── */
.timer-waiting {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.timer-waiting-icon {
  color: #fbbf24;
  animation: hourglass-spin 2s ease-in-out infinite;
}

.timer-waiting-text {
  color: #fbbf24;
  font-size: 16px;
  font-weight: 700;
}

.timer-waiting-sub {
  color: rgba(255, 255, 255, 0.4);
  font-size: 10px;
  text-align: center;
  max-width: 180px;
  line-height: 1.3;
}

/* ── BLINK (pause) ── */
.digit-sep--blink {
  animation: blink 1s step-end infinite;
}

/* ── ANIMATIONS ── */
@keyframes blink {
  50% {
    opacity: 0;
  }
}

@keyframes pulse-danger {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.6;
  }
}

@keyframes pulse-expired {
  0%,
  100% {
    opacity: 1;
    text-shadow: 0 0 10px rgba(239, 68, 68, 0.5);
  }
  50% {
    opacity: 0.5;
    text-shadow: 0 0 20px rgba(239, 68, 68, 0.8);
  }
}

@keyframes hourglass-spin {
  0%,
  100% {
    transform: rotate(0deg);
  }
  50% {
    transform: rotate(15deg);
  }
}

/* ── VARIANTS (bordure gauche colorée) ── */
.dossier-timer--expired {
  border-left: 3px solid #ef4444;
}

.dossier-timer--danger {
  border-left: 3px solid #f87171;
}

.dossier-timer--warning {
  border-left: 3px solid #fbbf24;
}
</style>
