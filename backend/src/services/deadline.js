/**
 * Calcul des deadlines en heures ouvrées uniquement.
 * Plages : 08h-12h et 14h-16h (fuseau Europe/Paris).
 * Durée totale : 16 heures ouvrées.
 */

const TIMEZONE = "Europe/Paris";
const DEADLINE_WORKING_SECONDS = 16 * 3600; // 16 heures ouvrées

function getParisParts(date) {
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
  const get = (type) =>
    Number(parts.find((p) => p.type === type)?.value || 0);

  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

function toParisDate(parts) {
  // Construire une date UTC approximative pour itération
  return new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second),
  );
}

function isWorkingMinute(parts) {
  const { hour, minute } = parts;
  const totalMin = hour * 60 + minute;
  const morningStart = 8 * 60;
  const morningEnd = 12 * 60;
  const afternoonStart = 14 * 60;
  const afternoonEnd = 16 * 60;
  return (
    (totalMin >= morningStart && totalMin < morningEnd) ||
    (totalMin >= afternoonStart && totalMin < afternoonEnd)
  );
}

function isOnCongeDate(parts, congeDebut, congeFin) {
  if (!congeDebut || !congeFin) return false;
  const dateStr = `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
  return dateStr >= congeDebut && dateStr <= congeFin;
}

/**
 * Avance d'une minute dans le temps (en heure Paris).
 */
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

/**
 * Compte les secondes ouvrées entre deux dates.
 */
function countWorkingSeconds(fromDate, toDate, congeDebut, congeFin) {
  if (!fromDate || !toDate) return 0;
  const start = new Date(fromDate);
  const end = new Date(toDate);
  if (end <= start) return 0;

  let parts = getParisParts(start);
  const endParts = getParisParts(end);
  let seconds = 0;
  let safety = 0;
  const maxIter = 365 * 24 * 60; // 1 an max

  while (safety < maxIter) {
    const currentStr = `${parts.year}${String(parts.month).padStart(2, "0")}${String(parts.day).padStart(2, "0")}${String(parts.hour).padStart(2, "0")}${String(parts.minute).padStart(2, "0")}`;
    const endStr = `${endParts.year}${String(endParts.month).padStart(2, "0")}${String(endParts.day).padStart(2, "0")}${String(endParts.hour).padStart(2, "0")}${String(endParts.minute).padStart(2, "0")}`;

    if (currentStr >= endStr) break;

    if (
      isWorkingMinute(parts) &&
      !isOnCongeDate(parts, congeDebut, congeFin)
    ) {
      seconds += 60;
    }

    parts = advanceOneMinute(parts);
    safety += 1;
  }

  return seconds;
}

/**
 * Calcule le temps restant en secondes ouvrées pour un dossier.
 */
function getDeadlineRemaining(dossier, type, congeDebut, congeFin) {
  const isVerif = type === "verification";
  const assignedAt = isVerif
    ? dossier.assigned_verification_at
    : dossier.assigned_validation_at;
  const elapsedStored = isVerif
    ? dossier.deadline_verif_elapsed_sec || 0
    : dossier.deadline_valid_elapsed_sec || 0;
  const pausedAt = isVerif
    ? dossier.deadline_verif_paused_at
    : dossier.deadline_valid_paused_at;

  if (!assignedAt) {
    const isPaused = isDeadlinePausedNow(congeDebut, congeFin);
    return { remaining: DEADLINE_WORKING_SECONDS, isPaused };
  }

  const now = new Date();
  let additional = 0;

  if (pausedAt) {
    // Timer en pause (congé) : ne pas compter depuis la pause
    additional = countWorkingSeconds(
      new Date(assignedAt),
      new Date(pausedAt),
      congeDebut,
      congeFin,
    );
  } else {
    additional = countWorkingSeconds(
      new Date(assignedAt),
      now,
      congeDebut,
      congeFin,
    );
  }

  const totalElapsed = elapsedStored + additional;
  const remaining = Math.max(0, DEADLINE_WORKING_SECONDS - totalElapsed);
  const isPaused =
    isDeadlinePausedNow(congeDebut, congeFin) ||
    (pausedAt && !isWorkingMinute(getParisParts(new Date())));

  return { remaining, isPaused };
}

function formatRemaining(seconds, isPaused = false) {
  if (seconds <= 0) return "Dépassé";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const base = `${h}h ${String(m).padStart(2, "0")}min ${String(s).padStart(2, "0")}s`;
  return isPaused ? `${base} (pause)` : base;
}

function isDeadlinePausedNow(congeDebut, congeFin) {
  const parts = getParisParts(new Date());
  if (isOnCongeDate(parts, congeDebut, congeFin)) return true;
  return !isWorkingMinute(parts);
}

function isDeadlineExpired(remaining) {
  return remaining <= 0;
}

module.exports = {
  DEADLINE_WORKING_SECONDS,
  countWorkingSeconds,
  getDeadlineRemaining,
  formatRemaining,
  isDeadlineExpired,
  isWorkingMinute,
  getParisParts,
  isDeadlinePausedNow,
};
