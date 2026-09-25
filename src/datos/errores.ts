import { GLOSARIO } from '../dominio/glosario.ts'
import { avisarError, reportarIncidente } from '../lib/aviso-de-error.ts'
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

  /**
   * El codigo del incidente, cuando la API guardo el error.
   *
   * Es el numero de ocho hexadecimales que la persona ve en el aviso y reporta en wiwo.center, y con
   * el que Administración → Incidentes encuentra la excepcion, la traza y quien la sufrio.
   */
  get incidente (): string | undefined {
    return incidenteDe(this.detalles)
  }
}

/**
 * Lee el codigo de incidente de los `details` de un error del contrato.
 *
 * El cast no es descuido: `details` tiene dos formas en el contrato. En los `422` es
 * `{ campo: [motivo] }` —la que describe el tipo, porque es la que consume media aplicacion— y en
 * los errores registrados es `{ incidente: 'ab12cd34' }`, un valor suelto. Tipar la union obligaria
 * a estrechar en los seis lugares que hoy recorren los motivos de un 422 sin ganar nada: aca se
 * comprueba que sea una cadena antes de devolverla, que es la unica garantia que hace falta.
 *
 * @param detalles el bloque `details` del error, si vino
 * @returns el codigo de ocho hexadecimales, o `undefined` si el error no quedo registrado
 */
export function incidenteDe (detalles: Record<string, string[]> | undefined): string | undefined {
  const valor: unknown = detalles?.incidente

  return typeof valor === 'string' && valor !== '' ? valor : undefined
}

/**
 * Las marcas de que una frase del mensaje es diagnostico y no informacion.
 *
 * La API antepone su parte legible —"Error interno. Incidente 45d2c10e."— y despues adjunta la
 * excepcion tal cual: `mysqli_sql_exception: Unknown column 'i.origen' in 'SELECT'
 * (mysqli_driver.php:307)`. Esa cola no le dice nada a quien usa el panel, le tapa el codigo que si
 * necesita y nombra tablas y archivos del servidor en una pantalla que ve cualquiera.
 */
const JERGA = /(Exception|SQLSTATE|mysqli|Fatal error|\.php:\d+|\bat [A-Z]\w+\.)/

/**
 * El mensaje de un error tal como se muestra en pantalla: sin la cola tecnica.
 *
 * Corta por frases y se queda con las que una persona puede leer. El diagnostico **no** se pierde:
 * la API ya lo guardo entero en el incidente, que es donde un superadministrador lo lee con su
 * traza al lado.
 *
 * Si todas las frases son tecnicas —una excepcion pelada, sin parte legible adelante— devuelve la
 * frase generica antes que un volcado: en ese caso el mensaje crudo no informa, solo asusta.
 *
 * @param mensaje el `message` del error, tal como llego
 * @returns el texto para pantalla, siempre no vacio
 */
