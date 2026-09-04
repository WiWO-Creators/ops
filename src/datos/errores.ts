import { GLOSARIO } from '../dominio/glosario.ts'
import type { CodigoError, SobreError } from './tipos'

/**
 * Error de la API con el codigo del contrato intacto.
 *
 * El codigo importa mas que el estado HTTP: los tres `401` (`unauthenticated`, `token_expired`,
 * `token_revoked`) piden reacciones distintas, y `details` solo llega en los `422`.
 */
export class ErrorApi extends Error {
  readonly codigo: CodigoError
  readonly estado: number
  readonly detalles: Record<string, string[]> | undefined

  constructor (codigo: CodigoError, mensaje: string, estado: number, detalles?: Record<string, string[]>) {
    super(mensaje)
    this.name = 'ErrorApi'
    this.codigo = codigo
    this.estado = estado
    this.detalles = detalles
  }

  /** El token vencio y se puede recuperar refrescando. */
  get esRefrescable (): boolean {
    return this.codigo === 'token_expired'
  }

  /** No hay forma de seguir sin volver a entrar. */
  get exigeEntrar (): boolean {
    return this.codigo === 'unauthenticated' || this.codigo === 'token_revoked'
  }
}

/**
 * Construye un `ErrorApi` a partir de una respuesta que no fue exitosa.
 *
 * Una respuesta sin JSON valido (un 502 del proxy, un HTML de Apache) tambien tiene que producir un
 * `ErrorApi`: si no, el llamador recibe un `SyntaxError` que no dice nada.
 */
export async function errorDesdeRespuesta (respuesta: Response, ruta: string): Promise<ErrorApi> {
  let cuerpo: SobreError | null = null

  try {
    cuerpo = await respuesta.json() as SobreError
  } catch {
    cuerpo = null
  }

  if (cuerpo?.error?.code) {
    return new ErrorApi(cuerpo.error.code, cuerpo.error.message, respuesta.status, cuerpo.error.details)
  }

  return new ErrorApi(
    'server_error',
    `La API respondio ${respuesta.status} sin cuerpo de error en ${ruta}`,
    respuesta.status
  )
}

/**
 * Lee el envelope de error del BFF, con un mensaje propio si la respuesta no trae JSON valido.
 *
 * Vive aca y no en el componente que lo estrenó porque cualquier llamada del cliente al BFF —una
 * accion de tabla, detener un cronometro— necesita exactamente esto y ninguna deberia reescribirlo.
 *
 * @param respuesta la respuesta fallida del BFF
 * @returns el error del contrato, o uno generico con el codigo de estado si el cuerpo no era JSON
 */
export async function leerError (respuesta: Response): Promise<SobreError['error']> {
  try {
    const cuerpo = await respuesta.json() as SobreError

    // El mensaje sale ya con los `details` adentro: quien lo muestra es un `<p>` de formulario, y
    // "Hay campos que no se pueden guardar." sin decir cual campo no se puede accionar.
    if (cuerpo.error?.code !== undefined) {
      return { ...cuerpo.error, message: mensajeConDetalles(cuerpo.error) }
    }
  } catch {
    // Un 502 del proxy devuelve HTML: se cae al mensaje generico de abajo.
  }

  return { code: 'server_error', message: `El servidor respondió ${respuesta.status}` }
}

/**
 * Nombres de campo del contrato, con los de la interfaz.
 *
 * Sin esto un `422` habla de `rel_id` o `due_date`, que son nombres de la API y no de la pantalla.
 * Lo que no esté acá se muestra tal cual: un nombre crudo dice más que esconder el campo.
 */
const CAMPOS: Record<string, string> = {
  name: 'Nombre',
  description: 'Descripción',
  start_date: 'Fecha de inicio',
  due_date: 'Fecha de vencimiento',
  priority: 'Prioridad',
  billable: 'Facturable',
  tags: 'Etiquetas',
  assignees: 'Asignados',
  followers: 'Seguidores',
  status: 'Estado',
  milestone: GLOSARIO.hito.singular,
  rel_id: GLOSARIO.espacio.singular,
  rel_type: 'Tipo de vínculo'
}

/**
 * Motivos del contrato, en castellano.
 *
 * La API mezcla códigos en inglés y en castellano según el endpoint. Lo que no esté acá se muestra
 * con los guiones bajos cambiados por espacios.
 */
const MOTIVOS: Record<string, string> = {
  requerido: 'falta',
  required: 'falta',
  invalid: 'no es válido',
  no_valido: 'no es válido',
  formato_invalido: 'tiene un formato inválido',
  inexistente: 'no existe en el calendario',
  no_existe: 'no existe',
  unknown: 'no existe',
  no_editable: 'no se puede editar',
  fuera_de_rango: 'está fuera de rango',
  no_booleano: 'tiene que ser sí o no',
  boolean: 'tiene que ser sí o no',
  integer: 'tiene que ser un número entero',
  date: 'tiene que ser una fecha',
  length: 'es demasiado largo',
  no_es_lista: 'tiene que ser una lista',
  no_soportado: 'no está soportado',
  anterior_al_inicio: 'es anterior a la fecha de inicio',
  no_pertenece_al_espacio: `no pertenece a este ${GLOSARIO.espacio.singular.toLowerCase()}`
}

/**
 * Mensaje de un error del contrato con sus `details` adentro.
 *
 * "Hay campos que no se pueden guardar." no dice cuál campo: el formulario queda lleno y sin pista,
 * que es exactamente el caso que hacía imposible crear una tarea con una etiqueta que no existía.
 * Los `details` solo llegan en los `422`; el resto de los errores devuelve su mensaje intacto.
 *
 * @param error el sobre de error del contrato
 * @returns el mensaje, con los campos y sus motivos si los hay
 */
export function mensajeConDetalles (error: { message: string, details?: Record<string, string[]> }): string {
  const detalles = error.details

  if (detalles === undefined) return error.message

  // Solo las entradas con forma de `campo: [motivo]`. El contrato tambien usa `details` para
  // devolver un bloque de datos —el `regeneracion` del 429 de la capa de IA es el primero—, y sin
  // este filtro ese bloque se cuela en la frase como el nombre pelado de su clave.
  const partes = Object.entries(detalles)
    .filter(([, motivos]) => Array.isArray(motivos))
    .map(([campo, motivos]) => {
      const nombre = CAMPOS[campo] ?? campo
      const codigo = motivos[0]

      if (codigo === undefined) return nombre

      return `${nombre} ${MOTIVOS[codigo] ?? codigo.replace(/_/g, ' ')}`
    })

  return partes.length === 0 ? error.message : `${error.message} ${partes.join('; ')}.`
}
