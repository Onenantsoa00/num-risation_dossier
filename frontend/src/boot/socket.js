import { boot } from "quasar/wrappers";
import { io } from "socket.io-client";

let socket = null;

/**
 * Déterminer l'URL du serveur backend pour Socket.IO.
 * En dev (port 9000) → backend sur port 3000.
 * En production → même origine.
 */
function getBackendUrl() {
  const loc = window.location;
  // En développement Quasar, le frontend est sur :9000 et le backend sur :3000
  if (loc.port === "9000" || loc.port === "8080") {
    return `${loc.protocol}//${loc.hostname}:3000`;
  }
  // En production, même origine
  return loc.origin;
}

function getSocket() {
  return socket;
}

function connectSocket() {
  const token = localStorage.getItem("token");
  if (!token) return null;

  // Si le socket existe déjà et est connecté, ne pas recréer
  if (socket?.connected) return socket;

  // Si le socket existe mais est en cours de reconnexion, ne pas recréer
  if (socket) return socket;

  const backendUrl = getBackendUrl();
  console.log(`[Socket] Connexion à ${backendUrl}`);

  socket = io(backendUrl, {
    auth: { token },
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: Infinity,
  });

  socket.on("connect", () => {
    console.log("[Socket] ✓ Connecté au serveur WebSocket (id=" + socket.id + ")");
  });

  socket.on("disconnect", (reason) => {
    console.log("[Socket] ✗ Déconnecté:", reason);
  });

  socket.on("connect_error", (err) => {
    console.warn("[Socket] ✗ Erreur connexion:", err.message);
  });

  return socket;
}

function disconnectSocket() {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
}

export default boot(() => {
  // Le socket sera connecté au login/logout via le store auth
});

export { connectSocket, disconnectSocket, getSocket };
