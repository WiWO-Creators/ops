import type { DefinicionRecurso, OpcionFiltro } from './tipos.ts'
import type { EstadoLicitacion, Licitacion } from '../datos/recursos.ts'
import { GLOSARIO } from '../dominio/glosario.ts'
import { formatearFecha } from '../lib/fechas.ts'

/**
 * Definicion del recurso Licitaciones.
 *
 * Fuente: `docs/modulos/11-licitaciones.md`. Una Licitacion **es** un Espacio colgado de un
 * Prospecto —la empresa candidata—: por eso el listado muestra el nombre del Espacio y su fecha de
 * inicio, y por eso el detalle puede reusar tal cual los paneles del detalle de Espacio.
 *
 * `filter[prospecto_id]` existe en el backend pero **no** se declara en `filtros`: se usa como
 * `consultaFija` desde la ficha del Prospecto, donde no debe viajar en la URL. Ver
 * `componentes/prospecto/PanelesProspecto.tsx`.
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
 * Que contempla el trabajo que se licita.
 *
 * Reemplaza a "Facturación" (`TIPOS_DE_FACTURACION`) **solo en el formulario de Licitación**: aquello
 * describe como se le cobra a un Espacio ya vendido —costo fijo, horas—, y acá la pregunta es otra,
 * que se ofrece. En Espacios `billing_type` sigue igual: son dos preguntas, no dos nombres de la
 * misma.
 *
 * **Es un selector simple con tres opciones y no uno multiple** aunque una licitación pueda
 * contemplar las dos cosas. Un campo multiple obliga a un `tipo` nuevo en `CampoFormulario`, a un
 * control nuevo en `ControlDeCampo` y a que `cuerpoDelFormulario` sepa serializar arreglos: tres
 * piezas de maquinaria para representar un caso que, con dos valores posibles, tiene exactamente
 * tres combinaciones utiles. La opcion combinada las cubre sin agregar nada.
 *
 * Van fijas y no por `desdeLookup` por el mismo motivo que `ESTADOS_DE_LICITACION`: no son un
 * catalogo que alguien administre en Perfex.
 */
export const MODELOS_DE_SERVICIO: OpcionFiltro[] = [
  { valor: 'implementacion', etiqueta: 'Implementación' },
  { valor: 'mantencion', etiqueta: 'Mantención' },
  { valor: 'implementacion_mantencion', etiqueta: 'Implementación y mantención' }
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

export const LICITACIONES: DefinicionRecurso<Licitacion> = {
  ruta: 'licitaciones',
  titulo: GLOSARIO.licitacion,

  columnas: [
    // `company` es el nombre del PROSPECTO, resuelto por el JOIN del backend. La columna Contacto
    // desapareció con `0320`: las personas viven en el prospecto, que puede tener varias, y elegir
    // una para la fila sería inventar cuál.
    { clave: 'company', encabezado: 'Empresa', ordenPor: 'company', presentar: (l) => l.company },
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
