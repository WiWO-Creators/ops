import { GLOSARIO } from './glosario.ts'
import { PESTANIAS_PROYECTO } from '../definiciones/portal-proyectos.ts'
import { LOCALE, ZONA_NEGOCIO } from '../lib/fechas.ts'

/**
 * Lectura de la actividad de los contactos en el portal: etiquetas, rankings y series.
 *
 * La API entrega rutas, pestañas y claves de boton; las frases legibles se arman aca, igual que en
 * la presencia del panel. Una ruta que este catalogo no conoce se muestra con su ruta, nunca con un
 * nombre inventado.
 */

export interface VistaRanking {
  ruta: string
  pestana: string | null
  visitas: number
  segundos: number
}

export interface ProyectoVisto {
  id: number
  nombre: string | null
  visitas: number
  segundos: number
}

export interface ClickRanking {
  objetivo: string
  clicks: number
}

export interface DiaDeActividad {
  dia: string
  sesiones: number
  segundos: number
}

export interface ContactoActivo {
  id: number
  nombre: string
  email: string
  sesiones: number
  segundos: number
  ultima_visita: string | null
  vista_favorita: string | null
}

/** `GET /clients/{id}/portal-activity`. */
export interface ActividadDeCliente {
  desde: string
  hasta: string
  kpis: {
    sesiones: number
    contactos_activos: number
    segundos_activos: number
    mediana_segundos: number
    ultima_visita: string | null
  }
  por_dia: DiaDeActividad[]
  vistas: VistaRanking[]
  proyectos: ProyectoVisto[]
  clicks: ClickRanking[]
  contactos: ContactoActivo[]
}

export interface PasoDeSesion {
  tipo: 'vista' | 'pestana' | 'click'
  ruta: string
  pestana: string | null
  objetivo: string | null
  objeto_id: number | null
  segundos: number | null
  a: string | null
}

/** Una fila de `GET /contacts/{id}/portal-activity`. */
export interface SesionDeContacto {
  sesion: string
  inicio: string | null
  segundos: number
  dispositivo: 'movil' | 'escritorio'
  eventos: number
  suplantado_por: { id: number, full_name: string } | null
  pasos: PasoDeSesion[]
}

export interface FilaDeRanking {
  clave: string
  etiqueta: string
  visitas: number
  segundos: number
  nunca: boolean
}

/** Rangos que ofrece el panel, en dias. */
export const RANGOS_DE_ACTIVIDAD = [7, 30, 90] as const

const PAGINAS: Array<{ ruta: string, etiqueta: string }> = [
  { ruta: '/portal', etiqueta: 'Inicio' },
  { ruta: '/portal/proyectos', etiqueta: `Lista de ${GLOSARIO.espacio.plural}` },
  { ruta: '/portal/proyectos/:id', etiqueta: `Detalle de un ${GLOSARIO.espacio.singular}` },
  { ruta: '/portal/reporte', etiqueta: 'Reporte mensual' },
  { ruta: '/portal/gestion', etiqueta: 'Control de gestión' },
  { ruta: '/portal/soporte', etiqueta: GLOSARIO.ticket.plural },
  { ruta: '/portal/soporte/:id', etiqueta: 'Detalle de un ticket' },
  { ruta: '/portal/archivos', etiqueta: 'Archivos' },
  { ruta: '/portal/anuncios', etiqueta: 'Anuncios' },
  { ruta: '/portal/ayuda', etiqueta: 'Ayuda' },
  { ruta: '/portal/perfil', etiqueta: 'Mi perfil' }
]

const PESTANAS_POR_CLAVE = new Map<string, string>(PESTANIAS_PROYECTO.map((p) => [p.clave, p.etiqueta]))

