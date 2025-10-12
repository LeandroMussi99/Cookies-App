// /admin/admin.js
// ===== Imports del proyecto (reutilizamos lo que ya tenés) =====
import { fmtPrecio, API_BASE_URL } from "../config.js";
import { getProductos } from "../api.js";

// ===== Referencias del DOM =====
const $tbody = document.getElementById("tbody-productos");
const $msg = document.getElementById("admin-msg");
const $btnLogout = document.getElementById("btn-logout");
const $btnNuevo = document.getElementById("btn-nuevo");
const $dlg = document.getElementById("modal-prod");

// Tabs
const $tabProd = document.getElementById("tab-prod");
const $tabPed = document.getElementById("tab-ped");
const $viewProd = document.getElementById("vista-productos");
const $viewPed = document.getElementById("vista-pedidos");

// Pedidos DOM
const $tbodyPed = document.getElementById("tbody-ped");
const $msgPed = document.getElementById("msg-ped");

// ===== Caché local de productos (memoria) =====
let productosCache = [];

// ===== Logout de Cloudflare Access =====
function setLogoutLink() {
  const returnTo = encodeURIComponent("/admin/");
  $btnLogout.href = `/cdn-cgi/access/logout?returnTo=${returnTo}`;
}

// ===== Auth simple para /api/admin (Basic) =====
// Pide user/pass una sola vez y lo guarda en sessionStorage.
let ADMIN_AUTH = sessionStorage.getItem("ADMIN_AUTH") || "";

function ensureAdminAuth() {
  if (!ADMIN_AUTH) {
    const u = prompt("Usuario admin:");
    const p = prompt("Contraseña admin:");
    ADMIN_AUTH = "Basic " + btoa(`${u}:${p}`);
    sessionStorage.setItem("ADMIN_AUTH", ADMIN_AUTH);
  }
}

async function apiAdmin(path, { method = "GET", body = null } = {}) {
  ensureAdminAuth();
  const headers = new Headers({ Authorization: ADMIN_AUTH });
  if (body) headers.set("Content-Type", "application/json");

  const res = await fetch(`${API_BASE_URL}${path}`, { method, headers, body });
  if (res.status === 401) {
    // credenciales malas → reset y reintentar una vez
    sessionStorage.removeItem("ADMIN_AUTH");
    ADMIN_AUTH = "";
    ensureAdminAuth();
    return apiAdmin(path, { method, body });
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const txt = await res.text();
  try {
    return JSON.parse(txt);
  } catch {
    return {};
  }
}

// ===== Helpers de UI =====
function rowHTML(p) {
  const img =
    p.imagen_url && p.imagen_url.trim()
      ? `<img class="thumb" src="${p.imagen_url}" alt="${escapeAttr(
          p.nombre || "Producto"
        )}">`
      : `<div class="thumb"></div>`;
  const precio = fmtPrecio.format(Number(p.precio || 0));
  const stock = Number(p.stock ?? 0);
  const desc = (p.descripcion || "").trim();
  const descShort = desc.length > 80 ? desc.slice(0, 77) + "…" : desc;

  return `
    <tr data-id="${p.id}">
      <td>${img}</td>
      <td>${escapeHtml(p.nombre || "—")}</td>
      <td>${precio}</td>
      <td><span class="tag">${stock}</span></td>
      <td>${escapeHtml(descShort || "—")}</td>
      <td>
        <button class="btn js-edit">Editar</button>
        <button class="btn js-del" style="border-color:#e79a9a;color:#8a1f1f">Eliminar</button>
      </td>
    </tr>
  `;
}

async function cargarProductos() {
  try {
    $msg.textContent = "Cargando productos…";
    const productos = await getProductos();
    productosCache = productos;
    $tbody.innerHTML = productos.map(rowHTML).join("");
    $msg.textContent = `Total: ${productos.length} productos.`;
  } catch (e) {
    console.error(e);
    $tbody.innerHTML = "";
    $msg.textContent = "No se pudieron cargar los productos.";
  }
}

function eliminarProducto(id) {
  if (!confirm("¿Seguro que querés eliminar este producto?")) return;

  (async () => {
    try {
      await apiAdmin(`/api/admin/productos/${id}`, {
        method: "DELETE",
      });
      await cargarProductos(); // refresca la lista
    } catch (err) {
      console.error(err);
      alert("No se pudo eliminar el producto. " + (err.message || ""));
    }
  })();
}

// ===== Helpers de admin =====
function formatFecha(iso) {
  try {
    const d = new Date(iso);
    if (isNaN(d)) return '—';
    return d.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'medium' });
  } catch { return '—'; }
}

function contactoBonito(row) {
  const parts = [];
  if (row.cliente_email) parts.push(row.cliente_email);
  if (row.cliente_telefono) parts.push(row.cliente_telefono);
  return parts.join(' · ');
}

