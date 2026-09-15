/**
 * La logica de la pantalla de area: que escenas hay, en que orden, cuanto dura cada una y que hacer
 * cuando los datos se ponen viejos.
 *
 * Todo aca es puro: entra el paquete de la API y los parametros de la URL, sale una lista. No hay un
 * solo `window`, `document` ni `Date.now()` implicito. Es a proposito — esta es la parte del modulo
 * que se puede romper de formas que nadie nota mirando la pantalla (una escena que desaparece y
 * reinicia la rotacion, un paginado que esconde gente sin decirlo), y eso se prueba con
 * `node --test`, no abriendo un navegador.
 *
 * Se llama `pantalla-area` y no `pantalla` porque `src/dominio/pantalla.ts` ya existe y es otra cosa:
 * normaliza el pathname para el latido de presencia.
 */
import type { EscenaDeApi, PaqueteDePantalla } from '@/datos/pantalla-area'

/** Los tipos de escena que la pantalla sabe dibujar, en el orden en que se muestran. */
export const CLASES_DE_ESCENA = ['portada', 'trabajando', 'cronometros', 'procesos', 'espacios'] as const

export type ClaseDeEscena = typeof CLASES_DE_ESCENA[number]

/** Como esta puesto el televisor. Lo decide su proporcion, no una configuracion. */
export type Orientacion = 'horizontal' | 'vertical'

/**
 * Cuantas fichas entran por escena, segun como este puesto el televisor.
 *
 * No son numeros elegidos por gusto ni por estetica: salen de medir. A cuatro metros la altura de
 * mayuscula tiene que rondar los 2 cm —~45 px de cuerpo para un nombre a 1080p—, y con esa escala y
 * los margenes, en la banda util entran exactamente estas cantidades. Cambiarlas sin cambiar la
 * escala es achicar la letra para que entre, que es lo que no hay que hacer: si no entra, se pagina.
 *
 * La banda util es lo que queda del alto tras la cabecera, el titulo de escena y el pie. En
 * horizontal (1920x1080) son ~840 px; en vertical (1080x1920), ~1670. Por eso la columna vertical
 * lleva mas del doble de filas, y a la vez menos columnas: `vmin` es el mismo en las dos
 * orientaciones —el lado corto siempre mide 1080— asi que las fichas miden igual y lo unico que
 * cambia es cuantas caben.
 *
 * `pruebas/pantalla-area.browser.mjs` mide cada ficha contra su marco en las dos orientaciones: si
 * alguno de estos numeros se pasa, la prueba lo dice. No hay forma de que un desborde pase
 * inadvertido — `overflow: hidden` no produce barra de scroll, solo corta.
 */
export const REJILLAS: Record<Orientacion, Record<ClaseDeEscena, number>> = {
  horizontal: {
    portada: 1,
    // Cuatro columnas por tres filas de fichas de ~150 px.
    trabajando: 12,
    // Filas anchas de ~140 px. Con ocho —el numero con el que nacio— la sexta y la septima quedaban
    // cortadas sin que nada avisara.
    cronometros: 5,
    procesos: 5,
    // Dos columnas por tres filas de ~218 px.
    espacios: 6
  },
  vertical: {
    portada: 1,
    // Dos columnas, muchas mas filas: es donde el formato vertical se paga solo.
    trabajando: 14,
    cronometros: 9,
    procesos: 10,
    // Una sola columna: dos de ~500 px de ancho dejan los nombres de Proyecto en dos lineas.
    espacios: 6
  }
}

/** Nunca mas de estas paginas por escena: mas alla, la vuelta entera se vuelve demasiado larga. */
export const TOPE_DE_PAGINAS = 3

/** Una escena ya resuelta, lista para dibujar. */
export interface Escena {
  /** Identidad estable. Es lo unico de lo que depende la rotacion; ver `firmaDelGuion`. */
  id: string
  clase: ClaseDeEscena
  duracionMs: number
  /** Los items de ESTA pagina. La portada no tiene. */
  items: unknown[]
  /** Cuantos quedaron fuera del corte, para el "+N mas" del pie. */
  ocultos: number
  /** La escena de la API, tal cual, para que el componente lea sus campos propios. */
  origen: EscenaDeApi
}

