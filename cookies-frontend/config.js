// config.js
const PROD_API = "https://cookies-backend.leanroman99.workers.dev";
const DEV_API  = "http://127.0.0.1:8787";

const isLocal = typeof window !== "undefined" &&
  (location.hostname === "127.0.0.1" || location.hostname === "localhost");

export const API_BASE_URL = isLocal ? DEV_API : PROD_API;

export const fmtPrecio = new Intl.NumberFormat("es-AR", {
  style: "currency", currency: "ARS",
});

export const STORAGE = {
  CART_KEY: "cookies.cart",
  CART_VERSION: 1,
  FORM_KEY: "cookies.cliente.v1",
};