function estadoClassName(estado) {
  return String(estado || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ===== Modal (crear/editar) =====
function openProdModal(mode, prod = {}) {
  const isEdit = mode === "edit";
  const title = isEdit ? `Editar: ${prod.nombre ?? ""}` : "Nuevo producto";

  const v = {
    id: prod.id ?? "",
    nombre: prod.nombre ?? "",
    imagen_url: (prod.imagen_url ?? "").trim(),
    precio: Number(prod.precio ?? 0),
    stock: Number(prod.stock ?? 0),
    descripcion: prod.descripcion ?? "",
  };

  $dlg.innerHTML = `
    <div class="modal-head">
      <strong>${escapeHtml(title)}</strong>
      <button class="btn" data-close>✕</button>
    </div>
    <form id="form-prod" class="modal-body" method="dialog">
      <input type="hidden" name="id" value="${v.id}">
      <div class="form-grid">
        <label>
          <span>Nombre</span>
          <input name="nombre" required value="${escapeAttr(v.nombre)}" />
        </label>
        <label>
          <span>Precio (ARS)</span>
          <input name="precio" type="number" step="0.01" min="0" required value="${
            v.precio
          }">
        </label>
        <label>
          <span>Stock</span>
          <input name="stock" type="number" step="1" min="0" required value="${
            v.stock
          }">
        </label>
        <label>
          <span>Imagen URL</span>
          <input name="imagen_url" placeholder="https://..." value="${escapeAttr(
            v.imagen_url
          )}">
        </label>
        <label style="grid-column: 1 / -1;">
          <span>Descripción</span>
          <textarea name="descripcion">${escapeHtml(v.descripcion)}</textarea>
        </label>
      </div>
      <div class="modal-actions">
        <button class="btn" type="button" data-close>Cancelar</button>
        <button class="btn primary" type="submit">${
          isEdit ? "Guardar cambios" : "Crear"
        }</button>
      </div>
    </form>
  `;

  // cerrar por botón (Cancelar o ✕)
  $dlg.querySelectorAll("[data-close]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault(); // por si está en un <form>
      $dlg.close();
    });
  });

  // submit (validación + guardar real vía /api/admin)
  const $form = $dlg.querySelector("#form-prod");
  $form.addEventListener(
    "submit",
    (e) => {
      e.preventDefault();
      const fd = new FormData($form);
      const payload = {
        id: fd.get("id") ? Number(fd.get("id")) : null,
        nombre: (fd.get("nombre") || "").toString().trim(),
        precio: Number(fd.get("precio")),
        stock: Number(fd.get("stock")),
        imagen_url: (fd.get("imagen_url") || "").toString().trim(),
        descripcion: (fd.get("descripcion") || "").toString().trim(),
      };

      // validación mínima
      const errs = [];
      if (!payload.nombre) errs.push("El nombre es obligatorio.");
      if (!Number.isFinite(payload.precio) || payload.precio < 0)
        errs.push("Precio inválido.");
      if (!Number.isInteger(payload.stock) || payload.stock < 0)
        errs.push("Stock inválido (entero ≥ 0).");
      if (payload.imagen_url && !/^https?:\/\/.+/i.test(payload.imagen_url))
        errs.push("La imagen debe ser una URL http/https.");
      if (errs.length) {
        alert(errs.join("\n"));
        return;
      }

      (async () => {
        try {
          if (isEdit) {
            await apiAdmin(`/api/admin/productos/${payload.id}`, {
              method: "PUT",
              body: JSON.stringify({
                nombre: payload.nombre,
                precio: payload.precio,
                stock: payload.stock,
                imagen_url: payload.imagen_url,
                descripcion: payload.descripcion,
              }),
            });
          } else {
            await apiAdmin(`/api/admin/productos`, {
              method: "POST",
              body: JSON.stringify({
                nombre: payload.nombre,
                precio: payload.precio,
                stock: payload.stock,
                imagen_url: payload.imagen_url,
                descripcion: payload.descripcion,
              }),
            });
          }

          await cargarProductos(); // refresca desde la BD real
          $dlg.close();
        } catch (err) {
          console.error(err);
          alert("No se pudo guardar el producto. " + (err.message || ""));
        }
      })();
    },
    { once: true }
  );

  $dlg.showModal();
}

// ===== Eventos =====
function wireEvents() {
  // Nuevo producto
  $btnNuevo.addEventListener("click", () => openProdModal("new"));

  // Editar / Eliminar (delegación en el tbody)
  $tbody.addEventListener("click", (e) => {
    const tr = e.target.closest("tr");
    if (!tr) return;
    const id = Number(tr.dataset.id);
    const prod = productosCache.find((p) => Number(p.id) === id);

    const btnEdit = e.target.closest(".js-edit");
    if (btnEdit && prod) {
      openProdModal("edit", prod);
      return;
    }

    const btnDel = e.target.closest(".js-del");
    if (btnDel) {
      eliminarProducto(id);
    }
  });
}

