/**
 * Contrato del bus de «Ops en vivo»: tipos, constantes y lectores de mensajes.
 *
 * Es el único archivo que comparten el panel (Next) y el servicio `servicios/en-vivo/`, así que es
 * puro a propósito: nada de React, de Next ni de `@/`, y solo imports relativos con extensión `.ts`
 * para que Node lo ejecute tal cual. Lo que viaja por el bus nunca lleva contenido: solo dice
 * «cambió {tipo, id}» y quien escucha vuelve a pedir el dato a la API con su propio permiso.
 */

/** Tipos de evento que el board puede emitir hacia el servicio. Otro valor es un 422. */
export const TIPOS_DE_EVENTO = [
  'tarea',
  'ticket',
  'propuesta',
  'acta',
  'aviso',
  'jornada',
  'cronometro',
  'ejecucion',
  'presencia',
  'acta_comentario'
] as const

export type TipoDeEvento = typeof TIPOS_DE_EVENTO[number]

/** Lo que llega al navegador: los tipos del board y `pantalla`, que es el cambio genérico de la oficina. */
export type TipoDeCambio = TipoDeEvento | 'pantalla'

/** Códigos de error que el servidor le manda al cliente del bus. */
export const CODIGOS_DE_ERROR = ['boleto_invalido', 'sala_no_permitida', 'mensaje_invalido', 'limite'] as const

export type CodigoDeError = typeof CODIGOS_DE_ERROR[number]

/** Códigos con los que el servidor cierra un socket del bus. */
export const CIERRES = {
  boleto: 4401,
  sala: 4403,
  sinHola: 4408,
  limite: 4429,
  reinicio: 1012
} as const

/** Quién lleva el boleto: una persona del equipo, un contacto del portal o un televisor. */
export type SujetoDeBoleto = 'staff' | 'contacto' | 'pantalla'

/** Tope de un mensaje del bus, en bytes. */
export const MAXIMO_BYTES_MENSAJE = 4096

/** Mensajes por segundo que acepta una conexión antes de recibir `limite`. */
export const MAXIMO_MENSAJES_POR_SEGUNDO = 20

/** Salas que puede tener suscritas una conexión a la vez. */
export const MAXIMO_SALAS_POR_CONEXION = 50

/** Salas que puede llevar un boleto. */
export const MAXIMO_SALAS_POR_BOLETO = 20

/** Eventos por lote que acepta `POST interno/eventos`. */
export const MAXIMO_EVENTOS_POR_LOTE = 200

/** Tope del cuerpo de `POST interno/eventos`, en bytes. */
export const MAXIMO_BYTES_LOTE = 64 * 1024

/** Con el socket conectado, el sondeo pasa a respaldo: nunca más seguido que esto. */
export const RESPALDO_CONECTADO_MS = 300_000

/** Largo máximo de un boleto dentro de un mensaje, con holgura para 20 salas. */
const MAXIMO_CARACTERES_BOLETO = 3000

const SALA_VALIDA = /^(?:equipo|pantallas|(?:staff|espacio|cliente):[1-9]\d{0,9}|recurso:(?:tarea|ticket|proyecto):[1-9]\d{0,9})$/
const SALA_DE_RECURSO = /^recurso:(?:tarea|ticket|proyecto):[1-9]\d{0,9}$/
const SALA_DE_TICKET = /^recurso:ticket:[1-9]\d{0,9}$/

/** Audiencia de un evento: a quién le interesa. */
export interface AudienciaDeEvento {
  staff: number[]
  equipo: boolean
  espacio: boolean
  cliente: number | null
  pantallas: boolean
}

/** Un evento tal como lo emite el board. */
export interface EventoDeBoard {
  tipo: TipoDeEvento
  id: number | null
  espacio_id: number | null
  audiencia: AudienciaDeEvento
}

/** El cuerpo de `POST interno/eventos`. */
export interface LoteDeEventos {
  eventos: EventoDeBoard[]
  emitido_en: number
}

