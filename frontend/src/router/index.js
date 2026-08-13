import { defineRouter } from '#q-app/wrappers'
import {
  createRouter,
  createMemoryHistory,
  createWebHistory,
  createWebHashHistory,
} from 'vue-router'
import routes from './routes'
import { useAuthStore } from 'stores/auth'

export default defineRouter(function (/* { store, ssrContext } */) {
  const createHistory = process.env.SERVER
    ? createMemoryHistory
    : process.env.VUE_ROUTER_MODE === 'history'
      ? createWebHistory
      : createWebHashHistory

  const Router = createRouter({
    scrollBehavior: () => ({ left: 0, top: 0 }),
    routes,
    history: createHistory(process.env.VUE_ROUTER_BASE),
  })

  Router.beforeEach((to, _from, next) => {
    const auth = useAuthStore()
    if (!auth.token) auth.hydrate()

    if (to.meta.public) return next()
    if (!auth.isAuthenticated) return next({ name: 'login', query: { redirect: to.fullPath } })
    if (to.meta.roles && !to.meta.roles.includes(auth.role) && auth.role !== 'Admin') {
      return next({ name: 'dossiers' })
    }
    return next()
  })

  return Router
})
