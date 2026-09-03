/**
 * Calcul des deadlines en heures ouvrées uniquement.
 * Plages : 08h-12h et 14h-16h, heure locale de l'entreprise
 * (fuseau Indian/Antananarivo, UTC+3, sans heure d'été).
 * Jours ouvrés : lundi à vendredi, hors jours fériés.
 * Durée totale : 16 heures ouvrées.
 */

const TIMEZONE = "Indian/Antananarivo";
const DEADLINE_WORKING_SECONDS = 16 * 3600; // 16 heures ouvrées

/** Cache des jours fériés (dates au format YYYY-MM-DD) */
let jourFeriesCache = [];
let jourFeriesCacheDate = null;

/**
 * Charge les jours fériés depuis la BDD (cache 1h).
 */
async function loadJourFeriesFromDB() {
  try {
    const db = require("../config/db");
    // to_char : on compare des dates « calendrier » (YYYY-MM-DD), sans fuseau
    const { rows } = await db.query(
      `SELECT to_char(date_ferie, 'YYYY-MM-DD') AS date_ferie
       FROM jour_ferier ORDER BY date_ferie ASC`
    );
    jourFeriesCache = rows.map((r) => r.date_ferie);
    jourFeriesCacheDate = Date.now();
  } catch {
    // Table peut ne pas encore exister
    jourFeriesCache = [];
    jourFeriesCacheDate = Date.now();
  }
}

/**
 * Retourne les jours fériés (avec cache 1h).
 */
async function getJourFeries() {
  if (!jourFeriesCacheDate || Date.now() - jourFeriesCacheDate > 3600000) {
    await loadJourFeriesFromDB();
  }
  return jourFeriesCache;
}

/**
 * Force le rechargement du cache jours fériés.
 */
function invalidateJourFeriesCache() {
  jourFeriesCacheDate = null;
}

const pad2 = (n) => String(n).padStart(2, "0");

function dateStrFromParts(parts) {
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
}

/**
 * Normalise une date (Date JS, Date PostgreSQL, ISO, 'YYYY-MM-DD')
 * en chaîne 'YYYY-MM-DD' (date calendrier, sans heure).
 */
function toDateStr(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`;
  }
  return String(value).slice(0, 10);
}

/**
 * Date « aujourd'hui » au format YYYY-MM-DD dans la timezone métier (Indian/Antananarivo).
 */
function getTodayDateStr() {
  return dateStrFromParts(getParisParts(new Date()));
}

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
  return new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second),
  );
}

/**
 * Vérifie si le jour est un samedi (6) ou dimanche (0) dans la timezone métier.
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
  const dateStr = dateStrFromParts(parts);
  return jourFeries.includes(dateStr);
}

function isWorkingMinute(parts, jourFeries) {
  // Samedi / dimanche = jamais travaillé
  if (isWeekend(parts)) return false;

  // Jour férié = jamais travaillé
  if (isJourFerier(parts, jourFeries)) return false;

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
  const debut = toDateStr(congeDebut);
  const fin = toDateStr(congeFin);
  if (!debut || !fin) return false;
  const dateStr = dateStrFromParts(parts);
  return dateStr >= debut && dateStr <= fin;
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
function countWorkingSeconds(fromDate, toDate, congeDebut, congeFin, jourFeries) {
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
    const currentStr = `${parts.year}${pad2(parts.month)}${pad2(parts.day)}${pad2(parts.hour)}${pad2(parts.minute)}`;
    const endStr = `${endParts.year}${pad2(endParts.month)}${pad2(endParts.day)}${pad2(endParts.hour)}${pad2(endParts.minute)}`;

    if (currentStr >= endStr) break;

    if (
      isWorkingMinute(parts, jourFeries) &&
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
async function getDeadlineRemaining(dossier, type, congeDebut, congeFin) {
  const jourFeries = await getJourFeries();
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

  // FIFO : si assigned_at est NULL, le timer n'a pas encore démarré
  // (dossier en attente derrière un autre dossier actif)
  if (!assignedAt) {
    return { remaining: DEADLINE_WORKING_SECONDS, isPaused: true, waiting: true };
  }

  const now = new Date();
  let additional = 0;

  if (pausedAt) {
    additional = countWorkingSeconds(
      new Date(assignedAt),
      new Date(pausedAt),
      congeDebut,
      congeFin,
      jourFeries,
    );
  } else {
    additional = countWorkingSeconds(
      new Date(assignedAt),
      now,
      congeDebut,
      congeFin,
      jourFeries,
    );
  }

  const totalElapsed = elapsedStored + additional;
  const remaining = Math.max(0, DEADLINE_WORKING_SECONDS - totalElapsed);
  const isPaused =
    isDeadlinePausedNow(congeDebut, congeFin, jourFeries) ||
    (pausedAt && !isWorkingMinute(getParisParts(new Date()), jourFeries));

  return { remaining, isPaused, waiting: false };
}

function formatRemaining(seconds, isPaused = false) {
  if (seconds <= 0) return "Dépassé";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const base = `${h}h ${String(m).padStart(2, "0")}min ${String(s).padStart(2, "0")}s`;
  return isPaused ? `${base} (pause)` : base;
}

function isDeadlinePausedNow(congeDebut, congeFin, jourFeries) {
  const parts = getParisParts(new Date());
  if (isOnCongeDate(parts, congeDebut, congeFin)) return true;
  return !isWorkingMinute(parts, jourFeries);
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
  getJourFeries,
  invalidateJourFeriesCache,
  loadJourFeriesFromDB,
  dateStrFromParts,
  toDateStr,
  getTodayDateStr,
};
