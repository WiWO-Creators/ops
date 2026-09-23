/**
 * Lo que la paleta de comandos ofrece, como datos: grupos de opciones con su destino.
 *
 * Todo lo que decide QUE se muestra vive aca y no en el componente, por la regla de las pruebas
 * (Node no despoja JSX). El componente solo dibuja y mueve el foco.
 *
 * === De donde sale cada cosa ===
 *
 *   - Las secciones: las mismas que dibuja la barra, ya filtradas por permisos en el servidor. La
 *     paleta no suma pantallas que el menu niega; suma las que el menu PLIEGA.
 *   - Los atajos: destinos que no son una seccion del menu pero que se buscan por nombre (Tablero,
 *     Calendario, Mi perfil, Soporte). Cada uno lleva la seccion de la que depende, y sin ella no
 *     se ofrece.
 *   - Recientes y fijados: `/me/recientes` y `/me/fijados`, ya recortados por la API.
 *   - Resultados: `GET /search`, que ya respeta la visibilidad de cada tipo.
 */
import type { Seccion, IconoSeccion } from '../../lib/navegacion.ts'
import { PARAMETRO_TAREA, urlDeTareaEnProyecto } from '../datos/tabla.ts'
import { hrefDeElemento, type ElementoPersonal } from '../fijados/fijados.ts'

/** Iconos que la paleta sabe pintar: los de las secciones mas los propios de cada tipo de resultado. */
export type IconoComando = IconoSeccion | 'tarea' | 'persona' | 'reciente' | 'fijado' | 'soporte' | 'tablero' | 'calendario' | 'perfil'

export interface Comando {
  /** Unico en toda la paleta: se usa como id del `option` y para `aria-activedescendant`. */
  id: string
  etiqueta: string
  /** Linea tenue a la derecha: el cliente de un Proyecto, el Proyecto de una Tarea. */
  detalle?: string
  href: string
  icono: IconoComando
  /** Se abre en otra pestaña: sale del panel. */
  externo?: boolean
}

export interface GrupoDeComandos {
  id: string
  titulo: string
  comandos: Comando[]
}

/** Un destino que no es seccion del menu, con la seccion de la que depende. */
export interface Atajo {
  etiqueta: string
  href: string
  icono: IconoComando
  /** `href` de la seccion que lo habilita; sin ella en el menu, no se ofrece. `null` = siempre. */
  requiere: string | null
  /** Palabras extra con las que tambien se encuentra. */
  sinonimos?: string[]
  externo?: boolean
}

/** Lo que devuelve `GET /search`, solo con lo que la paleta lee. Un tipo sin permiso no llega. */
export interface ResultadosDeBusqueda {
  tasks?: { items: Array<{ id: number, name: string, project: { id: number, name: string } | null }> }
  projects?: { items: Array<{ id: number, name: string, client: { company: string } | null }> }
  clients?: { items: Array<{ id: number, company: string }> }
  staff?: { items: Array<{ id: number, full_name: string, email?: string }> }
}

/** Largo minimo para preguntarle a la API; es el mismo `LARGO_MINIMO` de `RecursoBusqueda`. */
export const LARGO_MINIMO_BUSQUEDA = 2

/**
 * Pasa un texto a la forma en que se compara: sin mayusculas, sin tildes, sin espacios de sobra.
 *
 * @param texto lo que escribio la persona o la etiqueta de una opcion
 * @returns el texto normalizado
 */
export function normalizar (texto: string): string {
  return texto.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ')
}

/**
 * Cuanto se parece una etiqueta a lo escrito. `0` = no coincide.
 *
 * Empieza-con gana sobre contiene, y una palabra que empieza con lo escrito gana sobre una
 * coincidencia en medio de palabra: "pro" tiene que traer "Proyectos" antes que "Mis procesos
 * aprobados".
 *
 * @param etiqueta texto de la opcion
 * @param consulta lo escrito, ya normalizado
 * @returns puntaje, mayor es mejor
 */
