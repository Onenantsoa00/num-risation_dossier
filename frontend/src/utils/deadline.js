// Heure de l'entreprise : Indian/Antananarivo (UTC+3, sans heure d'été).
// Les horaires 08h-12h / 14h-16h suivent l'horloge SERVEUR (Madagascar),
// pas l'horloge du PC (certains postes ne sont pas à jour).
const TIMEZONE = "Indian/Antananarivo";

// Ancien modèle (compatibilité) : 16h de travail par dossier
export const DEADLINE_WORKING_SECONDS = 16 * 3600;

// Seuils d'aide visuelle
export const COLOR_GREEN_ABOVE_SEC = 24 * 3600; // > 1 jour → vert
export const COLOR_YELLOW_ABOVE_SEC = 3 * 3600; // > 3h → jaune ; ≤ 3h → rouge

export function getParisParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const get = (type) => Number(parts.find((p) => p.type === type)?.value || 0);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

function toAntananarivoDate(parts) {
  return new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second),
  );
}

function isWeekend(parts) {
  const date = toAntananarivoDate(parts);
  const dayOfWeek = date.getUTCDay();
  return dayOfWeek === 0 || dayOfWeek === 6;
}

export function dateOnly(value) {
  if (!value) return null;
  return String(value).slice(0, 10);
}

