const routes = [
  {
    path: '/login',
    name: 'login',
    component: () => import('pages/LoginPage.vue'),
    meta: { public: true },
  },
  {
    path: '/signup',
    name: 'signup',
    component: () => import('pages/SignupPage.vue'),
    meta: { public: true },
  },
  {
    path: '/',
    component: () => import('layouts/MainLayout.vue'),
    children: [
      { path: '', redirect: '/dossiers' },
      {
        path: 'dossiers',
        name: 'dossiers',
        component: () => import('pages/DossiersPage.vue'),
      },
      {
        path: 'dossiers/nouveau',
        name: 'dossier-create',
        component: () => import('pages/DossierCreatePage.vue'),
        meta: { roles: ['Dispatch', 'Admin'] },
      },
      {
        path: 'dossiers/:id',
        name: 'dossier-detail',
        component: () => import('pages/DossierDetailPage.vue'),
      },
      {
        path: 'archives',
        name: 'archives',
        component: () => import('pages/ArchivesPage.vue'),
      },
      {
        path: 'notifications',
        name: 'notifications',
        component: () => import('pages/NotificationsPage.vue'),
      },
      {
        path: 'profil',
        name: 'profil',
        component: () => import('pages/ProfilePage.vue'),
      },
    ],
  },
  {
    path: '/:catchAll(.*)*',
    component: () => import('pages/ErrorNotFound.vue'),
  },
]

export default routes
