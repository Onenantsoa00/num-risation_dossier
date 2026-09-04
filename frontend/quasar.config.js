import { configure } from 'quasar/wrappers'

export default configure((/* ctx */) => {
  return {
    boot: ['logger', 'axios', 'socket'],
    css: ['app.scss'],
    extras: [
      'roboto-font',
      'material-icons',
    ],
    build: {
      target: {
        browser: ['es2022', 'firefox115', 'chrome115', 'safari14'],
        node: 'node20',
      },
      vueRouterMode: 'history',
      env: {
        API_URL: process.env.API_URL || 'http://localhost:3000/api',
      },
      vitePlugins: [],
    },
    devServer: {
      open: false,
      port: 9000,
      proxy: {
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true,
        },
        '/uploads': {
          target: 'http://localhost:3000',
          changeOrigin: true,
        },
      },
    },
    framework: {
      config: {
        brand: {
          primary: '#0B3D5C',
          secondary: '#1A6B8A',
          accent: '#C4A35A',
          dark: '#0F1C24',
          positive: '#2E7D4F',
          negative: '#B33A3A',
          info: '#3A7CA5',
          warning: '#C47B2A',
        },
      },
      plugins: ['Notify', 'Dialog', 'Loading'],
    },
    animations: ['fadeIn', 'fadeOut'],
  }
})