/** Lo que la URL puede elegir. Nada de esto viaja a la API. */
export interface ParametrosDePantalla {
  /**
   * Segundos por escena, o `null` para respetar lo configurado por area.
   *
   * `null` es el caso normal. Un numero solo llega cuando la URL trae `?escena=`, y entonces pisa la
   * configuracion entera: existe para probar una vuelta rapida y para un televisor que necesite otro
   * ritmo, no para configurar la pantalla — eso se hace en el panel.
   */
  segundosPorEscena: number | null
  segundosDeRefresco: number
  saltar: ClaseDeEscena[]
  solo: ClaseDeEscena | null
  tema: 'oscuro' | 'claro'
  transicion: 'fundido' | 'vista' | 'ninguna'
  zoom: number
  /**
   * Margen extra en los bordes, en `vmin`.
   *
   * Existe por el **overscan**: muchos televisores recortan un 3% de la imagen que les llega por
   * HDMI, y en una pantalla casteada eso se come el reloj de la esquina y el pie. No hay forma de
   * detectarlo desde el navegador —el aparato miente sobre su resolucion— asi que se ajusta a ojo,
   * una vez, mirando la pared.
   */
  margen: number
}

const POR_DEFECTO: ParametrosDePantalla = {
  segundosPorEscena: null,
  segundosDeRefresco: 30,
  saltar: [],
  solo: null,
  tema: 'oscuro',
  transicion: 'fundido',
  zoom: 1,
  margen: 0
}

const LIMITES = {
  escena: { minimo: 5, maximo: 120 },
  // El piso es mas alto que el `LIVE_MINIMO` de 10 s del tablero a proposito: estas pantallas no las
  // mira nadie y pueden ser muchas a la vez, asi que el coste se multiplica sin que nadie lo note.
  refresco: { minimo: 15, maximo: 300 },
  zoom: { minimo: 0.8, maximo: 1.4 },
  // Ocho `vmin` son ~86 px a 1080p: mas que el 3% que recorta el overscan tipico, y el techo a partir
  // del cual la pantalla empieza a desperdiciar mas de lo que salva.
  margen: { minimo: 0, maximo: 8 }
}

/** La portada dura menos que las demas: es un titulo, no una lista que haya que leer. */
const PROPORCION_PORTADA = 0.6

/**
 * Cuanto dura una escena cuando ni la configuracion ni la URL lo dicen.
 *
 * Solo se usa si el backend mando una escena sin `seconds`, que no deberia pasar: es el respaldo para
 * que una respuesta incompleta no deje una escena de cero segundos, o sea un parpadeo.
 */
const SEGUNDOS_DE_RESPALDO = 20

/**
 * Lee los parametros de la URL, acotando en vez de fallar.
 *
 * Un valor mal escrito no puede dejar la pared congelada ni convertirla en un estrobo, asi que todo
 * se recorta a su rango y lo que no se entiende se ignora en silencio. Mismo criterio que
 * `intervaloDeLive()` en `src/datos/live.ts`.
 *
 * Los parametros solo ELIGEN entre valores que este archivo ya conoce. Ninguno transporta datos y
 * ninguno llega a la API: el token es la unica autorizacion y el unico selector.
 */
export function leerParametrosDePantalla (
  crudos: Record<string, string | string[] | undefined>
): ParametrosDePantalla {
  const saltar = listaDeClases(primero(crudos.saltar))
  const solo = unaClase(primero(crudos.solo))

  return {
    segundosPorEscena: acotarOpcional(primero(crudos.escena), LIMITES.escena),
    segundosDeRefresco: acotar(primero(crudos.refresco), POR_DEFECTO.segundosDeRefresco, LIMITES.refresco),
    saltar,
    solo,
    tema: primero(crudos.tema) === 'claro' ? 'claro' : 'oscuro',
    transicion: transicionValida(primero(crudos.transicion)),
    zoom: acotar(primero(crudos.zoom), POR_DEFECTO.zoom, LIMITES.zoom, false),
    margen: acotar(primero(crudos.margen), POR_DEFECTO.margen, LIMITES.margen, false)
  }
}

