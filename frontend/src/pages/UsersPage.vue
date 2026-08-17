// frontend/src/pages/UsersPage.vue
<template>
  <q-page padding>
    <div class="page-shell">
      <!-- =========================
           EN-TÊTE
      ========================= -->
      <div class="row items-center justify-between q-mb-md">
        <div>
          <h1 class="page-title">Utilisateurs</h1>

          <p class="page-sub">Gestion des comptes utilisateurs</p>
        </div>

        <q-btn
          color="primary"
          icon="person_add"
          label="Créer un utilisateur"
          unelevated
          @click="openCreateDialog"
        />
      </div>

      <!-- =========================
           RECHERCHE
      ========================= -->
      <div class="surface-card q-mb-md">
        <q-input
          v-model="search"
          outlined
          dense
          clearable
          debounce="300"
          label="Rechercher un utilisateur"
        >
          <template #prepend>
            <q-icon name="search" />
          </template>
        </q-input>
      </div>

      <!-- =========================
           TABLEAU
      ========================= -->
      <q-table
        flat
        bordered
        class="surface-card"
        :rows="filteredUsers"
        :columns="columns"
        row-key="id"
        :loading="loading"
        :pagination="{
          rowsPerPage: 10,
        }"
        no-data-label="Aucun utilisateur"
      >
        <!-- NOM -->
        <template #body-cell-identite="props">
          <q-td :props="props">
            <div class="row items-center no-wrap">
              <q-avatar
                size="40px"
                color="primary"
                text-color="white"
                class="q-mr-sm"
              >
                <img
                  v-if="props.row.image"
                  :src="props.row.image"
                  alt="Photo"
                />

                <span v-else>
                  {{ initials(props.row) }}
                </span>
              </q-avatar>

              <div>
                <div class="text-weight-medium">
                  {{ props.row.prenoms }} {{ props.row.nom }}
                </div>

                <div class="text-caption text-grey-7">
                  {{ props.row.email }}
                </div>
              </div>
            </div>
          </q-td>
        </template>

        <!-- RÔLE -->
        <template #body-cell-role="props">
          <q-td :props="props">
            <q-badge :color="roleColor(props.row.role)" class="q-px-sm">
              {{ props.row.role || "—" }}
            </q-badge>
          </q-td>
        </template>

        <!-- CIN -->
        <template #body-cell-cin="props">
          <q-td :props="props">
            {{ props.row.cin || "—" }}
          </q-td>
        </template>

        <!-- IM -->
        <template #body-cell-im="props">
          <q-td :props="props">
            {{ props.row.im || "—" }}
          </q-td>
        </template>

        <!-- TÉLÉPHONE -->
        <template #body-cell-tel="props">
          <q-td :props="props">
            {{ props.row.tel || "—" }}
          </q-td>
        </template>

        <!-- STATUT -->
        <template #body-cell-statut="props">
          <q-td :props="props">
            <q-badge
              class="status-badge"
              :class="props.row.actif ? 'status-active' : 'status-inactive'"
            >
              <q-icon
                :name="props.row.actif ? 'check_circle' : 'pause_circle'"
                size="16px"
                class="q-mr-xs"
              />

              {{ props.row.actif ? "Actif" : "Inactif" }}
            </q-badge>
          </q-td>
        </template>

        <!-- ACTIONS -->
        <template #body-cell-actions="props">
          <q-td :props="props">
            <!-- Voir les informations -->
            <q-btn
              flat
              round
              dense
              icon="visibility"
              color="primary"
              @click="viewUser(props.row)"
            >
              <q-tooltip> Voir les informations </q-tooltip>
            </q-btn>

            <!-- Restreindre / Réactiver -->
            <q-btn
              v-if="props.row.id !== currentUserId"
              flat
              round
              dense
              :icon="props.row.actif ? 'lock' : 'lock_open'"
              :color="props.row.actif ? 'negative' : 'positive'"
              @click="changeUserStatus(props.row)"
            >
              <q-tooltip>
                {{
                  props.row.actif
                    ? "Restreindre l'utilisateur"
                    : "Réactiver l'utilisateur"
                }}
              </q-tooltip>
            </q-btn>
          </q-td>
        </template>
      </q-table>
    </div>

    <!-- ======================================================
         DIALOG CRÉATION UTILISATEUR
    ======================================================= -->
    <q-dialog v-model="createDialog">
      <q-card style="width: 720px; max-width: 95vw">
        <!-- HEADER -->
        <q-card-section>
          <div class="row items-center justify-between">
            <div>
              <div class="text-h6 text-weight-bold">Créer un utilisateur</div>

              <div class="text-caption text-grey-7">
                Le compte sera créé par l'Administrateur
              </div>
            </div>

            <q-btn flat round dense icon="close" v-close-popup />
          </div>
        </q-card-section>

        <q-separator />

        <!-- FORM -->
        <q-card-section>
          <q-form @submit.prevent="createUser" class="q-gutter-md">
            <!-- IDENTITÉ -->
            <div class="text-subtitle2 text-weight-bold">
              Informations personnelles
            </div>

            <div class="row q-col-gutter-md">
              <div class="col-12 col-sm-6">
                <q-input
                  v-model="form.nom"
                  label="Nom *"
                  outlined
                  dense
                  :rules="[(v) => !!v?.trim() || 'Le nom est requis']"
                />
              </div>

              <div class="col-12 col-sm-6">
                <q-input
                  v-model="form.prenoms"
                  label="Prénoms *"
                  outlined
                  dense
                  :rules="[(v) => !!v?.trim() || 'Les prénoms sont requis']"
                />
              </div>
            </div>

            <div class="row q-col-gutter-md">
              <div class="col-12 col-sm-6">
                <q-input
                  v-model="form.cin"
                  label="CIN"
                  outlined
                  dense
                  maxlength="12"
                />
              </div>

              <div class="col-12 col-sm-6">
                <q-input
                  v-model="form.im"
                  label="IM"
                  outlined
                  dense
                  maxlength="12"
                />
              </div>
            </div>

            <div class="row q-col-gutter-md">
              <div class="col-12 col-sm-6">
                <q-input v-model="form.tel" label="Téléphone" outlined dense />
              </div>

              <div class="col-12 col-sm-6">
                <q-input
                  v-model="form.date_naissance"
                  type="date"
                  label="Date de naissance"
                  outlined
                  dense
                  stack-label
                />
              </div>
            </div>

            <q-separator class="q-my-md" />

            <!-- COMPTE -->
            <div class="text-subtitle2 text-weight-bold">
              Informations du compte
            </div>

            <q-input
              v-model="form.email"
              type="email"
              label="Adresse e-mail *"
              outlined
              dense
              :rules="[(v) => !!v?.trim() || 'L email est requis']"
            />

            <q-input
              v-model="form.mdp"
              :type="showPassword ? 'text' : 'password'"
              label="Mot de passe *"
              outlined
              dense
              :rules="[(v) => (v && v.length >= 6) || 'Minimum 6 caractères']"
            >
              <template #append>
                <q-icon
                  :name="showPassword ? 'visibility_off' : 'visibility'"
                  class="cursor-pointer"
                  @click="showPassword = !showPassword"
                />
              </template>
            </q-input>

            <q-select
              v-model="form.id_roles"
              :options="roleOptions"
              label="Rôle *"
              outlined
              dense
              emit-value
              map-options
              :rules="[(v) => !!v || 'Le rôle est requis']"
            >
              <template #prepend>
                <q-icon name="badge" />
              </template>
            </q-select>

            <!-- ERREUR -->
            <q-banner v-if="error" class="bg-red-1 text-negative" rounded dense>
              <template #avatar>
                <q-icon name="error" />
              </template>

              {{ error }}
            </q-banner>

            <!-- ACTIONS -->
            <div class="row justify-end q-gutter-sm q-pt-sm">
              <q-btn flat label="Annuler" @click="closeCreateDialog" />

              <q-btn
                type="submit"
                color="primary"
                icon="person_add"
                label="Créer le compte"
                unelevated
                :loading="creating"
              />
            </div>
          </q-form>
        </q-card-section>
      </q-card>
    </q-dialog>

    <!-- ======================================================
         DIALOG DÉTAIL UTILISATEUR
    ======================================================= -->
    <q-dialog v-model="detailDialog">
      <q-card style="width: 500px; max-width: 95vw">
        <q-card-section>
          <div class="row items-center">
            <q-avatar
              size="64px"
              color="primary"
              text-color="white"
              class="q-mr-md"
            >
              <img
                v-if="selectedUser?.image"
                :src="selectedUser.image"
                alt="Photo"
              />

              <span v-else>
                {{ initials(selectedUser) }}
              </span>
            </q-avatar>

            <div>
              <div class="text-h6 text-weight-bold">
                {{ selectedUser?.prenoms }}
                {{ selectedUser?.nom }}
              </div>

              <div class="text-caption text-grey-7">
                {{ selectedUser?.role }}
              </div>
            </div>
          </div>
        </q-card-section>

        <q-separator />

        <q-card-section v-if="selectedUser">
          <div class="detail-row">
            <span>Nom</span>
            <strong>{{ selectedUser.nom }}</strong>
          </div>

          <div class="detail-row">
            <span>Prénoms</span>
            <strong>{{ selectedUser.prenoms }}</strong>
          </div>

          <div class="detail-row">
            <span>Email</span>
            <strong>{{ selectedUser.email }}</strong>
          </div>

          <div class="detail-row">
            <span>CIN</span>
            <strong>{{ selectedUser.cin || "—" }}</strong>
          </div>

          <div class="detail-row">
            <span>IM</span>
            <strong>{{ selectedUser.im || "—" }}</strong>
          </div>

          <div class="detail-row">
            <span>Téléphone</span>
            <strong>{{ selectedUser.tel || "—" }}</strong>
          </div>

          <div class="detail-row">
            <span>Date de naissance</span>
            <strong>
              {{ formatDateOnly(selectedUser.date_naissance) }}
            </strong>
          </div>

          <div class="detail-row">
            <span>Rôle</span>
            <q-badge :color="roleColor(selectedUser.role)">
              {{ selectedUser.role }}
            </q-badge>
          </div>

          <div class="detail-row">
            <span>Statut</span>
            <q-badge :color="selectedUser.actif ? 'positive' : 'negative'">
              {{ selectedUser.actif ? "Actif" : "Restreint" }}
            </q-badge>
          </div>
        </q-card-section>

        <q-card-actions align="right">
          <q-btn flat label="Fermer" color="primary" v-close-popup />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import { useQuasar, Dialog } from "quasar";
