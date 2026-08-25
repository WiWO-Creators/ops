import type { Paginacion } from '@/datos/tipos'

/**
 * Logica pura del motor de Tablero: reordenar, mover en optimista y paginar por columna.
 *
 * Vive fuera del `.tsx` a proposito: Node sabe despojar los tipos de un `.ts`, pero no el JSX, asi
 * que una funcion declarada dentro del componente no se puede probar. Aca no hay React ni `fetch`:
 * todo es entrada -> salida, y por eso `pruebas/tablero.test.js` la puede recorrer entera.
 *
 * Sin imports de valor: los `import type` se borran al despojar tipos, pero un import normal con el
 * alias `@/` no resolveria bajo el runner de Node.
 */

/** Lo unico que el motor necesita saber de una fila: como identificarla ante la API. */
export interface FilaConId {
  id: number
}

/** Columna del tablero, tal como llega en `lookups` y en la vista tablero. */
export interface ColumnaTablero {
  id: number
  name: string
  color: string | null
  order: number
}

/** Una columna con sus tarjetas y su paginacion propia. */
export interface GrupoTablero<T> {
  columna: ColumnaTablero
  tarjetas: T[]
  pagination: Paginacion
}

/** Cuerpo de `POST /<recurso>/{id}/mover`. Los nombres son los del contrato, no se traducen. */
export interface CuerpoMover {
  columna: number
  posicion: number
  columna_completa: number[]
}

/** Resultado de un movimiento: el tablero ya movido y el cuerpo exacto que hay que enviar. */
export interface Movimiento<T> {
  grupos: Array<GrupoTablero<T>>
  cuerpo: CuerpoMover
}

/**
 * Ordena las columnas por su campo `order`.
 *
 * Los ids de estado de Perfex NO siguen el orden de visualizacion: el orden real en produccion es
 * 1, 4, 3, 2, 5 porque "Completado" tiene `order: 100`. Ordenar por id da un tablero equivocado.
 * La API ya las manda ordenadas; esto es la red que evita que un `sort` posterior lo arruine.
 *
 * @param grupos columnas tal como llegaron
 * @returns una copia ordenada por `columna.order` ascendente
 */
export function ordenarGrupos<T> (grupos: Array<GrupoTablero<T>>): Array<GrupoTablero<T>> {
  return [...grupos].sort((a, b) => a.columna.order - b.columna.order)
}

/**
 * Indica si la columna tiene paginas sin cargar.
 *
 * Importa porque `columna_completa` viaja con los ids que tiene el cliente: si le faltan tarjetas,
 * el backend empuja al fondo todo lo que no le mandaron. Reordenar una columna a medias reescribe
 * el orden de tarjetas que la persona ni siquiera vio.
 *
 * @param grupo la columna a evaluar
 * @returns `true` si quedan tarjetas sin traer
 */
export function columnaIncompleta<T> (grupo: GrupoTablero<T>): boolean {
  return grupo.tarjetas.length < grupo.pagination.total
}

/**
 * Traduce "soltar sobre la tarjeta que esta en el indice N" a la posicion final.
 *
 * Cuando la tarjeta arrastrada ya estaba mas arriba en esa misma columna, sacarla corre un lugar a
 * todo lo que venia despues: sin este ajuste, arrastrar hacia abajo deja la tarjeta un lugar antes
 * del que la persona apunto.
 *
 * @param grupo la columna donde se suelta
 * @param indice indice de la tarjeta sobre la que se solto, en la columna tal como se ve
 * @param idTarjeta id de la tarjeta arrastrada
 * @returns la posicion a pasarle a `moverTarjeta`
 */
export function posicionAlSoltar<T extends FilaConId> (
  grupo: GrupoTablero<T>,
  indice: number,
  idTarjeta: number
): number {
  const actual = grupo.tarjetas.findIndex((t) => t.id === idTarjeta)
  return actual !== -1 && actual < indice ? indice - 1 : indice
}

/** Ubica una tarjeta por id. Devuelve `null` si no esta cargada en ninguna columna. */
function ubicar<T extends FilaConId> (
  grupos: Array<GrupoTablero<T>>,
  idTarjeta: number
): { indiceGrupo: number, indiceTarjeta: number } | null {
  for (const [indiceGrupo, grupo] of grupos.entries()) {
    const indiceTarjeta = grupo.tarjetas.findIndex((t) => t.id === idTarjeta)
    if (indiceTarjeta !== -1) return { indiceGrupo, indiceTarjeta }
  }
  return null
}

