<template>
  <q-page padding>
    <div class="page-shell" style="max-width: 800px">
      <div class="row items-center justify-between q-mb-md">
        <div>
          <h1 class="page-title">Notifications</h1>
          <p class="page-sub">Alertes liées aux dossiers et mentions</p>
        </div>
        <q-btn flat color="primary" label="Tout marquer lu" @click="markAll" :disable="!notif.unread" />
      </div>

      <q-list bordered class="surface-card" separator>
        <q-item
          v-for="n in notif.items"
          :key="n.id"
          clickable
          v-ripple
          :class="{ 'bg-blue-1': !n.lu }"
          @click="open(n)"
        >
          <q-item-section avatar>
            <q-icon :name="iconFor(n.type)" :color="n.lu ? 'grey' : 'primary'" />
          </q-item-section>
          <q-item-section>
            <q-item-label :class="{ 'text-weight-bold': !n.lu }">{{ n.message }}</q-item-label>
            <q-item-label caption>{{ formatDate(n.created_at) }} · {{ n.type }}</q-item-label>
          </q-item-section>
          <q-item-section side v-if="!n.lu">
            <q-badge color="accent">Nouveau</q-badge>
          </q-item-section>
        </q-item>
        <q-item v-if="!notif.items.length">
          <q-item-section class="text-grey-7">Aucune notification</q-item-section>
        </q-item>
      </q-list>
    </div>
  </q-page>
</template>

<script setup>
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useNotificationStore } from 'stores/notifications'

const notif = useNotificationStore()
const router = useRouter()

function formatDate(d) {
  return new Date(d).toLocaleString('fr-FR')
}

function iconFor(type) {
  return {
    INFO: 'info',
    DOSSIER: 'folder',
    VERIFICATION: 'fact_check',
    VALIDATION: 'verified',
    REJET: 'cancel',
    SYSTEME: 'settings',
  }[type] || 'notifications'
}

async function open(n) {
  if (!n.lu) await notif.markRead(n.id)
  if (n.id_dossier) {
    router.push({ name: 'dossier-detail', params: { id: n.id_dossier } })
  }
}

async function markAll() {
  await notif.markAllRead()
}

onMounted(() => notif.fetch())
</script>
