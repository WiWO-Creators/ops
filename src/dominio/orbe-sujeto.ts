import { GLOSARIO } from './glosario.ts'
import { hrefDeCita, PARAMETRO_PESTANA, PESTANA_ACTAS } from './ia-chat.ts'
import type { Cita } from './ia.ts'

/**
 * De quien es el orbe: el mismo chat sirve al equipo y al cliente, con reglas distintas.
 *
 * Todo lo que cambia entre los dos vive en este archivo y no repartido en `if` dentro de los
 * componentes: las rutas, que partes del chat existen, que se le manda al servidor, a donde lleva
 * una cita y lo que dice la pantalla. Asi los componentes quedan uno solo y esta tabla se prueba con
 * `node --test` sin navegador (`pruebas/orbe-sujeto.test.js`).
 *
 * El staff es el comportamiento de siempre, sin cambios. El contacto es el Thinking Orb del portal
 * (contrato O1): solo lee. No hay agente, no hay tarjetas de propuesta ni de pregunta, no navega
 * solo y no dicta por Whisper (`/ia/dictado` es del equipo): solo el reconocimiento del navegador.
 */

/** Los dos sujetos de sesion de ops-v2. Coincide con `Sujeto` de `datos/servidor.ts`. */
export type SujetoOrbe = 'staff' | 'contacto'

/** Lo que se le dice a la persona. Cambia entre el equipo y el cliente. */
export interface TextosOrbe {
  /** Linea bajo el nombre del asistente en la cabecera del panel flotante. */
  subtitulo: string
  /** Preguntas de arranque del estado vacio: rellenan el campo, no envian. */
  sugerencias: string[]
  /** Descripcion del estado vacio, con o sin Proyecto abierto. */
  descripcion: (proyecto?: string) => string
  /** Placeholder del campo, con o sin Proyecto abierto. */
  placeholder: (conProyecto: boolean) => string
  /** El limite de la funcion, siempre visible al pie. */
  pie: (conProyecto: boolean) => string
  /** Indicador mientras busca, antes de que llegue texto. */
  buscando: (conProyecto: boolean) => string
  /** Aviso fijo cuando la conversacion es de un Proyecto. */
  alcanceProyecto: string
}

/** Todo lo que distingue un orbe del otro. Datos planos y funciones puras. */
export interface ConfiguracionOrbe {
  sujeto: SujetoOrbe
  /** Ruta del BFF que dice si el orbe se ofrece y con que motor. */
  rutaCapacidades: string
  /** Si puede montar el agente (`ChatAgente`). Solo el equipo. */
  conAgente: boolean
  /** Si pinta tarjetas de propuesta y de pregunta. Solo el equipo: el cliente no escribe. */
  conPropuestas: boolean
  /** Si obedece `event: navegar`. Las rutas que manda el servidor son del panel. */
  conNavegacion: boolean
  /** Si el dictado puede caer al respaldo de Whisper (`POST /ia/dictado`, staff-only). */
  dictadoConRespaldo: boolean
  /** Ruta del hilo para GET y DELETE. */
  rutaHilo: (proyectoId?: number) => string
  /** Ruta del POST que genera. */
  rutaEnvio: (proyectoId?: number) => string
  /**
   * Cuerpo del POST.
   *
   * @param texto la pregunta, ya recortada
   * @param proyectoId el Proyecto de la conversacion, si hay
   * @param pantalla donde esta parada la persona (solo lo usa el equipo), o `null`
   */
  cuerpo: (texto: string, proyectoId: number | undefined, pantalla: string | null) => Record<string, unknown>
  /** A donde lleva una cita, o `null` si no hay pantalla de este sujeto que la resuelva. */
  hrefDeCita: (cita: Cita) => string | null
  textos: TextosOrbe
}

/** El Thinking Orb del equipo: exactamente el de antes de existir este archivo. */
const STAFF: ConfiguracionOrbe = {
  sujeto: 'staff',
  rutaCapacidades: 'ia/capacidades',
  conAgente: true,
  conPropuestas: true,
  conNavegacion: true,
  dictadoConRespaldo: true,
  rutaHilo: (proyectoId) => proyectoId === undefined ? 'ia/chat' : `ia/proyectos/${proyectoId}/chat`,
  rutaEnvio: (proyectoId) => proyectoId === undefined ? 'ia/chat' : `ia/proyectos/${proyectoId}/chat`,
  cuerpo: (texto, _proyectoId, pantalla) => pantalla === null ? { pregunta: texto } : { pregunta: texto, pantalla },
  hrefDeCita,
  textos: {
    subtitulo: 'Pregunta por lo que necesites',
    sugerencias: [
      `¿Qué ${GLOSARIO.proceso.plural.toLowerCase()} están atrasadas y de quién son?`,
      '¿Qué vence esta semana?',
      '¿Qué se movió en la última semana?'
    ],
    descripcion: (proyecto) => proyecto === undefined
      ? 'Responde con lo que hay cargado en Ops y cita de dónde lo sacó.'
      : `Pregunta por las tareas, hitos y avances de ${proyecto}.`,
    placeholder: (conProyecto) => conProyecto ? 'Pregunta sobre este proyecto…' : 'Pregunta lo que necesites…',
    pie: (conProyecto) => `${conProyecto ? 'Solo trabaja en este proyecto.' : 'Responde con lo que hay cargado en Ops.'} No cambia nada sin que lo confirmes.`,
    buscando: (conProyecto) => conProyecto ? 'Buscando en este proyecto…' : 'Buscando en Ops…',
    alcanceProyecto: 'Esta conversación solo consulta y modifica este proyecto.'
  }
}