import { api } from "boot/axios";
import { useAuthStore } from "stores/auth";

const auth = useAuthStore();

const currentUserId = computed(() => auth.user?.id);

const $q = useQuasar();

const loading = ref(false);
const creating = ref(false);

const error = ref("");

const search = ref("");

const createDialog = ref(false);
const detailDialog = ref(false);

const selectedUser = ref(null);

const users = ref([]);
const roleOptions = ref([]);

const showPassword = ref(false);

/*
 * ============================================================
 * FORMULAIRE
 * ============================================================
 */

const emptyForm = () => ({
  nom: "",
  prenoms: "",
  cin: "",
  im: "",
  tel: "",
  date_naissance: "",
  email: "",
  mdp: "",
  id_roles: null,
});

const form = reactive(emptyForm());

/*
 * ============================================================
 * COLONNES
 * ============================================================
 */

const columns = [
  {
    name: "identite",
    label: "Utilisateur",
    field: "identite",
    align: "left",
  },

  {
    name: "role",
    label: "Rôle",
    field: "role",
    align: "left",
  },

  {
    name: "cin",
    label: "CIN",
    field: "cin",
    align: "left",
  },

  {
    name: "im",
    label: "IM",
    field: "im",
    align: "left",
  },

  {
    name: "tel",
    label: "Téléphone",
    field: "tel",
    align: "left",
  },

  {
    name: "statut",
    label: "Statut",
    field: "actif",
    align: "left",
  },

  {
    name: "actions",
    label: "Actions",
    field: "actions",
    align: "right",
  },
];

