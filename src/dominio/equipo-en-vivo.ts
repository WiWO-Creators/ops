import { LOCALE, ZONA_NEGOCIO } from '../lib/fechas.ts'
import { etiquetaDePantalla, pantallaParaAgente } from './orbe-contexto.ts'
import { GLOSARIO } from './glosario.ts'
import { SALA_PRIVADA_PARA_EL_EQUIPO, salaComunPorId } from './teletrabajo.ts'
import type { FilaDeLive, PresenciaEnVivo } from '@/datos/live'

/**
 * Lo que las tarjetas del equipo en vivo dicen de cada persona, sin React ni red.
 *
 * Vive fuera de los `.tsx` por lo mismo que `componentes/live/presentacion.ts`: lo que se prueba
 * (`pruebas/equipo-en-vivo.test.js`) es lo que se puede equivocar en silencio —una frase cruda del
 * servidor en pantalla, una persona en reunión que se lee como «sin jornada», una hora corrida por
 * el huso—, y el JSX no se puede importar desde Node.
 *
 * === QUÉ SE MUESTRA, Y QUÉ NO ===
 *
 * Solo lo que la persona ya declaró: si abrió jornada, qué cronómetro corre, en qué sección del
 * panel está y si está en una sala de Teletrabajo. Nunca capturas, teclado ni inactividad, y de una
 * sala privada solo se dice que lo es.
 */

/** Cómo se encuentra una persona en el tablero, de lo más a lo menos activo. */
export type SituacionDePersona = 'en_reunion' | 'midiendo' | 'en_jornada' | 'sin_jornada'

/** Las dos mitades del tablero: quién tiene tarjeta y quién va en la lista plegada. */
export interface TableroDeTarjetas {
  tarjetas: FilaDeLive[]
  enReposo: FilaDeLive[]
}

/**
 * La frase humana de dónde está parada una persona en el panel.
 *
 * La ruta manda: el servidor manda además una frase, pero para una pantalla que no conoce la deja
 * cruda («en /tareas/12»), que es verdad y es fea. La ruta se resuelve con las mismas funciones que
 * ya nombran la pantalla para el chip del orbe, y la frase del servidor queda de respaldo solo si
 * no trae una barra. Una ruta de Proyecto no dice cuál: con un id, la tarjeta ya cuelga el Proyecto
 * que se mide, y nombrar otro desde la navegación diría más de lo que la persona declaró.
 *
 * @param presencia la última señal de vida de la fila, o `null` si nunca hubo
 * @returns la frase en minúscula inicial («en la sección «Tareas»»), o `null` si no hay nada que decir
 */
export function fraseDePresencia (presencia: Pick<PresenciaEnVivo, 'route' | 'phrase'> | null): string | null {
  if (presencia === null) return null

  const ruta = presencia.route?.trim() ?? ''
  const pantalla = ruta === '' ? null : pantallaParaAgente(ruta)

  if (pantalla !== null) {
    const etiqueta = etiquetaDePantalla(pantalla)

    if (!etiqueta.startsWith('/')) {
      return etiqueta === GLOSARIO.espacio.singular
        ? `en un ${GLOSARIO.espacio.singular}`
        : `en la sección «${etiqueta}»`
    }
  }

  const respaldo = presencia.phrase?.trim() ?? ''

  return respaldo === '' || respaldo.includes('/') ? null : respaldo
}

/**
 * Cómo se llama la sala en que alguien está.
 *
 * @param sala el id de sala que entregó `/api/equipo/salas`: una común o `privada`
 * @returns «la sala General», «la sala Café» o «una sala privada»; para un id que el catálogo ya no
 *   tiene, «una sala de Teletrabajo»
 */
export function etiquetaDeSala (sala: string): string {
  if (sala === SALA_PRIVADA_PARA_EL_EQUIPO) return 'una sala privada'

  const comun = salaComunPorId(sala)

  return comun === null ? 'una sala de Teletrabajo' : `la sala ${comun.nombre}`
}

/**
 * En qué situación está una persona del tablero.
 *
 * Estar en una sala gana sobre todo lo demás: es lo más específico que se sabe y explica por qué un
 * cronómetro puede estar quieto. Sin sala, manda el medidor y después la jornada.
 *
 * @param fila la persona tal como llega de `GET /live`
 * @param sala la sala en que está ahora, o `null`/`undefined` si no está en ninguna o no se sabe
 */