const CLICKS_CONOCIDOS: Record<string, string> = {
  'ticket.nuevo': 'Nuevo ticket',
  'ticket.cancelar': 'Cancelar un ticket nuevo',
  'ticket.enviar': 'Enviar un ticket',
  'aprobacion.aprobar': 'Aprobar una tarea',
  'aprobacion.rechazar': 'Rechazar una tarea',
  'aprobacion.cambiar': 'Responder de nuevo una aprobación',
  'aprobacion.cancelar': 'Cancelar un rechazo',
  'aprobacion.comentar': 'Enviar un comentario de rechazo',
  'resumen.generar': 'Generar el resumen de la semana',
  'resumen.saltar': 'Saltar la animación del resumen',
  'resumen.reintentar': 'Reintentar el resumen',
  'tablero.ver-mes': 'Cambiar el mes del tablero',
  'tema.cambiar': 'Cambiar el tema',
  'sesion.salir': 'Salir del portal',
  'orbe.alternar': 'Abrir o cerrar el asistente',
  'orbe.cerrar': 'Cerrar el asistente',
  'tarea.abrir': 'Abrir una tarea',
  'enlace.externo': 'Enlace a otro sitio',
  'enlace.otro': 'Otro enlace del portal',
  'boton.sin-rotulo': 'Botón sin nombre'
}

/** Texto de una clave tecnica: `una-clave.larga` queda `Una clave larga`. */
function humanizar (clave: string): string {
  const texto = clave.replace(/[.\-_]+/g, ' ').trim()

  return texto === '' ? clave : texto.charAt(0).toUpperCase() + texto.slice(1)
}

/**
 * Duracion corta para una celda: `45 s`, `3 min`, `1 h 12 min`.
 *
 * @param segundos duracion en segundos; lo negativo o invalido se lee como cero
 */
export function formatearDuracion (segundos: number): string {
  const total = Number.isFinite(segundos) && segundos > 0 ? Math.round(segundos) : 0

  if (total < 60) return `${total} s`

  const minutos = Math.round(total / 60)

  if (minutos < 60) return `${minutos} min`

  const horas = Math.floor(minutos / 60)
  const resto = minutos % 60

  return resto === 0 ? `${horas} h` : `${horas} h ${resto} min`
}

/**
 * Hora de un instante ISO en la zona del negocio, sin fecha: `14:03`.
 *
 * @param instante ISO-8601 UTC, o `null`
 * @returns la hora, o cadena vacia si no hay instante valido
 */
export function formatearHora (instante: string | null): string {
  if (instante === null) return ''

  const fecha = new Date(instante)

  return Number.isNaN(fecha.getTime())
    ? ''
    : new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: ZONA_NEGOCIO }).format(fecha)
}

/** Etiqueta de una pestaña de Proyecto: la del portal si se conoce, y la clave si no. */
export function etiquetaDePestana (clave: string): string {
  return PESTANAS_POR_CLAVE.get(clave) ?? humanizar(clave)
}

/**
 * Etiqueta de una ruta del portal. Una ruta de detalle con id y nombre conocido dice el nombre:
 * `Proyecto «DELCO»`. Sin nombre cae al generico, nunca a "Proyecto 42".
 *
 * @param ruta ruta del evento, con ids reales o ya normalizada con `:id`
 * @param nombres nombres de proyectos que devolvio la API, por id
 */
export function etiquetaDeRuta (ruta: string, nombres: Record<string, string> = {}): string {
  const coincide = /^\/portal\/proyectos\/(\d+)$/.exec(ruta)
  const id = coincide?.[1]
  const nombre = id === undefined ? undefined : nombres[id]

  if (nombre !== undefined) return `${GLOSARIO.espacio.singular} «${nombre}»`

  const normal = ruta.replace(/\/\d+(?=\/|$)/g, '/:id')

  return PAGINAS.find((p) => p.ruta === normal)?.etiqueta ?? ruta
}

/** Etiqueta de un boton a partir de su clave (`data-rastreo`, `pestana.x`, `enlace.x`, `boton.x`). */
export function etiquetaDeClick (objetivo: string): string {
  const conocida = CLICKS_CONOCIDOS[objetivo]

  if (conocida !== undefined) return conocida
  if (objetivo.startsWith('pestana.')) return `Pestaña ${etiquetaDePestana(objetivo.slice(8))}`
  if (objetivo.startsWith('enlace.')) return `Enlace a ${humanizar(objetivo.slice(7).replace(/\.id\b/g, '')).toLowerCase()}`
  if (objetivo.startsWith('boton.')) return humanizar(objetivo.slice(6))

  return humanizar(objetivo)
}

/**
 * Frase de un paso de sesion: lo que hizo el contacto, en lenguaje de equipo.
 *
 * @param paso evento tal como lo devuelve la API
 * @param nombres nombres de proyectos que devolvio la API
 */
