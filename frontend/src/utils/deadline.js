const TIMEZONE = "Europe/Paris";
export const DEADLINE_WORKING_SECONDS = 16 * 3600;

function getParisParts(date = new Date()) {
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

function toParisDate(parts) {
  return new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second),
  );
}

/**
 * Vérifie si le jour est un samedi (6) ou dimanche (0) en Europe/Paris.
 */
function isWeekend(parts) {
  const date = toParisDate(parts);
  const dayOfWeek = date.getUTCDay();
  return dayOfWeek === 0 || dayOfWeek === 6;
}

/**
 * Vérifie si la date correspond à un jour férié.
 */
function isJourFerier(parts, jourFeries) {
  if (!jourFeries || jourFeries.length === 0) return false;
  const dateStr = `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
  return jourFeries.includes(dateStr);
}

export function isWorkingMinute(parts, jourFeries) {
  // Samedi / dimanche = jamais travaillé
  if (isWeekend(parts)) return false;

  // Jour férié = jamais travaillé
  if (isJourFerier(parts, jourFeries)) return false;

  const totalMin = parts.hour * 60 + parts.minute;
  return (
    (totalMin >= 8 * 60 && totalMin < 12 * 60) ||
    (totalMin >= 14 * 60 && totalMin < 16 * 60)
  );
}

function isOnCongeDate(parts, congeDebut, congeFin) {
  if (!congeDebut || !congeFin) return false;
  const dateStr = `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
  return dateStr >= congeDebut && dateStr <= congeFin;
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
    const currentStr = `${parts.year}${String(parts.month).padStart(2, "0")}${String(parts.day).padStart(2, "0")}${String(parts.hour).padStart(2, "0")}${String(parts.minute).padStart(2, "0")}`;
    const endStr = `${endParts.year}${String(endParts.month).padStart(2, "0")}${String(endParts.day).padStart(2, "0")}${String(endParts.hour).padStart(2, "0")}${String(endParts.minute).padStart(2, "0")}`;
    if (currentStr >= endStr) break;
    if (isWorkingMinute(parts, jourFeries) && !isOnCongeDate(parts, congeDebut, congeFin)) {
      seconds += 60;
    }
    parts = advanceOneMinute(parts);
    safety += 1;
  }
  return seconds;
}

export function isDeadlinePausedNow(congeDebut, congeFin, jourFeries) {
  const parts = getParisParts();
  if (isOnCongeDate(parts, congeDebut, congeFin)) return true;
  return !isWorkingMinute(parts, jourFeries);
}

export function getDeadlineRemaining(dossier, type, congeDebut, congeFin, jourFeries) {
  const isVerif = type === "verification";
  const assignedAt = isVerif
    ? dossier.assigned_verification_at
    : dossier.assigned_validation_at;
  const elapsedStored = isVerif
    ? dossier.deadline_verif_elapsed_sec || 0
    : dossier.deadline_valid_elapsed_sec || 0;

  if (!assignedAt) {
    return {
      remainingSec: DEADLINE_WORKING_SECONDS,
      isPaused: isDeadlinePausedNow(congeDebut, congeFin, jourFeries),
    };
  }

  const additional = countWorkingSeconds(
    new Date(assignedAt),
    new Date(),
    congeDebut,
    congeFin,
    jourFeries,
  );
  const totalElapsed = elapsedStored + additional;
  const remainingSec = Math.max(0, DEADLINE_WORKING_SECONDS - totalElapsed);
  const isPaused = isDeadlinePausedNow(congeDebut, congeFin, jourFeries);

  return { remainingSec, isPaused };
}

export function formatDeadlineLabel(remainingSec, isPaused) {
  if (remainingSec <= 0) return "Dépassé";
  const h = Math.floor(remainingSec / 3600);
  const m = Math.floor((remainingSec % 3600) / 60);
  const s = remainingSec % 60;
  const base = `${h}h ${String(m).padStart(2, "0")}min ${String(s).padStart(2, "0")}s`;
  return isPaused ? `${base} (pause)` : base;
}

export function getDeadlineType(dossier, userRole, userId) {
  if (!dossier) return null;
  if (
    dossier.statut === "EN_VERIFICATION" &&
    (userRole === "Verificateur" && dossier.id_verificateur === userId)
  ) {
    return "verification";
  }
  if (
    dossier.statut === "EN_VALIDATION" &&
    (userRole === "Validateur" && dossier.id_validateur === userId)
  ) {
    return "validation";
  }
  return null;
}
