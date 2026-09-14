import type { EstadoLookup } from '../datos/recursos.ts'
import type { OpcionFiltro } from '../definiciones/tipos.ts'
import { resolverInsignia } from '../componentes/datos/tabla.ts'

/**
 * La unica forma de traducir el `status` de una Tarea a algo que se pueda leer.
 *
 * Antes habia tres: el motor de tabla resolvia con `resolverInsignia`, la ficha tenia su
 * `valorDeCatalogo` privado y la pestaña de un Espacio hacia su propio `find`. Las tres hacian lo
 * mismo con resultados distintos en el unico caso que importa —un estado que el catalogo no
 * conoce—, asi que la misma Tarea se leia de tres maneras segun la pantalla. Aca queda una.
 *
 * Vive en `dominio` y no en un `.tsx` para poder probarse con el runner de Node, que despoja tipos
 * pero no JSX. Quien necesita pintarlo usa `<EstadoDeTarea>`, que es este modulo mas una insignia.
 *
 * **El color lo administra Perfex y viaja en el lookup**: no hay mapa de colores en el frontend, y
 * no puede haberlo — los estados se crean y se repintan desde el panel sin tocar este codigo.
 */

/**
 * El catalogo de estados, en cualquiera de las dos formas en que circula por el producto.
 *
 * `GET /lookups` lo entrega como `EstadoLookup` (`id`/`name`) y `opcionesDeFiltros` lo convierte a
 * `OpcionFiltro` (`valor`/`etiqueta`) para los filtros. Aceptar las dos evita que cada pantalla
 * tenga que saber cual le toco recibir, que es como empezaron a divergir.
 */
export type CatalogoDeEstados = ReadonlyArray<EstadoLookup | OpcionFiltro>

export interface EstadoResuelto {
  etiqueta: string
  color: string | undefined
  /**
   * `true` cuando el valor no estaba en el catalogo. La insignia lo pinta sin color y con contorno:
   * pasa cuando alguien agrega un estado en Perfex y la pantalla todavia trae el catalogo viejo, y
   * un id visible es mas util que un hueco.
   */
  desconocido: boolean
}

/** Lo que se muestra cuando la Tarea no trae estado. No es un id, asi que no lleva `#`. */
const SIN_ESTADO = 'Sin estado'

/**
 * Normaliza el catalogo a la forma que entiende el motor de tabla.
 *
 * @param catalogo el catalogo en cualquiera de sus dos formas, o nada
 * @returns las opciones, o vacio si no llego catalogo — un catalogo ausente no es un error, es una
 *          pantalla que todavia no lo recibio
 */
export function opcionesDeEstados (catalogo: CatalogoDeEstados | undefined): OpcionFiltro[] {
  if (catalogo === undefined) return []

  return catalogo.map((item) => {
    if ('valor' in item) return item

    return {
      valor: String(item.id),
      etiqueta: item.name,
      ...(item.color === undefined ? {} : { color: item.color })
    }
  })
}

/**
 * Etiqueta y color de un valor de catalogo, listos para una insignia.
 *
 * Nunca devuelve `null` ni cadena vacia: donde hay una Tarea tiene que verse su estado, y eso vale
 * tambien cuando el catalogo no llego o no conoce el valor. La API manda `status` como numero y la
 * URL lo trae como texto; los dos entran igual porque la comparacion es por texto.
 *
 * Sirve para cualquier catalogo de `/lookups` —prioridades, estados de Espacio, de ticket— porque
 * todos tienen la misma forma. La tabla la usa para todas sus insignias por eso mismo: si el caso
 * degradado se resolviera aparte, volveria a haber dos maneras de leer el mismo dato.
 *
 * @param valor el `status` de la Tarea, como lo devuelve la API o como viene de la URL
 * @param catalogo el catalogo, en cualquiera de sus dos formas
 * @returns el estado resuelto; `desconocido` avisa que la etiqueta es un id y no un nombre
 */
export function resolverEstado (valor: unknown, catalogo: CatalogoDeEstados | undefined): EstadoResuelto {
  if (valor === null || valor === undefined || valor === '') {
    return { etiqueta: SIN_ESTADO, color: undefined, desconocido: true }
  }

  const encontrado = resolverInsignia(valor, opcionesDeEstados(catalogo))

  if (encontrado === null) return { etiqueta: `#${String(valor)}`, color: undefined, desconocido: true }

  return { etiqueta: encontrado.etiqueta, color: encontrado.color, desconocido: false }
}
