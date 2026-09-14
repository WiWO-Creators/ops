import type { CampoFormulario, OpcionCampo } from '@/componentes/proyecto/formulario'
import { MODELOS_DE_SERVICIO } from '../../definiciones/licitaciones.ts'
import { GLOSARIO } from '../../dominio/glosario.ts'
import { EMPRESAS_DEL_HOLDING } from '../../dominio/holding.ts'

/**
 * Campos del formulario de alta de una Licitacion.
 *
 * Vive en un `.ts` por la misma razon que `cliente/campos.ts`: sin JSX se puede probar, y una `clave`
 * mal escrita no rompe nada visible pero manda a la API un cuerpo que ella contesta con un 422. Las
 * importaciones son relativas y no por alias para que `node --test` pueda cargarlo sin resolver
 * `@/`: el alias solo sobrevive en los `import type`, que el intérprete borra.
 *
 * **Ya no hay formulario de edicion.** Desde `0320`, `PATCH /licitaciones/{id}` no acepta nada: la
 * empresa y sus contactos se editan en el prospecto y los campos del Espacio con
 * `PATCH /projects/{id}`. Ofrecer un formulario acá escribiria campos que la ruta rechaza.
 */

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
      ayuda: 'Quien responde por esta licitación en el día a día. Puede ser la misma persona que el owner.'
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
    { clave: 'espacio.description', etiqueta: 'Descripción', tipo: 'area' }
  ]
}
