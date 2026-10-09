import type { DefinicionRecurso, OpcionFiltro } from './tipos.ts'
import type {
  ConflictoDeFusion, ConteoDeFusion, DuplicadoDeFusion, FusionDelHistorial
} from '../dominio/fusion.ts'
import {
  ENTIDADES_FUSIONABLES, diasParaDeshacer, etiquetaDeAccion, etiquetaDeEstadoDeFusion, nombreDeEntidadFusionable,
  textoParaDeshacer
} from '../dominio/fusion.ts'
import { formatearFecha } from '../lib/fechas.ts'

/**
 * Definiciones de las tablas de la fusion.
 *
 * Las tres de la vista previa (`CONTEOS`, `DUPLICADOS`, `CONFLICTOS`) se usan en modo memoria: los
 * datos ya llegaron con la vista previa y no hay nada que pedirle a la API. Por eso declaran
 * `filtros: []`, `busqueda: false` y sin columnas ordenables —ordenar escribe en la URL, y una tabla de
 * un dialogo no tiene por que mover la pagina de atras—. Llevan `ruta: 'merges'` solo porque la
 * definicion la exige.
 *
 * Los presentadores de texto plano van aca; lo que necesita JSX —la eleccion por campo, los enlaces
 * del historial— se agrega en los componentes, que son `.tsx`.
 */

/** Lo que mueve la fusion, tabla por tabla. */
export const CONTEOS_DE_FUSION: DefinicionRecurso<ConteoDeFusion> = {
  ruta: 'merges',
  titulo: { singular: 'Dato', plural: 'Datos' },
  columnas: [
    { clave: 'etiqueta', encabezado: 'Dato', presentar: (c) => c.etiqueta },
    { clave: 'filas', encabezado: 'Cantidad', numerica: true, presentar: (c) => String(c.filas) },
    { clave: 'accion', encabezado: 'Qué pasa', presentar: (c) => etiquetaDeAccion(c.accion) }
  ],
  filtros: [],
  ordenables: [],
  ordenPorDefecto: [],
  busqueda: false,
  includes: []
}

/** Lo que existe en los dos lados. */
export const DUPLICADOS_DE_FUSION: DefinicionRecurso<DuplicadoDeFusion> = {
  ruta: 'merges',
  titulo: { singular: 'Duplicado', plural: 'Duplicados' },
  columnas: [
    { clave: 'etiqueta', encabezado: 'Qué ya está', presentar: (d) => d.etiqueta },
    { clave: 'cantidad', encabezado: 'Cantidad', numerica: true, presentar: (d) => String(d.cantidad) }
  ],
  filtros: [],
  ordenables: [],
  ordenPorDefecto: [],
  busqueda: false,
  includes: []
}

/**
 * Los campos en conflicto, sin la columna de eleccion.
 *
 * La eleccion es un control y por eso la agrega `TablaDeConflictos`; el resto se lee igual que en
 * cualquier otra tabla. `valor_origen` y `valor_destino` llegan crudos y se presentan en el componente
 * con `textoDeValor`, que es la unica forma de leerlos.
 */
export const CONFLICTOS_DE_FUSION: DefinicionRecurso<ConflictoDeFusion> = {
  ruta: 'merges',
  titulo: { singular: 'Campo', plural: 'Campos' },
  columnas: [
    { clave: 'etiqueta', encabezado: 'Campo', presentar: (c) => c.etiqueta }
  ],
  filtros: [],
  ordenables: [],
  ordenPorDefecto: [],
  busqueda: false,
  includes: []
}

/** Las entidades del filtro del historial, con su nombre del glosario. */
const OPCIONES_DE_ENTIDAD: OpcionFiltro[] = ENTIDADES_FUSIONABLES.map((entidad) => ({
  valor: entidad,
  etiqueta: nombreDeEntidadFusionable(entidad, true)
}))

/**
 * Lo que dice la columna «Se puede deshacer»: los dias que quedan, o por que ya no.
 *
 * @param fusion la fila del historial
 * @returns un guion si ya se deshizo; si no, los dias o «Ya no se puede»
 */
function textoDeDeshacer (fusion: FusionDelHistorial): string {
  if (fusion.estado === 'revertida') return '—'

  return fusion.puede_revertir ? textoParaDeshacer(diasParaDeshacer(fusion.revertible_hasta)) : 'Ya no se puede'
}

/**
 * El historial de fusiones (`GET /merges`).
 *
 * Las columnas con enlaces o insignias las reemplaza `VistaFusiones`; aca queda el texto plano, que es
 * lo que exportaria un CSV.
 */
export const FUSIONES: DefinicionRecurso<FusionDelHistorial> = {
  ruta: 'merges',
  titulo: { singular: 'Fusión', plural: 'Fusiones' },
  columnas: [
    { clave: 'fecha', encabezado: 'Cuándo', presentar: (f) => formatearFecha(f.fecha, true) },
    {
      clave: 'entidad',
      encabezado: 'Qué',
      presentar: (f) => nombreDeEntidadFusionable(f.entidad)
    },
    { clave: 'origen', encabezado: 'Origen', presentar: (f) => f.origen.nombre },
    { clave: 'destino', encabezado: 'Destino', presentar: (f) => f.destino.nombre },
    { clave: 'staff', encabezado: 'Hecha por', presentar: (f) => f.staff?.full_name ?? '' },
    { clave: 'estado', encabezado: 'Estado', presentar: (f) => etiquetaDeEstadoDeFusion(f.estado) },
    { clave: 'puede_revertir', encabezado: 'Se puede deshacer', angosta: true, presentar: (f) => textoDeDeshacer(f) }
  ],
  filtros: [
    { clave: 'entidad', etiqueta: 'Qué', tipo: 'seleccion', opciones: OPCIONES_DE_ENTIDAD }
  ],
  // El historial sale siempre de lo mas reciente a lo mas viejo y la API no acepta otro orden.
  ordenables: [],
  ordenPorDefecto: [],
  busqueda: false,
  includes: []
}
