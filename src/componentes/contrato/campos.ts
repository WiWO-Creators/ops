import type { CampoFormulario, OpcionCampo } from '@/componentes/proyecto/formulario'
import type { AccesoContratos, Contrato } from '@/datos/recursos'
import { GLOSARIO } from '../../dominio/glosario.ts'

/**
 * Campos de los formularios de Contratos (WIW-0502).
 *
 * Vive en un `.ts` por la misma razon que `upsell/campos.ts`: sin JSX se puede probar, y una clave
 * mal escrita manda a la API un cuerpo que ella contesta con 422. Las claves son las de
 * `Escritura\Contrato::CAMPOS`.
 *
 * Las importaciones de valor son relativas para que `node --test` lo cargue sin resolver `@/`.
 */

/** Largos maximos, tomados de la columna y del tope de la API. */
const LARGOS = {
  asunto: 191,
  descripcion: 20000
}

/**
 * Campos del alta y la edicion. Son los mismos: un contrato se corrige entero.
 *
 * El proyecto no se ofrece: depende del cliente y el panel lo sigue asignando. El HTML del contrato
 * tampoco: se redacta y se firma en el panel.
 *
 * @param clientes Clientes activos, ya como opciones.
 * @param tipos Tipos de contrato (`GET /contratos/tipos`), ya como opciones.
 * @returns Los campos en el orden en que se llenan.
 */
export function camposDeContrato (clientes: OpcionCampo[], tipos: OpcionCampo[]): CampoFormulario[] {
  return [
    { clave: 'subject', etiqueta: 'Asunto', tipo: 'texto', requerido: true, maximo: LARGOS.asunto, seccion: 'Contrato' },
    { clave: 'client_id', etiqueta: GLOSARIO.cliente.singular, tipo: 'seleccion', requerido: true, opciones: clientes },
    { clave: 'contract_type_id', etiqueta: 'Tipo', tipo: 'seleccion', opciones: tipos, etiquetaSinValor: 'Sin tipo' },
    {
      clave: 'contract_value',
      etiqueta: 'Valor',
      tipo: 'numero',
      ayuda: 'Monto total del contrato. Vacío es «sin monto cargado».',
      validar: errorDelValor
    },
    { clave: 'datestart', etiqueta: 'Fecha de inicio', tipo: 'fecha', requerido: true, seccion: 'Vigencia' },
    { clave: 'dateend', etiqueta: 'Fecha de término', tipo: 'fecha', ayuda: 'Vacío si no tiene término.' },
    {
      clave: 'description',
      etiqueta: 'Alcance',
      tipo: 'area',
      maximo: LARGOS.descripcion,
      ayuda: 'Qué cubre el contrato: entregables, condiciones, renovación.',
      seccion: 'Alcance',
      // Es lo que se firmo: se copia del contrato, no se redacta.
      sinAsistenteIa: true
    },
    { clave: 'signed', etiqueta: 'Marcado como firmado', tipo: 'booleano', seccion: 'Estado' },
    { clave: 'visible_to_client', etiqueta: 'Visible para el cliente en su portal', tipo: 'booleano' }
  ]
}

/**
 * El contrato en la forma que leen los campos: ids planos en vez de referencias.
 *
 * @param contrato La fila de la API.
 * @returns El registro para `FormularioRecurso`.
 */
export function registroDeContrato (contrato: Contrato): Record<string, unknown> {
  return {
    subject: contrato.subject,
    client_id: contrato.client_id,
    contract_type_id: contrato.contract_type?.id ?? null,
    contract_value: contrato.contract_value,
    datestart: contrato.datestart,
    dateend: contrato.dateend,
    description: contrato.description,
    signed: contrato.signed,
    visible_to_client: contrato.visible_to_client
  }
}

/** Valores con que nace un alta: visible para el cliente, como en el panel. */
export const REGISTRO_NUEVO_CONTRATO: Record<string, unknown> = { visible_to_client: true }

/**
 * Regla del valor: la misma que aplica `Escritura\Contrato`.
 *
 * @param texto Lo escrito, ya comprobado como numero.
 * @returns El mensaje, o `null` si sirve.
 */
export function errorDelValor (texto: string): string | null {
  return Number(texto) < 0 ? 'No puede ser negativo.' : null
}

/**
 * Campos del dialogo de acceso, que solo abre el superadmin.
 *
 * @param areas Todas las areas del equipo (`areas` de `GET /lookups`), ya como opciones.
 * @returns El selector de areas y el interruptor de administradores.
 */
export function camposDeAcceso (areas: OpcionCampo[]): CampoFormulario[] {
  return [
    {
      clave: 'area_ids',
      etiqueta: 'Áreas que ven los contratos',
      tipo: 'seleccion-multiple',
      opciones: areas,
      ayuda: 'Cuenta el área principal y las adicionales de cada persona.'
    },
    {
      clave: 'admin',
      etiqueta: 'Los administradores también los ven',
      tipo: 'booleano',
      ayuda: 'Tú los ves siempre, por ser superadmin.'
    }
  ]
}

/**
 * La configuracion en la forma que leen los campos del dialogo.
 *
 * @param acceso Lo que devuelve `GET /contratos/acceso`.
 * @returns El registro para `FormularioRecurso`.
 */
export function registroDeAcceso (acceso: AccesoContratos): Record<string, unknown> {
  return { area_ids: acceso.areas.map((area) => String(area.id)), admin: acceso.admin }
}