/**
 * Arma el guion: las escenas que se van a mostrar, ya paginadas y en orden.
 *
 * === LA REGLA DE LO VACIO ===
 *
 * Una escena sin nada que mostrar sale del guion: una pantalla que dice "Ningun cronometro
 * corriendo" durante veinte segundos, cada minuto y medio, todo el dia, es una pantalla que la gente
 * aprende a no mirar.
 *
 * Con una excepcion que no es negociable: **el guion nunca vuelve vacio**. Si no hay absolutamente
 * nada, queda la portada, que es el nombre del area y el reloj. Un area dormida mostrando su nombre y
 * la hora es digna; una pantalla en blanco es un producto roto. Por eso la portada no se puede saltar
 * con `?saltar=` ni quedar fuera por estar vacia.
 *
 * === EL PAGINADO ===
 *
 * Cada pagina es una ENTRADA PROPIA del guion (`trabajando#1`, `trabajando#2`) y no un temporizador
 * anidado dentro de la escena. Es mas simple, alarga la vuelta honestamente cuando el area es grande,
 * y encaja solo con la firma: si el area pasa de una pagina a dos, la firma cambia y la rotacion se
 * entera sin que nadie le avise.
 *
 * Pasado el tope de paginas se corta, y lo que se corto viaja en `ocultos` para que el pie pueda
 * decir "+7 mas". Nunca se miente por omision.
 */
export function construirGuion (
  paquete: PaqueteDePantalla | null,
  parametros: ParametrosDePantalla,
  orientacion: Orientacion = 'horizontal'
): Escena[] {
  if (paquete === null) return []

  const guion: Escena[] = []

  for (const escena of paquete.scenes) {
    if (!esClaseConocida(escena.kind)) continue
    if (parametros.solo !== null && escena.kind !== parametros.solo) continue
    if (parametros.solo === null && parametros.saltar.includes(escena.kind)) continue

    const duracion = duracionDe(escena, parametros)

    if (escena.kind === 'portada') {
      guion.push({
        id: 'portada',
        clase: 'portada',
        duracionMs: duracion,
        items: [],
        ocultos: 0,
        origen: escena
      })
      continue
    }

    guion.push(...paginar(escena, duracion, orientacion))
  }

  if (guion.length > 0) return guion

  // Ni una escena encendida con contenido, o un `?solo=` que no dejo nada en pie. La portada suele
  // viajar; si tampoco estuviera, se arma una con los contadores en cero antes que devolver nada.
  return [portadaDeRespaldo(paquete, parametros)]
}

/**
 * Cuanto dura una escena, en milisegundos.
 *
 * **Manda la configuracion del area**, que llega en `seconds`: es la que se edita desde el panel, sin
 * subir a ninguna escalera. El `?escena=` de la URL la pisa, y existe para probar —una vuelta entera
 * a cinco segundos por escena— y para el televisor raro que necesita otro ritmo.
 *
 * Sin ninguno de los dos, la portada dura menos que las demas: es un titulo, no una lista que haya
 * que leer.
 */
function duracionDe (escena: EscenaDeApi, parametros: ParametrosDePantalla): number {
  if (parametros.segundosPorEscena !== null) {
    const base = parametros.segundosPorEscena * 1000

    return escena.kind === 'portada' ? Math.round(base * PROPORCION_PORTADA) : base
  }

  if (typeof escena.seconds === 'number' && escena.seconds > 0) {
    return escena.seconds * 1000
  }

  const base = SEGUNDOS_DE_RESPALDO * 1000

  return escena.kind === 'portada' ? Math.round(base * PROPORCION_PORTADA) : base
}

/**
 * La firma del guion: la identidad de la lista, no la de sus datos.
 *
 * === POR QUE EXISTE ===
 *
 * El guion se recalcula en cada render, asi que es un arreglo NUEVO cada vez. Un
 * `useEffect(..., [guion])` se volveria a ejecutar en cada sondeo y reiniciaria el temporizador de la
 * escena actual: la pantalla se quedaria clavada en la primera escena para siempre, y el bug se ve
 * solo si alguien se queda mirando la pared un minuto entero.
 *
 * Con la firma, la rotacion depende de un string. Un sondeo que trae los mismos segundos actualizados
 * produce la misma firma y el efecto no vuelve a correr. Solo cambia cuando aparece o desaparece una
 * escena, que es exactamente cuando la rotacion SI tiene que enterarse.
 */
export function firmaDelGuion (guion: Escena[]): string {
  return guion.map((escena) => escena.id).join('|')
}

