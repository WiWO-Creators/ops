import type { CampoFormulario, OpcionCampo } from '@/componentes/proyecto/formulario'
import { TIPOS_DE_FACTURACION } from '../../definiciones/espacios.ts'
import { GLOSARIO } from '../../dominio/glosario.ts'
import { partirEdicionCombinada, type EdicionCombinada } from '../proyecto/edicion-combinada.ts'

/**
 * Campos de los formularios de Upsell.
 *
 * Vive en un `.ts` por la misma razon que `cliente/campos.ts`: sin JSX se puede probar, y una
 * `clave` mal escrita no rompe nada visible pero manda a la API un cuerpo que ella contesta con 422.
 *
 * Los campos propios de la oportunidad van PLANOS y los del Espacio anidados bajo `espacio.`:
 * `cuerpoDelFormulario` convierte las claves con punto en el objeto que espera `POST /upsells`.
 *
 * Las importaciones son relativas y no por alias para que `node --test` pueda cargarlo sin resolver
 * `@/`: el alias solo sobrevive en los `import type`, que el intérprete borra.
 */

/** Las claves que acepta `PATCH /upsells/{id}`: espejo de `Upsell::CAMPOS`. */
const CAMPOS_EDITABLES = ['monto_estimado', 'moneda_id', 'probabilidad', 'motivo'] as const

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
 * desde el diálogo de confirmación, y la edicion lo ofrece aparte para corregirlo.
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
      validar: errorDelMonto,
      seccion: 'Oportunidad'
    },
    { clave: 'moneda_id', etiqueta: 'Moneda', tipo: 'seleccion', opciones: monedas },
    { clave: 'probabilidad', etiqueta: 'Probabilidad (%)', tipo: 'numero', ayuda: 'De 0 a 100.', validar: errorDeLaProbabilidad }
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
 * Campos de la **edicion** de un Upsell: todo lo que se puede cambiar, en un solo formulario.
 *
 * Son dos recursos detras de una misma pantalla, como en la licitacion: los propios van a
 * `PATCH /upsells/{id}` y los del Espacio (`espacio.*`) a `PATCH /projects/{id}`; el reparto lo hace
 * `partirEdicionDeUpsell`. Salen de `camposDeUpsell` y no de una lista aparte para que el alta y la
 * edicion no puedan ofrecer opciones ni reglas distintas del mismo campo.
 *
 * No se editan el cliente ni la facturacion: `PATCH /projects/{id}` los rechaza, y mover la
 * oportunidad a otro cliente arrastraria contactos y portal ajenos. Se edita en cualquier estado:
 * corregir el monto de una oportunidad ya ganada es un caso real.
 *
 * @param monedas Catalogo `currencies` de `GET /lookups`.
 * @param conEspacio `false` cuando el Espacio esta archivado —un upsell perdido lo archiva— y la API
 *   rechazaria cualquier cambio: entonces solo se ofrece lo propio.
 * @returns Los campos en bloques: el Espacio (si aplica), la oportunidad y el seguimiento.
 */
export function camposDeEdicionDeUpsell (monedas: OpcionCampo[], conEspacio: boolean): CampoFormulario[] {
  const delAlta = new Map(camposDeUpsell([], monedas).map(({ seccion: _seccion, ...campo }) => [campo.clave, campo]))
  const horas: CampoFormulario = {
    clave: 'espacio.estimated_hours',
    etiqueta: 'Horas estimadas',
    tipo: 'numero',
    validar: errorDeLasHoras
  }
  const motivo: CampoFormulario = {
    clave: 'motivo',
    etiqueta: 'Notas del resultado',
    tipo: 'texto',
    maximo: LARGOS.motivo,
    ayuda: 'Por qué se ganó o se perdió. Se completa al cerrar, y acá se corrige.'
  }
  const bloques: Array<[string, CampoFormulario[]]> = [
    [GLOSARIO.espacio.singular, conEspacio
      ? [...deLista(delAlta, ['espacio.name', 'espacio.start_date', 'espacio.deadline']), horas, ...deLista(delAlta, ['espacio.description'])]
      : []],
    ['Oportunidad', deLista(delAlta, ['monto_estimado', 'moneda_id', 'probabilidad'])],
    ['Seguimiento', [motivo]]
  ]

  return bloques.flatMap(([seccion, campos]) => campos.map((campo, indice) => indice === 0 ? { ...campo, seccion } : campo))
}

/**
 * Parte el cuerpo del formulario de edicion en lo que va a cada ruta, con solo lo que cambio.
 *
 * @param cuerpo El cuerpo armado con `camposDeEdicionDeUpsell` y lo que hay escrito.
 * @param inicial El mismo cuerpo armado con los valores con que se abrio el formulario.
 * @returns El cuerpo de cada `PATCH`, o `null` en el que no hay nada que mandar.
 */
export function partirEdicionDeUpsell (cuerpo: Record<string, unknown>, inicial: Record<string, unknown>): EdicionCombinada {
  return partirEdicionCombinada(cuerpo, inicial, CAMPOS_EDITABLES)
}

/**
 * Los campos de `lista` con esas claves, en ese orden; los que no esten se saltan.
 *
 * @param lista Los campos del alta, por clave.
 * @param claves Las claves a tomar.
 * @returns Los campos encontrados.
 */
function deLista (lista: Map<string, CampoFormulario>, claves: string[]): CampoFormulario[] {
  return claves.flatMap((clave) => {
    const campo = lista.get(clave)

    return campo === undefined ? [] : [campo]
  })
}

/**
 * Regla del monto: la misma que aplica `Upsell::validarPropios`.
 *
 * @param texto Lo escrito, ya sin espacios a los lados y ya comprobado como numero.
 * @returns El mensaje, o `null` si sirve.
 */
export function errorDelMonto (texto: string): string | null {
  return Number(texto) < 0 ? 'No puede ser negativo.' : null
}

/**
 * Regla de la probabilidad: un entero de 0 a 100, como exige la API.
 *
 * @param texto Lo escrito, ya sin espacios a los lados y ya comprobado como numero.
 * @returns El mensaje, o `null` si sirve.
 */
export function errorDeLaProbabilidad (texto: string): string | null {
  const valor = Number(texto)

  if (!Number.isInteger(valor)) return 'Tiene que ser un número entero.'

  return valor < 0 || valor > 100 ? 'Tiene que estar entre 0 y 100.' : null
}

/**
 * Regla de las horas estimadas: no pueden ser negativas.
 *
 * @param texto Lo escrito, ya sin espacios a los lados y ya comprobado como numero.
 * @returns El mensaje, o `null` si sirve.
 */
function errorDeLasHoras (texto: string): string | null {
  return Number(texto) < 0 ? 'No pueden ser negativas.' : null
}
