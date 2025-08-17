// api.js
import { API_BASE_URL } from "./config.js";

//Chequeo silencioso de salud. Devuelve true/false.
export async function checkHealth() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/health`);
    if (!res.ok) return false;
    const txt = await res.text();
    return txt.trim().toLowerCase() === "ok";
  } catch {
    return false;
  }
}

export async function getProductos() {
  const res = await fetch(`${API_BASE_URL}/api/productos`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error("La API no devolvió una lista");
  return data;
}

export async function crearPedido(payload) {
  const res = await fetch(`${API_BASE_URL}/api/pedidos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`No se pudo crear el pedido. ${txt}`);
  }
  return res.json(); // { pago_url, ... }
}

// La vamos a usar en gracias.html
export async function getPedidoById(id) {
  const res = await fetch(`${API_BASE_URL}/api/pedidos/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