export type MensajeDelCliente =
  | { t: 'hola', boleto: string }
  | { t: 'suscribir', sala: string, boleto: string }
  | { t: 'desuscribir', sala: string }
  | { t: 'presencia', sala: string, estado: 'viendo' | 'fuera' }
  | { t: 'escribiendo', sala: string }

export type MensajeDelServidor =
  | { t: 'listo', salas: string[] }
  | { t: 'cambio', tipo: TipoDeCambio, id: number | null, espacio_id: number | null }
  | { t: 'presentes', sala: string, staff: number[] }
  | { t: 'escribiendo', sala: string, staff: number }
  | { t: 'error', codigo: CodigoDeError }

/** Un evento de ventana que el puente del navegador debe disparar. */
export interface EventoDeVentana {
  nombre: string
  detalle: Record<string, unknown>
}

type Objeto = Record<string, unknown>

function esObjeto (valor: unknown): valor is Objeto {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor)
}

function esIdPositivo (valor: unknown): valor is number {
  return typeof valor === 'number' && Number.isSafeInteger(valor) && valor > 0
}

function esIdOpcional (valor: unknown): valor is number | null {
  return valor === null || esIdPositivo(valor)
}

function leerJson (texto: unknown): Objeto | null {
  if (typeof texto !== 'string' || texto === '') return null

  try {
    const valor: unknown = JSON.parse(texto)

    return esObjeto(valor) ? valor : null
  } catch {
    return null
  }
}

/**
 * `true` si el texto es el nombre de una sala con la forma conocida.
 *
 * @param sala el nombre a revisar
 * @returns si es `equipo`, `pantallas`, `staff|espacio|cliente:{n}` o `recurso:{tipo}:{n}`
 */
export function esSalaValida (sala: unknown): sala is string {
  return typeof sala === 'string' && sala.length <= 64 && SALA_VALIDA.test(sala)
}

/**
 * Lee un mensaje que llegó del navegador. Nunca lanza.
 *
 * @param texto el mensaje crudo, en JSON
 * @returns el mensaje tipado, o `null` si pasa de 4 KB, no es JSON o no tiene la forma esperada
 */
export function leerMensajeDelCliente (texto: unknown): MensajeDelCliente | null {
  if (typeof texto !== 'string' || new TextEncoder().encode(texto).length > MAXIMO_BYTES_MENSAJE) return null

  const cuerpo = leerJson(texto)

  if (cuerpo === null) return null

  const { t, sala, boleto, estado } = cuerpo
  const boletoValido = typeof boleto === 'string' && boleto !== '' && boleto.length <= MAXIMO_CARACTERES_BOLETO

  switch (t) {
    case 'hola':
      return boletoValido ? { t, boleto } : null
    case 'suscribir':
      return boletoValido && esSalaValida(sala) ? { t, sala, boleto } : null
    case 'desuscribir':
      return esSalaValida(sala) ? { t, sala } : null
    case 'presencia':
      return esSalaValida(sala) && SALA_DE_RECURSO.test(sala) && (estado === 'viendo' || estado === 'fuera')
        ? { t, sala, estado }
        : null
    case 'escribiendo':
      return esSalaValida(sala) && SALA_DE_TICKET.test(sala) ? { t, sala } : null
    default:
      return null
  }
}

function esTipoDeCambio (valor: unknown): valor is TipoDeCambio {
  return valor === 'pantalla' || (TIPOS_DE_EVENTO as readonly unknown[]).includes(valor)
}

/**
 * Lee un mensaje que llegó del servidor. Nunca lanza.
 *
 * @param texto el mensaje crudo, en JSON
 * @returns el mensaje tipado, o `null` si no tiene la forma esperada
 */