/** Ruta base del chat del portal. Queda bajo `portal/` para que el BFF la mande con la sesion del contacto. */
const RUTA_CHAT_PORTAL = 'portal/ia/chat'

/**
 * Ruta del hilo del portal: el Proyecto viaja como `?proyecto_id=`, no en el camino.
 *
 * @param proyectoId el Proyecto de la conversacion; sin el, el hilo general del contacto
 */
function rutaHiloPortal (proyectoId?: number): string {
  return proyectoId === undefined ? RUTA_CHAT_PORTAL : `${RUTA_CHAT_PORTAL}?proyecto_id=${proyectoId}`
}

/**
 * A donde lleva una cita en el portal.
 *
 * Solo a pantallas del portal: una cita del chat del cliente que apunte a `/procesos` o a
 * `/proyectos/{id}` lo mandaria al login del equipo. Lo que no tiene pantalla en el portal —una tarea
 * sin su Proyecto— se pinta como texto, igual que hace el panel.
 *
 * @param cita la cita que mando el servidor
 * @returns la ruta del portal, o `null`
 */
export function hrefDeCitaPortal (cita: Cita): string | null {
  const proyecto = '/portal/proyectos/'

  if (cita.tipo === 'espacio') return `${proyecto}${cita.id}`
  if (cita.espacio_id === undefined) return null

  const pestanas: Record<Cita['tipo'], string | null> = {
    tarea: 'tasks',
    hito: 'milestones',
    acta: PESTANA_ACTAS,
    espacio: null
  }
  const pestana = pestanas[cita.tipo]

  return pestana === null ? null : `${proyecto}${cita.espacio_id}?${PARAMETRO_PESTANA}=${pestana}`
}

/** El Thinking Orb del portal (contrato O1): de solo lectura. */
const CONTACTO: ConfiguracionOrbe = {
  sujeto: 'contacto',
  rutaCapacidades: 'portal/ia/capacidades',
  conAgente: false,
  conPropuestas: false,
  conNavegacion: false,
  dictadoConRespaldo: false,
  rutaHilo: rutaHiloPortal,
  rutaEnvio: () => RUTA_CHAT_PORTAL,
  // `mensaje` es el nombre del contrato O1; `pregunta` es el que lee `IA\Chat` del staff, que el
  // backend del portal replica. Viajan los dos con el mismo texto hasta que el contrato se cierre.
  cuerpo: (texto, proyectoId) => proyectoId === undefined
    ? { mensaje: texto, pregunta: texto }
    : { mensaje: texto, pregunta: texto, proyecto_id: proyectoId },
  hrefDeCita: hrefDeCitaPortal,
  textos: {
    subtitulo: 'Consulta el avance de tus proyectos',
    sugerencias: [
      '¿Cómo va mi proyecto?',
      '¿Qué tareas esperan mi aprobación?',
      '¿Qué se avanzó esta semana?'
    ],
    descripcion: (proyecto) => proyecto === undefined
      ? 'Responde con lo que tu equipo comparte contigo en el portal y cita de dónde lo sacó. Solo consulta: no cambia nada.'
      : `Pregunta por las tareas, hitos y avances de ${proyecto}. Solo consulta: no cambia nada.`,
    placeholder: (conProyecto) => conProyecto ? 'Pregunta sobre este proyecto…' : 'Pregunta por tus proyectos…',
    pie: () => 'Solo consulta lo que ves en el portal. No cambia nada.',
    buscando: (conProyecto) => conProyecto ? 'Buscando en este proyecto…' : 'Buscando en tus proyectos…',
    alcanceProyecto: 'Esta conversación es sobre el proyecto que tienes abierto.'
  }
}

/**
 * La configuracion del orbe de un sujeto.
 *
 * @param sujeto de quien es la sesion; cualquier otro valor cae al del equipo, que es el de siempre
 * @returns la configuracion completa
 */
export function configuracionDeOrbe (sujeto: SujetoOrbe = 'staff'): ConfiguracionOrbe {
  return sujeto === 'contacto' ? CONTACTO : STAFF
}

/** `/portal/proyectos/{id}` y lo que cuelgue de ahi. El id son solo digitos. */
const RUTA_PROYECTO_PORTAL = /^\/portal\/proyectos\/(\d+)(?:\/|$)/

/**
 * El Proyecto que el contacto tiene abierto, sacado de la ruta del portal.
 *
 * Es lo que viaja como `proyecto_id`: en la ficha de un Proyecto "esta tarea" y "mi proyecto" tienen
 * que significar ese Proyecto. Fuera de una ficha no hay Proyecto y la conversacion es la general.
 *
 * @param ruta el pathname actual, o `null` si no se conoce
 * @returns el id del Proyecto, o `undefined` fuera de una ficha o con un id invalido
 */
export function proyectoDeRutaPortal (ruta: string | null): number | undefined {
  if (ruta === null) return undefined

  const coincidencia = RUTA_PROYECTO_PORTAL.exec(ruta)
  if (coincidencia === null) return undefined

  const id = Number(coincidencia[1])

  return Number.isSafeInteger(id) && id > 0 ? id : undefined
}
