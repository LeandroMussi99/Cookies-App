import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { getDb } from './db'
import type { CrearPedidoInput } from './types'

// Variables que vamos a leer desde c.env
type EnvBindings = {
  ORIGEN_FRONTEND?: string
  NEON_DATABASE_URL: string
  MP_ACCESS_TOKEN: string
  ADMIN_USER?: string
  ADMIN_PASS?: string
}

const app = new Hono<{ Bindings: EnvBindings }>()

/* ------------------------- Helpers ------------------------- */

function okBasicAuth(req: Request, env: { ADMIN_USER?: string; ADMIN_PASS?: string }) {
  const auth = req.headers.get('Authorization') || ''
  if (!auth.startsWith('Basic ')) return false
  const [u, p] = atob(auth.slice(6)).split(':')
  return u === env.ADMIN_USER && p === env.ADMIN_PASS
}

/* -------------------- Middleware global -------------------- */
// CORS (incluye PUT/DELETE/PATCH)
app.use(
  '/*',
  cors({
    origin: (origin: string | undefined, c) => {
      const list: string[] = (c.env.ORIGEN_FRONTEND ?? '')
        .split(',')
        .map((s: string) => s.trim())
        .filter((s: string) => Boolean(s));

      // si 'origin' viene undefined, no permitimos
      return origin && list.includes(origin) ? origin : '';
    },
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  })
);



/* ------------------------- Health -------------------------- */
app.get('/api/health', (c) => c.text('ok'))

/* ------------------------ Productos ------------------------ */
// públicos
app.get('/api/productos', async (c) => {
  const db = getDb(c.env)
  const rows = await db`
    SELECT id, nombre, descripcion, precio, imagen_url, stock, activo
    FROM productos
    WHERE activo = TRUE
    ORDER BY id ASC
  `
  return c.json(rows)
})

/* --------------------- Admin: protección ------------------- */
app.use('/api/admin/*', async (c, next) => {
  if (!okBasicAuth(c.req.raw, c.env as any)) {
    return c.text('Unauthorized', 401, { 'WWW-Authenticate': 'Basic realm="Admin"' })
  }
  await next()
})

/* --------------------- Admin: productos -------------------- */
// crear
app.post('/api/admin/productos', async (c) => {
  const db = getDb(c.env)
  const body = await c.req.json().catch(() => ({} as any))

  const nombre = (body.nombre ?? '').toString().trim()
  const precio = Number(body.precio)
  const stock = Number.isInteger(body.stock) ? body.stock : parseInt(body.stock, 10)
  const imagen_url = (body.imagen_url ?? '').toString().trim()
  const descripcion = (body.descripcion ?? '').toString().trim()

  if (!nombre || !Number.isFinite(precio) || precio < 0 || !Number.isInteger(stock) || stock < 0) {
    return c.text('Datos inválidos', 400)
  }

  const rows = await db`
    INSERT INTO productos (nombre, precio, stock, imagen_url, descripcion, activo)
    VALUES (${nombre}, ${precio}, ${stock}, ${imagen_url || null}, ${descripcion || null}, TRUE)
    RETURNING id, nombre, descripcion, precio, imagen_url, stock, activo
  `
  return c.json(rows[0], 201)
})

// editar (sin SQL dinámico inseguro → COALESCE)
app.put('/api/admin/productos/:id', async (c) => {
  const db = getDb(c.env)
  const id = Number(c.req.param('id'))
  if (!Number.isFinite(id)) return c.text('ID inválido', 400)

  const body = await c.req.json().catch(() => ({} as any))

  const nombre      = typeof body.nombre === 'string' ? body.nombre.trim() : null
  const descripcion = typeof body.descripcion === 'string' ? body.descripcion.trim() : null
  const imagen_url  = typeof body.imagen_url === 'string' ? body.imagen_url.trim() : null

  let precio: number | null = null
  if (body.precio != null) {
    const p = Number(body.precio)
    if (!Number.isFinite(p) || p < 0) return c.text('Precio inválido', 400)
    precio = p
  }

  let stock: number | null = null
  if (body.stock != null) {
    const s = Number.isInteger(body.stock) ? body.stock : parseInt(body.stock, 10)
    if (!Number.isInteger(s) || s < 0) return c.text('Stock inválido', 400)
    stock = s
  }

  if (nombre === null && descripcion === null && imagen_url === null && precio === null && stock === null) {
    return c.text('Nada para actualizar', 400)
  }

  const rows = await db`
    UPDATE productos
    SET
      nombre      = COALESCE(${nombre}, nombre),
    descripcion   = COALESCE(${descripcion}, descripcion),
      imagen_url  = COALESCE(${imagen_url}, imagen_url),
      precio      = COALESCE(${precio}, precio),
      stock       = COALESCE(${stock}, stock)
    WHERE id = ${id}
    RETURNING id, nombre, descripcion, precio, imagen_url, stock, activo
  `
  if (!rows.length) return c.text('No encontrado', 404)
  return c.json(rows[0])
})

