import { defineStore } from "pinia";
import { api } from "boot/axios";
import { playNotificationSound } from "src/utils/notificationSound";
import { getSocket } from "boot/socket";

export const useNotificationStore = defineStore("notifications", {
  state: () => ({
    items: [],
    unread: 0,
    previousUnread: 0,
    _socketListener: false,
    _retryTimer: null,
    _pollTimer: null,
  }),

  actions: {
    async fetch() {
      try {
        const [list, count] = await Promise.all([
          api.get("/notifications"),
          api.get("/notifications/unread-count"),
        ]);
        this.items = list.data;
        this.previousUnread = this.unread;
        this.unread = count.data.count;
      } catch {
        // silencieux
      }
    },

    async markRead(id) {
      await api.patch(`/notifications/${id}/read`);
      await this.fetch();
    },

    async markAllRead() {
      await api.patch("/notifications/read-all");
      await this.fetch();
    },

    /**
     * Écouter les notifications en temps réel via WebSocket.
     * Si le socket n'est pas encore connecté, réessaie toutes les 2 secondes.
     */
    listenRealtime() {
      if (this._socketListener) return;

      const socket = getSocket();
      if (!socket) {
        // Le socket n'existe pas encore — réessayer dans 2s
        if (this._retryTimer) clearTimeout(this._retryTimer);
        this._retryTimer = setTimeout(() => this.listenRealtime(), 2000);
        return;
      }

      this._socketListener = true;
      if (this._retryTimer) clearTimeout(this._retryTimer);

      // Si le socket n'est pas encore connecté, attendre la connexion
      if (!socket.connected) {
        socket.once("connect", () => {
          this._registerListeners(socket);
        });
      } else {
        this._registerListeners(socket);
      }

      // Si le socket se reconnecte, ré-enregistrer les listeners
      if (socket.io) {
        socket.io.on("reconnect", () => {
          console.log("[NotifStore] Socket reconnecté, ré-enregistrement des listeners");
          this._registerListeners(socket);
        });
      }
    },

    _registerListeners(socket) {
      // Supprimer les anciens listeners d'abord
      socket.off("notification:new");
      socket.off("notification:unread-count");

      // ── Nouvelle notification reçue ──
      socket.on("notification:new", (notif) => {
        // Éviter les doublons
        const exists = this.items.some((n) => n.id === notif.id);
        if (!exists) {
          this.items.unshift(notif);
        }
        this.previousUnread = this.unread;
        this.unread++;

        // Jouer le son pour TOUS les rôles
        console.log("[NotifStore] Nouvelle notification reçue:", notif.message);
        playNotificationSound();
      });

      // ── Compteur mis à jour ──
      socket.on("notification:unread-count", (data) => {
        this.previousUnread = this.unread;
        this.unread = data.count;
      });

      console.log("[NotifStore] Listeners WebSocket enregistrés ✓");
    },

    /**
     * Arrêter l'écoute WebSocket.
     */
    stopRealtime() {
      if (this._retryTimer) clearTimeout(this._retryTimer);
      if (this._pollTimer) clearInterval(this._pollTimer);
      const socket = getSocket();
      if (socket) {
        socket.off("notification:new");
        socket.off("notification:unread-count");
        if (socket.io) socket.io.off("reconnect");
      }
      this._socketListener = false;
    },

    /**
     * Démarrer le chargement initial + écoute temps réel.
     * Inclut un fallback polling toutes les 30s si le WebSocket est indisponible.
     */
    startPolling() {
      this.fetch();
      this.listenRealtime();

      // Fallback polling toutes les 30s (sécurité)
      if (this._pollTimer) clearInterval(this._pollTimer);
      this._pollTimer = setInterval(() => {
        const socket = getSocket();
        if (!socket?.connected) {
          // Pas de WebSocket actif — poller le compteur
          api.get("/notifications/unread-count")
            .then(({ data }) => {
              this.previousUnread = this.unread;
              this.unread = data.count;
            })
            .catch(() => {});
        }
      }, 30000);
    },

    stopPolling() {
      this.stopRealtime();
    },
  },
});
