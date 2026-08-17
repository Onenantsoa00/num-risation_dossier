// frontend/src/pages/ProfilePage.vue
<template>
  <q-page padding>
    <div class="page-shell profile-page">
      <div class="profile-header q-mb-lg">
        <h1 class="page-title">Mon profil</h1>
        <p class="page-sub">Modifiez vos informations personnelles</p>
      </div>

      <div class="surface-card profile-card">
        <!-- =========================
             IDENTITÉ
             ========================= -->
        <section class="profile-section">
          <div class="profile-section__header">
            <div>
              <div class="profile-section__title">
                Informations personnelles
              </div>
              <div class="profile-section__subtitle">
                Vos informations d'identification
              </div>
            </div>
          </div>

          <div class="profile-section__body">
            <div class="row q-col-gutter-md">
              <div class="col-12 col-sm-6">
                <q-input v-model="form.nom" label="Nom" outlined dense />
              </div>

              <div class="col-12 col-sm-6">
                <q-input
                  v-model="form.prenoms"
                  label="Prénoms"
                  outlined
                  dense
                />
              </div>
            </div>

            <div class="row q-col-gutter-md q-mt-sm">
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
          </div>
        </section>

        <q-separator />

        <!-- =========================
             CONTACT
             ========================= -->
        <section class="profile-section">
          <div class="profile-section__header">
            <div>
              <div class="profile-section__title">Coordonnées</div>
              <div class="profile-section__subtitle">
                Informations utilisées pour vous contacter
              </div>
            </div>
          </div>

          <div class="profile-section__body">
            <div class="row q-col-gutter-md">
              <div class="col-12">
                <q-input
                  v-model="form.email"
                  type="email"
                  label="Adresse e-mail"
                  outlined
                  dense
                />
              </div>

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
          </div>
        </section>

        <q-separator />

        <!-- =========================
             PHOTO
             ========================= -->
        <section class="profile-section">
          <div class="profile-section__header">
            <div>
              <div class="profile-section__title">Photo de profil</div>
              <div class="profile-section__subtitle">
                Mettez à jour votre photo
              </div>
            </div>
          </div>

          <div class="profile-section__body">
            <div class="profile-photo-row">
              <q-avatar
                size="88px"
                color="primary"
                text-color="white"
                class="profile-avatar"
              >
                <img
                  v-if="preview || auth.user?.image"
                  :src="preview ? preview : imageUrl(auth.user.image)"
                  alt="Photo de profil"
                  class="profile-avatar__image"
                />

                <span v-else>
                  {{ initials }}
                </span>
              </q-avatar>

              <div class="profile-photo-info">
                <div class="text-body1 text-weight-medium">
                  {{ auth.fullName }}
                </div>

                <div class="text-caption text-grey-7 q-mt-xs">
                  {{ auth.role }}
                </div>

                <q-file
                  v-model="imageFile"
                  label="Choisir une nouvelle photo"
                  outlined
                  dense
                  accept="image/*"
                  class="profile-photo-input q-mt-sm"
                  @update:model-value="onImage"
                >
                  <template #prepend>
                    <q-icon name="image" />
                  </template>
                </q-file>
              </div>
            </div>
          </div>
        </section>

        <q-separator />

        <!-- =========================
             MOT DE PASSE
             ========================= -->
        <section class="profile-section">
          <div class="profile-section__header">
            <div>
              <div class="profile-section__title">Sécurité</div>

              <div class="profile-section__subtitle">
                Modifiez votre mot de passe si nécessaire
              </div>
            </div>
          </div>

          <div class="profile-section__body">
            <q-input
              v-model="form.mdp"
              type="password"
              label="Nouveau mot de passe"
              hint="Laissez vide pour conserver votre mot de passe actuel"
              outlined
              dense
            />
          </div>
        </section>

        <!-- =========================
             ACTION
             ========================= -->
        <div class="profile-actions">
          <q-btn outline color="primary" label="Annuler" @click="resetForm" />

          <q-btn
            type="button"
            color="primary"
            label="Enregistrer les modifications"
            icon="save"
            unelevated
            :loading="loading"
            @click="save"
          />
        </div>
      </div>
    </div>
  </q-page>
</template>

