import type { Paginacion } from '@/datos/tipos'

/**
 * Cuantos elementos tiene el listado, junto a su titulo.
 *
 * El numero es `meta.pagination.total`: lo cuenta el backend sobre la consulta entera, con los filtros
 * y la busqueda puestos. **No se cuentan las filas de la pagina**: eso daria veinticinco y lo llamaria
 * el total.
 *
 * Dice "en total" con las mismas palabras que `PaginacionTabla` al pie de la tabla, a proposito: es el
 * mismo dato, y dos maneras de nombrarlo se leen como dos numeros distintos. Lo que agrega es que se
 * vea sin bajar hasta el final de la lista.
 *
 * No se pinta nada cuando el recurso no pagina —hay endpoints que devuelven `{data: [...]}` sin
 * `meta`—: un total que el backend no dio no se inventa.
 *
 * @param paginacion el bloque `meta.pagination` de la respuesta, si vino
 * @returns el conteo, o nada
 */
export function TotalDelListado ({ paginacion }: { paginacion: Paginacion | undefined }) {
  if (paginacion === undefined) return null

  return (
    <p data-numerico className="text-texto-tenue text-sm tabular-nums">
      {paginacion.total} en total
    </p>
  )
}
