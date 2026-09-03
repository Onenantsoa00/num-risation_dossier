/**
 * Service WebSocket centralisé (Socket.IO).
 * Gère l'authentification JWT, les salons par utilisateur,
 * et les émissions d'événements en temps réel.
 *
 * Présence :
 * - Suivi actif des connexions par utilisateur (un user peut avoir plusieurs onglets)
 * - Déconnexion douce : 30s de grâce avant de marquer offline
 *   (pour éviter le flicker quand l'utilisateur recharge la page)
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

/**
 * Initialiser le serveur Socket.IO sur le serveur HTTP existant.
 */
function initSocket(server) {
  const JWT_SECRET = process.env.JWT_SECRET;

  io = new Server(server, {
    cors: {
      origin: [
        "http://localhost:9000",
        "http://127.0.0.1:9000",
      ],
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

      const { rows } = await db.query(
        `SELECT u.id, u.nom, u.prenoms, u.email, u.actif, r.nom AS role
         FROM utilisateur u
         LEFT JOIN roles r ON r.id = u.id_roles
         WHERE u.id = $1`,
        [decoded.id]
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
    const userId = socket.user.id;
    const socketId = socket.id;
    console.log(`[Socket] ${socket.user.prenoms} ${socket.user.nom} connecté (id=${userId}, sid=${socketId})`);

    // Rejoindre le salon personnel
    socket.join(`user:${userId}`);

    // Les admins rejoignent le salon admin
    if (["Admin", "super_admin"].includes(socket.user.role)) {
      socket.join("admins");
    }

    // ── Annuler le timer de déconnexion douce si存在 ──
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
      nom: socket.user.nom,
      prenoms: socket.user.prenoms,
      role: socket.user.role,
      is_online: true,
      presence_status: "online",
      presence_dossier_id: null,
    });

    // ── Heartbeat depuis le client ─────────────────────────────
    socket.on("presence:heartbeat", async (data) => {
      const { status = "online", dossier_id = null } = data || {};
      const validStatuses = ["online", "typing", "viewing", "scrolling", "offline"];
      const presenceStatus = validStatuses.includes(status) ? status : "online";

      // Si status = offline, retirer cette connexion de la liste active
      if (presenceStatus === "offline") {
        const sockets = activeSockets.get(userId);
        if (sockets) {
          sockets.delete(socketId);
          if (sockets.size === 0) {
            activeSockets.delete(userId);
          }
        }
      }

      // Calculer is_online : true si au moins une connexion active
      const isConnected = activeSockets.has(userId) && activeSockets.get(userId).size > 0;

      await db.query(
        `UPDATE utilisateur
         SET presence_status = $1, presence_dossier_id = $2,
             last_activity_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [presenceStatus === "offline" && !isConnected ? "offline" : presenceStatus, dossier_id, userId]
      );

      io.to("admins").emit("presence:update", {
        id: userId,
        nom: socket.user.nom,
        prenoms: socket.user.prenoms,
        role: socket.user.role,
        is_online: presenceStatus === "offline" && !isConnected ? false : presenceStatus !== "offline",
        presence_status: presenceStatus === "offline" && !isConnected ? "offline" : presenceStatus,
        presence_dossier_id: presenceStatus === "offline" ? null : dossier_id,
      });
    });

    // ── Déconnexion douce ──────────────────────────────────────
    socket.on("disconnect", async () => {
      console.log(`[Socket] ${socket.user.prenoms} ${socket.user.nom} déconnecté (sid=${socketId})`);

      // Retirer cette connexion de la liste active
      const sockets = activeSockets.get(userId);
      if (sockets) {
        sockets.delete(socketId);
        if (sockets.size === 0) {
          activeSockets.delete(userId);
        }
      }

      // Si plus aucune connexion active pour cet user, démarrer le timer de grâce
      if (!activeSockets.has(userId) || activeSockets.get(userId).size === 0) {
        activeSockets.delete(userId);

        const timer = setTimeout(async () => {
          // Re-vérifier : l'utilisateur s'est-il reconnecté pendant le délai ?
          if (!activeSockets.has(userId)) {
            console.log(`[Socket] ${socket.user.prenoms} ${socket.user.nom} marqué offline (grâce expirée)`);
            await db.query(
              `UPDATE utilisateur
               SET presence_status = 'offline',
                   last_activity_at = CURRENT_TIMESTAMP,
                   updated_at = CURRENT_TIMESTAMP
               WHERE id = $1`,
              [userId]
            );
            io.to("admins").emit("presence:update", {
              id: userId,
              nom: socket.user.nom,
              prenoms: socket.user.prenoms,
              role: socket.user.role,
              is_online: false,
              presence_status: "offline",
              presence_dossier_id: null,
            });
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
