/**
 * Service WebSocket centralisé (Socket.IO).
 * Gère l'authentification JWT, les salons par utilisateur,
 * et les émissions d'événements en temps réel.
 *
 * Présence :
 * - Suivi actif des connexions par utilisateur (un user peut avoir plusieurs onglets)
 * - Déconnexion douce : 30s de grâce avant de marquer offline
 *   (pour éviter le flicker quand l'utilisateur recharge la page)
 * - Les heartbeat des clients (online / typing / scrolling / offline)
 *   mettent à jour presence_status + last_activity_at
 */

const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const db = require("../config/db");

let io = null;

/** Map<userId, Set<socketId>> — connexions actives par utilisateur */
const activeSockets = new Map();

/** Map<userId, NodeJS.Timeout> — timers de déconnexion douce */
const disconnectTimers = new Map();

const DISCONNECT_GRACE_MS = 30000; // 30 secondes de grâce

const VALID_PRESENCE_STATUSES = ["online", "typing", "viewing", "scrolling", "offline"];

/** Origines autorisées (dev + réseau local), comme le CORS HTTP. */
function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
  ) {
    return true;
  }
  // Réseaux privés LAN
  return (
    /^http:\/\/192\.168\.\d{1,3}\.\d{1,3}(?::\d+)?$/.test(origin) ||
    /^http:\/\/10\.\d{1,3}\.\d{1,3}\.\d{1,3}(?::\d+)?$/.test(origin) ||
    /^http:\/\/172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}(?::\d+)?$/.test(origin)
  );
}

/**
 * Marquer l'utilisateur offline (DB + broadcast aux admins).
 * On ne touche PAS last_activity_at : la date reste la dernière activité connue.
 */