export function leerMensajeDelServidor (texto: unknown): MensajeDelServidor | null {
  const cuerpo = leerJson(texto)

  if (cuerpo === null) return null

  const { t, salas, tipo, id, espacio_id: espacioId, sala, staff, codigo } = cuerpo

  switch (t) {
    case 'listo':
      return Array.isArray(salas) && salas.every(esSalaValida) ? { t, salas } : null
    case 'cambio':
      return esTipoDeCambio(tipo) && esIdOpcional(id) && esIdOpcional(espacioId)
        ? { t, tipo, id, espacio_id: espacioId }
        : null
    case 'presentes':
      return esSalaValida(sala) && Array.isArray(staff) && staff.every(esIdPositivo) ? { t, sala, staff } : null
    case 'escribiendo':
      return esSalaValida(sala) && esIdPositivo(staff) ? { t, sala, staff } : null
    case 'error':
      return (CODIGOS_DE_ERROR as readonly unknown[]).includes(codigo) ? { t, codigo: codigo as CodigoDeError } : null
    default:
      return null
  }
}

function leerAudiencia (valor: unknown): AudienciaDeEvento | null {
  if (!esObjeto(valor)) return null

  const { staff = [], equipo = false, espacio = false, cliente = null, pantallas = false } = valor

  if (!Array.isArray(staff) || staff.length > MAXIMO_SALAS_POR_BOLETO || !staff.every(esIdPositivo)) return null
  if (typeof equipo !== 'boolean' || typeof espacio !== 'boolean' || typeof pantallas !== 'boolean') return null
  if (!esIdOpcional(cliente)) return null

  return { staff, equipo, espacio, cliente, pantallas }
}

function leerEvento (valor: unknown): EventoDeBoard | null {
  if (!esObjeto(valor)) return null

  const { tipo, id = null, espacio_id: espacioId = null } = valor
  const audiencia = leerAudiencia(valor.audiencia)

  if (!(TIPOS_DE_EVENTO as readonly unknown[]).includes(tipo) || audiencia === null) return null
  if (!esIdOpcional(id) || !esIdOpcional(espacioId)) return null

  return { tipo: tipo as TipoDeEvento, id, espacio_id: espacioId, audiencia }
}

/**
 * Lee el cuerpo de `POST interno/eventos`. Nunca lanza.
 *
 * @param texto el cuerpo crudo, en JSON
 * @returns el lote tipado, o `null` si está vacío, pasa de 200 eventos o algún evento es inválido
 */
export function leerLoteDeEventos (texto: unknown): LoteDeEventos | null {
  const cuerpo = leerJson(texto)

  if (cuerpo === null || !Array.isArray(cuerpo.eventos)) return null
  if (cuerpo.eventos.length === 0 || cuerpo.eventos.length > MAXIMO_EVENTOS_POR_LOTE) return null
  if (typeof cuerpo.emitido_en !== 'number' || !Number.isSafeInteger(cuerpo.emitido_en) || cuerpo.emitido_en < 0) return null

  const eventos: EventoDeBoard[] = []

  for (const crudo of cuerpo.eventos as unknown[]) {
    const evento = leerEvento(crudo)

    if (evento === null) return null
    eventos.push(evento)
  }

  return { eventos, emitido_en: cuerpo.emitido_en }
}

/**
 * Las salas que un sujeto tiene sin pedirle permiso a nadie más.
 *
 * Una persona del equipo siempre tiene la suya y la del equipo; un televisor, la de pantallas. El
 * contacto del portal no tiene ninguna por defecto: su sala `cliente:{id}` sale de su ficha.
 *
 * @param sujeto quién es y su id
 * @returns las salas base
 */
export function salasPermitidasPorDefecto (sujeto: { suj: SujetoDeBoleto, id: number }): string[] {
  if (sujeto.suj === 'staff') return [`staff:${sujeto.id}`, 'equipo']
  if (sujeto.suj === 'pantalla') return ['pantallas']

  return []
}

/**
 * `true` si esa sala puede figurar en el boleto de ese sujeto.
 *
 * Es la segunda llave, después de la que valida cada sala contra el board: aunque el secreto del
 * boleto se filtrara, un boleto de staff no puede nombrar la sala de otra persona ni la de un cliente.
 *
 * @param sujeto el sujeto del boleto
 * @param id su id
 * @param sala la sala a revisar
 */
