import { boot } from "quasar/wrappers";
import axios from "axios";

const api = axios.create({
  baseURL: "/api",
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,

  (error) => {
    const status = error.response?.status;
    const code = error.response?.data?.code;

    if (status === 403 && code === "ACCOUNT_RESTRICTED") {
      localStorage.removeItem("token");
      localStorage.removeItem("user");

      window.location.href = "/compte-restreint";

      return Promise.reject(error);
    }

    if (status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");

      if (
        !window.location.pathname.startsWith("/login") &&
        !window.location.pathname.startsWith("/compte-restreint")
      ) {
        window.location.href = "/login";
      }
    }

    return Promise.reject(error);
  },
);

export default boot(({ app }) => {
  app.config.globalProperties.$axios = axios;
  app.config.globalProperties.$api = api;
});

export { api };