export function puntaje (etiqueta: string, consulta: string): number {
  if (consulta === '') return 1
  const texto = normalizar(etiqueta)

  if (texto.startsWith(consulta)) return 3
  if (texto.split(' ').some((palabra) => palabra.startsWith(consulta))) return 2
  return texto.includes(consulta) ? 1 : 0
}

/**
 * Las secciones y atajos que se ofrecen, filtrados por lo escrito.
 *
 * @param secciones las secciones del menu
 * @param atajos los destinos extra
 * @param consulta lo escrito, sin normalizar
 * @returns los comandos de navegacion, del mas parecido al menos
 */
export function comandosDeNavegacion (secciones: readonly Seccion[], atajos: readonly Atajo[], consulta: string): Comando[] {
  const buscada = normalizar(consulta)
  const hrefs = new Set(secciones.map((seccion) => seccion.href))

  const candidatos: Array<Comando & { sinonimos: string[] }> = [
    ...secciones.map((seccion) => ({
      id: `ir:${seccion.href}`,
      etiqueta: seccion.etiqueta,
      href: seccion.href,
      icono: seccion.icono as IconoComando,
      sinonimos: []
    })),
    ...atajos
      .filter((atajo) => atajo.requiere === null || hrefs.has(atajo.requiere))
      .map((atajo) => ({
        id: `ir:${atajo.href}`,
        etiqueta: atajo.etiqueta,
        href: atajo.href,
        icono: atajo.icono,
        externo: atajo.externo,
        sinonimos: atajo.sinonimos ?? []
      }))
  ]

  return candidatos
    .map((candidato, orden) => ({
      candidato,
      orden,
      puntos: Math.max(puntaje(candidato.etiqueta, buscada), ...candidato.sinonimos.map((sinonimo) => puntaje(sinonimo, buscada)))
    }))
    .filter(({ puntos }) => puntos > 0)
    .sort((a, b) => b.puntos - a.puntos || a.orden - b.orden)
    .map(({ candidato: { sinonimos: _sinonimos, ...comando } }) => comando)
}

/**
 * Recientes o fijados como comandos.
 *
 * @param elementos lo que devolvio la API
 * @param prefijo `reciente` o `fijado`, para que un mismo Proyecto en las dos listas tenga dos ids
 * @returns los comandos
 */
export function comandosDeElementos (elementos: readonly ElementoPersonal[], prefijo: 'reciente' | 'fijado'): Comando[] {
  return elementos.map((elemento) => ({
    id: `${prefijo}:${elemento.type}:${elemento.id}`,
    etiqueta: elemento.name,
    detalle: elemento.type === 'project' ? elemento.client?.company ?? 'Proyecto' : 'Cliente',
    href: hrefDeElemento(elemento),
    icono: prefijo
  }))
}

/**
 * Los resultados de `/search`, un grupo por tipo y en el orden de la API.
 *
 * @param resultados la respuesta
 * @param rutaDeTareaSuelta donde se abre una Tarea sin Proyecto: `/procesos` si se ve, si no `/mis-tareas`
 * @returns los grupos no vacios
 */
