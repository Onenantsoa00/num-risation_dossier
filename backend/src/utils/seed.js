require('dotenv').config();
const argon2 = require('argon2');
const db = require('../config/db');

async function seed() {
  const users = [
    { nom: 'Admin', prenoms: 'Système', email: 'admin@ordsec.local', mdp: 'Admin123!', role: 'Admin' },
    { nom: 'Rakoto', prenoms: 'Dispatch', email: 'dispatch@ordsec.local', mdp: 'Dispatch123!', role: 'Dispatch' },
    { nom: 'Rabe', prenoms: 'Vérificateur', email: 'verif@ordsec.local', mdp: 'Verif123!', role: 'Verificateur' },
    { nom: 'Rasoa', prenoms: 'Validateur', email: 'valid@ordsec.local', mdp: 'Valid123!', role: 'Validateur' },
  ];

  for (const u of users) {
    const role = await db.query('SELECT id FROM roles WHERE nom = $1', [u.role]);
    if (!role.rows[0]) {
      console.error('Rôle manquant:', u.role);
      continue;
    }
    const hash = await argon2.hash(u.mdp, { type: argon2.argon2id });
    await db.query(
      `INSERT INTO utilisateur (nom, prenoms, email, mdp, id_roles)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (email) DO UPDATE SET mdp = EXCLUDED.mdp, id_roles = EXCLUDED.id_roles`,
      [u.nom, u.prenoms, u.email, hash, role.rows[0].id]
    );
    console.log(`✓ ${u.role}: ${u.email} / ${u.mdp}`);
  }

  console.log('Seed terminé.');
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
