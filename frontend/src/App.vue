<template>
  <router-view />
</template>

<script setup>
import { onMounted } from 'vue'
import { useAuthStore } from 'stores/auth'
import { useInactivityLogout } from 'src/composables/useInactivityLogout'
import { usePresence } from 'src/composables/usePresence'

const auth = useAuthStore()
useInactivityLogout()
usePresence()

onMounted(() => {
  auth.hydrate()
})
</script>
