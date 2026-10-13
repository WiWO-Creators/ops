import { useEffect, useRef, useSyncExternalStore } from 'react'
import { UMBRAL_DETENIDA_SEGUNDOS } from './ia-ejecucion.ts'

/**
 * Estado compartido de la conversación del orbe.
 *
 * Los dos motores (consulta SSE y agente durable) publican aquí en qué fase está su conversación,
 * por ámbito (`sujeto:proyecto`). Quien quiera reflejarla —el botón flotante hoy; la pestaña y el
 * panel después— la lee sin conocer al motor. Es un store de módulo: sobrevive a abrir y cerrar el
 * chat, que desmonta los motores.
 */

/** Fase de una conversación: nada en curso, generando, esperando a la persona o con un fallo. */
export type FaseConversacion = 'reposo' | 'generando' | 'esperando' | 'error'

/** Gravedad para resumir varios ámbitos: gana el que más reclama la atención. */
const PRIORIDAD: Record<FaseConversacion, number> = { reposo: 0, error: 1, esperando: 2, generando: 3 }

/** Cuánto sobrevive una fase conservada tras cerrar el chat si nadie la revalida: el umbral de «detenida». */
export const TTL_FASE_CONSERVADA_MS = UMBRAL_DETENIDA_SEGUNDOS * 1000

const fases = new Map<string, FaseConversacion>()
/** Instante en que caduca cada fase conservada, y el temporizador que la borra. */
const caducidades = new Map<string, { hasta: number, temporizador: ReturnType<typeof setTimeout> | undefined }>()
const oyentes = new Set<() => void>()

/** Avisa a los lectores de que alguna fase cambió. */
function avisar (): void {
  for (const oyente of oyentes) oyente()
}

/**
 * Clave del ámbito de una conversación.
 *
 * @param sujeto De quién es la sesión (`staff` o `contacto`).
 * @param proyectoId Proyecto de la conversación; `undefined` es la conversación global.
 * @returns `sujeto:proyecto`, con `global` cuando no hay Proyecto.
 */
export function ambitoDeOrbe (sujeto: string, proyectoId?: number): string {
  return `${sujeto}:${proyectoId ?? 'global'}`
}

/** Fase publicada de un ámbito. @param ambito Clave de `ambitoDeOrbe`. @returns La fase, o `reposo` si nadie publicó. */
export function leerFaseOrbe (ambito: string, ahora = Date.now()): FaseConversacion {
  const caducidad = caducidades.get(ambito)
  if (caducidad !== undefined && caducidad.hasta <= ahora) return 'reposo'
  return fases.get(ambito) ?? 'reposo'
}

/**
 * Fase resumida de todos los ámbitos de un sujeto.
 *
 * @param sujeto De quién es la sesión.
 * @returns La fase más urgente entre sus ámbitos: generando, esperando, error, reposo.
 */
export function faseDeSujeto (sujeto: string, ahora = Date.now()): FaseConversacion {
  let mejor: FaseConversacion = 'reposo'
  for (const ambito of fases.keys()) {
    const fase = leerFaseOrbe(ambito, ahora)
    if (ambito.startsWith(`${sujeto}:`) && PRIORIDAD[fase] > PRIORIDAD[mejor]) mejor = fase
  }
  return mejor
}

/** Olvida la caducidad de un ámbito y cancela su temporizador. @param ambito Clave de `ambitoDeOrbe`. */
function olvidarCaducidad (ambito: string): void {
  clearTimeout(caducidades.get(ambito)?.temporizador)
  caducidades.delete(ambito)
}

/** Publica la fase de un ámbito. `reposo` borra la entrada. @param ambito Clave de `ambitoDeOrbe`. @param fase Fase actual. */
export function publicarFaseOrbe (ambito: string, fase: FaseConversacion): void {
  olvidarCaducidad(ambito)
  if (leerFaseOrbe(ambito) === fase) return
  if (fase === 'reposo') fases.delete(ambito)
  else fases.set(ambito, fase)
  avisar()
}

/**
 * Marca la fase de un ámbito como conservada tras cerrar el chat: caduca a los `ttlMs` si nadie la
 * vuelve a publicar. Sin esto, una espera de decisión que ya se resolvió en otro lado (otra
 * pestaña, el propio servidor) dejaría el aviso del botón para siempre.
 *
 * @param ambito Clave de `ambitoDeOrbe`.
 * @param ttlMs Vigencia en ms.
 */
export function conservarFaseOrbe (ambito: string, ttlMs = TTL_FASE_CONSERVADA_MS): void {
  olvidarCaducidad(ambito)
  const hasta = Date.now() + ttlMs
  const temporizador = setTimeout(() => {
    if (caducidades.get(ambito)?.hasta !== hasta) return
    caducidades.delete(ambito)
    fases.delete(ambito)
    avisar()
  }, ttlMs)
  temporizador.unref?.()
  caducidades.set(ambito, { hasta, temporizador })
}

/** Olvida todas las fases y sus caducidades. Al cerrar sesión y en pruebas. */
export function vaciarFasesOrbe (): void {
  for (const ambito of [...caducidades.keys()]) olvidarCaducidad(ambito)
  fases.clear()
  avisar()
}

/** Suscribe un lector al store. @param oyente Se llama en cada cambio. @returns Cómo cancelar. */
function suscribir (oyente: () => void): () => void {
  oyentes.add(oyente)
  return () => { oyentes.delete(oyente) }
}

/** Snapshot del servidor: sin sesión de conversación, todo en reposo. */
function reposoEnServidor (): FaseConversacion {
  return 'reposo'
}

/** Lee la fase resumida de un sujeto y se repinta al cambiar. @param sujeto De quién es la sesión. @returns La fase más urgente. */
export function useFaseDeSujeto (sujeto: string): FaseConversacion {
  return useSyncExternalStore(suscribir, () => faseDeSujeto(sujeto), reposoEnServidor)
}

/** Lee la fase de un ámbito y se repinta al cambiar. @param ambito Clave de `ambitoDeOrbe`. @returns La fase del ámbito. */
export function useFaseDeAmbito (ambito: string): FaseConversacion {
  return useSyncExternalStore(suscribir, () => leerFaseOrbe(ambito), reposoEnServidor)
}

/** Fases que no se conservan al desmontar el motor. */
export const NO_CONSERVAR: readonly FaseConversacion[] = []

/**
 * Publica la fase de un motor mientras está montado.
 *
 * Al desmontar vuelve a `reposo`, salvo que el motor diga que su fase sobrevive al cierre del chat
 * (`conservar`), como la espera de una decisión del agente, que sigue pendiente aunque nadie mire.
 *
 * @param ambito Clave de `ambitoDeOrbe`.
 * @param fase Fase actual del motor.
 * @param conservar Fases que no se limpian al desmontar; pasar una constante de módulo.
 * @param ttlConservadaMs Cuánto sobrevive una fase conservada si nadie la revalida.
 */
export function usePublicarFaseOrbe (ambito: string, fase: FaseConversacion, conservar: readonly FaseConversacion[] = NO_CONSERVAR, ttlConservadaMs = TTL_FASE_CONSERVADA_MS): void {
  const ultima = useRef(fase)
  useEffect(() => {
    ultima.current = fase
    publicarFaseOrbe(ambito, fase)
  }, [ambito, fase])
  useEffect(() => () => {
    if (conservar.includes(ultima.current)) conservarFaseOrbe(ambito, ttlConservadaMs)
    else publicarFaseOrbe(ambito, 'reposo')
  }, [ambito, conservar, ttlConservadaMs])
}