/* ---------------------- Pedidos + MP ----------------------- */

type MPPreferenceResponse = {
  id: string
  init_point?: string
  sandbox_init_point?: string
}

// crear pedido + preferencia de MP
app.post('/api/pedidos', async (c) => {
  const body = (await c.req.json().catch(() => null)) as CrearPedidoInput | null

  if (!body || typeof body !== 'object' || !body.cliente) {
    return c.json({ error: 'Datos incompletos' }, 400)
  }

  // Normalización
  body.cliente.nombre    = (body.cliente.nombre    || '').trim().slice(0, 100)
  body.cliente.email     = (body.cliente.email     || '').trim().toLowerCase().slice(0, 254)
  body.cliente.telefono  = (body.cliente.telefono  || '').trim().slice(0, 32)
  body.cliente.direccion = (body.cliente.direccion || '').trim().slice(0, 200)

  // Validación mínima
  if (!body?.cliente?.nombre || !Array.isArray(body.items) || body.items.length === 0) {
    return c.json({ error: 'Datos incompletos' }, 400)
  }
  if (!body.cliente.email && !body.cliente.telefono) {
    return c.json({ error: 'Debe proporcionar email o teléfono' }, 400)
  }
  const emailOk = !body.cliente.email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.cliente.email)
  const telDigits = (body.cliente.telefono || '').replace(/\D/g, '')
  const telOk = !body.cliente.telefono || telDigits.length >= 6
  if (!emailOk || !telOk) return c.json({ error: 'Datos de contacto inválidos' }, 400)

  // Items
  for (const it of body.items) {
    if (!Number.isInteger(it.producto_id) || it.producto_id <= 0) {
      return c.json({ error: 'Producto inválido' }, 400)
    }
    if (!Number.isInteger(it.cantidad) || it.cantidad < 1 || it.cantidad > 50) {
      return c.json({ error: 'Cantidad inválida' }, 400)
    }
  }

  const db = getDb(c.env)
  await db`BEGIN`

  try {
    // 1) Upsert cliente por email (si vino)
    let clienteId: number
    if (body.cliente.email) {
      const found = await db`SELECT id FROM clientes WHERE email = ${body.cliente.email} LIMIT 1`
      if (found.length) {
        clienteId = found[0].id
        await db`
          UPDATE clientes
          SET nombre=${body.cliente.nombre},
              telefono=${body.cliente.telefono || null},
              direccion=${body.cliente.direccion || null}
          WHERE id=${clienteId}
        `
      } else {
        const ins = await db`
          INSERT INTO clientes (nombre, email, telefono, direccion)
          VALUES (${body.cliente.nombre}, ${body.cliente.email}, ${body.cliente.telefono || null}, ${body.cliente.direccion || null})
          RETURNING id
        `
        clienteId = ins[0].id
      }
    } else {
      const ins = await db`
        INSERT INTO clientes (nombre, email, telefono, direccion)
        VALUES (${body.cliente.nombre}, ${null}, ${body.cliente.telefono || null}, ${body.cliente.direccion || null})
        RETURNING id
      `
      clienteId = ins[0].id
    }

    // 2) Validar stock + calcular total
    let total = 0
    for (const it of body.items) {
      const prod = await db`
        SELECT precio, stock
        FROM productos
        WHERE id = ${it.producto_id} AND activo = TRUE
        LIMIT 1
      `
      if (!prod.length) throw new Error('PRODUCTO_NO_DISPONIBLE')
      if (prod[0].stock < it.cantidad) throw new Error('SIN_STOCK')
      total += Number(prod[0].precio) * it.cantidad
    }

    // 3) Crear pedido
    const pedidoIns = await db`
      INSERT INTO pedidos (cliente_id, estado, total)
      VALUES (${clienteId}, 'pendiente', ${total})
      RETURNING id
    `
    const pedidoId = pedidoIns[0].id

    // 4) Insertar items
    for (const it of body.items) {
      const prod = await db`SELECT precio FROM productos WHERE id = ${it.producto_id} LIMIT 1`
      const precioUnit = Number(prod[0].precio)
      await db`
        INSERT INTO pedido_items (pedido_id, producto_id, cantidad, precio_unit)
        VALUES (${pedidoId}, ${it.producto_id}, ${it.cantidad}, ${precioUnit})
      `
    }

    // 5) Crear preferencia en MP
    const itemsForMp: Array<{ title: string; quantity: number; unit_price: number; currency_id: string }> = []
    for (const it of body.items) {
      const prod = await db`SELECT nombre, precio FROM productos WHERE id=${it.producto_id} LIMIT 1`
      itemsForMp.push({
        title: prod[0].nombre,
        quantity: it.cantidad,
        unit_price: Number(prod[0].precio),
        currency_id: 'ARS',
      })
    }

    const front = c.env.ORIGEN_FRONTEND || ''
    const workerBase = 'https://cookies-backend.leanroman99.workers.dev'

    const preferenceBody: any = {
      items: itemsForMp,
      external_reference: String(pedidoId),
      notification_url: `${workerBase}/api/webhooks/mp`,
    }

    if (front.startsWith('https://')) {
      preferenceBody.back_urls = {
        success: `${front}/exito.html?pedido=${pedidoId}`,
        failure: `${front}/fallo.html?pedido=${pedidoId}`,
        pending: `${front}/pendiente.html?pedido=${pedidoId}`,
      }
      preferenceBody.auto_return = 'approved'
    }

    const mpRes = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${c.env.MP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(preferenceBody),
    })

    if (!mpRes.ok) {
      await db`ROLLBACK`
      const errText = await mpRes.text().catch(() => '')
      console.error('Error MP preference:', mpRes.status, errText)
      return c.json({ error: 'Error creando preferencia de pago' }, 502)
    }

    const pref = (await mpRes.json()) as MPPreferenceResponse
    if (!pref || typeof pref !== 'object' || !('id' in pref)) {
      await db`ROLLBACK`
      console.error('Respuesta inesperada de MP:', pref)
      return c.json({ error: 'Respuesta inesperada de Mercado Pago' }, 502)
    }

    // 6) Guardar id de preferencia
    await db`UPDATE pedidos SET mp_preference_id=${pref.id} WHERE id=${pedidoId}`

    // 7) Commit
    await db`COMMIT`

    // 8) Respuesta
    return c.json(
      {
        pedido_id: pedidoId,
        total,
        pago_url: pref.init_point || pref.sandbox_init_point,
      },
      201
    )
  } catch (err: any) {
    await db`ROLLBACK`
    if (err?.message === 'SIN_STOCK') return c.json({ error: 'Sin stock' }, 409)
    if (err?.message === 'PRODUCTO_NO_DISPONIBLE') return c.json({ error: 'Producto no disponible' }, 400)
    console.error('Error creando pedido:', err)
    return c.json({ error: 'Error interno' }, 500)
  }
})