export function situacionDePersona (fila: FilaDeLive, sala: string | null | undefined): SituacionDePersona {
  if (sala !== null && sala !== undefined) return 'en_reunion'
  if (fila.medidor !== null) return 'midiendo'
  if (fila.jornada !== null) return 'en_jornada'

  return 'sin_jornada'
}

/** Cómo se dice cada situación en el sello de la tarjeta. */
const ETIQUETA_DE_SITUACION: Record<SituacionDePersona, string> = {
  en_reunion: 'En reunión',
  midiendo: 'Midiendo',
  en_jornada: 'En jornada',
  sin_jornada: 'Sin jornada'
}

/**
 * El texto del sello de una situación.
 *
 * @param situacion la situación de la persona
 * @returns la palabra a mostrar
 */
export function etiquetaDeSituacion (situacion: SituacionDePersona): string {
  return ETIQUETA_DE_SITUACION[situacion]
}

/** Formato de la hora de pared del negocio: 24 horas, dos dígitos. */
const FORMATO_DE_HORA = new Intl.DateTimeFormat(LOCALE, {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: ZONA_NEGOCIO
})

/**
 * La hora de pared (`HH:mm`, zona del negocio) de un instante.
 *
 * Con la zona fijada a propósito: la hora de inicio de una jornada es la de la oficina, no la del
 * dispositivo de quien mira.
 *
 * @param instante ISO-8601 tal como lo manda la API
 * @returns `'09:05'`, o `null` si el texto no es una fecha
 */
export function horaDeInicio (instante: string | null | undefined): string | null {
  if (instante === null || instante === undefined) return null

  const tiempo = new Date(instante)

  return Number.isNaN(tiempo.getTime()) ? null : FORMATO_DE_HORA.format(tiempo)
}

/**
 * Reparte el tablero en quién tiene tarjeta y quién va en la lista de «sin jornada».
 *
 * Tiene tarjeta quien está en una sala, tiene jornada o tiene un medidor. El orden es el de la
 * situación —reunión, midiendo, jornada— y a igualdad alfabético, que es el único que no reacomoda
 * la lista sola en cada refresco.
 *
 * @param filas el tablero tal como llega de `GET /live`
 * @param salas quién está en qué sala (puede estar vacío o ser `null` si LiveKit no respondió)
 * @returns las dos mitades; nunca modifica `filas`
 */
export function repartirTarjetas (filas: readonly FilaDeLive[], salas: ReadonlyMap<number, string> | null): TableroDeTarjetas {
  const peso: Record<SituacionDePersona, number> = { en_reunion: 3, midiendo: 2, en_jornada: 1, sin_jornada: 0 }
  const situacion = (fila: FilaDeLive): SituacionDePersona => situacionDePersona(fila, salas?.get(fila.staff.id))
  const ordenadas = [...filas].sort((a, b) =>
    peso[situacion(b)] - peso[situacion(a)] || a.staff.name.localeCompare(b.staff.name, 'es')
  )

  return {
    tarjetas: ordenadas.filter((fila) => situacion(fila) !== 'sin_jornada'),
    enReposo: ordenadas.filter((fila) => situacion(fila) === 'sin_jornada')
  }
}

/**
 * Lee la respuesta de `/api/equipo/salas` sin fiarse de su forma.
 *
 * @param cuerpo el JSON ya parseado de la respuesta
 * @returns quién está en qué sala; vacío si la forma no es la esperada. Las claves que no son un id
 *   de persona o los valores que no son texto se ignoran
 */
export function salasDeRespuesta (cuerpo: unknown): Map<number, string> {
  const salas = new Map<number, string>()
  const datos = typeof cuerpo === 'object' && cuerpo !== null ? (cuerpo as { data?: unknown }).data : null

  if (typeof datos !== 'object' || datos === null) return salas

  for (const [clave, sala] of Object.entries(datos)) {
    const id = Number(clave)

    if (Number.isSafeInteger(id) && id > 0 && typeof sala === 'string' && sala !== '') salas.set(id, sala)
  }

  return salas
}
