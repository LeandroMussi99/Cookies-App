// src/types.ts
export type PedidoItemInput = {
  producto_id: number
  cantidad: number
}

export type ClienteInput = {
  nombre: string
  email?: string
  telefono?: string
  direccion?: string
}

export type CrearPedidoInput = {
  cliente: ClienteInput
  items: PedidoItemInput[]
}
