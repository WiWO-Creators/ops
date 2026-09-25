import type { CampoFormulario, OpcionCampo } from '@/componentes/proyecto/formulario'
import { MODELOS_DE_SERVICIO } from '../../definiciones/licitaciones.ts'
import { LARGO_MAXIMO_ENLACE, revisarEnlaceDePresentacion } from '../../dominio/presentacion-licitacion.ts'
import { GLOSARIO } from '../../dominio/glosario.ts'
import { EMPRESAS_DEL_HOLDING } from '../../dominio/holding.ts'
import { partirEdicionCombinada } from '../proyecto/edicion-combinada.ts'

/**
 * Campos del formulario de alta de una Licitacion.
 *
 * Vive en un `.ts` por la misma razon que `cliente/campos.ts`: sin JSX se puede probar, y una `clave`
 * mal escrita no rompe nada visible pero manda a la API un cuerpo que ella contesta con un 422. Las
 * importaciones son relativas y no por alias para que `node --test` pueda cargarlo sin resolver
 * `@/`: el alias solo sobrevive en los `import type`, que el intérprete borra.
 *
 * La edicion junta en un formulario los seis campos propios (`PATCH /licitaciones/{id}`) y los del
 * Espacio (`PATCH /projects/{id}`); ver `camposDeEdicionDeLicitacion`. La empresa y sus contactos se
 * editan en el prospecto.
 */

/** Las claves que acepta `PATCH /licitaciones/{id}`: espejo de `Licitacion::CAMPOS_PROPIOS`. */
const CAMPOS_EDITABLES = ['empresa_holding', 'area_id', 'modelo_servicio', 'owner_id', 'focal_id', 'presentacion_url']

/** Largo maximo del nombre del Espacio, tomado de `tblprojects`. */
const LARGO_NOMBRE_ESPACIO = 191

/**
 * Campos del alta: de quien sale, de que prospecto cuelga y el Espacio que se crea con ella.
 *
 * `prospecto_id` es un `seleccion` y no un texto: es una clave foranea, y escribir un numero a mano
 * es la forma de crear una licitacion colgada de la empresa equivocada. El valor viaja como cadena
 * porque un `<select>` no conoce otro tipo, y `cuerpoDelFormulario` lo vuelve numero al armar el
 * cuerpo. Lo mismo vale para el area y para las dos personas.
 *
 * **`owner_id` y `focal_id` son dos campos y no uno.** El owner es el dueño comercial —quien
 * persigue la venta— y el focal es quien responde por esta licitacion en el dia a dia. Suelen ser la
 * misma persona y a veces no, y unificarlos haria imposible distinguir "nadie la esta empujando" de
 * "nadie la esta atendiendo". Son personas del staff, igual que los Focals de un Cliente
 * (`PUT /clients/{id}/focales`); la diferencia es que aquello es una lista con ruta propia y esto son
 * dos casillas del alta, asi que no hay nada que importar de alli: lo que se comparte es el catalogo
 * de personas, que llega como parametro.
 *
 * **Los dos pueden quedar vacios.** Ninguno lleva `requerido`, y es a proposito: el dia que se abre
 * una licitacion no siempre se sabe quien la va a atender, y exigirlo terminaba en una persona puesta
 * al azar para poder guardar. Lo que quede sin nombrar lo reclama despues la ficha
 * (`dominio/pendientes-licitacion.ts`), que es donde se puede resolver.
 *
 * Los catalogos son opcionales y caen en la lista vacia porque el formulario se monta desde mas de
 * un lado y no todos los tienen a mano; un selector vacio se ve vacio, que es preferible a que la
 * pantalla no compile.
 *
 * @param prospectos Los prospectos entre los que elegir, ya en forma de opciones.
 * @param areas Catalogo `areas` de `GET /lookups` (las areas del equipo), ya en forma de opciones.
 * @param staff Catalogo `staff` de `GET /lookups`, para el owner y el focal.
 * @returns Los campos de las dos secciones, en el orden en que se llenan.
 */