async function changeUserStatus(user) {
  const action = user.actif ? "désactiver" : "réactiver";

  Dialog.create({
    title: "Confirmation",
    message: `
      Voulez-vous ${action} le compte
      <strong>${user.prenoms} ${user.nom}</strong> ?
    `,
    html: true,
    cancel: {
      label: "Annuler",
      flat: true,
    },
    ok: {
      label: user.actif ? "Restreindre" : "Réactiver",
      color: user.actif ? "negative" : "positive",
    },
    persistent: true,
  }).onOk(async () => {
    try {
      const { data } = await api.patch(`/users/${user.id}/status`);

      $q.notify({
        type: user.actif ? "warning" : "positive",
        message: data.message,
      });

      await loadUsers();
    } catch (e) {
      $q.notify({
        type: "negative",
        message: e.response?.data?.error || "Erreur modification du statut.",
      });
    }
  });
}

/*
 * ============================================================
 * FILTRAGE
 * ============================================================
 */

const filteredUsers = computed(() => {
  const q = search.value.trim().toLowerCase();

  if (!q) {
    return users.value;
  }

  return users.value.filter((user) => {
    return [
      user.nom,
      user.prenoms,
      user.email,
      user.cin,
      user.im,
      user.tel,
      user.role,
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(q));
  });
});

/*
 * ============================================================
 * INITIAL
 * ============================================================
 */

function initials(user) {
  if (!user) {
    return "?";
  }

  return (
    `${user.prenoms?.[0] || ""}` + `${user.nom?.[0] || ""}`
  ).toUpperCase();
}

/*
 * ============================================================
 * COULEUR RÔLE
 * ============================================================
 */

