/**
 * El canal por el que cualquier parte del panel avisa que algo se rompio.
 *
 * Es un evento del `window` y no un contexto de React por una razon concreta: quien detecta el error
 * casi nunca es un componente. Es el cliente de datos (`datos/cliente.ts`), un `catch` de una accion
 * de tabla, un `unhandledrejection` del navegador. Todos esos viven fuera del arbol y no pueden
 * llamar a un hook, y envolverlos en uno obligaria a pasar el avisador por parametro hasta el fondo
 * de cada modulo.
 *
 * Emitir es seguro en el servidor: si no hay `window`, no pasa nada. Eso deja que el mismo modulo lo
 * importen componentes de cliente y de servidor sin partirlo en dos.
 */

/** Nombre del evento. Con prefijo propio para no chocar con ningun evento del navegador. */
export const EVENTO_ERROR = 'ops:error'

/**
 * Lo que se sabe del error en el momento de avisar.
 *
 * `incidente` llega cuando la API ya lo registro y devolvio el codigo en `details.incidente`; en ese
 * caso no hay nada que reportar, solo que mostrar. `reporte` es el otro caso: el error lo vio el
 * navegador, nadie lo guardo todavia, y el aviso tiene que pedir el codigo antes de poder mostrarlo.
 */
export interface AvisoDeError {
  /** Lo que se le dice a la persona, en una frase. */
  mensaje: string
  /** El codigo de ocho hexadecimales, si ya existe. */
  incidente?: string
  /** Que guardar, cuando el incidente todavia no existe. */
  reporte?: ReporteDelNavegador
}

/** Lo que el navegador puede contar de un error que nadie mas vio. */
export interface ReporteDelNavegador {
  /** Clase del error: `TypeError`, `PantallaCaida`, `SinConexion`. */
  tipo: string
  mensaje: string
  /** Metodo de la accion que fallo. `VISTA` cuando lo que se cayo es una pantalla. */
  metodo?: string
  traza?: string
}

/**
 * Avisa de un error para que la pila de avisos lo muestre.
 *
 * @param aviso el mensaje para la persona, con el codigo o con lo que hay que registrar
 */
export function avisarError (aviso: AvisoDeError): void {
  if (typeof window === 'undefined') return

  window.dispatchEvent(new CustomEvent<AvisoDeError>(EVENTO_ERROR, { detail: aviso }))
}

/**
 * Pide al servidor que registre un error del navegador y devuelve su codigo.
 *
 * La ruta nunca contesta error —ver `app/api/incidentes/route.ts`—, asi que el unico fallo posible
 * aca es de red: justo el caso en el que no hay forma de guardar nada y el aviso se muestra sin
 * codigo.
 *
 * @param reporte que paso
 * @returns el codigo del incidente, o `null` si no se pudo registrar
 */
export async function reportarIncidente (reporte: ReporteDelNavegador): Promise<string | null> {
  try {
    const respuesta = await fetch('/api/incidentes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        tipo: reporte.tipo,
        mensaje: reporte.mensaje,
        metodo: reporte.metodo,
        traza: reporte.traza,
        // La ruta la pone el navegador y no el servidor: la peticion de reporte tiene su propia URL
        // —`/api/incidentes`— y guardar esa no diria en que pantalla estaba la persona.
        uri: window.location.pathname + window.location.search
      })
    })

    if (!respuesta.ok) return null

    const { incidente } = await respuesta.json() as { incidente: string | null }

    return incidente
  } catch {
    return null
  }
}

/**
 * Marca el contenedor de la pila de avisos en el DOM.
 *
 * Existe para que las superposiciones puedan reconocerlo: la pila se dibuja en un portal aparte y por
 * encima de los dialogos (`z-[55]`), asi que para Radix un clic en un aviso es un clic FUERA del
 * dialogo y cierra el formulario que la persona estaba llenando. Cerrar el aviso del error que acaba
 * de ocurrir no puede costar el trabajo que todavia no se guardo.
 *
 * Es un atributo y no una clase porque la clase es del aspecto y la puede cambiar cualquiera; esto es
 * un contrato entre la pila y las superposiciones.
 */
export const ATRIBUTO_AVISOS = 'data-avisos-de-error'

/**
 * `true` si la interaccion nacio dentro de la pila de avisos.
 *
 * @param destino el `target` del evento de Radix (`onInteractOutside`)
 * @returns `true` cuando el elemento vive dentro del contenedor marcado con {@link ATRIBUTO_AVISOS}
 */
export function naceEnLosAvisos (destino: EventTarget | null): boolean {
  return destino instanceof Element && destino.closest(`[${ATRIBUTO_AVISOS}]`) !== null
}

/**
 * Mensajes de error que el navegador emite sin que nada se haya roto.
 *
 * La View Transitions API aborta la transicion en curso cuando la pantalla cambia antes de que la
 * animacion arranque —dos clics seguidos, una navegacion mientras otra corre— y lo avisa con un
 * `InvalidStateError` que el panel no puede atrapar: la promesa la crea el navegador dentro de la
 * transicion que envuelve la navegacion, no el codigo de la pagina. La pantalla termina dibujada
 * bien y la persona no pierde nada; lo unico que deja es una fila de incidente y un aviso flotante
 * por cada clic apurado, que entierra los errores que si importan.
 *
 * Se compara contra el mensaje y no contra el tipo porque el tipo cambia entre navegadores: Chrome
 * lanza `InvalidStateError` y Safari `AbortError` para el mismo aborto.
 */
const RUIDO_DEL_NAVEGADOR: readonly RegExp[] = [
  /transition was aborted/i,
  /view transition/i
]

/**
 * `true` si el error es ruido del navegador y no hay que mostrarlo ni registrarlo.
 *
 * Solo se aplica a los errores que llegan por los enganches globales (`error` y
 * `unhandledrejection`). Un error que el panel avisa a proposito siempre se muestra: si alguien
 * escribio el `avisarError()`, es porque una accion de la persona quedo a medias.
 *
 * @param reporte que conto el navegador
 * @returns `true` cuando el mensaje coincide con {@link RUIDO_DEL_NAVEGADOR}
 */
export function esRuidoDelNavegador (reporte: ReporteDelNavegador): boolean {
  return RUIDO_DEL_NAVEGADOR.some((patron) => patron.test(reporte.mensaje))
}