<script setup>
import { computed, onMounted, onUnmounted, reactive, ref } from "vue";
import { useQuasar } from "quasar";
import { api } from "boot/axios";
import { useAuthStore } from "stores/auth";

const auth = useAuthStore();
const $q = useQuasar();
const loading = ref(false);
const imageFile = ref(null);
const preview = ref(null);

const form = reactive({
  nom: "",
  prenoms: "",
  email: "",
  tel: "",
  date_naissance: "",
  cin: "",
  im: "",
  mdp: "",
});

const initials = computed(() => {
  if (!auth.user) return "?";
  return `${auth.user.prenoms?.[0] || ""}${auth.user.nom?.[0] || ""}`.toUpperCase();
});

onMounted(() => {
  if (!auth.user) return;

  form.nom = auth.user.nom || "";
  form.prenoms = auth.user.prenoms || "";
  form.email = auth.user.email || "";
  form.tel = auth.user.tel || "";

  form.date_naissance = auth.user.date_naissance
    ? String(auth.user.date_naissance).slice(0, 10)
    : "";

  form.cin = auth.user.cin || "";
  form.im = auth.user.im || "";
});

function imageUrl(image) {
  if (!image) return null;

  if (/^https?:\/\//.test(image)) {
    return image;
  }

  return `http://localhost:3000${image}`;
}

onUnmounted(() => {
  if (preview.value) {
    URL.revokeObjectURL(preview.value);
    preview.value = null;
  }
});

function onImage(file) {
  if (!file) {
    preview.value = null;
    return;
  }
  preview.value = URL.createObjectURL(file);
}

function resetForm() {
  if (!auth.user) return;

  form.nom = auth.user.nom || "";
  form.prenoms = auth.user.prenoms || "";
  form.email = auth.user.email || "";
  form.tel = auth.user.tel || "";

  form.date_naissance = auth.user.date_naissance
    ? String(auth.user.date_naissance).slice(0, 10)
    : "";

  form.cin = auth.user.cin || "";
  form.im = auth.user.im || "";
  form.mdp = "";

  imageFile.value = null;
  preview.value = null;
}

async function save() {
  loading.value = true;
  try {
    const fd = new FormData();
    Object.entries(form).forEach(([k, v]) => {
      if (v) fd.append(k, v);
    });
    if (imageFile.value) fd.append("image", imageFile.value);

    const { data } = await api.put("/users/profile", fd, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    auth.updateUser(data.user);
    form.mdp = "";
    $q.notify({ type: "positive", message: "Profil mis à jour" });
  } catch (e) {
    $q.notify({
      type: "negative",
      message: e.response?.data?.error || "Erreur",
    });
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.profile-page {
  max-width: 900px;
  margin: 0 auto;
}

.profile-header {
  padding: 0 4px;
}

.profile-card {
  overflow: hidden;
}

.profile-section {
  padding: 24px;
}

.profile-section__header {
  margin-bottom: 20px;
}

.profile-section__title {
  font-size: 16px;
  font-weight: 700;
  color: var(--q-primary);
}

.profile-section__subtitle {
  margin-top: 4px;
  font-size: 13px;
  color: #6b7280;
}

.profile-section__body {
  width: 100%;
}

.profile-photo-row {
  display: flex;
  align-items: center;
  gap: 20px;
}

.profile-photo-info {
  flex: 1;
  min-width: 0;
}

.profile-photo-input {
  width: 100%;
  max-width: 420px;
}

.profile-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 12px;
  padding: 20px 24px;
  background: #fafbfc;
  border-top: 1px solid #e5e7eb;
}

/* Tablette */
@media (max-width: 700px) {
  .profile-section {
    padding: 18px;
  }

  .profile-actions {
    padding: 16px 18px;
    flex-direction: column-reverse;
    align-items: stretch;
  }

  .profile-actions .q-btn {
    width: 100%;
  }

  .profile-photo-row {
    align-items: flex-start;
    flex-direction: column;
  }

  .profile-photo-input {
    max-width: none;
  }
}

.profile-avatar {
  overflow: hidden;
  flex-shrink: 0;
}

.profile-avatar__image {
  width: 100% !important;
  height: 100% !important;
  max-width: none !important;
  max-height: none !important;

  display: block;

  object-fit: cover !important;
  object-position: center center;

  border-radius: 50%;
}
</style>