export function fraseDePaso (paso: PasoDeSesion, nombres: Record<string, string> = {}): string {
  if (paso.tipo === 'click') return `Pulsó «${etiquetaDeClick(paso.objetivo ?? '')}»`
  if (paso.tipo === 'pestana') return `Abrió la pestaña ${etiquetaDePestana(paso.pestana ?? '')}`

  return `Entró a ${etiquetaDeRuta(paso.ruta, nombres)}`
}

/** El catalogo completo de lo que un contacto puede abrir: paginas y pestañas de un Proyecto. */
function catalogoDeVistas (): FilaDeRanking[] {
  const paginas = PAGINAS.map((p) => ({ clave: p.ruta, etiqueta: p.etiqueta, visitas: 0, segundos: 0, nunca: true }))
  const pestanas = PESTANIAS_PROYECTO.map((p) => ({
    clave: `/portal/proyectos/:id#${p.clave}`,
    etiqueta: `Pestaña ${p.etiqueta}`,
    visitas: 0,
    segundos: 0,
    nunca: true
  }))

  return [...paginas, ...pestanas]
}

/**
 * Cruza el ranking de la API con el catalogo de todo lo abrible, para decir tambien lo que NUNCA se
 * abrio, que es lo que mas cuesta ver mirando solo los numeros.
 *
 * @param vistas ranking de la API
 * @param nombres nombres de proyectos que devolvio la API
 * @returns todo el catalogo ordenado de mas a menos visto; lo no visto al final, por etiqueta
 */
export function rankingDeVistas (vistas: VistaRanking[], nombres: Record<string, string> = {}): FilaDeRanking[] {
  const filas = new Map(catalogoDeVistas().map((f) => [f.clave, f]))

  for (const v of vistas) {
    const clave = v.pestana === null ? v.ruta : `${v.ruta}#${v.pestana}`
    const previa = filas.get(clave)
    const etiqueta = previa?.etiqueta ??
      (v.pestana === null ? etiquetaDeRuta(v.ruta, nombres) : `Pestaña ${etiquetaDePestana(v.pestana)}`)

    filas.set(clave, { clave, etiqueta, visitas: v.visitas, segundos: v.segundos, nunca: false })
  }

  return [...filas.values()].sort((a, b) =>
    b.visitas - a.visitas || a.etiqueta.localeCompare(b.etiqueta, 'es'))
}

/**
 * Los extremos del ranking: lo mas visto (solo lo que se abrio) y lo menos visto (de atras hacia
 * adelante, empezando por lo que nunca se abrio).
 *
 * @param ranking salida de `rankingDeVistas`
 * @param n filas por lado
 */
export function extremosDelRanking (ranking: FilaDeRanking[], n: number): { mas: FilaDeRanking[], menos: FilaDeRanking[] } {
  const mas = ranking.filter((f) => !f.nunca).slice(0, n)
  const enMas = new Set(mas.map((f) => f.clave))
  const menos = [...ranking].reverse().filter((f) => !enMas.has(f.clave)).slice(0, n)

  return { mas, menos }
}

/**
 * Serie diaria continua entre dos fechas: los dias sin actividad valen cero y no se saltan, porque
 * un hueco en el eje se lee como "ese dia no existe" y no como "no entro nadie".
 *
 * @param desde `YYYY-MM-DD`
 * @param hasta `YYYY-MM-DD`
 * @param dias lo que devolvio la API
 */
export function serieContinua (desde: string, hasta: string, dias: DiaDeActividad[]): DiaDeActividad[] {
  const porDia = new Map(dias.map((d) => [d.dia, d]))
  const salida: DiaDeActividad[] = []
  const fin = Date.parse(`${hasta}T00:00:00Z`)

  for (let t = Date.parse(`${desde}T00:00:00Z`); t <= fin && salida.length < 400; t += 86_400_000) {
    const dia = new Date(t).toISOString().slice(0, 10)

    salida.push(porDia.get(dia) ?? { dia, sesiones: 0, segundos: 0 })
  }

  return salida
}

/** Ancho de una barra como fraccion de 0 a 1 respecto del maximo; el maximo cero da cero. */
export function fraccionDeBarra (valor: number, maximo: number): number {
  return maximo > 0 && valor > 0 ? Math.min(1, valor / maximo) : 0
}