export function salaCorrespondeAlSujeto (sujeto: SujetoDeBoleto, id: number, sala: string): boolean {
  if (!esSalaValida(sala)) return false
  if (sujeto === 'pantalla') return sala === 'pantallas'
  if (sujeto === 'contacto') return sala.startsWith('cliente:')
  if (sala.startsWith('staff:')) return sala === `staff:${id}`

  return sala === 'equipo' || sala.startsWith('espacio:') || sala.startsWith('recurso:')
}

/** Cómo se comprueba que una persona puede entrar a una sala: con su sesión, con una lectura a la API, o no puede. */
export type ValidacionDeSala =
  | { via: 'sesion' }
  | { via: 'api', ruta: string }
  | { via: 'denegada' }

/**
 * Decide cómo validar una sala pedida por una persona del equipo.
 *
 * `staff:{yo}` y `equipo` bastan con la sesión; las salas de un Espacio o de un recurso exigen que
 * la API deje a esa persona leerlo (con su propio token). `cliente:*` y `pantallas` no se piden
 * desde el panel y quedan denegadas.
 *
 * @param sala el nombre de la sala
 * @param staffId quién la pide
 * @returns la vía de validación
 */
export function validacionDeSala (sala: string, staffId: number): ValidacionDeSala {
  if (!esSalaValida(sala)) return { via: 'denegada' }
  if (sala === 'equipo' || sala === `staff:${staffId}`) return { via: 'sesion' }

  const [clase, tipoOId, id] = sala.split(':')

  if (clase === 'espacio') return { via: 'api', ruta: `/projects/${tipoOId}` }
  if (clase !== 'recurso') return { via: 'denegada' }

  const rutas: Record<string, string> = { tarea: 'tasks', ticket: 'tickets', proyecto: 'projects' }
  const base = rutas[tipoOId ?? '']

  return base === undefined ? { via: 'denegada' } : { via: 'api', ruta: `/${base}/${id}` }
}

/** Los documentos colaborativos: el Meeting Paper, la descripción de una tarea y el borrador de respuesta de un ticket. */
export type ClaseDeDocumento = 'acta' | 'tarea' | 'ticket-borrador'

/** El pedido de un boleto (`POST /api/en-vivo/boleto`), ya validado. */
export interface PedidoDeBoleto {
  /** `undefined` si no se pidieron salas: se usan las de por defecto. */
  salas?: string[]
  /** `acta:{id}`, `tarea:{id}`, `ticket-borrador:{id}` o `null`. */
  documento: string | null
  /** El Espacio del acta; `null` en los documentos que no cuelgan de uno (tarea y borrador de ticket). */
  espacioId: number | null
}

const DOCUMENTO_VALIDO = /^(acta|tarea|ticket-borrador):([1-9]\d{0,9})$/

/**
 * Separa el nombre de un documento colaborativo en su clase y su id.
 *
 * @param documento por ejemplo `acta:12`
 * @returns la clase y el id, o `null` si el nombre no tiene la forma de un documento conocido
 */
export function leerNombreDeDocumento (documento: unknown): { clase: ClaseDeDocumento, id: number } | null {
  const partes = typeof documento === 'string' ? DOCUMENTO_VALIDO.exec(documento) : null

  return partes === null ? null : { clase: partes[1] as ClaseDeDocumento, id: Number(partes[2]) }
}

/**
 * Qué interruptor de `ConfigEnVivo` enciende cada clase de documento.
 *
 * @param clase la clase del documento
 * @returns `actas` para el Meeting Paper, `textos` para la descripción de tarea y el borrador de ticket
 */
export function funcionDeDocumento (clase: ClaseDeDocumento): 'actas' | 'textos' {
  return clase === 'acta' ? 'actas' : 'textos'
}

/**
 * La lectura a la API que avala que una persona puede abrir un documento (con su propio token).
 *
 * @param documento el nombre del documento (`acta:12`, `tarea:5`, `ticket-borrador:9`)
 * @param espacioId el Espacio del acta; ignorado en los demás
 * @returns la ruta a leer, o `null` si el nombre es inválido o falta el Espacio del acta
 */
