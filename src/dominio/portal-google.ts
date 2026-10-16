import { motivoParaRechazarDominio, normalizarDominio } from './acceso.ts'

/**
 * Reglas del acceso con Google al portal de clientes, sin nada de React ni de Next.
 *
 * Vive aparte de las pantallas por lo mismo que `acceso.ts`: lo que se decide aca —que se manda a la
 * API, que mensaje explica cada rechazo, que se ofrece segun lo que responde— merece prueba, y Node
 * puede ejecutar este archivo tal cual (`pruebas/portal-google.test.js`).
 *
 * La API es quien manda. Estas funciones solo evitan viajes inutiles y traducen sus codigos: la
 * resolucion de dominios, los sufijos publicos y los conflictos entre clientes se deciden alla.
 */

/** Tope de dominios por cliente. Lo fija la API; se repite aca para avisar antes de guardar. */
export const MAX_DOMINIOS_PORTAL = 20

/** Un dominio del cliente, con o sin sus subdominios (`wom.cl` cubre `consultor.wom.cl` si lo tiene). */
export interface DominioDelPortal {
  dominio: string
  incluir_subdominios: boolean
}

/** Lo que devuelve `GET /clients/{id}/portal-google` y recibe `PUT` tal cual. */
export interface ConfiguracionPortalGoogle {
  configurado: boolean
  google_client_id: string
  exigir_google: boolean
  dominios: DominioDelPortal[]
  /** El interruptor global (Administracion → Acceso). Informativo: el `PUT` lo ignora. */
  global_habilitado: boolean
  /**
   * Contactos activos del cliente cuyo correo no cae en ningun dominio de la lista. Con Google
   * encendido siguen entrando, pero solo con contraseña.
   */
  contactos_sin_cobertura: number
}

/** Lo que responde `GET /auth/portal/google[?email=]`. */
export interface AccesoGooglePortal {
  enabled: boolean
  client_id: string | null
  required: boolean
}

/** El portal sin Google: lo que se asume si la API no contesta o el interruptor global esta apagado. */
export const PORTAL_SIN_GOOGLE: AccesoGooglePortal = { enabled: false, client_id: null, required: false }

/**
 * Deja la respuesta de la API en una forma en la que la pantalla puede confiar.
 *
 * `client_id` solo cuenta si viene como texto no vacio, y `required` solo si ademas hay Google que
 * exigir: asi la pantalla nunca tiene que desconfiar de la combinacion imposible «exigir Google sin
 * boton», que dejaria a alguien sin ninguna puerta.
 *
 * @param bruto lo que llego, sin verificar
 */
export function accesoGoogleDelPortal (bruto: unknown): AccesoGooglePortal {
  if (typeof bruto !== 'object' || bruto === null) return PORTAL_SIN_GOOGLE

  const { enabled, client_id: clientId, required } = bruto as Record<string, unknown>
  const clienteValido = typeof clientId === 'string' && clientId !== ''

  if (enabled !== true) return PORTAL_SIN_GOOGLE

  return {
    enabled: true,
    client_id: clienteValido ? clientId : null,
    required: clienteValido && required === true
  }
}

/** Una configuracion vacia: lo que se muestra para un cliente que nunca la tuvo. */
export const CONFIGURACION_VACIA: ConfiguracionPortalGoogle = {
  configurado: false,
  google_client_id: '',
  exigir_google: false,
  dominios: [],
  global_habilitado: false,
  contactos_sin_cobertura: 0
}

/**
 * Lo que dice un Client ID de Google para que valga la pena mandarlo.
 *
 * No prueba que exista —eso lo sabe Google—: rechaza lo que casi siempre es un error de pegado, como
 * un correo, una URL o un secreto. El formato exacto lo valida la API (`422`).
 */
const PATRON_CLIENT_ID = /^[A-Za-z0-9._-]+\.apps\.googleusercontent\.com$/

/**
 * Por que este Client ID no sirve, o `null` si sirve. Vacio es valido: es la forma de quitar la config.
 *
 * @param valor lo escrito en el campo
 */
export function motivoParaRechazarClientId (valor: string): string | null {
  const limpio = valor.trim()

  if (limpio === '') return null
  if (!PATRON_CLIENT_ID.test(limpio)) {
    return 'Eso no parece un Client ID de Google. Termina en «.apps.googleusercontent.com».'
  }

  return null
}

/**
 * Por que no se puede agregar este dominio a la lista del cliente, o `null` si se puede.
 *
 * Reutiliza la regla del login del equipo (forma de dominio, sin duplicados); los sufijos publicos,
 * los correos gratuitos y los cruces con otros clientes los rechaza la API al guardar.
 *
 * @param candidato lo escrito en el campo
 * @param actuales los dominios que ya estan en la lista
 */
export function motivoParaRechazarDominioDelCliente (candidato: string, actuales: DominioDelPortal[]): string | null {
  return motivoParaRechazarDominio(candidato, actuales.map((d) => d.dominio))
}