// Toggle vistas
function showView(which) {
  const prod = which === "prod";
  $tabProd.classList.toggle("active", prod);
  $tabPed.classList.toggle("active", !prod);

  if ($viewProd) $viewProd.hidden = !prod;
  if ($viewPed) $viewPed.hidden = prod;

  if (!prod) cargarPedidos();
}

$tabProd.addEventListener("click", () => showView("prod"));
$tabPed.addEventListener("click", () => showView("ped"));

// Helpers
const fmtMoney = (n) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(
    Number(n || 0)
  );
const fmtDate = (iso) => new Date(iso).toLocaleString("es-AR");

// Render fila pedido
function rowPedidoHTML(p) {
  const contacto = contactoBonito(p);
  const direccion = (p.cliente_direccion || "").trim();
  const estadoRaw = (p.estado || "").toString().trim();
  const estadoLabel = estadoRaw
    ? estadoRaw.charAt(0).toUpperCase() + estadoRaw.slice(1)
    : "—";
  const estadoClass = estadoClassName(estadoRaw);
  return `
    <tr data-id="${p.id}">
      <td class="col-id">#${p.id}</td>
      <td class="col-fecha">${formatFecha(p.created_at)}</td>
      <td class="col-cliente">
        <strong>${escapeHtml(p.cliente_nombre || "—")}</strong>
        ${
          direccion
            ? `<small>${escapeHtml(direccion)}</small>`
            : ""
        }
      </td>
      <td class="col-contacto">
        ${
          contacto
            ? contacto
                .split(' · ')
                .map((c) => `<span>${escapeHtml(c)}</span>`)
                .join("")
            : '<span>—</span>'
        }
      </td>
      <td class="col-estado"><span class="tag estado ${estadoClass}">${escapeHtml(estadoLabel)}</span></td>
      <td class="col-total">${fmtMoney(p.total)}</td>
      <td class="col-accion"><button class="btn js-ver">Ver</button></td>
    </tr>
  `;
}

// Cargar pedidos
async function cargarPedidos() {
  try {
    $msgPed.textContent = "Cargando pedidos…";
    $tbodyPed.innerHTML = "";
    const pedidos = await apiAdmin("/api/admin/pedidos"); // ← endpoint nuevo
    if (!Array.isArray(pedidos) || pedidos.length === 0) {
      $msgPed.textContent = "No hay pedidos.";
      return;
    }
    $tbodyPed.innerHTML = pedidos.map(rowPedidoHTML).join("");
    $msgPed.textContent = `Total: ${pedidos.length} pedidos.`;

    // Ver detalle
    $tbodyPed.querySelectorAll(".js-ver").forEach(($btn) => {
      $btn.addEventListener("click", async () => {
        const id = Number($btn.closest("tr")?.dataset.id);
        if (!id) return;
        try {
          const det = await apiAdmin(`/api/admin/pedidos/${id}`);
          abrirModalDetallePedido(det); // definimos abajo
        } catch (e) {
          console.error(e);
          alert("No se pudo cargar el detalle del pedido.");
        }
      });
    });
  } catch (e) {
    console.error(e);
    $msgPed.textContent = "Error cargando pedidos.";
  }
}

// Modal simple de detalle
function abrirModalDetallePedido(data) {
  const { pedido, items } = data || {};
  const contacto = [pedido.cliente_email, pedido.cliente_telefono]
  .filter(Boolean)
  .join(" · ");

  const lista = (items || [])
    .map(
      (it) =>
        `<li>${escapeHtml(it.nombre)} × ${it.cantidad} — ${fmtMoney(
          it.precio_unit
        )}</li>`
    )
    .join("");
  $dlg.innerHTML = `
    <div class="modal-head">
      <strong>Pedido #${pedido.id} — ${escapeHtml(pedido.estado)}</strong>
      <button class="btn" data-close>✕</button>
    </div>
    <div class="modal-body">
      <p><strong>Fecha:</strong> ${fmtDate(pedido.created_at)}</p>
      <p><strong>Cliente:</strong> ${escapeHtml(pedido.cliente_nombre)}${contacto ? " — " + escapeHtml(contacto) : ""}</p>
      <p><strong>Dirección:</strong> ${escapeHtml(
        pedido.cliente_direccion || "—"
      )}</p>
      <p><strong>Total:</strong> ${fmtMoney(pedido.total)}</p>
      <hr>
      <p><strong>Items:</strong></p>
      <ul>${lista}</ul>
    </div>
    <div class="modal-actions">
      <button class="btn" data-close>Cerrar</button>
    </div>
  `;
  $dlg
    .querySelectorAll("[data-close]")
    .forEach((b) => b.addEventListener("click", () => $dlg.close()));
  $dlg.showModal();
}

// ===== Helpers de escape =====
function escapeHtml(str) {
  return String(str).replace(
    /[&<>"']/g,
    (s) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[
        s
      ])
  );
}
function escapeAttr(str) {
  return escapeHtml(str);
}

// ===== Init =====
function init() {
  setLogoutLink();
  wireEvents();
  cargarProductos();
}

init();