export function rutaDeAvalDelDocumento (documento: string, espacioId: number | null): string | null {
  const leido = leerNombreDeDocumento(documento)

  if (leido === null) return null
  if (leido.clase === 'tarea') return `/tasks/${leido.id}`
  if (leido.clase === 'ticket-borrador') return `/tickets/${leido.id}`

  return espacioId === null ? null : `/projects/${espacioId}/actas/${leido.id}`
}

/**
 * Si una clase de documento necesita saber los permisos de la persona (`GET /me`) para decidir si
 * puede escribir. Hoy solo la descripción de la tarea: la API de los permisos no expone ninguna
 * marca de «puede editar» en el recurso.
 *
 * @param clase la clase del documento
 */
export function exigePermisosParaEscribir (clase: ClaseDeDocumento): boolean {
  return clase === 'tarea'
}

/**
 * Si la persona puede escribir en un documento, con el mismo criterio con que la interfaz ofrece «editar».
 *
 * - `tarea`: tiene `edit` en `permissions.tasks` de `GET /me` (lo que el board revalida al guardar como
 *   `tasks.edit`). Sin permisos legibles se niega: ante la duda, solo lectura.
 * - `acta` y `ticket-borrador`: quien puede leerlos puede escribir; la pantalla los ofrece a todo el
 *   equipo y el board decide al guardar (si niega, el servicio descarta a esa persona sin cerrar la sesión).
 *
 * @param clase la clase del documento
 * @param permisos `data.permissions` de `GET /me`; solo se mira para la tarea
 * @returns `true` si puede escribir
 */
export function puedeEscribirDocumento (clase: ClaseDeDocumento, permisos: unknown): boolean {
  if (!exigePermisosParaEscribir(clase)) return true

  const tareas = esObjeto(permisos) ? permisos.tasks : undefined

  return Array.isArray(tareas) && tareas.includes('edit')
}

/**
 * Lee y valida el cuerpo de `POST /api/en-vivo/boleto`.
 *
 * El acta exige `espacio_id`; la tarea y el borrador de ticket no cuelgan de un Espacio, así que
 * cualquier `espacio_id` que lleguen se descarta (el boleto lleva `null`, que es lo que el servicio
 * espera de esos documentos).
 *
 * @param cuerpo el JSON recibido
 * @returns el pedido, o `null` si algún campo tiene una forma inválida o hay más de 20 salas
 */
export function leerPedidoDeBoleto (cuerpo: unknown): PedidoDeBoleto | null {
  if (!esObjeto(cuerpo)) return null

  const { salas, documento = null, espacio_id: espacioId = null } = cuerpo

  if (salas !== undefined && (!Array.isArray(salas) || salas.length > MAXIMO_SALAS_POR_BOLETO || !salas.every(esSalaValida))) {
    return null
  }
  if (!esIdOpcional(espacioId)) return null

  const leido = documento === null ? null : leerNombreDeDocumento(documento)

  if (documento !== null && leido === null) return null
  if (leido?.clase === 'acta' && espacioId === null) return null

  return {
    salas: salas as string[] | undefined,
    documento: documento as string | null,
    espacioId: leido === null || leido.clase === 'acta' ? espacioId : null
  }
}

/**
 * Qué eventos de ventana debe disparar el navegador cuando llega un cambio.
 *
 * El navegador no recibe datos: dispara los mismos eventos que ya escuchan las listas y los detalles
 * para que se vuelvan a pedir a la API. Lo que no tiene escucha propia sale como `ops:en-vivo`.
 *
 * @param evento el cambio recibido
 * @returns los eventos de ventana, en el orden en que deben dispararse
 */
