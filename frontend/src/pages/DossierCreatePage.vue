// frontend/src/pages/DossierCreatePage.vue
<template>
  <q-page class="dossier-create-page">
    <div class="page-header">
      <div>
        <h1 class="page-title">Importer un dossier</h1>
        <p class="page-sub">
          Importez le dossier, renseignez ses informations puis assignez-le à un
          vérificateur.
        </p>
      </div>
    </div>

    <div class="create-workspace">
      <!-- =========================
           COLONNE GAUCHE : APERÇU
           ========================= -->
      <section class="preview-panel">
        <div class="panel-header">
          <div>
            <div class="panel-title">
              <q-icon name="visibility" class="q-mr-sm" />
              Aperçu du dossier
            </div>

            <div class="panel-subtitle">
              Le contenu du fichier apparaîtra ici
            </div>
          </div>

          <q-chip
            v-if="fichier"
            color="primary"
            text-color="white"
            icon="description"
            size="sm"
          >
            {{ fichier.name }}
          </q-chip>
        </div>

        <div class="preview-container">
          <DossierFilePreview :file="fichier" :can-download="false" />
        </div>
      </section>

      <!-- =========================
           COLONNE DROITE : FORMULAIRE
           ========================= -->
      <section class="form-panel">
        <div class="panel-header">
          <div>
            <div class="panel-title">
              <q-icon name="edit_document" class="q-mr-sm" />
              Informations du dossier
            </div>

            <div class="panel-subtitle">
              Complétez les informations avant l'envoi
            </div>
          </div>
        </div>

        <q-form @submit.prevent="submit" class="form-content">
          <!-- NOM -->
          <q-input
            :model-value="nomDossier"
            label="Nom du dossier"
            outlined
            readonly
          />

          <!-- INFORMATIONS -->
          <div class="form-section-title">Informations administratives</div>

          <div class="row q-col-gutter-md">
            <div class="col-12 col-sm-6">
              <q-input v-model="nCompte" label="N° compte" outlined />
            </div>

            <div class="col-12 col-sm-6">
              <q-input v-model="nBe" label="N° BE" outlined />
            </div>

            <div class="col-12 col-sm-6">
              <q-input v-model="nSoa" label="N° SOA" outlined />
            </div>

            <div class="col-12 col-sm-6">
              <q-input v-model="nOrd" label="N° ORD" outlined />
            </div>

            <div class="col-12 col-sm-6">
              <q-input
                v-model="exoBudgetaire"
                label="Exercice budgétaire"
                outlined
              />
            </div>
          </div>

          <!-- FICHIER -->
          <div class="form-section-title">Fichier du dossier</div>

          <q-file
            v-model="fichier"
            label="Sélectionner le fichier *"
            outlined
            dense
            accept=".pdf,.doc,.docx,.zip,.png,.jpg,.jpeg,.xls,.xlsx,.txt"
            :rules="[(v) => !!v || 'Le fichier est requis']"
            clearable
          >
            <template #prepend>
              <q-icon name="attach_file" />
            </template>

            <template #hint> PDF — 50 Mo maximum </template>
          </q-file>

          <!-- VERIFICATEUR -->
          <div class="form-section-title">Attribution</div>

          <q-select
            v-model="form.id_verificateur"
            :options="verificateurs"
            label="Envoyer au vérificateur *"
            outlined
            dense
            emit-value
            map-options
            use-input
            input-debounce="200"
            :rules="[(v) => !!v || 'Veuillez sélectionner un vérificateur']"
          >
            <template #option="scope">
              <q-item v-bind="scope.itemProps">
                <q-item-section avatar>
                  <q-avatar
                    size="40px"
                    color="primary"
                    text-color="white"
                    class="assign-avatar"
                  >
                    <img
                      v-if="scope.opt.image"
                      :src="imageUrl(scope.opt.image)"
                      alt="Photo"
                      class="assign-avatar__image"
                    />

                    <span v-else>
                      {{ initials(scope.opt) }}
                    </span>
                  </q-avatar>
                </q-item-section>

                <q-item-section>
                  <q-item-label>
                    {{ scope.opt.label }}
                  </q-item-label>

                  <q-item-label caption>
                    IM : {{ scope.opt.im || "—" }}
                  </q-item-label>
                </q-item-section>
              </q-item>
            </template>

            <template #selected-item="scope">
              <q-chip v-if="scope.opt" dense class="q-ma-none">
                <q-avatar
                  size="28px"
                  color="primary"
                  text-color="white"
                  class="assign-avatar"
                >
                  <img
                    v-if="scope.opt.image"
                    :src="imageUrl(scope.opt.image)"
                    alt="Photo"
                    class="assign-avatar__image"
                  />

                  <span v-else>
                    {{ initials(scope.opt) }}
                  </span>
                </q-avatar>

                {{ scope.opt.label }}
              </q-chip>
            </template>

            <template #prepend>
              <q-icon name="person_search" />
            </template>
          </q-select>

          <!-- COMMENTAIRE -->
          <q-input
            v-model="form.commentaire"
            type="textarea"
            label="Commentaire"
            outlined
            autogrow
          />

          <!-- ERREUR -->
          <q-banner v-if="error" class="bg-red-1 text-negative" rounded>
            <template #avatar>
              <q-icon name="error" />
            </template>

            {{ error }}
          </q-banner>

          <!-- ACTIONS -->
          <div class="form-actions">
            <q-btn flat label="Annuler" :to="{ name: 'dossiers' }" />

            <q-btn
              type="submit"
              color="primary"
              icon="send"
              label="Importer et envoyer"
              unelevated
              :loading="loading"
              :disable="!fichier"
            />
          </div>
        </q-form>
      </section>
    </div>
  </q-page>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { useQuasar } from "quasar";
