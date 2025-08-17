// app.js
import { fmtPrecio, STORAGE } from "./config.js";
import { getProductos, crearPedido, checkHealth } from "./api.js";

/* ============================
   Referencias del DOM
   ============================ */
const $productosMsg   = document.getElementById("productos-msg");
const $listaProductos = document.getElementById("lista-productos");

const $cartList   = document.getElementById("cart-list");
const $cartCountH = document.getElementById("cart-count");
const $cartCountA = document.getElementById("cart-count-aside");
const $cartTotal  = document.getElementById("cart-total");

const $checkoutForm = document.getElementById("checkout-form");
const $msg = document.getElementById("msg");
const $btnVaciar = document.getElementById("btn-vaciar");
const $remember = document.getElementById("remember-datos");

const $btnVerCarrito = document.getElementById("btn-ver-carrito");

// Modal
const $modal      = document.getElementById("product-modal");
const $modalImg   = document.getElementById("modal-img");
const $modalTitle = document.getElementById("modal-title");
const $modalPrice = document.getElementById("modal-price");
const $modalDesc  = document.getElementById("modal-desc");
const $modalQty   = document.getElementById("modal-qty");
const $modalQtyOut= document.getElementById("modal-qty-out");
const $modalAdd   = document.getElementById("modal-add");
let modalProduct = null;
let modalQtyValue = 1;

/* ============================
   Estado carrito + stocks
   ============================ */
let cart = [];
const productStock = new Map();

/* =========================================================
   Chequeo silencioso backend
   ========================================================= */
checkHealth().then(ok => {
  console.log("Backend health:", ok ? "ok" : "no disponible");
});

/* ============================
   Helpers
   ============================ */
function updateCartCount() {
  const totalQty = cart.reduce((acc, it) => acc + (it.cantidad || 0), 0);
  if ($cartCountH) $cartCountH.textContent = totalQty;
  if ($cartCountA) $cartCountA.textContent = totalQty;
}

// Toast sencillo reutilizando #msg
let toastTimer = null;
function showToast(text, ms = 2200) {
  if (!$msg) return alert(text);
  $msg.textContent = text;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $msg.textContent = ""; }, ms);
}

function renderSkeletons(n = 6) {
  $listaProductos.textContent = "";
  for (let i = 0; i < n; i++) {
    const sk = document.createElement("article");
    sk.className = "card skel";
    sk.innerHTML = `
      <div class="skeleton" style="width:100%; height:140px;"></div>
      <h3 class="skeleton"></h3>
      <p class="skeleton"></p>
      <div class="skeleton btn-add"></div>
    `;
    $listaProductos.appendChild(sk);
  }
}

/* =========================================================
   1) PRODUCTOS (render)
   ========================================================= */
function renderProductos(productos) {
  if (!productos.length) {
    $listaProductos.innerHTML = "<p>No hay productos para mostrar.</p>";
    return;
  }

  $listaProductos.textContent = "";
  productStock.clear();

  for (const p of productos) {
    const id = String(p.id ?? "");
    const nombre = p.nombre ?? "Producto";
    const precio = Number(p.precio ?? 0);
    const stock  = Number(p.stock ?? 0);

    productStock.set(id, isFinite(stock) ? stock : 0);

    const placeholder =
      "data:image/svg+xml;utf8," +
      encodeURIComponent(
        `<svg xmlns='http://www.w3.org/2000/svg' width='400' height='300'>
           <rect width='100%' height='100%' fill='#ffe6de'/>
           <text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle'
                 font-family='sans-serif' font-size='20' fill='#a14c2d'>Cookies</text>
         </svg>`
      );

    const imgSrc = p.imagen_url && p.imagen_url.trim() ? p.imagen_url : placeholder;

    const card = document.createElement("article");
    card.className = "card";
    card.dataset.id = id;
    card.dataset.stock = stock;
    card.dataset.descripcion = p.descripcion || "";

    const disabled = stock <= 0 ? "disabled" : "";
    const labelBtn = stock <= 0 ? "Sin stock" : "Agregar";

    card.innerHTML = `
      <img src="${imgSrc}" alt="${nombre}" loading="lazy">
      <h3>${nombre}</h3>
      <p class="precio">${fmtPrecio.format(precio)}</p>
      <button class="btn-add"
              data-id="${id}"
              data-nombre="${encodeURIComponent(nombre)}"
              data-precio="${precio}"
              data-stock="${stock}"
              ${disabled}>${labelBtn}</button>
    `;
    $listaProductos.appendChild(card);
  }
}

