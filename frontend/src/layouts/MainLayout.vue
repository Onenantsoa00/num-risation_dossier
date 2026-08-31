//frontend/src/layouts/MainLayout.vue

<template>
  <q-layout view="hHh Lpr lFf">
    <!-- =========================================================
         HEADER
    ========================================================== -->
    <q-header elevated class="app-header bg-primary text-white">
      <q-toolbar class="app-toolbar">
        <!-- =====================================================
             BOUTON MENU
        ====================================================== -->
        <div class="header-menu" :class="{ 'header-menu--open': leftDrawer }">
          <q-btn
            flat
            dense
            round
            icon="menu"
            aria-label="Menu"
            @click="toggleDrawer"
          />
        </div>

        <!-- =====================================================
             LOGO CENTRÉ
        ====================================================== -->
        <div class="header-brand">
          <img
            src="/fce.png"
            alt="Fond Commun de l'Éducation"
            class="header-brand__logo"
          />

          <div class="header-brand__text">
            <div class="header-brand__title">
              NUMÉRISATION
              <span>Dossiers</span>
            </div>
          </div>
        </div>

        <!-- =====================================================
             ACTIONS À DROITE
        ====================================================== -->
        <div class="header-actions">
          <!-- NOTIFICATIONS -->
          <q-btn
            flat
            round
            dense
            icon="notifications"
            :to="{ name: 'notifications' }"
            class="header-action-btn"
          >
            <q-badge v-if="notif.unread" color="accent" floating>
              {{ notif.unread }}
            </q-badge>
          </q-btn>

          <!-- PROFIL -->
          <q-btn
            flat
            dense
            no-caps
            :to="{ name: 'profil' }"
            class="header-profile-btn"
          >
            <q-avatar
              size="34px"
              color="secondary"
              text-color="white"
              class="profile-avatar"
            >
              <img
                v-if="auth.user?.image"
                :src="imageUrl(auth.user.image)"
                alt="Photo de profil"
                class="profile-avatar__image"
              />

              <span v-else>
                {{ initials }}
              </span>
            </q-avatar>

            <span class="header-user-name">
              {{ auth.fullName }}
            </span>
          </q-btn>
        </div>
      </q-toolbar>
    </q-header>

    <!-- =========================================================
         DRAWER
    ========================================================== -->
    <q-drawer
      v-model="leftDrawer"
      bordered
      :width="DRAWER_WIDTH"
      :behavior="drawerBehavior"
      :breakpoint="700"
      class="app-drawer"
    >
      <q-scroll-area class="fit drawer-scroll">
        <q-list padding class="drawer-list">
          <!-- TITRE -->
          <q-item-label
            header
            class="drawer-section-title text-weight-bold text-primary"
          >
            Navigation
          </q-item-label>

          <!-- DOSSIERS -->
          <q-item
            clickable
            v-ripple
            :to="{ name: 'dossiers' }"
            exact
            class="drawer-nav-item"
          >
            <q-item-section avatar>
              <q-icon name="folder_open" />
            </q-item-section>

            <q-item-section> Dossiers </q-item-section>
          </q-item>

          <!-- UTILISATEURS -->
          <q-item
            v-if="['Admin', 'super_admin'].includes(auth.role)"
            clickable
            v-ripple
            :to="{ name: 'users' }"
            class="drawer-nav-item"
          >
            <q-item-section avatar>
              <q-icon name="manage_accounts" />
            </q-item-section>

            <q-item-section> Utilisateurs </q-item-section>
          </q-item>

          <!-- IMPORTER -->
          <q-item
            v-if="
              [
                'Dispatch',
                'Verificateur',
                'Validateur',
                'i_archive',
                'Admin',
                'super_admin',
              ].includes(auth.role)
            "
            clickable
            v-ripple
            :to="{ name: 'dossier-create' }"
            class="drawer-nav-item"
          >
            <q-item-section avatar>
              <q-icon name="upload_file" />
            </q-item-section>

            <q-item-section> Importer </q-item-section>
          </q-item>

          <!-- ARCHIVES -->
          <q-item
            clickable
            v-ripple
            :to="{ name: 'archives' }"
            class="drawer-nav-item"
          >
            <q-item-section avatar>
              <q-icon name="inventory_2" />
            </q-item-section>

            <q-item-section> Archives </q-item-section>
          </q-item>

          <!-- NOTIFICATIONS -->
          <q-item
            clickable
            v-ripple
            :to="{ name: 'notifications' }"
            class="drawer-nav-item"
          >
            <q-item-section avatar>
              <q-icon name="notifications" />
            </q-item-section>

            <q-item-section>
              Notifications

              <q-badge v-if="notif.unread" color="negative" class="q-ml-sm">
                {{ notif.unread }}
              </q-badge>
            </q-item-section>
          </q-item>

          <!-- PROFIL -->
          <q-item
            clickable
            v-ripple
            :to="{ name: 'profil' }"
            class="drawer-nav-item"
          >
            <q-item-section avatar>
              <q-icon name="person" />
            </q-item-section>

            <q-item-section> Profil </q-item-section>
          </q-item>

          <q-separator class="drawer-separator" />

          <!-- ROLE -->
          <q-item class="drawer-role-item">
            <q-item-section>
              <q-item-label caption class="drawer-role-caption">
                Rôle
              </q-item-label>

              <q-item-label class="drawer-role-value text-weight-medium">
                {{ auth.role }}
              </q-item-label>
            </q-item-section>
          </q-item>

          <!-- DECONNEXION -->
          <q-item clickable v-ripple @click="logout" class="drawer-logout-item">
            <q-item-section avatar>
              <q-icon name="logout" color="negative" />
            </q-item-section>

            <q-item-section class="text-negative"> Déconnexion </q-item-section>
          </q-item>
        </q-list>
      </q-scroll-area>
    </q-drawer>

    <!-- =========================================================
         CONTENU
    ========================================================== -->
    <q-page-container>
      <router-view />
    </q-page-container>
  </q-layout>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";

