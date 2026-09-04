require("dotenv").config();

/*
 * ============================================================
 * LOGS
 * ============================================================
 * En développement : tous les logs s'affichent dans la console.
 *
 * En production (NODE_ENV=production) : les logs de routine
 * (console.log / info / warn / debug) sont coupés pour ne pas
 * surcharger les machines à faible configuration
 * (2 Go de RAM, disque dur HDD).
 *
 * Les erreurs (console.error) restent affichées en production
 * afin de pouvoir diagnostiquer un incident éventuel.
 *
 * Astuce dépannage : lancer avec LOG_LEVEL=debug pour réafficher
 * les logs de routine même en production.
 * ============================================================
 */
if (
  process.env.NODE_ENV === "production" &&
  process.env.LOG_LEVEL !== "debug"
) {
  const noop = () => {};
  ["log", "info", "warn", "debug"].forEach((method) => {
    console[method] = noop;
  });
}

const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/users");
const dossierRoutes = require("./routes/dossiers");
const notificationRoutes = require("./routes/notifications");
const archiveRoutes = require("./routes/archives");
const joursFeriesRoutes = require("./routes/joursFeries");

const app = express();
const http = require("http");
const server = http.createServer(app);

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";

/*
 * ============================================================
 * CHEMINS
 * ============================================================
 */

// Backend
const backendDir = path.join(__dirname, "..");

// Frontend Quasar en production
const frontendDist = path.resolve(backendDir, "../frontend/dist/spa");

// Uploads
const uploadsDir = path.join(backendDir, "uploads");

/*
 * ============================================================
 * CORS
 * ============================================================
 *
 * En développement :
 *   http://localhost:9000
 *
 * En production locale :
 *   le frontend est servi par Express lui-même,
 *   donc l'origine est la même et CORS n'est normalement
 *   pas nécessaire pour le navigateur.
 *
 * On garde cependant CORS pour les appels venant du mode dev.
 * ============================================================
 */

const allowedOrigins = [
  "http://localhost:9000",
  "http://127.0.0.1:9000",
  process.env.CORS_ORIGIN,
].filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      /*
       * Les requêtes sans Origin peuvent être :
       * curl, Postman, serveur à serveur, etc.
       */
      if (!origin) {
        return callback(null, true);
      }

      /*
       * En développement, on autorise les origines connues.
       */
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      /*
       * En production LAN, le frontend et l'API ont la
       * même origine, donc cette vérification ne bloque pas
       * les appels navigateur vers /api.
       *
       * On accepte également les IP du réseau local.
       */
      if (
        /^http:\/\/192\.168\.\d{1,3}\.\d{1,3}(?::\d+)?$/.test(origin) ||
        /^http:\/\/10\.\d{1,3}\.\d{1,3}\.\d{1,3}(?::\d+)?$/.test(origin) ||
        /^http:\/\/172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}(?::\d+)?$/.test(
          origin,
        )
      ) {
        return callback(null, true);
      }

      return callback(new Error("Origine non autorisée par CORS."));
    },

    credentials: true,
  }),
);

/*
 * ============================================================
 * MIDDLEWARES
 * ============================================================
 */

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/*
 * ============================================================
 * FICHIERS UPLOADS
 * ============================================================
 */

app.use(
  "/uploads",
  express.static(uploadsDir, {
    etag: false,
    lastModified: false,
    cacheControl: false,
  }),
);

/*
 * ============================================================
 * HEALTH CHECK
 * ============================================================
 */

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "gestion-dossiers",
    environment:
      process.env.NODE_ENV === "production" ? "production" : "development",
  });
});

/*
 * ============================================================
 * ROUTES API
 * ============================================================
 */

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/dossiers", dossierRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/archives", archiveRoutes);
app.use("/api/jours-feries", joursFeriesRoutes);

/*
 * ============================================================
 * FRONTEND QUASAR EN PRODUCTION
 * ============================================================
 *
 * Seulement si le build Quasar existe.
 *
 * En développement Ubuntu avec "quasar dev",
 * ce dossier peut ne pas exister et ce n'est pas un problème.
 * ============================================================
 */

const frontendAvailable = fs.existsSync(path.join(frontendDist, "index.html"));

if (frontendAvailable) {
  console.log(`Frontend Quasar détecté : ${frontendDist}`);

  // Fichiers statiques du build Quasar
  app.use(express.static(frontendDist));

  // Fallback SPA pour Vue Router
  app.use((req, res, next) => {
    // Ne jamais intercepter les routes API
    if (req.path.startsWith("/api/")) {
      return next();
    }

    // Ne jamais intercepter les fichiers uploadés
    if (req.path.startsWith("/uploads/")) {
      return next();
    }

    // Pour toute autre route, renvoyer index.html
    return res.sendFile(path.join(frontendDist, "index.html"));
  });
}

/*
 * ============================================================
 * GESTION DES ERREURS
 * ============================================================
 */

app.use((err, _req, res, _next) => {
  console.error(err);

  if (res.headersSent) {
    return;
  }

  res.status(500).json({
    error: err.message || "Erreur serveur",
  });
});

/*
 * ============================================================
 * WEBSOCKET (Socket.IO)
 * ============================================================
 */
const { initSocket } = require("./services/socket");
const io = initSocket(server);
app.set("io", io);

// Rendre io accessible dans les services
const { setIO } = require("./services/helpers");
setIO(io);

/*
 * ============================================================
 * DEADLINE MONITOR
 * ============================================================
 */
const { startDeadlineMonitor } = require("./services/deadlineMonitor");
startDeadlineMonitor();

/*
 * ============================================================
 * DÉMARRAGE SERVEUR
 * ============================================================
 */
server.listen(PORT, HOST, () => {
  console.log(`API ORDSEC démarrée sur http://${HOST}:${PORT}`);

  if (frontendAvailable) {
    console.log(`Application disponible sur http://localhost:${PORT}`);
  }
});