function dateStrFromParts(parts) {
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function isJourFerier(parts, jourFeries) {
  if (!jourFeries || jourFeries.length === 0) return false;
  const dateStr = dateStrFromParts(parts);
  return jourFeries.some((j) => dateOnly(j) === dateStr);
}

export function isWorkingMinute(parts, jourFeries) {
  if (isWeekend(parts)) return false;
  if (isJourFerier(parts, jourFeries)) return false;

  const totalMin = parts.hour * 60 + parts.minute;
  return (
    (totalMin >= 8 * 60 && totalMin < 12 * 60) ||
    (totalMin >= 14 * 60 && totalMin < 16 * 60)
  );
}

function isOnCongeDate(parts, congeDebut, congeFin) {
  const debut = dateOnly(congeDebut);
  const fin = dateOnly(congeFin);
  if (!debut || !fin) return false;
  const dateStr = dateStrFromParts(parts);
  return dateStr >= debut && dateStr <= fin;
}

/**
 * En pause ou non à l'instant `at` (Date absolue). `at` doit être dérivé de
 * l'horloge du serveur (deadline_server_now) pour ignorer l'heure du PC.
 */
export function isDeadlinePausedNow(congeDebut, congeFin, jourFeries, at = new Date()) {
  const parts = getParisParts(at);
  if (isOnCongeDate(parts, congeDebut, congeFin)) return true;
  return !isWorkingMinute(parts, jourFeries);
}

/**
 * Couleur d'aide visuelle :
 *   waiting (file FIFO) → neutre/jaune ; > 24h → vert ; 3h–24h → jaune ;
 *   < 3h → rouge ; pause → gris.
 */
export function deadlineColor(remainingSec, { waiting = false, paused = false } = {}) {
  if (waiting) return "waiting";
  if (remainingSec == null) return "grey";
  if (remainingSec <= 0) return "red";
  if (paused) return "grey";
  if (remainingSec > COLOR_GREEN_ABOVE_SEC) return "green";
  if (remainingSec > COLOR_YELLOW_ABOVE_SEC) return "yellow";
  return "red";
}

function advanceOneMinute(parts) {
  let { year, month, day, hour, minute, second } = parts;
  minute += 1;
  if (minute >= 60) {
    minute = 0;
    hour += 1;
  }
  if (hour >= 24) {
    hour = 0;
    day += 1;
    const daysInMonth = new Date(year, month, 0).getDate();
    if (day > daysInMonth) {
      day = 1;
      month += 1;
    }
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return { year, month, day, hour, minute, second };
}

function countWorkingSeconds(fromDate, toDate, congeDebut, congeFin, jourFeries) {
  if (!fromDate || !toDate) return 0;
  const start = new Date(fromDate);
  const end = new Date(toDate);
  if (end <= start) return 0;

  let parts = getParisParts(start);
  const endParts = getParisParts(end);
  let seconds = 0;
  let safety = 0;

  while (safety < 366 * 24 * 60) {
    const currentStr =
      `${parts.year}${String(parts.month).padStart(2, "0")}${String(parts.day).padStart(2, "0")}` +
      `${String(parts.hour).padStart(2, "0")}${String(parts.minute).padStart(2, "0")}`;
    const endStr =
      `${endParts.year}${String(endParts.month).padStart(2, "0")}${String(endParts.day).padStart(2, "0")}` +
      `${String(endParts.hour).padStart(2, "0")}${String(endParts.minute).padStart(2, "0")}`;
    if (currentStr >= endStr) break;
    if (isWorkingMinute(parts, jourFeries) && !isOnCongeDate(parts, congeDebut, congeFin)) {
      seconds += 60;
    }
    parts = advanceOneMinute(parts);
    safety += 1;
  }
  return seconds;
}

/**
 * Calcule le temps restant (secondes de TRAVAIL) côté client.
 * Modèle « pile » : budget partagé depuis deadline_*_pile_start.
 * Le paramètre `now` (Date) doit venir de l'horloge serveur (décalée).
 */
export function getDeadlineRemaining(
  dossier,
  type,
  congeDebut,
  congeFin,
  jourFeries,
  now = new Date(),
) {
  const isVerif = type === "verification";
  const pileStart = isVerif
    ? dossier.deadline_verif_pile_start
    : dossier.deadline_valid_pile_start;
  const pileBudget = isVerif
    ? dossier.deadline_verif_pile_budget_sec
    : dossier.deadline_valid_pile_budget_sec;
  const assignedAt = isVerif
    ? dossier.assigned_verification_at
    : dossier.assigned_validation_at;
  const elapsedStored = isVerif
    ? dossier.deadline_verif_elapsed_sec || 0
    : dossier.deadline_valid_elapsed_sec || 0;

  const waiting = !assignedAt;

  if (pileStart && pileBudget) {
    const elapsed = countWorkingSeconds(new Date(pileStart), now, congeDebut, congeFin, jourFeries);
    const remainingSec = Math.max(0, Number(pileBudget) - elapsed);
    const isPaused = isDeadlinePausedNow(congeDebut, congeFin, jourFeries, now);
    return { remainingSec, isPaused, waiting };
  }

  // Ancien modèle (compatibilité) — dossier sans pile
  if (!assignedAt) {
    return {
      remainingSec: DEADLINE_WORKING_SECONDS,
      isPaused: isDeadlinePausedNow(congeDebut, congeFin, jourFeries, now),
      waiting: true,
    };
  }
  const additional = countWorkingSeconds(new Date(assignedAt), now, congeDebut, congeFin, jourFeries);
  const totalElapsed = elapsedStored + additional;
  const remainingSec = Math.max(0, DEADLINE_WORKING_SECONDS - totalElapsed);
  const isPaused = isDeadlinePausedNow(congeDebut, congeFin, jourFeries, now);
  return { remainingSec, isPaused, waiting };
}

export function formatDeadlineLabel(remainingSec, isPaused) {
  if (remainingSec <= 0) return "Dépassé";
  const h = Math.floor(remainingSec / 3600);
  const m = Math.floor((remainingSec % 3600) / 60);
  const s = remainingSec % 60;
  const base = `${h}h ${String(m).padStart(2, "0")}min ${String(s).padStart(2, "0")}s`;
  return isPaused ? `${base} (pause)` : base;
}

export function getDeadlineType(dossier, userRole) {
  if (!dossier) return null;
  if (dossier.statut === "EN_VERIFICATION") {
    if (["Verificateur", "Admin", "super_admin"].includes(userRole)) return "verification";
    return null;
  }
  if (dossier.statut === "EN_VALIDATION") {
    if (["Validateur", "Admin", "super_admin"].includes(userRole)) return "validation";
    return null;
  }
  return null;
}
