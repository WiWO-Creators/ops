/**
 * Logica pura del enlace publico de una Tarea.
 *
 * Vive en `.ts` y no en el componente porque es lo unico de esta feature que se puede equivocar en
 * silencio: una URL mal armada se copia, se manda por chat y recien falla del otro lado, y un avance
 * inventado convierte "no hay lista de control" en "no se hizo nada".
 */

/** Prefijo de la ruta publica. Un solo lugar que lo sepa: la pagina y el dialogo leen de aca. */
const PREFIJO = '/tarea/'

/** El avance de la ficha publica, ya resuelto para pintar. */
export interface AvancePublico {
  /** 0-100, o `null` cuando no hay nada que medir. `null` no se dibuja como barra en cero. */
  porcentaje: number | null
  /** Linea de apoyo: cuantos items de la lista de control, o por que no hay porcentaje. */
  detalle: string
}

/** La forma del bloque `progress` que devuelve `GET /public/tasks/{token}`. */
interface ProgresoDeApi {
  checklist_total: number
  checklist_done: number
  percent: number | null
}

/**
 * Arma la URL absoluta que el equipo copia y manda.
 *
 * El token se codifica aunque la API lo emita en hexadecimal: el dia que cambie el alfabeto, el
 * enlace no tiene que romperse en silencio. La barra final del origen se recorta para no emitir
 * `https://ops.wiwo.me//tarea/…`, que algunos servidores normalizan y otros responden 404.
 *
 * @param origen origen del sitio (`window.location.origin`), con o sin barra final
 * @param token el token en claro, tal como lo devolvio el `POST`
 * @returns la URL absoluta, o `null` si falta el origen o el token
 */
export function urlDeEnlacePublico (origen: string, token: string): string | null {
  const base = origen.trim().replace(/\/+$/, '')

  if (base === '' || token.trim() === '') return null

  return `${base}${PREFIJO}${encodeURIComponent(token.trim())}`
}

/**
 * Traduce el bloque `progress` de la API a lo que se muestra.
 *
 * `percent` en `null` es informacion, no un cero: significa que la Tarea no tiene lista de control y
 * todavia no esta cerrada, asi que no hay avance medible. Pintar una barra vacia ahi le diria a quien
 * abre el enlace que el trabajo no arranco.
 *
 * @param progreso el bloque `progress` de `GET /public/tasks/{token}`
 * @returns el porcentaje a dibujar (o `null`) y la linea de apoyo
 */
export function avancePublico (progreso: ProgresoDeApi): AvancePublico {
  const { checklist_total: total, checklist_done: hechos, percent } = progreso

  if (total > 0) {
    return {
      porcentaje: percent,
      detalle: `${hechos} de ${total} ${total === 1 ? 'ítem' : 'ítems'} de la lista de control`
    }
  }

  return {
    porcentaje: percent,
    detalle: percent === null ? 'Sin lista de control' : 'Sin lista de control · marcada como terminada'
  }
}