async function markOffline(user, userId) {
  await db.query(
    `UPDATE utilisateur
     SET presence_status = 'offline',
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [userId],
  );
  io.to("admins").emit("presence:update", {
    id: userId,
    nom: user.nom,
    prenoms: user.prenoms,
    role: user.role,
    is_online: false,
    presence_status: "offline",
    presence_dossier_id: null,
  });
  console.log(`[Socket] ${user.prenoms} ${user.nom} marqué offline`);
}

/**
 * Initialiser le serveur Socket.IO sur le serveur HTTP existant.
 */
function initSocket(server) {
  const JWT_SECRET = process.env.JWT_SECRET;

  io = new Server(server, {
    cors: {
      origin: (origin, callback) => {
        if (isAllowedOrigin(origin)) {
          return callback(null, true);
        }
        return callback(new Error("Origine non autorisée par CORS."));
      },
      credentials: true,
    },
    pingTimeout: 30000,
    pingInterval: 10000,
  });

  // ── Auth middleware ──────────────────────────────────────────
  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.query?.token;

      if (!token) {
        return next(new Error("Token manquant"));
      }

      const decoded = jwt.verify(token, JWT_SECRET);
      // Le JWT est signé avec { userId } (voir authController.signToken)
      const userId = decoded.userId ?? decoded.id;

      const { rows } = await db.query(
        `SELECT u.id, u.nom, u.prenoms, u.email, u.actif, r.nom AS role
         FROM utilisateur u
         LEFT JOIN roles r ON r.id = u.id_roles
         WHERE u.id = $1`,
        [userId]
      );

      if (!rows[0] || !rows[0].actif) {
        return next(new Error("Utilisateur introuvable ou désactivé"));
      }

      socket.user = rows[0];
      next();
    } catch (err) {
      next(new Error("Token invalide"));
    }
  });

  // ── Connexion ────────────────────────────────────────────────
  io.on("connection", async (socket) => {
    const user = socket.user;
    const userId = user.id;
    const socketId = socket.id;
    console.log(`[Socket] ${user.prenoms} ${user.nom} connecté (id=${userId}, sid=${socketId})`);

    // Rejoindre le salon personnel
    socket.join(`user:${userId}`);

    // Les admins rejoignent le salon admin
    if (["Admin", "super_admin"].includes(user.role)) {
      socket.join("admins");
    }

    // ── Annuler le timer de déconnexion douce si existant ──
    if (disconnectTimers.has(userId)) {
      clearTimeout(disconnectTimers.get(userId));
      disconnectTimers.delete(userId);
      console.log(`[Socket] Timer déconnexion douce annulé pour user ${userId}`);
    }

    // ── Ajouter cette connexion à la liste active ──
    if (!activeSockets.has(userId)) {
      activeSockets.set(userId, new Set());
    }
    activeSockets.get(userId).add(socketId);

    // ── Marquer en ligne dans la BDD ──
    await db.query(
      `UPDATE utilisateur
       SET presence_status = 'online',
           last_activity_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [userId]
    );

    // ── Broadcaster la présence en ligne ──
    io.to("admins").emit("presence:update", {
      id: userId,
      nom: user.nom,
      prenoms: user.prenoms,
      role: user.role,
      is_online: true,
      presence_status: "online",
      presence_dossier_id: null,
    });

    // ── Heartbeat depuis le client ─────────────────────────────
    socket.on("presence:heartbeat", async (data) => {
      const { status = "online", dossier_id = null } = data || {};
      const presenceStatus = VALID_PRESENCE_STATUSES.includes(status) ? status : "online";

      // ── Déconnexion explicite (logout / fermeture d'onglet) ──
      if (presenceStatus === "offline") {
        const sockets = activeSockets.get(userId);
        if (sockets) {
          sockets.delete(socketId);
          if (sockets.size === 0) {
            activeSockets.delete(userId);
          }
        }

        // Une autre connexion (autre onglet / autre appareil) est encore active :
        // l'utilisateur reste en ligne, on ne marque rien.
        const stillConnected =
          activeSockets.has(userId) && activeSockets.get(userId).size > 0;
        if (stillConnected) {
          return;
        }

        // Plus aucune connexion active → déconnexion immédiate
        // (contrairement à la fermeture brutale qui passe par le délai de grâce)
        try {
          await markOffline(user, userId);
        } catch (err) {
          console.error("[Socket] Erreur marquage offline:", err.message);
        }
        return;
      }

      // ── online / typing / viewing / scrolling ──
      if (!activeSockets.has(userId)) {
        activeSockets.set(userId, new Set([socketId]));
      } else {
        activeSockets.get(userId).add(socketId);
      }

      await db.query(
        `UPDATE utilisateur
         SET presence_status = $1, presence_dossier_id = $2,
             last_activity_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [presenceStatus, dossier_id, userId]
      );

      io.to("admins").emit("presence:update", {
        id: userId,
        nom: user.nom,
        prenoms: user.prenoms,
        role: user.role,
        is_online: true,
        presence_status: presenceStatus,
        presence_dossier_id: dossier_id || null,
      });
    });

    // ── Déconnexion (fermeture brutale, réseau coupé…) ─────────
    socket.on("disconnect", async () => {
      console.log(`[Socket] ${user.prenoms} ${user.nom} déconnecté (sid=${socketId})`);

      // Retirer cette connexion de la liste active
      const sockets = activeSockets.get(userId);
      if (sockets) {
        sockets.delete(socketId);
        if (sockets.size === 0) {
          activeSockets.delete(userId);
        }
      }

      // Si plus aucune connexion active pour cet user, démarrer le timer de grâce
      if (!activeSockets.has(userId)) {
        const timer = setTimeout(async () => {
          // Re-vérifier : l'utilisateur s'est-il reconnecté pendant le délai ?
          if (!activeSockets.has(userId)) {
            try {
              await markOffline(user, userId);
            } catch (err) {
              console.error("[Socket] Erreur déconnexion douce:", err.message);
            }
          }
          disconnectTimers.delete(userId);
        }, DISCONNECT_GRACE_MS);

        disconnectTimers.set(userId, timer);
        console.log(`[Socket] Timer déconnexion douce démarré pour user ${userId} (${DISCONNECT_GRACE_MS}ms)`);
      }
    });
  });

  console.log("[Socket] Serveur WebSocket initialisé");
  return io;
}

function getIO() {
  return io;
}

module.exports = { initSocket, getIO };