import { api } from "boot/axios";
import { getImageUrl } from "src/utils/files";

import DossierFilePreview from "components/DossierFilePreview.vue";

const router = useRouter();
const $q = useQuasar();

const loading = ref(false);
const error = ref("");

const fichier = ref(null);
const verificateurs = ref([]);

const nCompte = ref("");
const nBe = ref("");
const nSoa = ref("");
const nOrd = ref("");
const exoBudgetaire = ref("");

/*
 * Nom du dossier généré automatiquement
 *
 * Exemple :
 * 100020039-10399049-0293029390-2026
 */
const nomDossier = computed(() => {
  return [exoBudgetaire.value, nBe.value, nOrd.value, nCompte.value, nSoa.value]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join("_");
});

/*
 * Informations complémentaires du formulaire
 */
const form = reactive({
  id_verificateur: null,
  commentaire: "",
});

/*
 * Chargement des vérificateurs
 */
onMounted(async () => {
  try {
    const { data } = await api.get("/users", {
      params: {
        role: "Verificateur",
      },
    });

    const admins = await api.get("/users", {
      params: {
        role: "Admin",
      },
    });

    const all = [...data, ...admins.data];

    verificateurs.value = all.map((u) => ({
      label: `${u.prenoms} ${u.nom}`,
      value: u.id,
      image: u.image,
      im: u.im,
      email: u.email,
    }));
  } catch (e) {
    console.error("Erreur chargement utilisateurs :", e);

    error.value =
      e.response?.data?.error || "Impossible de charger les vérificateurs.";
  }
});

/*
 * Envoi du dossier
 */
async function submit() {
  error.value = "";

  /*
   * Vérification du fichier
   */
  if (!fichier.value) {
    error.value = "Veuillez sélectionner un fichier.";
    return;
  }

  /*
   * Vérification des informations obligatoires
   */
  if (!nCompte.value.trim()) {
    error.value = "Veuillez renseigner le N° compte.";
    return;
  }

  if (!nBe.value.trim()) {
    error.value = "Veuillez renseigner le N° BE.";
    return;
  }

  if (!nSoa.value.trim()) {
    error.value = "Veuillez renseigner le N° SOA.";
    return;
  }

  if (!exoBudgetaire.value.trim()) {
    error.value = "Veuillez renseigner l'exercice budgétaire.";
    return;
  }

  if (!form.id_verificateur) {
    error.value = "Veuillez sélectionner un vérificateur.";
    return;
  }

  loading.value = true;

  try {
    const fd = new FormData();

    /*
     * Nom généré automatiquement
     */
    fd.append("nom", nomDossier.value);

    /*
     * Informations administratives
     */
    fd.append("n_compte", nCompte.value.trim());
    fd.append("n_be", nBe.value.trim());
    fd.append("n_ord", nOrd.value.trim());
    fd.append("n_soa", nSoa.value.trim());
    fd.append("exo_budgetaire", exoBudgetaire.value.trim());

    /*
     * Attribution
     */
    fd.append("id_verificateur", form.id_verificateur);

    /*
     * Commentaire
     */
    if (form.commentaire.trim()) {
      fd.append("commentaire", form.commentaire.trim());
    }

    /*
     * Fichier
     */
    fd.append("fichier", fichier.value);

    /*
     * Envoi API
     */
    const { data } = await api.post("/dossiers", fd);

    $q.notify({
      type: "positive",
      message: "Dossier importé et transmis avec succès.",
      icon: "check_circle",
    });

    /*
     * Aller vers le détail du dossier
     */
    router.push({
      name: "dossier-detail",
      params: {
        id: data.id,
      },
    });
  } catch (e) {
    console.error("Erreur import dossier :", e);

    error.value =
      e.response?.data?.error ||
      "Une erreur est survenue lors de l’import du dossier.";
  } finally {
    loading.value = false;
  }
}

