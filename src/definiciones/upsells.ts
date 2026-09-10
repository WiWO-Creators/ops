import type { DefinicionRecurso } from './tipos.ts'
import type { Upsell } from '../datos/recursos.ts'
import { ESTADOS_DE_LICITACION, etiquetaDeEstado } from './licitaciones.ts'
import { GLOSARIO } from '../dominio/glosario.ts'
import { formatearFecha } from '../lib/fechas.ts'

/**
 * Definicion del recurso Upselling.
 *
 * Fuente: `docs/modulos/13-upselling.md`. Un Upsell **es** un Espacio de un cliente que ya existe,
 * escondido de sus proyectos hasta que la oportunidad se cierre: por eso el listado muestra el
 * cliente, el nombre del Espacio y su fecha de inicio, y por eso el detalle reusa tal cual los
 * paneles del detalle de Espacio.
 *
 * Los estados son **los mismos tres** de una Licitacion y se importan de alli en vez de copiarse:
 * dos listas iguales se separan en el primer cambio, y la etiqueta de un estado no depende de que
 * clase de oportunidad sea.
 */
export const UPSELLS: DefinicionRecurso<Upsell> = {
  ruta: 'upsells',
  titulo: GLOSARIO.upsell,

  columnas: [
    { clave: 'client', encabezado: 'Cliente', presentar: (u) => u.client?.company ?? '' },
    {
      clave: 'espacio',
      encabezado: `Nombre del ${GLOSARIO.espacio.singular.toLowerCase()}`,
      ordenPor: 'name',
      presentar: (u) => u.espacio.name
    },
    // Sin `comoInsignia`: ese camino busca el valor en un catalogo de `/lookups` y estos estados no
    // viven ahi, asi que la columna quedaria en blanco.
    { clave: 'estado', encabezado: 'Estado', presentar: (u) => etiquetaDeEstado(u.estado) },
    {
      clave: 'monto_estimado',
      encabezado: 'Monto estimado',
      ordenPor: 'monto_estimado',
      numerica: true,
      // Sin simbolo de moneda: `moneda_id` puede venir en `null` —"todavia no se sabe"— y pintar
      // "$" para un monto en otra moneda es peor que no pintar ninguno.
      presentar: (u) => (u.monto_estimado === null ? '' : u.monto_estimado.toLocaleString('es-CL'))
    },
    {
      clave: 'probabilidad',
      encabezado: 'Probabilidad',
      ordenPor: 'probabilidad',
      numerica: true,
      presentar: (u) => (u.probabilidad === null ? '' : `${u.probabilidad}%`)
    },
    {
      clave: 'start_date',
      encabezado: 'Inicio',
      ordenPor: 'start_date',
      presentar: (u) => formatearFecha(u.espacio.start_date)
    },
    {
      clave: 'creada_en',
      encabezado: 'Alta',
      ordenPor: 'creada_en',
      ocultaPorDefecto: true,
      presentar: (u) => formatearFecha(u.creada_en, true)
    }
  ],

  // Sin filtro, el listado trae los tres: un upsell perdido sigue siendo consultable, y esconder el
  // historico por defecto obligaria a saber que existe un filtro para encontrarlo.
  filtros: [
    { clave: 'estado', etiqueta: 'Estado', tipo: 'seleccion', opciones: ESTADOS_DE_LICITACION }
  ],

  ordenables: ['name', 'monto_estimado', 'probabilidad', 'start_date', 'creada_en'],
  ordenPorDefecto: '-creada_en',
  busqueda: true,
  // `GET /upsells` no acepta `include`: el Espacio y el cliente ya vienen en la fila.
  includes: []
}