export function mensajeParaPantalla (mensaje: string): string {
  const frases = mensaje.split(/(?<=\.)\s+/).map((frase) => frase.trim()).filter((frase) => frase !== '')
  const legibles = frases.filter((frase) => !JERGA.test(frase))

  if (legibles.length === 0) return 'Algo falló de nuestro lado.'

  return legibles.join(' ')
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
 * @param peticion metodo y ruta de la peticion, para el incidente si hay que registrarlo
 * @returns el error del contrato, o uno generico con el codigo de estado si el cuerpo no era JSON
 */
export async function leerError (respuesta: Response, peticion: PeticionFallida = {}): Promise<SobreError['error']> {
  const cuerpo = await leerCuerpoDeError(respuesta)

  // El mensaje sale ya con los `details` adentro: quien lo muestra es un `<p>` de formulario, y
  // "Hay campos que no se pueden guardar." sin decir cual campo no se puede accionar.
  const error: SobreError['error'] = cuerpo.sobre?.error?.code !== undefined
    ? { ...cuerpo.sobre.error, message: mensajeConDetalles(cuerpo.sobre.error) }
    : { code: 'server_error', message: `El servidor respondió ${respuesta.status}` }

  await registrarFallaSinIncidente(respuesta, cuerpo, error.message, peticion)

  return error
}

/** Lo que se sabe de la peticion que fallo, ademas de la respuesta. */
export interface PeticionFallida {
  /** Metodo HTTP. La `Response` no lo trae, asi que solo lo sabe quien hizo el `fetch`. */
  metodo?: string
  /** Ruta pedida. Si falta se usa la de `respuesta.url`. */
  ruta?: string
}

/** El cuerpo de una respuesta fallida: crudo, y como envelope si lo era. */
export interface CuerpoDeError {
  crudo: string
  sobre: Partial<SobreError> | null
}

/**
 * Lee el cuerpo de una respuesta fallida una sola vez, como texto y como envelope.
 *
 * Se lee como texto primero porque un cuerpo solo se puede consumir una vez: si se pidiera `json()`
 * y fallara —el HTML de un 502 de Apache—, el HTML ya no se podria recuperar para el incidente.
 * Nunca lanza: un cuerpo ilegible queda como cadena vacia.
 *
 * @param respuesta la respuesta fallida
 * @returns el texto crudo y el envelope, o `null` si el texto no era un objeto JSON
 */
export async function leerCuerpoDeError (respuesta: Response): Promise<CuerpoDeError> {
  let crudo = ''

  try {
    crudo = await respuesta.text()
  } catch {
    return { crudo, sobre: null }
  }

  try {
    const valor: unknown = JSON.parse(crudo)

    return { crudo, sobre: typeof valor === 'object' && valor !== null ? valor as Partial<SobreError> : null }
  } catch {
    return { crudo, sobre: null }
  }
}

/**
 * Un trozo del cuerpo que no era JSON, para que el incidente diga algo del HTML que llego.
 *
 * @param crudo el cuerpo tal como llego
 * @returns hasta 300 caracteres con los espacios colapsados, o `cuerpo vacío`
 */
export function recorteDelCuerpo (crudo: string): string {
  const limpio = crudo.replace(/\s+/g, ' ').trim()

  return limpio === '' ? 'cuerpo vacío' : limpio.slice(0, 300)
}

/**
 * Registra desde el navegador un error del servidor que nadie registro, y avisa con su codigo.
 *
 * Existe por los errores que el BFF nunca ve: en produccion Apache esta delante de Next, y cuando
 * Next no contesta a tiempo el `502` lo arma el proxy en HTML. Ese error no pasa por `conIncidente()`
 * y, sin esto, la persona veia «El servidor respondió 502» y en Incidentes no quedaba nada. El otro
 * caso es un envelope `5xx` sin `details.incidente`: el BFF lo vio pero no pudo guardarlo.
 *
 * No hace nada con los `4xx` —son desenlaces que la pantalla explica— ni cuando el envelope ya trae
 * incidente, porque registrarlo otra vez duplicaria la fila y el codigo mostrado no seria el que
 * tiene la traza del servidor. Nunca lanza: si el reporte falla, el aviso sale sin codigo y el
 * llamador sigue con su mensaje generico.
 *
 * @param respuesta la respuesta fallida
 * @param cuerpo el cuerpo ya leido con {@link leerCuerpoDeError}
 * @param mensaje lo que se le muestra a la persona
 * @param peticion metodo y ruta, si quien llama los conoce
 */
export async function registrarFallaSinIncidente (
  respuesta: Response,
  cuerpo: CuerpoDeError,
  mensaje: string,
  peticion: PeticionFallida = {}
): Promise<void> {
  if (respuesta.status < 500) return
  if (incidenteDe(cuerpo.sobre?.error?.details) !== undefined) return

  const detalle = cuerpo.sobre?.error?.message ?? recorteDelCuerpo(cuerpo.crudo)
  let incidente: string | null = null

  try {
    incidente = await reportarIncidente({
      tipo: cuerpo.sobre?.error === undefined ? 'RespuestaSinCuerpo' : 'RespuestaSinIncidente',
      mensaje: `${respuesta.status} ${detalle} en ${rutaDeLaRespuesta(respuesta, peticion)}`,
      metodo: peticion.metodo
    })
  } catch {
    incidente = null
  }

  avisarError({ mensaje, incidente: incidente ?? undefined })
}

/** La ruta pedida: la que dio quien llama, o el path de `respuesta.url`. */
function rutaDeLaRespuesta (respuesta: Response, peticion: PeticionFallida): string {
  if (peticion.ruta !== undefined && peticion.ruta !== '') return peticion.ruta

  try {
    return new URL(respuesta.url).pathname
  } catch {
    return 'ruta desconocida'
  }
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
  estimated_hours: 'Horas estimadas',
  milestone: GLOSARIO.hito.singular,
  rel_id: GLOSARIO.espacio.singular,
  rel_type: 'Tipo de vínculo',
  completed_at: 'Fecha de cierre',
  recurring: 'Recurrente',
  repeat_every: 'Repetir cada',
  recurring_type: 'Unidad',
  cycles: 'Ciclos',
  recurring_until: 'Último día',
  skip_weekdays: 'Días sin copias',
  recurring_paused: 'Pausa',
  // Limpieza de copias de una recurrencia (`POST /tasks/recurrentes/{id}/limpiar`).
  ids: 'Copias',
  detener: 'Además',
  // Organigrama de areas. `area_superior_id` y `jefe_staffid` son los nombres de la tabla; en la
  // pantalla son "De qué área cuelga" y "Quién la dirige", que es como los lee quien los completa.
  area_superior_id: 'Área superior',
  jefe_staffid: 'Quien dirige',
  area_ids: 'Áreas',
  area_id: 'Área',
  // Duplicar un Proceso. `nombre`, `project_id` y el bloque `copiar` son las claves de
  // `POST /tasks/{id}/duplicar`, que nombra en castellano lo que el resto de la API nombra en
  // ingles; sin estas entradas el 422 hablaria de `copiar.campos_personalizados`.
  nombre: 'Nombre',
  project_id: GLOSARIO.espacio.singular,
  copiar: 'Qué se copia',
  'copiar.descripcion': 'Descripción',
  'copiar.asignados': 'Asignados',
  'copiar.seguidores': 'Seguidores',
  'copiar.checklist': 'Checklist',
  'copiar.adjuntos': 'Adjuntos',
  'copiar.campos_personalizados': 'Campos personalizados',
  'copiar.etiquetas': 'Etiquetas',
  'copiar.recordatorios': 'Recordatorios',
  // Alta y edicion de Prospecto: la empresa viaja anidada en el bloque `cliente`.
  'cliente.company': 'Empresa'
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
  futura: 'no puede ser posterior a ahora',
  no_completado: 'solo se puede corregir en una tarea completada',
  no_pertenece_al_espacio: `no pertenece a este ${GLOSARIO.espacio.singular.toLowerCase()}`,
  recurrencia_apagada: 'no se puede usar: la recurrencia está desactivada en esta instalación',
  sobra_sin_recurrencia: 'sobra si la tarea no es recurrente',
  duplicado: 'ya está usado por otra',
  repetido: 'tiene un valor repetido',
  desconocido: 'no existe',
  no_es_objeto: 'tiene que ser un bloque de opciones',
  demasiado_largo: 'es demasiado largo',
  sin_espacio: `no se puede fijar en una ${GLOSARIO.proceso.singular.toLowerCase()} sin ${GLOSARIO.espacio.singular.toLowerCase()}`,
  // El motivo dice la consecuencia y no la palabra "ciclo": quien completa el formulario no piensa
  // en grafos, piensa en que acaba de colgar un área de una que ya colgaba de ella.
  ciclo: 'no puede ser un área que ya cuelga de esta'
}

/**
 * Claves de `details` que son datos para el programa, no un campo del formulario.
 *
 * `prospecto_existente` es el id del prospecto con el que choca un alta repetida: viaja con la forma
 * `campo: [motivo]` y sin esta lista se colaría en la frase como «prospecto_existente 4».
 */
const CLAVES_QUE_NO_SE_NOMBRAN = new Set([
  'prospecto_existente',
  // El motivo técnico con que Google rechaza una operación de Drive (`cannotMoveTrashedItem` y
  // compañía): el mensaje ya dice qué pasó, y el código pelado no le dice nada a nadie.
  'drive'
])

/**
 * Pares `campo:motivo` que el mensaje principal ya explica mejor que la frase armada.
 *
 * «Ya existe un prospecto con esa empresa.» ya lo dice todo; sumarle «Empresa ya está usado por otra»
 * sólo repite, y en peor castellano.
 */
const YA_DICHOS_POR_EL_MENSAJE = new Set([
  'cliente.company:duplicado',
  // Drive: el mensaje ya nombra el problema ("supera el máximo de 25 MB", "la extensión .exe no está
  // permitida", "ya están en esa carpeta").
  'file:too_large',
  'file:extension_not_allowed',
  'parent_id:same_folder'
])

/**
 * Pares `campo:motivo` que se dicen con una frase entera y no con «Campo motivo».
 *
 * `requerido_por_cliente` no es un defecto del campo sino una regla de otro lado —el cliente de la
 * Tarea exige fecha—, y armada con el nombre del campo quedaria «Fecha de vencimiento falta por
 * cliente», que no dice por que. Sin punto final: lo pone quien junta las partes.
 */
const FRASES_PROPIAS: Record<string, string> = {
  'due_date:requerido_por_cliente': 'Este cliente exige fecha de vencimiento',
  // Recurrencia: las dos son reglas de la regla, no defectos de un valor. «Días sin copias
  // excluye todos» no dice que pasaria; la frase si.
  'skip_weekdays:excluye_todos': 'No puedes excluir los siete días de la semana: la tarea nunca se generaría',
  'recurring_paused:sin_recurrencia': 'La tarea no es recurrente, así que no hay nada que pausar ni reanudar',
  // Un id que no es copia viva de esa regla: ajena, ya borrada o inventada. No se borra ninguna.
  'ids:no_es_copia': 'Alguna de las tareas elegidas no es una copia de esta recurrencia, o ya está en la papelera. Vuelve a revisar la lista'
}

/**
 * Frases de los codigos de error con nombre propio, para cuando la pantalla quiere decir el porque
 * y no el mensaje que mando la API.
 */
const MENSAJES_DE_CODIGO: Partial<Record<CodigoError, string>> = {
  solo_administradores: 'Solo un administrador puede hacer esto.'
}

/**
 * La frase de un codigo de error, o la que se pase si el codigo no tiene una.
 *
 * @param codigo el `error.code` del sobre, si llego
 * @param porDefecto lo que se muestra si no hay frase propia
 */
export function mensajeDeCodigo (codigo: string | undefined, porDefecto: string): string {
  return MENSAJES_DE_CODIGO[codigo as CodigoError] ?? porDefecto
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
    .filter(([campo, motivos]) => Array.isArray(motivos) && !CLAVES_QUE_NO_SE_NOMBRAN.has(campo) &&
      !YA_DICHOS_POR_EL_MENSAJE.has(`${campo}:${motivos[0] ?? ''}`))
    .map(([campo, motivos]) => {
      const nombre = CAMPOS[campo] ?? campo
      const codigo = motivos[0]

      if (codigo === undefined) return nombre

      const propia = FRASES_PROPIAS[`${campo}:${codigo}`]

      if (propia !== undefined) return propia

      return `${nombre} ${MOTIVOS[codigo] ?? codigo.replace(/_/g, ' ')}`
    })

  return partes.length === 0 ? error.message : `${error.message} ${partes.join('; ')}.`
}
