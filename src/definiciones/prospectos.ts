import type { DefinicionRecurso, OpcionFiltro } from './tipos.ts'
import type { ContactoProspecto, EstadoProspecto, PersonaDeContacto, Prospecto } from '../datos/recursos.ts'
import { GLOSARIO } from '../dominio/glosario.ts'
import { formatearFecha } from '../lib/fechas.ts'

/**
 * Definicion del recurso Prospectos.
 *
 * Fuente: `docs/modulos/12-prospectos.md`. Un Prospecto es la empresa a la que se le esta
 * licitando **antes** de que sea cliente: de el cuelgan sus personas de contacto y las licitaciones
 * que se le preparan.
 *
 * **No es `/leads`.** Aquel es el embudo heredado de Perfex, donde cada fila es UNA PERSONA
 * moviendose por etapas, y no tiene pantalla en este panel.
 */

/**
 * Los cuatro estados de un Prospecto.
 *
 * **Ninguno se guarda**: la API los deriva del resumen de las licitaciones del prospecto. Por eso no
 * hay filtro por estado —el backend no acepta uno sobre una columna que no existe— y por eso no hay
 * ningun boton que los cambie: ganar y perder son por licitacion.
 *
 * Van fijos y no por `desdeLookup`: no son un catalogo que alguien administre en Perfex. Mismo
 * criterio que `ESTADOS_DE_LICITACION`.
 */
export const ESTADOS_DE_PROSPECTO: OpcionFiltro[] = [
  { valor: 'abierto', etiqueta: 'Abierto' },
  { valor: 'ganado', etiqueta: 'Ganado' },
  { valor: 'perdido', etiqueta: 'Perdido' },
  { valor: 'sin_licitaciones', etiqueta: 'Sin licitaciones' }
]

/**
 * Nombre visible de un estado de Prospecto.
 *
 * @param estado Valor tal como lo devuelve la API.
 * @returns La etiqueta en español; el valor crudo si el backend agregara un estado que este panel no conoce.
 */
export function etiquetaDeEstadoDeProspecto (estado: EstadoProspecto): string {
  return ESTADOS_DE_PROSPECTO.find((opcion) => opcion.valor === estado)?.etiqueta ?? estado
}

/**
 * Nombre completo de una persona de contacto.
 *
 * La API lo devuelve partido en dos porque asi lo escribe Perfex al crear el contacto; la interfaz
 * nunca muestra "firstname" y "lastname" en columnas separadas.
 *
 * `null` es un valor esperable y no un error: la API devuelve la clave en `null` cuando el JSON
 * guardado esta vacio. Se resuelve como cadena vacia para que la celda quede en blanco en vez de
 * tumbar el listado entero.
 *
 * @param contacto Persona de contacto, o `null`.
 * @returns Nombre y apellido en una linea, sin espacios sobrantes; vacio si no hay contacto.
 */
export function nombreDelContacto (contacto: PersonaDeContacto | null): string {
  return contacto === null ? '' : `${contacto.firstname} ${contacto.lastname}`.trim()
}

export const PROSPECTOS: DefinicionRecurso<Prospecto> = {
  ruta: 'prospectos',
  titulo: GLOSARIO.prospecto,

  columnas: [
    { clave: 'empresa', encabezado: 'Empresa', ordenPor: 'empresa', presentar: (p) => p.empresa },
    // Sin `comoInsignia`: ese camino busca el valor en un catalogo de `/lookups` y estos estados no
    // viven ahi, asi que la columna quedaria en blanco.
    { clave: 'estado', encabezado: 'Estado', presentar: (p) => etiquetaDeEstadoDeProspecto(p.estado) },
    { clave: 'licitaciones_total', encabezado: 'Licitaciones', numerica: true, presentar: (p) => p.licitaciones_total },
    { clave: 'licitaciones_abiertas', encabezado: 'Abiertas', numerica: true, presentar: (p) => p.licitaciones_abiertas },
    { clave: 'licitaciones_ganadas', encabezado: 'Ganadas', numerica: true, presentar: (p) => p.licitaciones_ganadas },
    { clave: 'client', encabezado: 'Cliente', presentar: (p) => p.client?.company ?? '' },
    {
      clave: 'creado_en',
      encabezado: 'Alta',
      ordenPor: 'creado_en',
      ocultaPorDefecto: true,
      presentar: (p) => formatearFecha(p.creado_en, true)
    }
  ],

  // Sin filtros: el unico que tendria sentido es por estado, y el estado es derivado. Declararlo
  // mandaria `filter[estado]` a un backend que no lo acepta, y la respuesta seria un 422.
  filtros: [],

  ordenables: ['empresa', 'creado_en'],
  ordenPorDefecto: '-creado_en',
  busqueda: true,
  // `GET /prospectos` no acepta `include`: el listado ya trae los contadores.
  includes: []
}

/**
 * Definicion de la pestaña Contactos de un Prospecto.
 *
 * La ruta va sin el prospecto: `PanelesProspecto` la completa con el id, porque acotar por ruta y no
 * por filtro deja el prospecto fuera de la URL, donde seria editable por quien mira.
 */
export const CONTACTOS_DE_PROSPECTO: DefinicionRecurso<ContactoProspecto> = {
  ruta: 'prospectos/contactos',
  titulo: { singular: 'Contacto', plural: 'Contactos' },

  columnas: [
    { clave: 'nombre', encabezado: 'Nombre', presentar: (c) => nombreDelContacto(c.contacto) },
    { clave: 'email', encabezado: 'Correo', presentar: (c) => c.contacto?.email ?? '' },
    { clave: 'title', encabezado: 'Cargo', presentar: (c) => c.contacto?.title ?? '' },
    { clave: 'phonenumber', encabezado: 'Teléfono', presentar: (c) => c.contacto?.phonenumber ?? '' },
    { clave: 'es_principal', encabezado: 'Principal', presentar: (c) => (c.es_principal ? 'Sí' : '') },
    // La columna que explica por que un contacto ya no se puede quitar desde acá.
    {
      clave: 'contacto_id',
      encabezado: 'En el cliente',
      presentar: (c) => (c.contacto_id === null ? 'Todavía no' : `#${c.contacto_id}`)
    }
  ],

  filtros: [],
  // El endpoint devuelve la lista entera sin paginar ni ordenar: son las personas de una empresa.
  ordenables: [],
  ordenPorDefecto: [],
  busqueda: false,
  includes: []
}