import { useRouter } from "vue-router";

import { useQuasar } from "quasar";

import { useAuthStore } from "stores/auth";

import { useNotificationStore } from "stores/notifications";

import { getImageUrl } from "src/utils/files";

// ============================================================
// CONSTANTES
// ============================================================

const DRAWER_WIDTH = 250;

// ============================================================
// COMPOSABLES
// ============================================================

const $q = useQuasar();

const router = useRouter();

const auth = useAuthStore();

const notif = useNotificationStore();

// ============================================================
// ETAT
// ============================================================

const leftDrawer = ref(false);

// ============================================================
// COMPORTEMENT DU DRAWER
// ============================================================

const drawerBehavior = computed(() => {
  return $q.screen.gt.sm ? "desktop" : "mobile";
});

// ============================================================
// INITIALES
// ============================================================

const initials = computed(() => {
  if (!auth.user) {
    return "?";
  }

  return (
    `${auth.user.prenoms?.[0] || ""}` + `${auth.user.nom?.[0] || ""}`
  ).toUpperCase();
});

// ============================================================
// OUVERTURE / FERMETURE MENU
// ============================================================

function toggleDrawer() {
  leftDrawer.value = !leftDrawer.value;
}

// ============================================================
// LOGOUT
// ============================================================

function logout() {
  notif.stopPolling();

  auth.logout();

  router.replace({
    name: "login",
  });
}

// ============================================================
// URL IMAGE
// ============================================================

function imageUrl(image) {
  return getImageUrl(image);
}

// ============================================================
// INITIALISATION
// ============================================================

onMounted(() => {
  /*
   * Sur desktop :
   * le menu est ouvert par défaut.
   */
  if ($q.screen.gt.sm) {
    leftDrawer.value = true;
  }

  /*
   * Démarrer les notifications.
   */
  notif.startPolling();
});

// ============================================================
// NETTOYAGE
// ============================================================

onUnmounted(() => {
  notif.stopPolling();
});
</script>

