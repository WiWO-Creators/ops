/**
 * La forma de la navegacion del panel: que secciones hay, como se agrupan y cual esta activa.
 *
 * Vive en un `.ts` y no dentro de `BarraLateral.tsx` por la regla de las pruebas: Node despoja los
 * tipos de un `.ts` pero no el JSX de un `.tsx`, y el agrupado es justo la clase de logica que se
 * rompe en silencio —una seccion que cae en el bloque equivocado, o dos items marcados como
 * activos a la vez—.
 *
 * === Quien decide que se ve ===
 *
 * Esto NO decide permisos. `seccionesDe()` en `(panel)/layout.tsx` filtra por permisos igual que
 * siempre y a cada seccion le pone su `grupo`; aca solo se ordena lo que ya llego. Si una seccion
 * no esta en la lista de entrada, no aparece en ningun bloque.
 */

/**
 * Claves de icono de la barra. El componente de Lucide se resuelve en `BarraLateral`, porque no
 * cruza la frontera servidor-cliente; aca solo viaja el nombre.
 */
export const ICONOS_SECCION = [
  'inicio', 'live', 'mis_tareas', 'procesos', 'recurrentes', 'tickets', 'espacios', 'licitaciones', 'upsells',
  'salas', 'teletrabajo', 'clientes', 'focals', 'equipo', 'mi_area', 'organigrama',
  'administracion', 'auditoria', 'papelera'
] as const

export type IconoSeccion = typeof ICONOS_SECCION[number]

/** Bloque del menu al que pertenece una seccion. `principal` va arriba y sin encabezado. */
export type GrupoSeccion = 'principal' | 'operacion' | 'comercial' | 'equipo' | 'administracion'

/** Subgrupo plegable dentro de un bloque. Hoy hay uno solo: las dos formas de reunirse. */
export type PlegableSeccion = 'reuniones'

export interface Seccion {
  href: string
  etiqueta: string
  icono: IconoSeccion
  grupo: GrupoSeccion
  /** Si va dentro de un subgrupo plegable de su bloque. */
  plegable?: PlegableSeccion
}

/**
 * Las cuatro entradas principales, en el orden en que se muestran.
 *
 * Es contrato compartido con la barra inferior de movil, que dibuja estas mismas cuatro mas "Más":
 * cambiar el orden o el conjunto aca cambia las dos navegaciones a la vez, que es lo que se quiere.
 */
export const HREFS_PRINCIPALES = ['/inicio', '/mis-tareas', '/live', '/proyectos'] as const

/**
 * Los bloques con encabezado, en el orden del menu.
 *
 * Todos se pliegan. `abiertoPorDefecto` es como los ve quien nunca toco su encabezado: los del dia a
 * dia abiertos, los de consulta ocasional cerrados, para que el menu entero entre en una pantalla
 * de laptop sin scroll.
 */
export const BLOQUES: ReadonlyArray<{ id: Exclude<GrupoSeccion, 'principal'>, titulo: string, abiertoPorDefecto: boolean }> = [
  { id: 'operacion', titulo: 'Operación', abiertoPorDefecto: true },
  { id: 'comercial', titulo: 'Comercial', abiertoPorDefecto: true },
  { id: 'equipo', titulo: 'Equipo', abiertoPorDefecto: false },
  { id: 'administracion', titulo: 'Administración', abiertoPorDefecto: false }
]

/** Id del bloque de fijados entre los plegables recordados. No es un `GrupoSeccion`: no tiene secciones. */
export const ID_BLOQUE_FIJADOS = 'fijados'

/** Como se titula cada subgrupo plegable. */
export const TITULOS_PLEGABLES: Record<PlegableSeccion, string> = {
  reuniones: 'Reuniones'
}

export interface PlegableDeNavegacion {
  id: PlegableSeccion
  titulo: string
  secciones: Seccion[]
}

export interface BloqueDeNavegacion {
  id: Exclude<GrupoSeccion, 'principal'>
  titulo: string
  abiertoPorDefecto: boolean
  /** Las secciones sueltas del bloque, en el orden en que llegaron. */
  secciones: Seccion[]
  /** Los subgrupos plegables, despues de las sueltas. */
  plegables: PlegableDeNavegacion[]
}

export interface Navegacion {
  principales: Seccion[]
  bloques: BloqueDeNavegacion[]
}

/**
 * Reparte las secciones ya filtradas en principales y bloques.
 *
 * Las principales salen en el orden de `HREFS_PRINCIPALES` y no en el de llegada: el contrato con
 * la barra de movil es el orden, no solo el conjunto. Un bloque sin secciones no aparece —un
 * encabezado "Administración" vacio se lee como un error de permisos—, y lo mismo un plegable.
 *
 * @param secciones las secciones que `seccionesDe()` dejo pasar
 * @returns la navegacion lista para dibujar
 */
