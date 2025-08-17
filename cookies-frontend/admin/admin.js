// /admin/admin.js
// ===== Imports del proyecto (reutilizamos lo que ya tenés) =====
import { fmtPrecio, API_BASE_URL } from "../config.js";
import { getProductos } from "../api.js";

// ===== Referencias del DOM =====
const $tbody      = document.getElementById("tbody-productos");
const $msg        = document.getElementById("admin-msg");
const $btnLogout  = document.getElementById("btn-logout");
const $btnNuevo   = document.getElementById("btn-nuevo");
const $dlg        = document.getElementById("modal-prod");

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
  const headers = new Headers({ "Authorization": ADMIN_AUTH });
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
  try { return JSON.parse(txt); } catch { return {}; }
}

// ===== Helpers de UI =====
function rowHTML(p) {
  const img = p.imagen_url && p.imagen_url.trim()
    ? `<img class="thumb" src="${p.imagen_url}" alt="${escapeAttr(p.nombre || "Producto")}">`
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

    // 👇 Agregar listeners después de renderizar la tabla
    $tbody.querySelectorAll(".js-edit").forEach(($btn) => {
      $btn.addEventListener("click", () => {
        const $row = $btn.closest("tr");
        const id = Number($row?.dataset.id);
        const producto = productosCache.find((p) => p.id === id);
        if (producto) openProdModal("edit", producto);
      });
    });

    $tbody.querySelectorAll(".js-del").forEach(($btn) => {
      $btn.addEventListener("click", () => {
        const $row = $btn.closest("tr");
        const id = Number($row?.dataset.id);
        if (id) eliminarProducto(id);  // ✅ Usa la función que ya hicimos
      });
    });

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
          <input name="precio" type="number" step="0.01" min="0" required value="${v.precio}">
        </label>
        <label>
          <span>Stock</span>
          <input name="stock" type="number" step="1" min="0" required value="${v.stock}">
        </label>
        <label>
          <span>Imagen URL</span>
          <input name="imagen_url" placeholder="https://..." value="${escapeAttr(v.imagen_url)}">
        </label>
        <label style="grid-column: 1 / -1;">
          <span>Descripción</span>
          <textarea name="descripcion">${escapeHtml(v.descripcion)}</textarea>
        </label>
      </div>
      <div class="modal-actions">
        <button class="btn" type="button" data-close>Cancelar</button>
        <button class="btn primary" type="submit">${isEdit ? "Guardar cambios" : "Crear"}</button>
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
  $form.addEventListener("submit", (e) => {
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
    if (!Number.isFinite(payload.precio) || payload.precio < 0) errs.push("Precio inválido.");
    if (!Number.isInteger(payload.stock) || payload.stock < 0) errs.push("Stock inválido (entero ≥ 0).");
    if (payload.imagen_url && !/^https?:\/\/.+/i.test(payload.imagen_url)) errs.push("La imagen debe ser una URL http/https.");
    if (errs.length) { alert(errs.join("\n")); return; }

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
  }, { once: true });

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
    const prod = productosCache.find(p => Number(p.id) === id);

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

// ===== Helpers de escape =====
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
}
function escapeAttr(str) { return escapeHtml(str); }

// ===== Init =====
function init() {
  setLogoutLink();
  wireEvents();
  cargarProductos();
}

init();