<style>
/* ============================================================
   VARIABLES
============================================================ */

:root {
  --app-header-height: 64px;
  --app-drawer-width: 250px;
  --app-surface-soft: rgba(255, 255, 255, 0.08);
  --app-surface-strong: rgba(255, 255, 255, 0.14);
}

/* ============================================================
   HEADER
============================================================ */

.app-header {
  position: relative;

  width: 100%;

  height: var(--app-header-height);
  min-height: var(--app-header-height);

  z-index: 2000;

  box-shadow: 0 2px 14px rgba(15, 23, 42, 0.08);
}

/* ============================================================
   TOOLBAR
============================================================ */

.app-toolbar {
  position: relative;

  width: 100%;

  height: var(--app-header-height);
  min-height: var(--app-header-height);

  padding: 0 12px;

  overflow: visible;
}

/* ============================================================
   BOUTON MENU
============================================================ */

.header-menu {
  position: absolute;

  left: 8px;
  top: 50%;

  transform: translateY(-50%);

  z-index: 20;

  transition:
    left 0.2s ease,
    transform 0.2s ease;
}

.header-menu .q-btn {
  border-radius: 10px;

  background: var(--app-surface-soft);

  transition:
    background 0.2s ease,
    transform 0.2s ease;
}

.header-menu .q-btn:hover {
  background: var(--app-surface-strong);
}

/*
 * Menu ouvert :
 * le bouton se place juste après
 * la largeur du drawer.
 */
.header-menu--open {
  left: calc(var(--app-drawer-width) + 8px);
}

/* ============================================================
   LOGO CENTRE
============================================================ */

.header-brand {
  position: absolute;

  left: 50%;
  top: 50%;

  transform: translate(-50%, -50%);

  display: flex;

  align-items: center;

  gap: 10px;

  white-space: nowrap;

  pointer-events: none;

  z-index: 10;
}

/* LOGO */

.header-brand__logo {
  width: 42px;
  height: 42px;

  display: block;

  object-fit: contain;

  flex-shrink: 0;
}

/* TEXTE */

.header-brand__title {
  font-size: 17px;

  font-weight: 700;

  line-height: 1.2;

  letter-spacing: 0.3px;
}

/* Dossiers */

.header-brand__title span {
  color: #f2c14e;

  margin-left: 4px;
}

/* ============================================================
   ACTIONS À DROITE
============================================================ */

.header-actions {
  position: absolute;

  right: 8px;
  top: 50%;

  transform: translateY(-50%);

  display: flex;

  align-items: center;

  gap: 6px;

  z-index: 30;

  white-space: nowrap;
}

/* ============================================================
   BOUTON NOTIFICATION
============================================================ */

.header-action-btn,
.header-profile-btn {
  border-radius: 12px;

  background: var(--app-surface-soft);

  transition:
    background 0.2s ease,
    transform 0.2s ease;
}

.header-action-btn:hover,
.header-profile-btn:hover {
  background: var(--app-surface-strong);
}

.header-action-btn {
  flex-shrink: 0;
}

/* ============================================================
   PROFIL
============================================================ */

.header-profile-btn {
  display: flex;

  align-items: center;

  justify-content: center;

  min-width: 0;

  padding-left: 8px;
  padding-right: 8px;

  border: 1px solid rgba(255, 255, 255, 0.12);
}

/* NOM */

.header-user-name {
  display: block;

  margin-left: 8px;

  max-width: 180px;

  overflow: hidden;

  text-overflow: ellipsis;

  white-space: nowrap;

  font-weight: 500;

  line-height: 1;
}

/* ============================================================
   AVATAR
============================================================ */

.profile-avatar {
  overflow: hidden;

  flex-shrink: 0;

  border: 2px solid rgba(255, 255, 255, 0.2);
}

.profile-avatar__image {
  width: 100%;
  height: 100%;

  max-width: none;
  max-height: none;

  display: block;

  object-fit: cover;

  object-position: center center;

  border-radius: 50%;
}

