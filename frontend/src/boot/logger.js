import { boot } from "quasar/wrappers";

/*
 * ============================================================
 * LOGS NAVIGATEUR
 * ============================================================
 * En développement (quasar dev / process.env.DEV) :
 *   tous les logs s'affichent dans la console du navigateur.
 *
 * En production (quasar build / process.env.PROD) :
 *   les logs de routine (console.log / info / warn / debug)
 *   sont coupés pour ne pas ralentir les PC de l'entreprise
 *   (2 Go de RAM, disque dur HDD).
 *
 * Les erreurs (console.error) restent visibles en production
 * pour pouvoir diagnostiquer un problème éventuel.
 * ============================================================
 */

export default boot(() => {
  // Coupé uniquement dans le build de production (pas en dev)
  if (process.env.PROD === true) {
    const noop = () => {};
    ["log", "info", "warn", "debug"].forEach((method) => {
      console[method] = noop;
    });
  }
});