/**
 * A que escena saltar cuando la actual desaparecio del guion.
 *
 * Caso real: son las 18:05, la ultima persona cierra su jornada, la escena "trabajando" se vacia y
 * sale. Si la posicion se guardara por indice, todos los indices se correrian y la pantalla saltaria
 * al principio en mitad de una escena.
 *
 * Devuelve el indice de la primera escena que venga DESPUES de la que murio, segun el orden de
 * clases; si no hay ninguna despues, vuelve al principio. Nunca devuelve -1: el guion nunca esta
 * vacio cuando se llama a esto.
 */
export function proximaEscenaViva (guion: Escena[], idAnterior: string): number {
  if (guion.length === 0) return 0

  const claseAnterior = idAnterior.split('#')[0] as ClaseDeEscena
  const posicionAnterior = CLASES_DE_ESCENA.indexOf(claseAnterior)

  if (posicionAnterior < 0) return 0

  const siguiente = guion.findIndex(
    (escena) => CLASES_DE_ESCENA.indexOf(escena.clase) > posicionAnterior
  )

  return siguiente >= 0 ? siguiente : 0
}

/** Que tan al dia estan los datos que se estan mostrando. */
export type Frescura = 'fresco' | 'viejo' | 'sin-conexion'

/**
 * Decide la frescura a partir de la edad del ultimo dato bueno.
 *
 * Tres tramos, y el primero importa tanto como los otros dos: **un solo sondeo fallido no cambia
 * nada**. Un parpadeo de red no puede hacer titilar una pared; la gente que pasa por delante lee el
 * aviso, no el dato, y una pantalla que avisa por cualquier cosa deja de avisar de las que importan.
 *
 * Pasado el tramo 'viejo', la pantalla deja de contar los cronometros: un contador que sigue trepando
 * con la conexion muerta es una mentira, y esta pared la leen jefaturas de area.
 */
export function frescuraDe (edadMs: number, intervaloMs: number): Frescura {
  if (edadMs <= intervaloMs * 3) return 'fresco'
  if (edadMs <= 10 * 60 * 1000) return 'viejo'

  return 'sin-conexion'
}

/**
 * El intervalo de sondeo despues de `fallos` seguidos, con backoff.
 *
 * Se duplica en cada fallo hasta un techo de cinco minutos, y vuelve a la base al primer acierto. Un
 * corte de seis horas con cuarenta televisores no puede convertirse en un martillo contra la API.
 */
export function intervaloConBackoff (baseMs: number, fallos: number): number {
  const TECHO_MS = 5 * 60 * 1000

  if (fallos <= 0) return baseMs

  return Math.min(baseMs * 2 ** Math.min(fallos, 10), TECHO_MS)
}

/**
 * El milisegundo del proximo recargado duro, con dispersion derivada del token.
 *
 * Una pagina que vive meses acumula lo que ningun `clearInterval` limpia: memoria del motor de JS,
 * cache de imagenes, y el despliegue nuevo que nunca va a ver porque nadie recarga. Una recarga
 * diaria de madrugada resuelve las tres.
 *
 * La dispersion no es cosmetica: sin ella, cuarenta televisores recargan en el mismo segundo y le
 * pegan a la API todos juntos. Sale del token para que cada aparato caiga siempre en el mismo
 * momento, y no en uno distinto por recarga.
 *
 * @param ahora  el reloj del navegador, en ms
 * @param token  el de la URL; solo se usa su forma, nunca se manda a ningun lado
 * @param hora   hora local del recargado, 0 a 23
 */
export function proximoRecargado (ahora: number, token: string, hora = 4): number {
  const fecha = new Date(ahora)
  const objetivo = new Date(ahora)

  objetivo.setHours(hora, 0, 0, 0)

  if (objetivo.getTime() <= fecha.getTime()) {
    objetivo.setDate(objetivo.getDate() + 1)
  }

  let suma = 0
  for (let i = 0; i < token.length; i++) suma += token.charCodeAt(i)

  return objetivo.getTime() + (suma % 900) * 1000
}

// -- Piezas -------------------------------------------------------------------------------------

/**
 * Parte una escena con items en tantas paginas como haga falta, hasta el tope.
 *
 * Una escena sin items no devuelve ninguna pagina: es lo que la saca del guion.
 */