/* ============================================================
   DRAWER
============================================================ */

.app-drawer {
  background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);

  border-right: 1px solid rgba(148, 163, 184, 0.18);

  box-shadow: 6px 0 22px rgba(15, 23, 42, 0.06);
}

.drawer-scroll {
  background: transparent;
}

.drawer-list {
  padding: 12px 8px 16px;
}

.drawer-section-title {
  margin: 0 8px 8px;

  letter-spacing: 0.06em;

  text-transform: uppercase;

  font-size: 11px;
}

.drawer-nav-item {
  margin: 2px 6px;

  border-radius: 12px;

  transition:
    background 0.2s ease,
    transform 0.2s ease,
    box-shadow 0.2s ease;
}

.drawer-nav-item:hover {
  background: rgba(255, 255, 255, 0.7);

  transform: translateX(1px);
}

.drawer-nav-item .q-item__section--avatar {
  min-width: 36px;
}

.drawer-nav-item .q-icon {
  color: var(--q-primary);
}

.drawer-nav-item.q-router-link--active,
.drawer-nav-item.q-item--active {
  background: rgba(255, 255, 255, 0.8);

  box-shadow: inset 0 0 0 1px rgba(148, 163, 184, 0.22);
}

.drawer-nav-item.q-router-link--active .q-item__label,
.drawer-nav-item.q-router-link--active .q-item__section,
.drawer-nav-item.q-router-link--active .q-icon,
.drawer-nav-item.q-item--active .q-item__label,
.drawer-nav-item.q-item--active .q-item__section,
.drawer-nav-item.q-item--active .q-icon {
  color: var(--q-primary);
  font-weight: 600;
}

.drawer-separator {
  margin: 12px 10px 10px;

  opacity: 0.9;
}

.drawer-role-item {
  margin: 0 6px;

  border-radius: 12px;

  background: rgba(148, 163, 184, 0.06);
}

.drawer-role-caption {
  color: #64748b;

  font-size: 11px;

  letter-spacing: 0.04em;

  text-transform: uppercase;
}

.drawer-role-value {
  margin-top: 4px;

  color: #0f172a;
}

.drawer-logout-item {
  margin: 8px 6px 0;

  border-radius: 12px;

  transition: background 0.2s ease;
}

.drawer-logout-item:hover {
  background: rgba(220, 38, 38, 0.06);
}

/* ============================================================
   PAGE CONTAINER
============================================================ */

/*
 * NE PAS mettre :
 *
 * padding-top: 0 !important
 *
 * QLayout/QHeader calculent automatiquement
 * l'espace sous le header.
 */

.q-page-container {
  width: 100%;
}

/* ============================================================
   PAGE
============================================================ */

.q-page {
  width: 100%;
}

/* ============================================================
   RESPONSIVE
============================================================ */

@media (max-width: 700px) {
  :root {
    --app-header-height: 56px;
  }

  .app-header {
    height: var(--app-header-height);

    min-height: var(--app-header-height);
  }

  .app-toolbar {
    height: var(--app-header-height);

    min-height: var(--app-header-height);

    padding: 0 6px;
  }

  /* MENU */

  .header-menu {
    left: 4px;
  }

  /*
   * Sur mobile le drawer ne doit pas déplacer
   * inutilement le bouton.
   */
  .header-menu--open {
    left: 4px;
  }

  /* LOGO */

  .header-brand {
    gap: 0;
  }

  .header-brand__logo {
    width: 36px;
    height: 36px;
  }

  .header-brand__title {
    display: none;
  }

  /* ACTIONS */

  .header-actions {
    right: 4px;

    gap: 2px;
  }

  /* NOM */

  .header-user-name {
    max-width: 100px;

    font-size: 13px;
  }
}

/* ============================================================
   TRES PETIT ECRAN
============================================================ */

@media (max-width: 420px) {
  .header-user-name {
    max-width: 75px;
  }

  .profile-avatar {
    width: 30px;
    height: 30px;
  }
}
</style>
