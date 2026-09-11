/**
 * Calcul des deadlines en heures ouvrées uniquement.
 * Plages : 08h-12h et 14h-16h, heure de Madagascar
 * (fuseau Indian/Antananarivo, UTC+3, sans heure d'été).
 * Jours ouvrés : lundi à vendredi, hors jours fériés.
 *
 * Nouvelle règle (définie par le métier) :
 *  - Quand la « pile » (file FIFO) d'un vérificateur / validateur est VIDE
 *    et qu'un premier dossier lui est assigné, la pile démarre avec un
 *    budget de 12 h de travail.
 *  - Chaque dossier supplémentaire qui entre dans une pile NON vide
 *    ajoute +3 h (n° de compte « rapide ») ou +12 h (autre compte).
 *  - La deadline de la pile = pile_start + budget total (en heures ouvrées).
 *  - Quand la pile se vide, le prochain dossier démarre une nouvelle pile
 *    (budget = 12 h à nouveau).
 *  - Le chrono se met en pause pendant : congé de la personne assignée,
 *    jours fériés, week-ends, et hors des plages 08h-12h / 14h-16h.
 */

const TIMEZONE = "Indian/Antananarivo";

// Ancienne règle (conservée en secours pour les dossiers déjà en cours)
const DEADLINE_WORKING_SECONDS = 16 * 3600; // 16 heures ouvrées

// Nouvelle règle : pile FIFO par utilisateur
const PILE_BASE_SEC = 12 * 3600; // 1er dossier d'une pile vide → 12h
const FAST_ACCOUNT_CODES = [
  "6241",
  "6131",
  "6561",
  "6242",
  "6231",
  "6232",
  "6263",
  "6264",
];

/**
 * Budget (en secondes) ajouté à la pile par un dossier supplémentaire
 * qui entre alors que la pile n'est pas vide.
 */
function pileExtraSecForAccount(nCompte) {
  const code = String(nCompte || "").trim();
  if (FAST_ACCOUNT_CODES.includes(code)) return 3 * 3600; // +3h
  return 12 * 3600; // +12h
}

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

function realDateFromParts(parts) {
  // Antananarivo = UTC+3 fixe (pas d'heure d'été).
  // Les parts représentent l'heure « murale » locale → instant réel = parts − 3h.
  return new Date(
    Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second || 0,
    ) - 3 * 3600 * 1000,
  );
}

/**
 * Avance depuis une date de départ en ajoutant `workingSeconds` de TRAVAIL
 * (seules les minutes ouvrées comptent : 08h-12h / 14h-16h, hors week-end,
 * jours fériés et congé). Renvoie l'instant absolu (Date) atteint.
 */
function addWorkingSeconds(
  fromDate,
  workingSeconds,
  congeDebut,
  congeFin,
  jourFeries,
) {
  if (!fromDate) return null;
  let parts = getParisParts(new Date(fromDate));
  let remaining = Math.max(0, Number(workingSeconds) || 0);
  let safety = 0;
  const maxIter = 366 * 24 * 60; // 1 an max de minutes

  while (safety < maxIter) {
    if (remaining <= 0) break;
    if (
      isWorkingMinute(parts, jourFeries) &&
      !isOnCongeDate(parts, congeDebut, congeFin)
    ) {
      remaining -= 60;
    }
    parts = advanceOneMinute(parts);
    safety += 1;
  }
  return realDateFromParts(parts);
}

/**
 * Calcule le temps restant en secondes ouvrées pour un dossier.
 *
 * Nouveau modèle « pile » : si le dossier porte des champs de pile
 * (deadline_*_pile_start + deadline_*_pile_budget_sec), la deadline est
 * celle de la pile complète (FIFO). Sinon, on retombe sur l'ancien
 * modèle par dossier (compatibilité).
 */
async function getDeadlineRemaining(
  dossier,
  type,
  congeDebut,
  congeFin,
  nowMs = Date.now(),
) {
  const jourFeries = await getJourFeries();
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
  const pausedAt = isVerif
    ? dossier.deadline_verif_paused_at
    : dossier.deadline_valid_paused_at;

  // FIFO : si assigned_at est NULL, le dossier est en attente derrière
  // un autre dossier actif (l'ordre est géré par startNextQueuedTimer).
  const waiting = !assignedAt;

  const now = new Date(nowMs);

  // ── Nouveau modèle « pile » ────────────────────────────────
  if (pileStart && pileBudget) {
    const elapsed = countWorkingSeconds(
      new Date(pileStart),
      now,
      congeDebut,
      congeFin,
      jourFeries,
    );
    const remaining = Math.max(0, Number(pileBudget) - elapsed);
    const isPaused = isDeadlinePausedNow(congeDebut, congeFin, jourFeries);
    return { remaining, isPaused, waiting };
  }

  // ── Ancien modèle par dossier (compatibilité) ──────────────
  if (!assignedAt) {
    return { remaining: DEADLINE_WORKING_SECONDS, isPaused: true, waiting: true };
  }

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
    (pausedAt && !isWorkingMinute(getParisParts(new Date(nowMs)), jourFeries));

  return { remaining, isPaused, waiting: false };
}

/**
 * Date (instantané absolu) de la deadline d'une pile (budget total partagé).
 */
async function getPileDeadlineAt(dossier, type, congeDebut, congeFin) {
  const jourFeries = await getJourFeries();
  const isVerif = type === "verification";
  const pileStart = isVerif
    ? dossier.deadline_verif_pile_start
    : dossier.deadline_valid_pile_start;
  const pileBudget = isVerif
    ? dossier.deadline_verif_pile_budget_sec
    : dossier.deadline_valid_pile_budget_sec;
  if (!pileStart || !pileBudget) return null;
  return addWorkingSeconds(
    pileStart,
    pileBudget,
    congeDebut,
    congeFin,
    jourFeries,
  );
}

/**
 * Date de deadline INDIVIDUELLE d'un dossier dans la pile.
 * Utilise own_budget_sec (cumul au moment de l'entrée dans la pile) :
 *  - 1er dossier → 12h
 *  - suivants → 12h + 3h/12h + …
 * Fallback sur le budget total de pile si own_budget n'est pas encore renseigné.
 */
async function getDossierOwnDeadlineAt(dossier, type, congeDebut, congeFin) {
  const jourFeries = await getJourFeries();
  const isVerif = type === "verification";
  const pileStart = isVerif
    ? dossier.deadline_verif_pile_start
    : dossier.deadline_valid_pile_start;
  const ownBudget = isVerif
    ? dossier.deadline_verif_own_budget_sec
    : dossier.deadline_valid_own_budget_sec;
  const pileBudget = isVerif
    ? dossier.deadline_verif_pile_budget_sec
    : dossier.deadline_valid_pile_budget_sec;
  const budget = Number(ownBudget || pileBudget || 0);
  if (!pileStart || !budget) return null;
  return addWorkingSeconds(
    pileStart,
    budget,
    congeDebut,
    congeFin,
    jourFeries,
  );
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
  PILE_BASE_SEC,
  FAST_ACCOUNT_CODES,
  pileExtraSecForAccount,
  countWorkingSeconds,
  addWorkingSeconds,
  getDeadlineRemaining,
  getPileDeadlineAt,
  getDossierOwnDeadlineAt,
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