/* ---------------------- Obtener pedido --------------------- */
app.get('/api/pedidos/:id', async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isFinite(id)) return c.json({ error: 'ID inválido' }, 400)

  const db = getDb(c.env)
  const pedido = await db`SELECT * FROM pedidos WHERE id = ${id} LIMIT 1`
  if (!pedido.length) return c.json({ error: 'No existe' }, 404)

  const items = await db`
    SELECT i.id, i.producto_id, i.cantidad, i.precio_unit, p.nombre
    FROM pedido_items i
    JOIN productos p ON p.id = i.producto_id
    WHERE i.pedido_id = ${id}
    ORDER BY i.id ASC
  `
  return c.json({ pedido: pedido[0], items })
})

/* ------------------- Webhook Mercado Pago ------------------ */
type MPPayment = {
  id: number
  status: 'approved' | 'rejected' | 'cancelled' | 'refunded' | 'charged_back' | 'in_process' | 'pending'
  external_reference?: string
  status_detail?: string
}

app.post('/api/webhooks/mp', async (c) => {
  let body: any = null
  try { body = await c.req.json() } catch {}

  const type = body?.type || body?.topic || ''
  const idRaw = body?.data?.id || body?.id
  const paymentId = idRaw ? String(idRaw) : null

  if (!type || !paymentId) return c.json({ ok: true }, 200)
  if (!type.includes('payment')) return c.json({ ok: true }, 200)

  const payRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${c.env.MP_ACCESS_TOKEN}` },
  })
  if (!payRes.ok) return c.json({ ok: false }, 202)

  const payment = (await payRes.json()) as MPPayment
  const pedidoId = Number(payment.external_reference)
  if (!Number.isFinite(pedidoId)) return c.json({ ok: false }, 200)

  let nuevoEstado: 'pagado' | 'rechazado' | 'cancelado' | 'reembolsado' | 'chargeback' | null = null
  switch (payment.status) {
    case 'approved':      nuevoEstado = 'pagado'; break
    case 'rejected':      nuevoEstado = 'rechazado'; break
    case 'cancelled':     nuevoEstado = 'cancelado'; break
    case 'refunded':      nuevoEstado = 'reembolsado'; break
    case 'charged_back':  nuevoEstado = 'chargeback'; break
    default:              nuevoEstado = null
  }
  if (!nuevoEstado) return c.json({ ok: true }, 200)

  const db = getDb(c.env)
  await db`BEGIN`
  try {
    const ped = await db`SELECT estado FROM pedidos WHERE id=${pedidoId} LIMIT 1`
    if (!ped.length) { await db`ROLLBACK`; return c.json({ ok: false }, 200) }

    const estadoActual: string = ped[0].estado
    const invalidBack =
      (estadoActual === 'pagado' && (nuevoEstado === 'rechazado' || nuevoEstado === 'cancelado')) ||
      (estadoActual === 'reembolsado' || estadoActual === 'chargeback')

    if (invalidBack || estadoActual === nuevoEstado) {
      await db`COMMIT`
      return c.json({ ok: true }, 200)
    }

    if (nuevoEstado === 'pagado') {
      if (estadoActual !== 'pagado') {
        await db`
          UPDATE productos p
          SET stock = p.stock - i.cantidad
          FROM pedido_items i
          WHERE i.pedido_id=${pedidoId} AND i.producto_id=p.id
        `
      }
      await db`
        UPDATE pedidos
        SET estado='pagado', mp_payment_id=${String(payment.id)}, pagado_at=COALESCE(pagado_at, NOW())
        WHERE id=${pedidoId}
      `
    } else if (nuevoEstado === 'reembolsado' || nuevoEstado === 'chargeback') {
      if (estadoActual === 'pagado') {
        await db`
          UPDATE productos p
          SET stock = p.stock + i.cantidad
          FROM pedido_items i
          WHERE i.pedido_id=${pedidoId} AND i.producto_id=p.id
        `
      }
      if (nuevoEstado === 'reembolsado') {
        await db`
          UPDATE pedidos
          SET estado='reembolsado', mp_payment_id=${String(payment.id)}, reembolsado_at=COALESCE(reembolsado_at, NOW())
          WHERE id=${pedidoId}
        `
      } else {
        await db`
          UPDATE pedidos
          SET estado='chargeback', mp_payment_id=${String(payment.id)}, chargeback_at=COALESCE(chargeback_at, NOW())
          WHERE id=${pedidoId}
        `
      }
    } else {
      if (nuevoEstado === 'cancelado') {
        await db`
          UPDATE pedidos
          SET estado='cancelado', mp_payment_id=${String(payment.id)}, cancelado_at=COALESCE(cancelado_at, NOW())
          WHERE id=${pedidoId}
        `
      } else {
        await db`
          UPDATE pedidos
          SET estado='rechazado', mp_payment_id=${String(payment.id)}
          WHERE id=${pedidoId}
        `
      }
    }

    await db`COMMIT`
    return c.json({ ok: true }, 200)
  } catch (e) {
    await db`ROLLBACK`
    console.error('Error webhook MP extendido:', e)
    return c.json({ ok: false }, 500)
  }
})

export default app
