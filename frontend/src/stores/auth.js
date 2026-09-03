import { defineStore } from "pinia";
import { api } from "boot/axios";
import { connectSocket, disconnectSocket } from "boot/socket";

export const useAuthStore = defineStore("auth", {
  state: () => ({
    token: null,
    user: null,
  }),
  getters: {
    isAuthenticated: (s) => !!s.token,
    role: (s) => s.user?.role || null,
    fullName: (s) => (s.user ? `${s.user.prenoms} ${s.user.nom}` : ""),
  },
  actions: {
    hydrate() {
      this.token = localStorage.getItem("token");
      const raw = localStorage.getItem("user");
      this.user = raw ? JSON.parse(raw) : null;

      // Reconnecter le socket si token existant
      if (this.token) {
        connectSocket();
      }
    },
    async login(cin, mdp) {
      const { data } = await api.post("/auth/login", {
        cin,
        mdp,
      });

      this.setSession(data.token, data.user);

      // Connecter le WebSocket
      connectSocket();

      return data.user;
    },
    async signup(payload) {
      const { data } = await api.post("/auth/signup", payload);
      this.setSession(data.token, data.user);
      connectSocket();
      return data.user;
    },
    setSession(token, user) {
      this.token = token;
      this.user = user;
      localStorage.setItem("token", token);
      localStorage.setItem("user", JSON.stringify(user));
    },
    updateUser(user) {
      this.user = user;
      localStorage.setItem("user", JSON.stringify(user));
    },
    logout() {
      // Déconnecter le WebSocket
      disconnectSocket();

      this.token = null;
      this.user = null;
      localStorage.removeItem("token");
      localStorage.removeItem("user");
    },
    async refreshMe() {
      const { data } = await api.get("/auth/me");
      this.updateUser(data.user);
    },
  },
});