/**
 * Por que no se puede guardar esta configuracion, o `null` si se puede.
 *
 * Son las reglas que la API repite: el Client ID y los dominios van juntos (uno solo no hace nada), no
 * se puede exigir Google sin dominios que lo cubran y la lista tiene tope.
 *
 * @param clientId el Client ID tal como esta en el campo
 * @param dominios la lista de dominios
 * @param exigir si se pide Google como unica puerta
 */
export function motivoParaRechazarConfiguracion (
  clientId: string,
  dominios: DominioDelPortal[],
  exigir: boolean
): string | null {
  const limpio = clientId.trim()
  const motivoCliente = motivoParaRechazarClientId(limpio)

  if (motivoCliente !== null) return motivoCliente
  if (limpio === '' && dominios.length > 0) {
    return 'Falta el Client ID. Pégalo, o quita los dominios si ya no quieres Google para este cliente.'
  }
  if (limpio !== '' && dominios.length === 0) {
    return 'Agrega al menos un dominio: sin él, nadie de este cliente podría entrar con Google.'
  }
  if (dominios.length > MAX_DOMINIOS_PORTAL) {
    return `Se pueden registrar hasta ${MAX_DOMINIOS_PORTAL} dominios por cliente.`
  }
  if (exigir && dominios.length === 0) {
    return 'Para exigir Google hace falta al menos un dominio.'
  }

  return null
}

/**
 * Si el formulario difiere de lo guardado: decide si «Guardar» se habilita.
 *
 * El orden de los dominios no cuenta, y el Client ID se compara sin espacios.
 *
 * @param guardado lo ultimo que devolvio la API
 * @param clientId el campo del Client ID
 * @param dominios la lista en pantalla
 * @param exigir la casilla de exigir Google
 */
export function hayCambios (
  guardado: ConfiguracionPortalGoogle,
  clientId: string,
  dominios: DominioDelPortal[],
  exigir: boolean
): boolean {
  const clave = (lista: DominioDelPortal[]): string =>
    lista.map((d) => `${d.dominio}:${d.incluir_subdominios ? 1 : 0}`).sort().join('|')

  return clientId.trim() !== guardado.google_client_id ||
    exigir !== guardado.exigir_google ||
    clave(dominios) !== clave(guardado.dominios)
}

/**
 * El cuerpo del `PUT`: el mismo que devuelve el `GET`, sin los campos que solo informa la API.
 *
 * @param clientId el campo del Client ID
 * @param dominios la lista en pantalla
 * @param exigir la casilla de exigir Google
 */
export function cuerpoDeGuardado (
  clientId: string,
  dominios: DominioDelPortal[],
  exigir: boolean
): Pick<ConfiguracionPortalGoogle, 'google_client_id' | 'exigir_google' | 'dominios'> {
  return {
    google_client_id: clientId.trim(),
    exigir_google: exigir,
    dominios: dominios.map((d) => ({ dominio: normalizarDominio(d.dominio), incluir_subdominios: d.incluir_subdominios }))
  }
}

/**
 * Lee `contactos_sin_cobertura` aunque la API lo mande como lista en vez de como numero.
 *
 * @param valor lo que llego
 */
export function cantidadSinCobertura (valor: unknown): number {
  if (Array.isArray(valor)) return valor.length

  return typeof valor === 'number' && Number.isFinite(valor) && valor > 0 ? Math.floor(valor) : 0
}

/**
 * Normaliza lo que devuelve la API a la forma que la pantalla usa.
 *
 * @param bruto el `data` del sobre
 */
export function configuracionDesdeApi (bruto: unknown): ConfiguracionPortalGoogle {
  if (typeof bruto !== 'object' || bruto === null) return CONFIGURACION_VACIA

  const dato = bruto as Record<string, unknown>
  const dominios = Array.isArray(dato.dominios)
    ? dato.dominios.flatMap((d: unknown): DominioDelPortal[] => {
      if (typeof d !== 'object' || d === null) return []
      const { dominio, incluir_subdominios: comodin } = d as Record<string, unknown>

      return typeof dominio === 'string'
        ? [{ dominio: normalizarDominio(dominio), incluir_subdominios: comodin === true || comodin === 1 }]
        : []
    })
    : []

  return {
    configurado: dato.configurado === true,
    google_client_id: typeof dato.google_client_id === 'string' ? dato.google_client_id : '',
    exigir_google: dato.exigir_google === true || dato.exigir_google === 1,
    dominios,
    global_habilitado: dato.global_habilitado === true,
    contactos_sin_cobertura: cantidadSinCobertura(dato.contactos_sin_cobertura)
  }
}

/** Cómo se dice cada código de rechazo de un dominio (`dominios.N.*`). */
function fraseDeDominio (codigo: string, dominio: string): string | null {
  switch (codigo) {
    case 'invalid': return `«${dominio}» no es un dominio válido.`
    case 'free_mail': return `«${dominio}» es un correo gratuito (Gmail, Outlook…) y no se puede registrar.`
    case 'duplicate': return `«${dominio}» está repetido.`
    case 'public_suffix': return `«${dominio}» es un sufijo público: no admite subdominios.`
    default: return null
  }
}