/**
 * Mueve una tarjeta a una posicion de otra columna (o de la misma) y arma el cuerpo del `POST`.
 *
 * No muta nada: devuelve un tablero nuevo. Revertir un movimiento optimista es volver a poner el
 * arreglo anterior, que quien llama ya tiene — por eso no hace falta una funcion `revertir()`.
 *
 * Los contadores de ambas columnas se ajustan: `pagination.total` es lo que ve la persona en el
 * encabezado, y dejarlo quieto muestra un numero que no coincide con lo que hay en pantalla.
 *
 * @param grupos tablero actual
 * @param idTarjeta id de la tarjeta arrastrada
 * @param idColumna id de la columna destino
 * @param posicion indice donde queda dentro del destino, ya sin la tarjeta en su lugar viejo
 * @returns el tablero movido y el cuerpo a enviar, o `null` si la tarjeta o la columna no existen
 */
export function moverTarjeta<T extends FilaConId> (
  grupos: Array<GrupoTablero<T>>,
  idTarjeta: number,
  idColumna: number,
  posicion: number
): Movimiento<T> | null {
  const origen = ubicar(grupos, idTarjeta)
  const indiceDestino = grupos.findIndex((g) => g.columna.id === idColumna)

  if (origen === null || indiceDestino === -1) return null

  const tarjeta = grupos[origen.indiceGrupo]?.tarjetas[origen.indiceTarjeta]
  if (tarjeta === undefined) return null

  const mismaColumna = origen.indiceGrupo === indiceDestino

  const movidos = grupos.map((grupo, indice) => {
    if (indice !== origen.indiceGrupo && indice !== indiceDestino) return grupo

    let tarjetas = grupo.tarjetas
    let total = grupo.pagination.total

    if (indice === origen.indiceGrupo) {
      tarjetas = tarjetas.filter((t) => t.id !== idTarjeta)
      if (!mismaColumna) total -= 1
    }

    if (indice === indiceDestino) {
      const destino = mismaColumna ? tarjetas : [...tarjetas]
      destino.splice(acotar(posicion, destino.length), 0, tarjeta)
      tarjetas = destino
      if (!mismaColumna) total += 1
    }

    return { ...grupo, tarjetas, pagination: { ...grupo.pagination, total } }
  })

  const columnaCompleta = (movidos[indiceDestino]?.tarjetas ?? []).map((t) => t.id)

  return {
    grupos: movidos,
    cuerpo: {
      columna: idColumna,
      // `posicion` es **1-based**, no un indice: la API lo documenta asi y hace `posicion - 1` al
      // insertar (`modules/api/Escritura/Tablero.php:44,125`). Mandar el indice base 0 corre la
      // tarjeta un lugar hacia arriba cada vez que el backend cae en ese camino — que es cuando
      // `columna_completa` llega vacia.
      posicion: columnaCompleta.indexOf(idTarjeta) + 1,
      columna_completa: columnaCompleta
    }
  }
}

/** Encierra un indice dentro de `[0, maximo]`. Un `splice` con indice fuera de rango miente en silencio. */
function acotar (indice: number, maximo: number): number {
  if (indice < 0) return 0
  return indice > maximo ? maximo : indice
}

/**
 * Suma una pagina de tarjetas a UNA columna.
 *
 * La paginacion del tablero es por columna: traer la pagina 2 de una no toca a las demas, y por eso
 * el resto de los grupos se devuelve por referencia. Descarta ids que ya estaban cargados, porque
 * una tarjeta que se movio entre dos peticiones puede volver repetida en la pagina siguiente.
 *
 * @param grupos tablero actual
 * @param idColumna columna que pidio mas
 * @param tarjetas la pagina recien traida
 * @param pagination la paginacion que vino con esa pagina
 * @returns el tablero con esa columna extendida
 */
export function agregarPagina<T extends FilaConId> (
  grupos: Array<GrupoTablero<T>>,
  idColumna: number,
  tarjetas: T[],
  pagination: Paginacion
): Array<GrupoTablero<T>> {
  return grupos.map((grupo) => {
    if (grupo.columna.id !== idColumna) return grupo

    const cargados = new Set(grupo.tarjetas.map((t) => t.id))
    const nuevas = tarjetas.filter((t) => !cargados.has(t.id))

    return { ...grupo, tarjetas: [...grupo.tarjetas, ...nuevas], pagination }
  })
}