export function agruparSecciones (secciones: readonly Seccion[]): Navegacion {
  const principales = secciones
    .filter((seccion) => seccion.grupo === 'principal')
    .sort((a, b) => posicionPrincipal(a.href) - posicionPrincipal(b.href))

  const bloques = BLOQUES
    .map((bloque) => bloqueDe(secciones.filter((seccion) => seccion.grupo === bloque.id), bloque))
    .filter((bloque) => bloque.secciones.length > 0 || bloque.plegables.length > 0)

  return { principales, bloques }
}

/**
 * Arma un bloque con sus sueltas y sus plegables.
 *
 * @param delBloque secciones de este bloque
 * @param bloque la entrada de `BLOQUES`
 * @returns el bloque, posiblemente vacio
 */
function bloqueDe (delBloque: Seccion[], { id, titulo, abiertoPorDefecto }: typeof BLOQUES[number]): BloqueDeNavegacion {
  const plegables: PlegableDeNavegacion[] = []

  for (const seccion of delBloque) {
    if (seccion.plegable === undefined) continue

    const existente = plegables.find((plegable) => plegable.id === seccion.plegable)
    if (existente !== undefined) existente.secciones.push(seccion)
    else plegables.push({ id: seccion.plegable, titulo: TITULOS_PLEGABLES[seccion.plegable], secciones: [seccion] })
  }

  return {
    id,
    titulo,
    abiertoPorDefecto,
    secciones: delBloque.filter((seccion) => seccion.plegable === undefined),
    plegables
  }
}

/**
 * Dice si un bloque o subgrupo del menu se muestra abierto.
 *
 * Lo guardado no es "los abiertos" sino "los que la persona dio vuelta respecto de su default": asi
 * un bloque que nace abierto y uno que nace cerrado se recuerdan con la misma lista, y lo que ya
 * estaba guardado de antes (subgrupos que nacian cerrados y se abrieron) sigue valiendo igual.
 *
 * Si la seccion activa esta adentro se muestra abierto siempre: esconder donde uno esta parado es
 * perder la barrita. Eso no se guarda.
 *
 * @param id el bloque o subgrupo
 * @param abiertoPorDefecto como nace
 * @param invertidos los ids que la persona dio vuelta
 * @param contieneActiva si adentro esta la seccion actual
 * @returns `true` si se dibuja abierto
 */
export function estaAbierto (id: string, abiertoPorDefecto: boolean, invertidos: readonly string[], contieneActiva: boolean): boolean {
  if (contieneActiva) return true
  return invertidos.includes(id) ? !abiertoPorDefecto : abiertoPorDefecto
}

/**
 * Da vuelta un bloque o subgrupo en la lista de invertidos.
 *
 * @param invertidos la lista actual
 * @param id el que se toco
 * @returns la lista nueva, sin repetidos
 */
export function alternarInvertido (invertidos: readonly string[], id: string): string[] {
  return invertidos.includes(id) ? invertidos.filter((otro) => otro !== id) : [...invertidos, id]
}

/** Posicion de una ruta entre las principales; lo desconocido va al final. */
function posicionPrincipal (href: string): number {
  const posicion = (HREFS_PRINCIPALES as readonly string[]).indexOf(href)

  return posicion === -1 ? HREFS_PRINCIPALES.length : posicion
}

/**
 * Rutas que pertenecen a otra seccion aunque no cuelguen de ella.
 *
 * Una Licitacion se abre en `/licitaciones/{id}` pero se llega desde Prospectos, que es donde vive
 * su listado.
 */
const ALIAS: Record<string, string> = { '/licitaciones': '/prospectos' }

/**
 * Cual de las secciones corresponde a la ruta actual. Una sola.
 *
 * Gana la coincidencia MAS LARGA: `/procesos/recurrentes` tiene entrada propia y a la vez cuelga de
 * `/procesos`, y con una regla de prefijo a secas las dos quedarian marcadas. El prefijo se compara
 * por segmento, asi `/clientes` no queda activo en `/clientes-potenciales`.
 *
 * @param hrefs rutas de las secciones que se dibujan
 * @param ruta ruta actual del navegador
 * @returns el `href` activo, o `null` si ninguna corresponde
 */
export function seccionActiva (hrefs: readonly string[], ruta: string): string | null {
  const efectiva = rutaEfectiva(ruta)
  let ganadora: string | null = null

  for (const href of hrefs) {
    const coincide = efectiva === href || efectiva.startsWith(`${href}/`)
    if (coincide && (ganadora === null || href.length > ganadora.length)) ganadora = href
  }

  return ganadora
}

/** Traduce una ruta con alias a la de la seccion que la contiene. */
function rutaEfectiva (ruta: string): string {
  for (const [desde, hacia] of Object.entries(ALIAS)) {
    if (ruta === desde || ruta.startsWith(`${desde}/`)) return hacia + ruta.slice(desde.length)
  }

  return ruta
}
