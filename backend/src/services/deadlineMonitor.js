/**
 * Service de surveillance des deadlines.
 * Tourne en arrière-plan et vérifie toutes les 60 secondes :
 * - 2h avant l'échéance → warning à l'utilisateur + admins
 * - Deadline dépassée → notification urgence aux admins
 */

const db = require("../config/db");
const { createNotification, notifyAllAdmins } = require("./helpers");
const {
  getDeadlineRemaining,
  DEADLINE_WORKING_SECONDS,
  getJourFeries,
} = require("./deadline");

const CHECK_INTERVAL_MS = 60_000; // 1 minute
const WARNING_THRESHOLD_SEC = 2 * 3600; // 2 heures

/**
 * Enregistre les notifications déjà envoyées pour éviter les doublons.
 * Clé : `${dossierId}_${type}` → timestamp
 */
const alreadyNotified = new Map();
const NOTIF_COOLDOWN_MS = 3600_000; // 1h entre chaque notif du même type

function notifKey(dossierId, type) {
  return `${dossierId}_${type}`;
}

function shouldNotify(key) {
  const last = alreadyNotified.get(key);
  if (!last) return true;
  if (Date.now() - last > NOTIF_COOLDOWN_MS) {
    alreadyNotified.delete(key);
    return true;
  }
  return false;
}

function markNotified(key) {
  alreadyNotified.set(key, Date.now());
}

/**
 * Cherche tous les dossiers avec un timer actif.
 */
async function getActiveDossiersWithDeadlines() {
  const { rows } = await db.query(`
    SELECT d.*,
           uv.nom AS verificateur_nom,
           uv.prenoms AS verificateur_prenoms,
           uval.nom AS validateur_nom,
           uval.prenoms AS validateur_prenoms
    FROM dossier d
    LEFT JOIN utilisateur uv ON uv.id = d.id_verificateur
    LEFT JOIN utilisateur uval ON uval.id = d.id_validateur
    WHERE d.statut IN ('EN_VERIFICATION', 'EN_VALIDATION')
      AND (
        (d.statut = 'EN_VERIFICATION' AND d.assigned_verification_at IS NOT NULL)
        OR
        (d.statut = 'EN_VALIDATION' AND d.assigned_validation_at IS NOT NULL)
      )
  `);
  return rows;
}

/**
 * Vérifie tous les dossiers actifs et envoie les notifications si nécessaire.
 */
async function checkDeadlines() {
  try {
    const dossiers = await getActiveDossiersWithDeadlines();
    const jourFeries = await getJourFeries();

    for (const dossier of dossiers) {
      const isVerif = dossier.statut === "EN_VERIFICATION";
      const userId = isVerif ? dossier.id_verificateur : dossier.id_validateur;
      const userName = isVerif
        ? `${dossier.verificateur_prenoms || ""} ${dossier.verificateur_nom || ""}`.trim()
        : `${dossier.validateur_prenoms || ""} ${dossier.validateur_nom || ""}`.trim();

      if (!userId) continue;

      // Récupérer congé de l'utilisateur
      const { rows: userRows } = await db.query(
        `SELECT conge_debut, conge_fin FROM utilisateur WHERE id = $1`,
        [userId]
      );
      const congeDebut = userRows[0]?.conge_debut;
      const congeFin = userRows[0]?.conge_fin;

      const result = await getDeadlineRemaining(dossier, isVerif ? "verification" : "validation", congeDebut, congeFin);

      if (result.waiting) continue; // FIFO en attente
      if (result.isPaused) continue; // Hors heures ouvrées

      const remaining = result.remaining;

      // ============================================================
      // DEADLINE DÉPASSÉE
      // ============================================================
      if (remaining <= 0) {
        const key = notifKey(dossier.id, "expired");
        if (shouldNotify(key)) {
          // Notifier l'utilisateur responsable
          await createNotification({
            id_user: userId,
            id_dossier: dossier.id,
            message: `⚠️ URGENCE — Le délai du dossier « ${dossier.nom} » est DÉPASSÉ !`,
            type: "SYSTEME",
          });

          // Notifier tous les admins
          await notifyAllAdmins({
            id_dossier: dossier.id,
            message: `⚠️ URGENCE — Le délai du dossier « ${dossier.nom} » (${isVerif ? "vérification" : "validation"}) est dépassé pour ${userName}.`,
            type: "SYSTEME",
          });

          markNotified(key);
        }
      }
      // ============================================================
      // WARNING 2h avant
      // ============================================================
      else if (remaining <= WARNING_THRESHOLD_SEC) {
        const key = notifKey(dossier.id, "warning_2h");
        if (shouldNotify(key)) {
          const h = Math.floor(remaining / 3600);
          const m = Math.floor((remaining % 3600) / 60);

          // Notifier l'utilisateur responsable
          await createNotification({
            id_user: userId,
            id_dossier: dossier.id,
            message: `⏰ Attention — Il ne reste que ${h}h${String(m).padStart(2, "0")}min pour le dossier « ${dossier.nom} ». Veuillez finaliser votre traitement.`,
            type: "SYSTEME",
          });

          // Notifier les admins
          await notifyAllAdmins({
            id_dossier: dossier.id,
            message: `⏰ Warning — Le dossier « ${dossier.nom} » (${isVerif ? "vérification" : "validation"}) assigné à ${userName} a moins de 2h de délai restant.`,
            type: "SYSTEME",
          });

          markNotified(key);
        }
      }
    }
  } catch (err) {
    console.error("[DeadlineMonitor] Erreur vérification deadlines:", err);
  }
}

let monitorInterval = null;

function startDeadlineMonitor() {
  if (monitorInterval) return;
  console.log("[DeadlineMonitor] Surveillance des deadlines démarrée (vérification toutes les 60s)");
  // Vérifier immédiatement au démarrage (avec un délai pour laisser le serveur démarrer)
  setTimeout(checkDeadlines, 10_000);
  monitorInterval = setInterval(checkDeadlines, CHECK_INTERVAL_MS);
}

function stopDeadlineMonitor() {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
    console.log("[DeadlineMonitor] Surveillance arrêtée");
  }
}

module.exports = {
  startDeadlineMonitor,
  stopDeadlineMonitor,
  checkDeadlines,
};