/** Cómo se dice un rechazo de los campos que no son de un dominio concreto. */
function fraseDeCampo (campo: string, codigo: string): string | null {
  const frases: Record<string, Record<string, string>> = {
    google_client_id: { required: 'Falta el Client ID.', invalid: 'El Client ID no tiene un formato válido.' },
    dominios: {
      required: 'Agrega al menos un dominio.',
      too_many: `Se pueden registrar hasta ${MAX_DOMINIOS_PORTAL} dominios por cliente.`,
      invalid: 'La lista de dominios no es válida.'
    },
    exigir_google: { requires_domains: 'Para exigir Google hace falta al menos un dominio.' }
  }

  return frases[campo]?.[codigo] ?? null
}

/**
 * Traduce el `details` de un `422` del `PUT` a frases para quien edita.
 *
 * Las claves son `google_client_id`, `exigir_google`, `dominios` y `dominios.N.dominio|incluir_subdominios`
 * (N es la posición en la lista enviada, de ahí se saca el nombre del dominio). Lo que no se reconoce se
 * omite: quien llama cae al mensaje general de la API.
 *
 * @param detalles el `details` del error
 * @param enviados la lista que se mandó, para nombrar el dominio de cada `dominios.N`
 * @returns frases sin repetir, vacío si no hubo nada reconocible
 */
export function frasesDeRechazo (detalles: Record<string, unknown> | undefined, enviados: DominioDelPortal[]): string[] {
  if (detalles === undefined) return []

  const frases = new Set<string>()

  for (const [clave, valor] of Object.entries(detalles)) {
    const codigos = Array.isArray(valor) ? valor.filter((c): c is string => typeof c === 'string') : []
    const enDominio = /^dominios\.(\d+)\./.exec(clave)

    for (const codigo of codigos) {
      const frase = enDominio !== null
        ? fraseDeDominio(codigo, enviados[Number(enDominio[1])]?.dominio ?? 'ese dominio')
        : fraseDeCampo(clave, codigo)

      if (frase !== null) frases.add(frase)
    }
  }

  return [...frases]
}

/** Las dos puertas por las que se puede intentar entrar al portal. */
export type ViaDelPortal = 'clave' | 'google'

/**
 * Traduce el rechazo de `/api/sesion` en el portal a algo accionable.
 *
 * El codigo del contrato manda sobre el estado HTTP, y la via cuenta: un `401` por Google no es
 * «contraseña incorrecta». Con Google exigido no se ofrece la contraseña como salida, porque no
 * serviria.
 *
 * @param codigo el `codigo` del cuerpo de error
 * @param estado el estado HTTP
 * @param mensaje el texto de la API, usado solo cuando nada lo explica mejor
 * @param via de donde venia la credencial
 * @param exigido si el cliente de esta persona exige Google
 */
export function mensajeDeEntradaAlPortal (
  codigo: string | undefined,
  estado: number,
  mensaje: string | undefined,
  via: ViaDelPortal,
  exigido: boolean
): string {
  if (codigo === 'rate_limited' || estado === 429) {
    return 'Demasiados intentos fallidos. Espera unos minutos antes de volver a probar.'
  }
  if (codigo === 'google_required') {
    return 'Tu empresa entra al portal con Google. Usa el botón de Google con tu cuenta de trabajo.'
  }
  if (codigo === 'forbidden' || estado === 403) {
    return 'Tu acceso está desactivado. Escríbenos y lo revisamos.'
  }
  if (via === 'google') return mensajeDeGoogle(estado, exigido)
  if (estado === 401) return 'Correo o contraseña incorrectos.'

  return mensaje ?? 'No se pudo entrar. Intenta de nuevo.'
}

/** El rechazo de la via de Google, segun el estado y si la contraseña sigue siendo una salida. */
function mensajeDeGoogle (estado: number, exigido: boolean): string {
  const salida = exigido ? '' : ' También puedes entrar con tu contraseña.'

  if (estado === 404) return `El acceso con Google no está disponible ahora.${salida}`
  if (estado === 503) return `Google no responde en este momento. Intenta de nuevo en un rato.${salida}`
  if (estado === 401) {
    return `No pudimos entrar con esa cuenta de Google. Revisa que sea tu cuenta de trabajo, la misma del correo que escribiste.${salida}`
  }

  return `No se pudo entrar con Google. Intenta de nuevo.${salida}`
}

/** Frase corta de la regla guardada, para el aviso de guardado y para quien solo puede leer. */
export function fraseDeConfiguracion (config: ConfiguracionPortalGoogle): string {
  if (!config.configurado) return 'Los contactos de este cliente entran al portal solo con su contraseña.'

  return config.exigir_google
    ? 'Los contactos de este cliente entran al portal solo con Google.'
    : 'Los contactos de este cliente pueden entrar al portal con Google o con su contraseña.'
}

/** Como se lee un dominio de la lista: el comodin se explica con palabras, no con un asterisco. */
export function etiquetaDeDominio (dominio: DominioDelPortal): string {
  return dominio.incluir_subdominios ? `${dominio.dominio} y sus subdominios` : dominio.dominio
}
