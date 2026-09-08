import type { DefinicionRecurso, OpcionFiltro } from './tipos.ts'
import type { ContactoLicitacion, EstadoLicitacion, Licitacion } from '../datos/recursos.ts'
import { GLOSARIO } from '../dominio/glosario.ts'
import { formatearFecha } from '../lib/fechas.ts'

/**
 * Definicion del recurso Licitaciones.
 *
 * Fuente: `docs/modulos/11-licitaciones.md`. Una Licitacion **es** un Espacio con una empresa
 * candidata colgada: por eso el listado muestra el nombre del Espacio y su fecha de inicio, y por eso
 * el detalle puede reusar tal cual los paneles del detalle de Espacio.
 */

/**
 * Los tres estados de una Licitacion.
 *
 * Van fijos y **no** por `desdeLookup` ni `comoInsignia`: esas dos formas resuelven contra
 * `GET /lookups`, y estos estados no estan ahi —no son un catalogo que alguien administre en Perfex,
 * son las tres ramas del flujo—. Mismo criterio que `TIPOS_DE_FACTURACION` en `espacios.ts`.
 */
export const ESTADOS_DE_LICITACION: OpcionFiltro[] = [
  { valor: 'abierta', etiqueta: 'Abierta' },
  { valor: 'ganada', etiqueta: 'Ganada' },
  { valor: 'perdida', etiqueta: 'Perdida' }
]

/**
 * Nombre visible de un estado.
 *
 * @param estado Valor tal como lo devuelve la API.
 * @returns La etiqueta en español; el valor crudo si el backend agregara un estado que este panel no conoce.
 */
export function etiquetaDeEstado (estado: EstadoLicitacion): string {
  return ESTADOS_DE_LICITACION.find((opcion) => opcion.valor === estado)?.etiqueta ?? estado
}

/**
 * Nombre completo del contacto de la candidata.
 *
 * La API lo devuelve partido en dos porque asi lo escribe Perfex al crear el contacto principal; la
 * interfaz nunca muestra "firstname" y "lastname" en columnas separadas.
 *
 * `null` es un valor esperable y no un error: `POST /licitaciones` acepta el alta sin contacto y la
 * API devuelve la clave en `null`. Se resuelve como cadena vacia para que la columna quede en blanco
 * en vez de tumbar el listado entero.
 *
 * @param contacto Contacto de la licitacion, o `null` si el alta no lo trajo.
 * @returns Nombre y apellido en una linea, sin espacios sobrantes; vacio si no hay contacto.
 */
export function nombreDelContacto (contacto: ContactoLicitacion | null): string {
  return contacto === null ? '' : `${contacto.firstname} ${contacto.lastname}`.trim()
}

export const LICITACIONES: DefinicionRecurso<Licitacion> = {
  ruta: 'licitaciones',
  titulo: GLOSARIO.licitacion,

  columnas: [
    { clave: 'company', encabezado: 'Empresa', ordenPor: 'company', presentar: (l) => l.company },
    { clave: 'contacto', encabezado: 'Contacto', presentar: (l) => nombreDelContacto(l.contacto) },
    // Sin `comoInsignia`: ese camino busca el valor en un catalogo de `/lookups` y estos estados no
    // viven ahi, asi que la columna quedaria en blanco.
    { clave: 'estado', encabezado: 'Estado', presentar: (l) => etiquetaDeEstado(l.estado) },
    {
      clave: 'espacio',
      encabezado: `Nombre del ${GLOSARIO.espacio.singular.toLowerCase()}`,
      presentar: (l) => l.espacio.name
    },
    // Ordena por `start_date` aunque el dato viva en `espacio`: el backend ordena por la columna del
    // Espacio, y el nombre del parametro es el suyo.
    { clave: 'start_date', encabezado: 'Inicio', ordenPor: 'start_date', presentar: (l) => formatearFecha(l.espacio.start_date) },
    {
      clave: 'creada_en',
      encabezado: 'Alta',
      ordenPor: 'creada_en',
      ocultaPorDefecto: true,
      presentar: (l) => formatearFecha(l.creada_en, true)
    }
  ],

  // Sin filtro, el listado trae las tres: una licitacion perdida sigue siendo consultable, y esconder
  // el historico por defecto obligaria a saber que existe un filtro para encontrarlo.
  filtros: [
    { clave: 'estado', etiqueta: 'Estado', tipo: 'seleccion', opciones: ESTADOS_DE_LICITACION }
  ],

  ordenables: ['company', 'start_date', 'creada_en'],
  ordenPorDefecto: '-creada_en',
  busqueda: true,
  // `GET /licitaciones` no acepta `include`: el Espacio y el contacto ya vienen en la fila.
  includes: []
}
