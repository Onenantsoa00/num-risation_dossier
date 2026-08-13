import { defineStore } from 'pinia'
import { api } from 'boot/axios'

export const useNotificationStore = defineStore('notifications', {
  state: () => ({
    items: [],
    unread: 0,
    timer: null,
  }),
  actions: {
    async fetch() {
      const [list, count] = await Promise.all([
        api.get('/notifications'),
        api.get('/notifications/unread-count'),
      ])
      this.items = list.data
      this.unread = count.data.count
    },
    async markRead(id) {
      await api.patch(`/notifications/${id}/read`)
      await this.fetch()
    },
    async markAllRead() {
      await api.patch('/notifications/read-all')
      await this.fetch()
    },
    startPolling() {
      this.fetch()
      if (this.timer) clearInterval(this.timer)
      this.timer = setInterval(() => this.fetch(), 15000)
    },
    stopPolling() {
      if (this.timer) clearInterval(this.timer)
      this.timer = null
    },
  },
})
