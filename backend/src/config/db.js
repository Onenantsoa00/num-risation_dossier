const { Pool, types } = require("pg");
require("dotenv").config();

/*
 * Les colonnes DATE (date_fin_dossier, date_ferie, conge_debut…) doivent
 * rester des dates « calendrier » YYYY-MM-DD.
 * Par défaut, node-postgres les convertit en objet Date (minuit local) :
 * l'API renvoyait alors « 2026-10-14T21:00:00.000Z » pour une date saisie
 * au 15/10/2026 (fuseau UTC+3), et l'interface — qui lit les 10 premiers
 * caractères — affichait le 14/10/2026.
 */
types.setTypeParser(1082, (value) => value);

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || "gestion_dossiers",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD,
});

pool.on("error", (err) => {
  console.error("Erreur PostgreSQL inattendue :", err);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  connect: () => pool.connect(),
  pool,
};
