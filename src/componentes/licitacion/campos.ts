import type { CampoFormulario, OpcionCampo } from '@/componentes/proyecto/formulario'
import { TIPOS_DE_FACTURACION } from '@/definiciones/espacios'
import { GLOSARIO } from '@/dominio/glosario'

/**
 * Campos del formulario de alta de una Licitacion.
 *
 * Vive en un `.ts` por la misma razon que `cliente/campos.ts`: sin JSX se puede probar, y una `clave`
 * mal escrita no rompe nada visible pero manda a la API un cuerpo que ella contesta con un 422.
 *
 * **Ya no hay formulario de edicion.** Desde `0320`, `PATCH /licitaciones/{id}` no acepta nada: la
 * empresa y sus contactos se editan en el prospecto y los campos del Espacio con
 * `PATCH /projects/{id}`. Ofrecer un formulario acá escribiria campos que la ruta rechaza.
 */

/** Largo maximo del nombre del Espacio, tomado de `tblprojects`. */
const LARGO_NOMBRE_ESPACIO = 191

/**
 * Campos del alta: de que prospecto cuelga y el Espacio que se crea con ella.
 *
 * `prospecto_id` es un `seleccion` y no un texto: es una clave foranea, y escribir un numero a mano
 * es la forma de crear una licitacion colgada de la empresa equivocada. El valor viaja como cadena
 * porque un `<select>` no conoce otro tipo, y `cuerpoDelFormulario` lo vuelve numero al armar el
 * cuerpo.
 *
 * @param prospectos Los prospectos entre los que elegir, ya en forma de opciones.
 * @returns Los campos de las dos secciones, en el orden en que se llenan.
 */
export function camposDeLicitacion (prospectos: OpcionCampo[]): CampoFormulario[] {
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
      clave: 'espacio.name',
      etiqueta: `Nombre del ${GLOSARIO.espacio.singular.toLowerCase()}`,
      tipo: 'texto',
      requerido: true,
      maximo: LARGO_NOMBRE_ESPACIO,
      seccion: GLOSARIO.espacio.singular
    },
    { clave: 'espacio.start_date', etiqueta: 'Fecha de inicio', tipo: 'fecha', requerido: true },
    { clave: 'espacio.deadline', etiqueta: 'Fecha de entrega', tipo: 'fecha' },
    { clave: 'espacio.billing_type', etiqueta: 'Facturación', tipo: 'seleccion', opciones: TIPOS_DE_FACTURACION },
    { clave: 'espacio.description', etiqueta: 'Descripción', tipo: 'area' }
  ]
}