function roleColor(role) {
  return (
    {
      Admin: "negative",
      Dispatch: "primary",
      Verificateur: "info",
      Validateur: "positive",
      i_archive: "warning",
    }[role] || "grey"
  );
}

/*
 * ============================================================
 * DATE
 * ============================================================
 */

function formatDateOnly(value) {
  if (!value) {
    return "—";
  }

  const text = String(value).slice(0, 10);

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);

  if (!match) {
    return "—";
  }

  return `${match[3]}/${match[2]}/${match[1]}`;
}

/*
 * ============================================================
 * CHARGEMENT DES UTILISATEURS
 * ============================================================
 */

async function loadUsers() {
  loading.value = true;

  try {
    const { data } = await api.get("/users");

    users.value = data;
  } catch (e) {
    console.error("Erreur chargement utilisateurs :", e);

    $q.notify({
      type: "negative",
      message:
        e.response?.data?.error || "Impossible de charger les utilisateurs.",
    });
  } finally {
    loading.value = false;
  }
}

/*
 * ============================================================
 * CHARGEMENT DES RÔLES
 * ============================================================
 */

async function loadRoles() {
  try {
    const { data } = await api.get("/users/roles");

    const rolesAutorises = [
      "Dispatch",
      "Verificateur",
      "Validateur",
      "i_archive",
    ];

    roleOptions.value = data
      .filter((role) => rolesAutorises.includes(role.nom))
      .map((role) => ({
        label: role.nom,
        value: role.id,
      }));
  } catch (e) {
    console.error("Erreur chargement rôles :", e);

    $q.notify({
      type: "negative",
      message: "Impossible de charger les rôles.",
    });
  }
}

/*
 * ============================================================
 * OUVRIR CRÉATION
 * ============================================================
 */

function openCreateDialog() {
  resetForm();

  error.value = "";

  createDialog.value = true;
}

/*
 * ============================================================
 * FERMER CRÉATION
 * ============================================================
 */

function closeCreateDialog() {
  createDialog.value = false;

  error.value = "";

  showPassword.value = false;
}

/*
 * ============================================================
 * RESET FORMULAIRE
 * ============================================================
 */

function resetForm() {
  Object.assign(form, emptyForm());
}

/*
 * ============================================================
 * CRÉATION
 * ============================================================
 */

async function createUser() {
  creating.value = true;
  error.value = "";

  try {
    const fd = new FormData();

    fd.append("nom", form.nom.trim());

    fd.append("prenoms", form.prenoms.trim());

    fd.append("email", form.email.trim());

    fd.append("mdp", form.mdp);

    if (form.cin.trim()) {
      fd.append("cin", form.cin.trim());
    }

    if (form.im.trim()) {
      fd.append("im", form.im.trim());
    }

    if (form.tel.trim()) {
      fd.append("tel", form.tel.trim());
    }

    if (form.date_naissance) {
      fd.append("date_naissance", form.date_naissance);
    }

    fd.append("id_roles", form.id_roles);

    const { data } = await api.post("/users", fd, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });

    $q.notify({
      type: "positive",
      icon: "check_circle",
      message: data.message || "Utilisateur créé avec succès.",
    });

    createDialog.value = false;

    resetForm();

    showPassword.value = false;

    await loadUsers();
  } catch (e) {
    console.error("Erreur création utilisateur :", e);

    error.value =
      e.response?.data?.error || "Erreur lors de la création du compte.";
  } finally {
    creating.value = false;
  }
}

/*
 * ============================================================
 * VOIR UTILISATEUR
 * ============================================================
 */

function viewUser(user) {
  selectedUser.value = user;

  detailDialog.value = true;
}

/*
 * ============================================================
 * INITIALISATION
 * ============================================================
 */

onMounted(async () => {
  await Promise.all([loadUsers(), loadRoles()]);
});
</script>

<style scoped>
.detail-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;

  padding: 12px 0;

  border-bottom: 1px solid #edf0f3;
}

.detail-row:last-child {
  border-bottom: none;
}

.detail-row > span {
  color: #6b7280;
}

.detail-row > strong {
  text-align: right;
  word-break: break-word;
}

@media (max-width: 700px) {
  .detail-row {
    align-items: flex-start;
    flex-direction: column;
    gap: 4px;
  }

  .detail-row > strong {
    text-align: left;
  }
}

.status-badge {
  padding: 6px 10px;
  border-radius: 6px;
  font-weight: 600;
  font-size: 12px;
}

.status-active {
  background: #d1fae5;
  color: #047857;
}

.status-inactive {
  background: #fef3c7;
  color: #b45309;
}
</style>