function imageUrl(image) {
  return getImageUrl(image);
}

function initials(user) {
  if (!user) return "?";

  return `${user.prenoms?.[0] || ""}${user.nom?.[0] || ""}`.toUpperCase();
}
</script>

<style scoped>
.dossier-create-page {
  background: #f5f7fa;
  min-height: calc(100vh - 64px);
  padding: 24px;
}

.page-header {
  max-width: 1600px;
  margin: 0 auto 20px;
}

.page-title {
  margin: 0;
  font-size: 28px;
  font-weight: 700;
}

.page-sub {
  margin: 6px 0 0;
  color: #6b7280;
}

/* =========================
   WORKSPACE
   ========================= */

.create-workspace {
  max-width: 1600px;
  margin: 0 auto;

  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(420px, 0.65fr);

  gap: 20px;

  align-items: stretch;

  min-height: calc(100vh - 170px);
}

/* =========================
   PANELS
   ========================= */

.preview-panel,
.form-panel {
  background: white;
  border-radius: 12px;
  border: 1px solid #e5e7eb;

  overflow: hidden;

  display: flex;
  flex-direction: column;
}

.panel-header {
  padding: 16px 20px;

  border-bottom: 1px solid #e5e7eb;

  display: flex;
  align-items: center;
  justify-content: space-between;

  gap: 15px;

  flex-shrink: 0;
}

.panel-title {
  font-size: 16px;
  font-weight: 700;

  display: flex;
  align-items: center;
}

.panel-subtitle {
  color: #6b7280;
  font-size: 12px;
  margin-top: 3px;
}

/* =========================
   PREVIEW
   ========================= */

.preview-container {
  flex: 1;

  min-height: 0;

  overflow: hidden;

  padding: 12px;

  background: #eef1f5;
}

/* =========================
   FORM
   ========================= */

.form-content {
  padding: 20px;

  display: flex;
  flex-direction: column;

  gap: 16px;

  overflow-y: auto;
}

.form-section-title {
  font-size: 13px;
  font-weight: 700;

  color: #374151;

  padding-bottom: 4px;

  border-bottom: 1px solid #e5e7eb;
}

.form-actions {
  display: flex;

  justify-content: flex-end;

  align-items: center;

  gap: 8px;

  padding-top: 8px;

  margin-top: auto;
}

/* =========================
   RESPONSIVE
   ========================= */

@media (max-width: 1000px) {
  .create-workspace {
    grid-template-columns: 1fr;

    min-height: auto;
  }

  .preview-panel {
    min-height: 600px;
  }

  .form-panel {
    min-height: auto;
  }
}

.assign-avatar {
  overflow: hidden;
  flex-shrink: 0;
}

.assign-avatar__image {
  width: 100% !important;
  height: 100% !important;
  max-width: none !important;
  max-height: none !important;

  display: block;

  object-fit: cover !important;
  object-position: center center;

  border-radius: 50%;
}

@media (max-width: 600px) {
  .dossier-create-page {
    padding: 12px;
  }

  .page-title {
    font-size: 22px;
  }

  .create-workspace {
    gap: 12px;
  }

  .preview-panel {
    min-height: 500px;
  }

  .panel-header {
    padding: 12px;
  }

  .form-content {
    padding: 14px;
  }
}
</style>
