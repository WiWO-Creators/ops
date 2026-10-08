/**
 * Carga perezosa del detalle del ticket.
 *
 * `DetalleTicket` arrastra el hilo, la caja de respuesta y los menus de edicion, y casi nadie abre un
 * ticket al entrar a la bandeja. `ModalTicket` lo pide al abrirse; `EnlaceATicket` lo adelanta cuando
 * el mouse o el teclado se acercan a un asunto, para que el clic ya lo encuentre descargado.
 */

/** Pide el modulo del detalle. El navegador lo guarda: llamarla de nuevo no repite la descarga. */
export async function cargarDetalleTicket (): Promise<typeof import('./DetalleTicket')> {
  return await import('./DetalleTicket')
}

/** Adelanta la descarga del detalle. Un fallo no se informa: la apertura reintenta por su cuenta. */
export function precargarDetalleTicket (): void {
  cargarDetalleTicket().catch(() => undefined)
}