export function gruposDeBusqueda (resultados: ResultadosDeBusqueda, rutaDeTareaSuelta: string): GrupoDeComandos[] {
  const grupos: GrupoDeComandos[] = [
    {
      id: 'tareas',
      titulo: 'Tareas',
      comandos: (resultados.tasks?.items ?? []).map((tarea) => ({
        id: `tarea:${tarea.id}`,
        etiqueta: tarea.name,
        detalle: tarea.project?.name,
        href: urlDeTareaEnProyecto(tarea.id, tarea.project?.id) ?? `${rutaDeTareaSuelta}?${PARAMETRO_TAREA}=${tarea.id}`,
        icono: 'tarea'
      }))
    },
    {
      id: 'proyectos',
      titulo: 'Proyectos',
      comandos: (resultados.projects?.items ?? []).map((proyecto) => ({
        id: `proyecto:${proyecto.id}`,
        etiqueta: proyecto.name,
        detalle: proyecto.client?.company,
        href: `/proyectos/${proyecto.id}`,
        icono: 'espacios'
      }))
    },
    {
      id: 'clientes',
      titulo: 'Clientes',
      comandos: (resultados.clients?.items ?? []).map((cliente) => ({
        id: `cliente:${cliente.id}`,
        etiqueta: cliente.company,
        href: `/clientes/${cliente.id}`,
        icono: 'clientes'
      }))
    },
    {
      id: 'personas',
      titulo: 'Personas',
      comandos: (resultados.staff?.items ?? []).map((persona) => ({
        id: `persona:${persona.id}`,
        etiqueta: persona.full_name,
        detalle: persona.email,
        href: `/equipo/${persona.id}`,
        icono: 'persona'
      }))
    }
  ]

  return grupos.filter((grupo) => grupo.comandos.length > 0)
}

export interface EntradaDePaleta {
  consulta: string
  secciones: readonly Seccion[]
  atajos: readonly Atajo[]
  recientes: readonly ElementoPersonal[]
  fijados: readonly ElementoPersonal[]
  /** `null` mientras no hay busqueda (consulta corta, o todavia no contesto). */
  resultados: ResultadosDeBusqueda | null
}

/**
 * Todos los grupos de la paleta para un estado dado.
 *
 * Vacia, la paleta es un punto de partida: lo reciente, lo fijado y todas las secciones. Con algo
 * escrito, primero las pantallas que coinciden (son instantaneas) y despues lo que devolvio la API.
 *
 * @param entrada el estado de la paleta
 * @returns los grupos no vacios, en orden de lectura
 */
export function gruposDePaleta (entrada: EntradaDePaleta): GrupoDeComandos[] {
  const { consulta, secciones, atajos, recientes, fijados, resultados } = entrada
  const rutaDeTareaSuelta = secciones.some((seccion) => seccion.href === '/procesos') ? '/procesos' : '/mis-tareas'

  if (normalizar(consulta) === '') {
    return [
      { id: 'recientes', titulo: 'Recientes', comandos: comandosDeElementos(recientes, 'reciente') },
      { id: 'fijados', titulo: 'Fijados', comandos: comandosDeElementos(fijados, 'fijado') },
      { id: 'ir', titulo: 'Ir a', comandos: comandosDeNavegacion(secciones, atajos, '') }
    ].filter((grupo) => grupo.comandos.length > 0)
  }

  return [
    { id: 'ir', titulo: 'Ir a', comandos: comandosDeNavegacion(secciones, atajos, consulta) },
    ...(resultados === null ? [] : gruposDeBusqueda(resultados, rutaDeTareaSuelta))
  ].filter((grupo) => grupo.comandos.length > 0)
}

/**
 * Los comandos en el orden en que los recorre el teclado.
 *
 * @param grupos los grupos dibujados
 * @returns la lista plana
 */
export function aplanar (grupos: readonly GrupoDeComandos[]): Comando[] {
  return grupos.flatMap((grupo) => grupo.comandos)
}

/**
 * El indice activo despues de una tecla de movimiento. Las flechas dan la vuelta; Inicio y Fin no.
 *
 * @param actual indice activo, `-1` si ninguno
 * @param total cuantas opciones hay
 * @param tecla la tecla
 * @returns el indice nuevo, o `-1` si no hay opciones
 */
export function moverActivo (actual: number, total: number, tecla: 'ArrowDown' | 'ArrowUp' | 'Home' | 'End'): number {
  if (total === 0) return -1
  if (tecla === 'Home') return 0
  if (tecla === 'End') return total - 1
  if (tecla === 'ArrowDown') return actual < 0 ? 0 : (actual + 1) % total
  return actual <= 0 ? total - 1 : actual - 1
}