export function eventosDeVentanaPara (
  evento: { tipo: TipoDeCambio, id: number | null, espacio_id?: number | null }
): EventoDeVentana[] {
  const { tipo, id } = evento

  if (tipo === 'tarea') {
    return [
      { nombre: 'ops:tareas-cambiadas', detalle: {} },
      ...(id === null ? [] : [{ nombre: 'ops:recurso-cambiado', detalle: { ruta: `tasks/${id}`, origen: 'en-vivo' } }])
    ]
  }

  if (tipo === 'ticket') {
    return [
      ...(id === null ? [] : [{ nombre: 'ops:tickets-cambiados', detalle: { id } }]),
      ...(id === null ? [] : [{ nombre: 'ops:recurso-cambiado', detalle: { ruta: `tickets/${id}`, origen: 'en-vivo' } }])
    ]
  }

  return [{ nombre: 'ops:en-vivo', detalle: { tipo, id, espacio_id: evento.espacio_id ?? null } }]
}

/**
 * Si ya toca sondear a la API.
 *
 * Con el socket conectado el sondeo pasa a respaldo y se espacia a, como mínimo, 5 minutos; sin
 * socket sigue a su ritmo de siempre.
 *
 * @param ultimaMs marca (ms) del último sondeo
 * @param baseMs intervalo normal de la pantalla
 * @param conectado si el bus está conectado
 * @param ahora marca (ms) actual
 * @returns `true` si ya pasó el intervalo que corresponde
 */
export function debeSondear (ultimaMs: number, baseMs: number, conectado: boolean, ahora: number): boolean {
  return ahora - ultimaMs >= (conectado ? Math.max(baseMs, RESPALDO_CONECTADO_MS) : baseMs)
}

/** Interruptores de «Ops en vivo» tal como los lee el panel. Todo `false` y sin URL = apagado. */
export interface ConfigEnVivo {
  activo: boolean
  url: string
  actas: boolean
  orbe: boolean
  equipo: boolean
  presencia: boolean
  pantallas: boolean
  textos: boolean
  comentarios: boolean
}

/** La configuración de un panel sin «en vivo»: es también lo que queda si `/settings` falla. */
export const CONFIG_EN_VIVO_APAGADA: ConfigEnVivo = {
  activo: false,
  url: '',
  actas: false,
  orbe: false,
  equipo: false,
  presencia: false,
  pantallas: false,
  textos: false,
  comentarios: false
}

/** Lo mínimo que se necesita de `GET /settings` para decidir los interruptores. */
export interface AjustesParaEnVivo {
  editable: Record<string, { value: string | number | boolean | null } | undefined>
}

function opcionEncendida (ajustes: AjustesParaEnVivo, clave: string): boolean {
  const valor = ajustes.editable[clave]?.value

  return valor === true || valor === 1 || valor === '1'
}

/**
 * Arma los interruptores a partir de los ajustes de la instalación y la URL pública del servicio.
 *
 * `activo` exige el maestro y una URL; cada función exige además su propia opción. Sin `activo`
 * ninguna se enciende, aunque su opción esté en `1`.
 *
 * @param ajustes el cuerpo de `GET /settings`
 * @param url `NEXT_PUBLIC_EN_VIVO_URL`
 * @returns la configuración para el navegador
 */
export function configDeEnVivo (ajustes: AjustesParaEnVivo, url: string): ConfigEnVivo {
  const limpia = url.trim().replace(/\/+$/, '')
  const activo = opcionEncendida(ajustes, 'wiwo_en_vivo') && limpia !== ''

  if (!activo) return CONFIG_EN_VIVO_APAGADA

  return {
    activo,
    url: limpia,
    actas: opcionEncendida(ajustes, 'wiwo_actas_colaborativas'),
    orbe: opcionEncendida(ajustes, 'wiwo_en_vivo_orbe'),
    equipo: opcionEncendida(ajustes, 'wiwo_en_vivo_equipo'),
    presencia: opcionEncendida(ajustes, 'wiwo_en_vivo_presencia'),
    pantallas: opcionEncendida(ajustes, 'wiwo_en_vivo_pantallas'),
    textos: opcionEncendida(ajustes, 'wiwo_en_vivo_textos'),
    comentarios: opcionEncendida(ajustes, 'wiwo_acta_comentarios')
  }
}
