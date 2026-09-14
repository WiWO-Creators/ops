import type { CampoFormulario, OpcionCampo } from '@/componentes/proyecto/formulario'
import { TIPOS_DE_FACTURACION } from '@/definiciones/espacios'
import { GLOSARIO } from '@/dominio/glosario'

/**
 * Campos de los formularios de Upsell.
 *
 * Vive en un `.ts` por la misma razon que `cliente/campos.ts`: sin JSX se puede probar, y una
 * `clave` mal escrita no rompe nada visible pero manda a la API un cuerpo que ella contesta con 422.
 *
 * Los campos propios de la oportunidad van PLANOS y los del Espacio anidados bajo `espacio.`:
 * `cuerpoDelFormulario` convierte las claves con punto en el objeto que espera `POST /upsells`.
 */

/** Largos maximos, tomados de las columnas. */
const LARGOS = {
  motivo: 255,
  nombreEspacio: 191
}

/**
 * Los campos propios de la oportunidad: cuanto, en que moneda y que tan probable.
 *
 * Describen la VENTA que se persigue, no el presupuesto del trabajo: para eso el Espacio ya tiene
 * `project_cost`, y es lo que se factura si se gana. `motivo` no esta acá: se escribe al cerrar,
 * desde el diálogo de confirmación, porque despues el `PATCH` responde 409.
 *
 * @param monedas Catalogo `currencies` de `GET /lookups`.
 * @returns Los tres campos de la seccion "Oportunidad".
 */
export function camposDeOportunidad (monedas: OpcionCampo[]): CampoFormulario[] {
  return [
    {
      clave: 'monto_estimado',
      etiqueta: 'Monto estimado',
      tipo: 'numero',
      ayuda: 'Lo que se espera vender. Vacío es «todavía no se sabe».',
      seccion: 'Oportunidad'
    },
    { clave: 'moneda_id', etiqueta: 'Moneda', tipo: 'seleccion', opciones: monedas },
    { clave: 'probabilidad', etiqueta: 'Probabilidad (%)', tipo: 'numero', ayuda: 'De 0 a 100.' }
  ]
}

/**
 * Campos del **alta** de un Upsell: la oportunidad y el Espacio donde se prepara.
 *
 * `espacio.clientid` es un `seleccion` sobre los clientes ACTIVOS y no un texto: es una clave
 * foranea, y escribir un numero a mano es la forma de armarle la oportunidad al cliente equivocado.
 * El valor viaja como cadena porque un `<select>` no conoce otro tipo, y `cuerpoDelFormulario` lo
 * vuelve numero al armar el cuerpo.
 *
 * @param clientes Los clientes activos, ya en forma de opciones.
 * @param monedas Catalogo `currencies` de `GET /lookups`.
 * @returns Los campos de las tres secciones, en el orden en que se llenan.
 */
export function camposDeUpsell (clientes: OpcionCampo[], monedas: OpcionCampo[]): CampoFormulario[] {
  return [
    {
      clave: 'espacio.clientid',
      etiqueta: 'Cliente',
      tipo: 'seleccion',
      requerido: true,
      opciones: clientes,
      ayuda: 'El cliente actual al que se le está ofreciendo el trabajo.',
      seccion: 'Cliente'
    },
    ...camposDeOportunidad(monedas),
    {
      clave: 'espacio.name',
      etiqueta: `Nombre del ${GLOSARIO.espacio.singular.toLowerCase()}`,
      tipo: 'texto',
      requerido: true,
      maximo: LARGOS.nombreEspacio,
      seccion: GLOSARIO.espacio.singular
    },
    { clave: 'espacio.start_date', etiqueta: 'Fecha de inicio', tipo: 'fecha', requerido: true },
    { clave: 'espacio.deadline', etiqueta: 'Fecha de entrega', tipo: 'fecha' },
    { clave: 'espacio.billing_type', etiqueta: 'Facturación', tipo: 'seleccion', opciones: TIPOS_DE_FACTURACION },
    { clave: 'espacio.description', etiqueta: 'Descripción', tipo: 'area' }
  ]
}

/**
 * Campos de la **edicion** de un Upsell: solo lo propio de la oportunidad, mas el motivo.
 *
 * `PATCH /upsells/{id}` acepta solo esos cuatro, y **responde 409 en cuanto la oportunidad se
 * cierra**. Lo del Espacio —cliente, nombre, fechas, estado, descripcion— se edita donde siempre,
 * con `PATCH /projects/{id}`.
 *
 * @param monedas Catalogo `currencies` de `GET /lookups`.
 * @returns Los cuatro campos editables.
 */
export function camposDeEdicionDeUpsell (monedas: OpcionCampo[]): CampoFormulario[] {
  return [
    ...camposDeOportunidad(monedas),
    { clave: 'motivo', etiqueta: 'Notas del resultado', tipo: 'texto', maximo: LARGOS.motivo }
  ]
}
