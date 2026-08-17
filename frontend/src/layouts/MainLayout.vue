<template>
  <q-layout view="lHh Lpr lFf">
    <q-header elevated class="bg-primary text-white">
      <q-toolbar>
        <q-btn
          flat
          dense
          round
          icon="menu"
          aria-label="Menu"
          @click="leftDrawer = !leftDrawer"
        />
        <q-toolbar-title class="text-weight-bold">
          NUMÉRISATION <span class="text-accent">Dossiers</span>
        </q-toolbar-title>

        <q-btn
          flat
          round
          dense
          icon="notifications"
          :to="{ name: 'notifications' }"
        >
          <q-badge v-if="notif.unread" color="accent" floating>{{
            notif.unread
          }}</q-badge>
        </q-btn>

        <q-btn flat dense no-caps class="q-ml-sm" :to="{ name: 'profil' }">
          <q-avatar
            size="28px"
            color="secondary"
            text-color="white"
            class="q-mr-sm"
          >
            {{ initials }}
          </q-avatar>
          <span class="gt-xs">{{ auth.fullName }}</span>
        </q-btn>
      </q-toolbar>
    </q-header>

    <q-drawer v-model="leftDrawer" show-if-above bordered :width="250">
      <q-list padding>
        <q-item-label header class="text-weight-bold text-primary"
          >Navigation</q-item-label
        >

        <q-item clickable v-ripple :to="{ name: 'dossiers' }" exact>
          <q-item-section avatar><q-icon name="folder_open" /></q-item-section>
          <q-item-section>Dossiers</q-item-section>
        </q-item>

        <q-item
          v-if="auth.role === 'Admin'"
          clickable
          v-ripple
          :to="{ name: 'users' }"
        >
          <q-item-section avatar>
            <q-icon name="manage_accounts" />
          </q-item-section>

          <q-item-section> Utilisateurs </q-item-section>
        </q-item>

        <q-item
          v-if="['Dispatch', 'Admin'].includes(auth.role)"
          clickable
          v-ripple
          :to="{ name: 'dossier-create' }"
        >
          <q-item-section avatar><q-icon name="upload_file" /></q-item-section>
          <q-item-section>Importer</q-item-section>
        </q-item>

        <q-item clickable v-ripple :to="{ name: 'archives' }">
          <q-item-section avatar><q-icon name="inventory_2" /></q-item-section>
          <q-item-section>Archives</q-item-section>
        </q-item>

        <q-item clickable v-ripple :to="{ name: 'notifications' }">
          <q-item-section avatar
            ><q-icon name="notifications"
          /></q-item-section>
          <q-item-section>
            Notifications
            <q-badge v-if="notif.unread" color="negative" class="q-ml-sm">{{
              notif.unread
            }}</q-badge>
          </q-item-section>
        </q-item>

        <q-item clickable v-ripple :to="{ name: 'profil' }">
          <q-item-section avatar><q-icon name="person" /></q-item-section>
          <q-item-section>Profil</q-item-section>
        </q-item>

        <q-separator class="q-my-md" />

        <q-item>
          <q-item-section>
            <q-item-label caption>Rôle</q-item-label>
            <q-item-label class="text-weight-medium">{{
              auth.role
            }}</q-item-label>
          </q-item-section>
        </q-item>

        <q-item clickable v-ripple @click="logout">
          <q-item-section avatar
            ><q-icon name="logout" color="negative"
          /></q-item-section>
          <q-item-section class="text-negative">Déconnexion</q-item-section>
        </q-item>
      </q-list>
    </q-drawer>

    <q-page-container>
      <router-view />
    </q-page-container>
  </q-layout>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "stores/auth";
import { useNotificationStore } from "stores/notifications";

const leftDrawer = ref(false);
const auth = useAuthStore();
const notif = useNotificationStore();
const router = useRouter();

const initials = computed(() => {
  if (!auth.user) return "?";
  return `${auth.user.prenoms?.[0] || ""}${auth.user.nom?.[0] || ""}`.toUpperCase();
});

function logout() {
  notif.stopPolling();
  auth.logout();
  router.push({ name: "login" });
}

onMounted(() => notif.startPolling());
onUnmounted(() => notif.stopPolling());
</script>