function paginar (escena: EscenaDeApi, duracionMs: number, orientacion: Orientacion): Escena[] {
  const items = 'items' in escena ? escena.items : []

  if (items.length === 0) return []

  const porPagina = REJILLAS[orientacion][escena.kind as ClaseDeEscena]
  const paginas = Math.min(Math.ceil(items.length / porPagina), TOPE_DE_PAGINAS)
  const mostrados = Math.min(items.length, paginas * porPagina)

  const escenas: Escena[] = []

  for (let pagina = 0; pagina < paginas; pagina++) {
    const desde = pagina * porPagina

    escenas.push({
      // El `#n` solo aparece cuando hay mas de una pagina: asi un area chica conserva la misma firma
      // aunque le entre o le salga una persona, y la rotacion no se entera de un cambio que no es.
      id: paginas === 1 ? escena.kind : `${escena.kind}#${pagina + 1}`,
      clase: escena.kind as ClaseDeEscena,
      duracionMs,
      items: items.slice(desde, desde + porPagina),
      // Los que no entraron se cuentan en la ULTIMA pagina, que es donde el pie los va a nombrar.
      ocultos: pagina === paginas - 1 ? items.length - mostrados : 0,
      origen: escena
    })
  }

  return escenas
}

/** Una portada armada a mano, para el caso en que el guion se quedaria vacio. */
function portadaDeRespaldo (paquete: PaqueteDePantalla, parametros: ParametrosDePantalla): Escena {
  const dePaquete = paquete.scenes.find((escena) => escena.kind === 'portada')
  const base = (parametros.segundosPorEscena ?? SEGUNDOS_DE_RESPALDO) * 1000

  return {
    id: 'portada',
    clase: 'portada',
    duracionMs: Math.round(base * PROPORCION_PORTADA),
    items: [],
    ocultos: 0,
    origen: dePaquete ?? {
      kind: 'portada',
      counts: {
        personas: 0,
        jornadas_abiertas: 0,
        cronometros_corriendo: 0,
        procesos_abiertos: 0,
        procesos_atrasados: 0,
        espacios_activos: 0
      }
    }
  }
}

function esClaseConocida (clase: string): clase is ClaseDeEscena {
  return (CLASES_DE_ESCENA as readonly string[]).includes(clase)
}

function primero (valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor
}

/**
 * Como `acotar`, pero devuelve `null` cuando la URL no dijo nada.
 *
 * La diferencia importa: `null` significa "respeta lo configurado", y un numero por defecto en su
 * lugar pisaria la configuracion del area sin que nadie lo haya pedido.
 */
function acotarOpcional (
  crudo: string | undefined,
  limites: { minimo: number, maximo: number }
): number | null {
  const numero = Number(crudo)

  if (crudo === undefined || !Number.isFinite(numero) || numero <= 0) return null

  return Math.round(Math.min(Math.max(numero, limites.minimo), limites.maximo))
}

function acotar (
  crudo: string | undefined,
  porDefecto: number,
  limites: { minimo: number, maximo: number },
  entero = true
): number {
  const numero = Number(crudo)

  if (!Number.isFinite(numero) || numero <= 0) return porDefecto

  const acotado = Math.min(Math.max(numero, limites.minimo), limites.maximo)

  return entero ? Math.round(acotado) : acotado
}

/** Las clases nombradas en una lista separada por comas. Lo que no se reconoce se ignora. */
function listaDeClases (crudo: string | undefined): ClaseDeEscena[] {
  if (crudo === undefined || crudo === '') return []

  return crudo
    .split(',')
    .map((pieza) => pieza.trim())
    // La portada no se puede saltar: es lo que impide que el guion quede vacio.
    .filter((pieza): pieza is ClaseDeEscena => esClaseConocida(pieza) && pieza !== 'portada')
}

/** Una clase sola, o `null` si no se reconoce — y entonces el guion completo, nunca uno vacio. */
function unaClase (crudo: string | undefined): ClaseDeEscena | null {
  if (crudo === undefined) return null

  return esClaseConocida(crudo) ? crudo : null
}

function transicionValida (crudo: string | undefined): ParametrosDePantalla['transicion'] {
  return crudo === 'vista' || crudo === 'ninguna' ? crudo : 'fundido'
}