/* ============================
   Productos (init)
   ============================ */
async function initProductos() {
  try {
    $productosMsg.textContent = "Cargando productos…";
    renderSkeletons();
    const productos = await getProductos();
    $productosMsg.textContent = "";
    renderProductos(productos);
  } catch (err) {
    console.error("Error al cargar productos:", err);
    $productosMsg.textContent = "No se pudieron cargar los productos ❌";
  }
}
initProductos();

/* ============================
   Eventos catálogo
   ============================ */
$listaProductos.addEventListener("click", (e) => {
  const addBtn = e.target.closest(".btn-add");
  if (addBtn) {
    const id = addBtn.dataset.id;
    const nombre = decodeURIComponent(addBtn.dataset.nombre || "Producto");
    const precio = Number(addBtn.dataset.precio || 0);
    const stk = Number(addBtn.dataset.stock ?? productStock.get(id) ?? 0);

    addToCart({ id, nombre, precio }, 1, stk);
    if (!addBtn.disabled) {
      addBtn.textContent = "Agregado ✓";
      setTimeout(() => addBtn.textContent = "Agregar", 900);
    }
    return;
  }

  const card = e.target.closest(".card");
  if (!card) return;
  const trigger = e.target.matches("img, h3, .precio");
  if (!trigger) return;

  const id = card.dataset.id || "";
  const nombre = card.querySelector("h3")?.textContent?.trim() || "Producto";
  const btn = card.querySelector(".btn-add");
  const precio = Number(btn?.dataset?.precio || 0);
  const img = card.querySelector("img")?.getAttribute("src") || "";
  const descripcion = (card.dataset.descripcion || "").trim();
  const stock = Number(card.dataset.stock ?? productStock.get(id) ?? 0);

  openModal({ id, nombre, precio, imagen_url: img, descripcion, stock });
});

/* ============================
   Modal Quick View
   ============================ */
function setModalQty(n) {
  const max = Number($modalQty.max || 1);
  modalQtyValue = Math.max(1, Math.min(parseInt(n, 10) || 1, max));
  $modalQty.value = modalQtyValue;
  $modalQtyOut.textContent = modalQtyValue;
}

function openModal(prod) {
  modalProduct = prod;

  const descripcion = (prod.descripcion || "").trim() || "Riquísimas cookies artesanales.";

  $modalImg.src = prod.imagen_url || "";
  $modalImg.alt = prod.nombre || "Producto";
  $modalTitle.textContent = prod.nombre || "Producto";
  $modalPrice.textContent = fmtPrecio.format(Number(prod.precio || 0));
  $modalDesc.textContent = descripcion;

  const stk = Number(prod.stock ?? productStock.get(String(prod.id)) ?? 0);

  if (stk > 0) {
    $modalQty.max = stk;
    $modalAdd.disabled = false;
    $modalAdd.textContent = "Agregar al carrito";
    setModalQty(1);
  } else {
    $modalQty.max = 1;       // no mostramos stock; solo bloqueamos el botón
    setModalQty(1);
    $modalAdd.disabled = true;
    $modalAdd.textContent = "Sin stock";
  }

  $modal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  $modalAdd.focus();
}

function closeModal() {
  $modal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
  modalProduct = null;
}

$modal.addEventListener("click", (e) => {
  if (e.target.matches("[data-close], .modal-backdrop")) closeModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && $modal.getAttribute("aria-hidden") === "false") closeModal();
});

// Botones − / ＋
$modal.addEventListener("click", (e) => {
  const btn = e.target.closest(".qty-btn");
  if (!btn) return;
  const act = btn.dataset.act;
  if (act === "dec") setModalQty(modalQtyValue - 1);
  if (act === "inc") setModalQty(modalQtyValue + 1);
});

// Input oculto accesible
$modalQty.addEventListener("input", () => setModalQty($modalQty.value));

$modalAdd.addEventListener("click", () => {
  if (!modalProduct) return;
  const qty = modalQtyValue;
  const stk = Number(modalProduct.stock ?? productStock.get(String(modalProduct.id)) ?? 0);
  addToCart({ id: modalProduct.id, nombre: modalProduct.nombre, precio: modalProduct.precio }, qty, stk);
  if (!$modalAdd.disabled) {
    $modalAdd.textContent = "Agregado ✓";
    setTimeout(() => { $modalAdd.textContent = "Agregar al carrito"; }, 900);
  }
});

/* =========================================================
   2) CARRITO
   ========================================================= */
function loadCartFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE.CART_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (!data || data.version !== STORAGE.CART_VERSION || !Array.isArray(data.items)) return;

    cart = data.items.map(it => ({
      id: String(it.id),
      nombre: String(it.nombre || "Producto"),
      precio: Number(it.precio) || 0,
      cantidad: Math.max(1, Number(it.cantidad) || 1),
    }));
  } catch (e) {
    console.warn("No se pudo leer el carrito del storage:", e);
  }
}

function saveCartToStorage() {
  try {
    const data = {
      version: STORAGE.CART_VERSION,
      items: cart.map(it => ({
        id: it.id, nombre: it.nombre, precio: it.precio, cantidad: it.cantidad,
      })),
    };
    localStorage.setItem(STORAGE.CART_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn("No se pudo guardar el carrito en storage:", e);
  }
}

// Respeta el stock
function addToCart({ id, nombre, precio }, qty = 1, stkArg = undefined) {
  const key = String(id);
  const maxStock = Number(stkArg ?? productStock.get(key));
  if (isFinite(maxStock) && maxStock <= 0) {
    showToast(`Sin stock de ${nombre}.`);
    return;
  }

  const existente = cart.find(it => String(it.id) === key);
  if (existente) {
    const nuevo = existente.cantidad + qty;
    const limite = isFinite(maxStock) ? Math.min(nuevo, maxStock) : nuevo;
    if (limite === existente.cantidad) {
      showToast(`Stock máximo alcanzado para ${nombre}.`);
      return;
    }
    existente.cantidad = limite;
    if (isFinite(maxStock) && limite === maxStock) {
      showToast(`Stock máximo alcanzado para ${nombre}.`);
    }
  } else {
    const cantidad = isFinite(maxStock) ? Math.min(qty, maxStock) : qty;
    cart.push({ id: key, nombre, precio, cantidad });
    if (isFinite(maxStock) && cantidad < qty) {
      showToast(`Se agregó el máximo disponible de ${nombre}.`);
    }
  }
  renderCart();
}

function renderCart() {
  $cartList.textContent = "";
  let total = 0;

  for (const item of cart) {
    total += item.precio * item.cantidad;
    const max = Number(productStock.get(String(item.id)));
    const atMax = isFinite(max) && item.cantidad >= max;

    const li = document.createElement("li");
    li.innerHTML = `
      <span>${item.nombre}</span>

      <div class="qty-pill">
        <button class="qty-btn menos" data-id="${item.id}" aria-label="Restar">−</button>
        <output class="qty-num" for="qty-${item.id}">${item.cantidad}</output>
        <button class="qty-btn mas" data-id="${item.id}" aria-label="Sumar" ${atMax ? "disabled" : ""}>+</button>
      </div>
      <input id="qty-${item.id}" type="number" min="1" value="${item.cantidad}" data-id="${item.id}" class="sr-only">

      <span>${fmtPrecio.format(item.precio * item.cantidad)}</span>

      <button class="remove" data-id="${item.id}" aria-label="Eliminar">x</button>
    `;
    $cartList.appendChild(li);
  }

  $cartTotal.textContent = fmtPrecio.format(total);
  saveCartToStorage();
  updateCartCount();
}

// Eventos carrito
$cartList.addEventListener("click", (e) => {
  const menosBtn = e.target.closest(".menos");
  const masBtn   = e.target.closest(".mas");
  const rmBtn    = e.target.closest(".remove");

  if (menosBtn) {
    const id = String(menosBtn.dataset.id);
    const it = cart.find(i => String(i.id) === id);
    if (it) { it.cantidad = Math.max(1, it.cantidad - 1); renderCart(); }
  }
  if (masBtn) {
    const id = String(masBtn.dataset.id);
    const it = cart.find(i => String(i.id) === id);
    if (it) {
      const max = Number(productStock.get(id));
      if (isFinite(max) && it.cantidad >= max) {
        showToast(`Stock máximo alcanzado para ${it.nombre}.`);
        return;
      }
      it.cantidad += 1; 
      renderCart();
    }
  }
  if (rmBtn) {
    const id = String(rmBtn.dataset.id);
    cart = cart.filter(i => String(i.id) !== id);
    renderCart();
  }
});

$cartList.addEventListener("change", (e) => {
  const input = e.target;
  if (input.matches('input[type="number"][data-id]')) {
    const id = String(input.dataset.id);
    let val = Math.max(1, parseInt(input.value || "1", 10));
    const max = Number(productStock.get(id));
    if (isFinite(max)) val = Math.min(val, max);
    const it = cart.find(i => String(i.id) === id);
    if (it) { 
      it.cantidad = val; 
      if (isFinite(max) && val === max) showToast(`Stock máximo alcanzado para ${it.nombre}.`);
      renderCart(); 
    }
  }
});

if ($btnVaciar) {
  $btnVaciar.addEventListener("click", () => {
    if (cart.length === 0) return;
    const ok = confirm("¿Vaciar carrito por completo?");
    if (!ok) return;
    cart = [];
    renderCart();
  });
}

// Botón header → scrollea al carrito
if ($btnVerCarrito) {
  $btnVerCarrito.addEventListener("click", () => {
    const aside = document.getElementById("carrito");
    if (aside) aside.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

loadCartFromStorage();
renderCart();

/* =========================================================
   3) FORM CLIENTE: validación + persistencia
   ========================================================= */
function setOneFieldError(input, msg) {
  input.classList.add("error");
  input.setAttribute("aria-invalid", "true");
  const small = input.closest("label")?.querySelector("small.error");
  if (small) small.textContent = msg;
}
function clearOneFieldError(input) {
  input.classList.remove("error");
  input.removeAttribute("aria-invalid");
  const small = input.closest("label")?.querySelector("small.error");
  if (small) small.textContent = "";
}
function clearFieldErrors(form) {
  form.querySelectorAll("input.error, textarea.error").forEach(el => {
    el.classList.remove("error"); el.removeAttribute("aria-invalid");
  });
  form.querySelectorAll("label > small.error").forEach(el => el.textContent = "");
}
function showFieldErrors(form, fieldErrors) {
  let first = null;
  for (const [name, msg] of Object.entries(fieldErrors)) {
    const input = form.querySelector(`[name="${name}"]`);
    if (!input) continue;
    setOneFieldError(input, msg);
    if (!first) first = input;
  }
  if (first) {
    first.focus({ preventScroll: true });
    first.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

function validarCliente(cliente) {
  const errores = [];
  const fieldErrors = {};
  const nombre   = (cliente.nombre || "").trim();
  const email    = (cliente.email || "").trim().toLowerCase();
  const telefono = (cliente.telefono || "").trim();

  if (!nombre || nombre.length < 2) {
    fieldErrors.nombre = "Ingresá tu nombre (al menos 2 caracteres).";
    errores.push(fieldErrors.nombre);
  }
  if (!email && !telefono) {
    fieldErrors.email = "Ingresá un email.";
    fieldErrors.telefono = "Ingresá un teléfono.";
    errores.push("Falta el medio de contacto (email o teléfono).");
  } else {
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      fieldErrors.email = "Ingresá un email válido."; errores.push(fieldErrors.email);
    }
    if (telefono) {
      const telDigits = telefono.replace(/\D/g, "");
      if (telDigits.length < 6) {
        fieldErrors.telefono = "Ingresá un teléfono válido (mín. 6 dígitos).";
        errores.push(fieldErrors.telefono);
      }
    }
  }
  return { errores, fieldErrors };
}

// Persistencia de formulario
function loadClienteFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE.FORM_KEY);
    if (!raw) return;
    const c = JSON.parse(raw) || {};
    const map = {
      nombre: document.querySelector('[name="nombre"]'),
      email: document.querySelector('[name="email"]'),
      telefono: document.querySelector('[name="telefono"]'),
      notas: document.querySelector('[name="notas"]'),
    };
    if (map.nombre)   map.nombre.value   = c.nombre   ?? "";
    if (map.email)    map.email.value    = c.email    ?? "";
    if (map.telefono) map.telefono.value = c.telefono ?? "";
    if (map.notas)    map.notas.value    = c.notas    ?? "";
    if ($remember) $remember.checked = !!c.remember;
  } catch(e) {
    console.warn("No se pudo leer el formulario del storage:", e);
  }
}
function saveClienteToStorage() {
  try {
    const c = {
      nombre:   (document.querySelector('[name="nombre"]')?.value || "").trim(),
      email:    (document.querySelector('[name="email"]')?.value || "").trim(),
      telefono: (document.querySelector('[name="telefono"]')?.value || "").trim(),
      notas:    (document.querySelector('[name="notas"]')?.value || "").trim(),
      remember: $remember?.checked ?? false,
    };
    localStorage.setItem(STORAGE.FORM_KEY, JSON.stringify(c));
  } catch(e) {
    console.warn("No se pudo guardar el formulario en storage:", e);
  }
}
loadClienteFromStorage();

// Guardado y validación por campo
let formSaveTimer = null;
$checkoutForm.addEventListener("input", (e) => {
  if ($msg.textContent.trim()) $msg.textContent = "";
  const el = e.target; if (el?.name) clearOneFieldError(el);
  clearTimeout(formSaveTimer); formSaveTimer = setTimeout(saveClienteToStorage, 300);
});
$checkoutForm.addEventListener("change", (e) => {
  const el = e.target; if (el?.name) {
    const msg = getFieldError(el.name, el.value);
    msg ? setOneFieldError(el, msg) : clearOneFieldError(el);
  }
  saveClienteToStorage();
});
$checkoutForm.addEventListener("blur", (e) => {
  const el = e.target; if (el?.name) {
    const msg = getFieldError(el.name, el.value);
    msg ? setOneFieldError(el, msg) : clearOneFieldError(el);
  }
  saveClienteToStorage();
}, true);

function onBeforeUnload() { saveClienteToStorage(); }
window.addEventListener("beforeunload", onBeforeUnload);

/* =========================================================
   4) CHECKOUT
   ========================================================= */
$checkoutForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  clearFieldErrors($checkoutForm);
  $msg.textContent = "";

  if (cart.length === 0) { $msg.textContent = "Agregá al menos un producto al carrito."; return; }

  const data = new FormData($checkoutForm);
  const cliente = {
    nombre: (data.get("nombre") || "").toString().trim(),
    email: (data.get("email") || "").toString().trim(),
    telefono: (data.get("telefono") || "").toString().trim(),
    notas: (data.get("notas") || "").toString().trim(),
  };

  const { errores, fieldErrors } = validarCliente(cliente);
  if (errores.length) { showFieldErrors($checkoutForm, fieldErrors); return; }

  // clamp al stock antes de enviar
  cart = cart.map(it => {
    const max = Number(productStock.get(String(it.id)));
    if (isFinite(max)) return { ...it, cantidad: Math.min(it.cantidad, max) };
    return it;
  });

  const payload = {
    cliente,
    items: cart.map(it => ({ producto_id: Number(it.id), cantidad: Number(it.cantidad), precio_unit: Number(it.precio) }))
  };

  const submitBtn = $checkoutForm.querySelector("button[type='submit']");
  const prevLabel = submitBtn.textContent;
  submitBtn.disabled = true; submitBtn.textContent = "Procesando…"; $msg.textContent = "Creando pedido…";

  try {
    const json = await crearPedido(payload);
    const pago_url = json?.pago_url || json?.data?.pago_url;
    if (pago_url) {
      window.removeEventListener("beforeunload", onBeforeUnload); // <-- FIX
      cart = []; renderCart();

      const remember = $remember?.checked ?? false;
      if (remember) {
        const stored = {
          nombre:   (document.querySelector('[name="nombre"]')?.value || "").trim(),
          email:    (document.querySelector('[name="email"]')?.value || "").trim(),
          telefono: (document.querySelector('[name="telefono"]')?.value || "").trim(),
          notas: "", remember: true,
        };
        localStorage.setItem(STORAGE.FORM_KEY, JSON.stringify(stored));
        const $notas = document.querySelector('[name="notas"]'); if ($notas) $notas.value = "";
      } else {
        localStorage.removeItem(STORAGE.FORM_KEY);
        if ($checkoutForm) $checkoutForm.reset();
      }

      $msg.textContent = "Redirigiendo al pago…";
      window.location.href = pago_url;
      return;
    } else {
      $msg.textContent = "Pedido creado, pero no recibimos pago_url.";
    }
  } catch (err) {
    console.error(err);
    $msg.textContent = err.message || "Error creando el pedido.";
  } finally {
    submitBtn.disabled = false; submitBtn.textContent = prevLabel;
  }
});

/* =========================================================
   5) Validación por campo (helper)
   ========================================================= */
function getFieldError(name, value) {
  const v = (value || "").toString().trim();
  const emailVal = (document.querySelector('[name="email"]')?.value || "").trim();
  const telVal   = (document.querySelector('[name="telefono"]')?.value || "").trim();

  if (name === "nombre") {
    if (v.length < 2) return "Ingresá tu nombre (al menos 2 caracteres).";
    return "";
  }
  if (name === "email") {
    if (!v && !telVal) return "Ingresá un email.";
    if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return "Ingresá un email válido.";
    return "";
  }
  if (name === "telefono") {
    if (!v && !emailVal) return "Ingresá un teléfono.";
    if (v && v.replace(/\D/g, "").length < 6) return "Ingresá un teléfono válido (mín. 6 dígitos).";
    return "";
  }
  return "";
}