export function camposDeLicitacion (
  prospectos: OpcionCampo[],
  areas: OpcionCampo[] = [],
  staff: OpcionCampo[] = []
): CampoFormulario[] {
  return [
    {
      clave: 'prospecto_id',
      etiqueta: 'Prospecto',
      tipo: 'seleccion',
      requerido: true,
      opciones: prospectos,
      ayuda: 'La empresa a la que se le licita. Si no está en la lista, se carga en Prospectos.',
      seccion: 'Empresa candidata'
    },
    {
      clave: 'empresa_holding',
      etiqueta: 'Empresa del holding',
      tipo: 'seleccion',
      opciones: EMPRESAS_DEL_HOLDING,
      ayuda: 'Cuál de las sociedades del grupo presenta esta licitación.'
    },
    {
      clave: 'area_id',
      etiqueta: 'Área',
      tipo: 'seleccion',
      opciones: areas,
      ayuda: 'El área del equipo que va a llevar el trabajo.'
    },
    {
      clave: 'owner_id',
      etiqueta: 'Owner',
      tipo: 'seleccion',
      opciones: staff,
      ayuda: 'El dueño comercial: quien persigue la venta.',
      seccion: 'Responsables'
    },
    {
      clave: 'focal_id',
      etiqueta: `${GLOSARIO.focal.singular} de la ${GLOSARIO.licitacion.singular.toLowerCase()}`,
      tipo: 'seleccion',
      opciones: staff,
      ayuda: 'Quien responde por esta licitación en el día a día. Puede ser la misma persona que el owner, o quedar vacío: si se deja sin nombrar, la ficha lo va a reclamar hasta que se complete.'
    },
    {
      clave: 'espacio.name',
      etiqueta: `Nombre del ${GLOSARIO.espacio.singular.toLowerCase()}`,
      tipo: 'texto',
      requerido: true,
      maximo: LARGO_NOMBRE_ESPACIO,
      seccion: GLOSARIO.espacio.singular
    },
    { clave: 'espacio.start_date', etiqueta: 'Fecha de inicio', tipo: 'fecha', requerido: true },
    { clave: 'espacio.deadline', etiqueta: 'Fecha de entrega', tipo: 'fecha' },
    { clave: 'modelo_servicio', etiqueta: 'Modelo de servicio', tipo: 'seleccion', opciones: MODELOS_DE_SERVICIO },
    { clave: 'espacio.description', etiqueta: 'Descripción', tipo: 'area' },
    {
      clave: 'presentacion_url',
      etiqueta: 'Carpeta de la propuesta',
      tipo: 'texto',
      maximo: LARGO_MAXIMO_ENLACE,
      ayuda: 'El link de la carpeta de Drive donde se arma la propuesta. Se puede pegar después desde la ficha.',
      validar: errorDelEnlace
    }
  ]
}

/**
 * Campos de la edicion de una Licitacion: todo lo que se puede cambiar, en un solo formulario.
 *
 * Son dos recursos detras de una misma pantalla. Los seis propios van a `PATCH /licitaciones/{id}`
 * y los del Espacio (`espacio.*`: nombre, fechas y descripcion) a `PATCH /projects/{id}`; el reparto
 * lo hace `partirEdicionDeLicitacion`. Quien edita no tiene por que saber que la licitacion y su
 * Espacio son dos filas.
 *
 * Salen de `camposDeLicitacion` y no de una lista aparte para que el alta y la edicion no puedan
 * ofrecer opciones distintas del mismo campo. Lo que no se edita es la empresa: se cambia en el
 * prospecto, y cambiarla aca colgaria la licitacion de otra empresa sin sus contactos.
 *
 * @param areas Catalogo `areas` de `GET /lookups`, ya en forma de opciones.
 * @param staff Catalogo `staff` de `GET /lookups`, para el owner y el focal.
 * @returns Los campos en cuatro bloques: el Espacio, los datos, los responsables y la carpeta.
 */
export function camposDeEdicionDeLicitacion (areas: OpcionCampo[], staff: OpcionCampo[]): CampoFormulario[] {
  const delAlta = new Map(camposDeLicitacion([], areas, staff).map(({ seccion: _seccion, ...campo }) => [campo.clave, campo]))
  const bloques: Array<[string, string[]]> = [
    [GLOSARIO.espacio.singular, ['espacio.name', 'espacio.start_date', 'espacio.deadline', 'espacio.description']],
    [GLOSARIO.licitacion.singular, ['empresa_holding', 'area_id', 'modelo_servicio']],
    ['Responsables', ['owner_id', 'focal_id']],
    ['Carpeta de la propuesta', ['presentacion_url']]
  ]

  return bloques.flatMap(([seccion, claves]) => claves.flatMap((clave, indice) => {
    const campo = delAlta.get(clave)

    if (campo === undefined) return []

    return [indice === 0 ? { ...campo, seccion } : campo]
  }))
}

/** Cuerpos de la edicion de una Licitacion, uno por recurso. `null` si ese recurso no se toca. */
export interface EdicionDeLicitacion {
  licitacion: Record<string, unknown> | null
  espacio: Record<string, unknown> | null
}

/**
 * Parte el cuerpo del formulario de edicion en lo que va a cada ruta, con solo lo que cambio.
 *
 * El reparto lo hace `partirEdicionCombinada`, el mismo que usa el Upsell; esto solo fija las claves
 * propias y el nombre del bloque.
 *
 * @param cuerpo El cuerpo armado con `camposDeEdicionDeLicitacion` y lo que hay escrito.
 * @param inicial El mismo cuerpo armado con los valores con que se abrio el formulario.
 * @returns El cuerpo de cada `PATCH`, o `null` en el que no hay nada que mandar.
 */
export function partirEdicionDeLicitacion (
  cuerpo: Record<string, unknown>,
  inicial: Record<string, unknown>
): EdicionDeLicitacion {
  const { propios, espacio } = partirEdicionCombinada(cuerpo, inicial, CAMPOS_EDITABLES)

  return { licitacion: propios, espacio }
}

/**
 * Regla del campo de la carpeta en el formulario: la misma que aplica la API.
 *
 * @param texto Lo escrito en el campo, ya sin espacios a los lados.
 * @returns El mensaje a mostrar bajo el campo, o `null` si el link sirve.
 */
function errorDelEnlace (texto: string): string | null {
  const revision = revisarEnlaceDePresentacion(texto)

  return revision.valido ? null : revision.error
}
