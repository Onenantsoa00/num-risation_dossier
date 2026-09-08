<template>
  <router-view />
</template>

<script setup>
import { onMounted } from 'vue'
import { useAuthStore } from 'stores/auth'
import { usePresence } from 'src/composables/usePresence'

const auth = useAuthStore()
// Pas de déconnexion automatique : la session ne doit jamais expirer,
// même après une longue inactivité.
usePresence()

onMounted(() => {
  auth.hydrate()
})
</script>
