import { useEffect, useRef, useSyncExternalStore } from 'react'

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

const fases = new Map<string, FaseConversacion>()
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
export function leerFaseOrbe (ambito: string): FaseConversacion {
  return fases.get(ambito) ?? 'reposo'
}

/**
 * Fase resumida de todos los ámbitos de un sujeto.
 *
 * @param sujeto De quién es la sesión.
 * @returns La fase más urgente entre sus ámbitos: generando, esperando, error, reposo.
 */
export function faseDeSujeto (sujeto: string): FaseConversacion {
  let mejor: FaseConversacion = 'reposo'
  for (const [ambito, fase] of fases) {
    if (ambito.startsWith(`${sujeto}:`) && PRIORIDAD[fase] > PRIORIDAD[mejor]) mejor = fase
  }
  return mejor
}

/** Publica la fase de un ámbito. `reposo` borra la entrada. @param ambito Clave de `ambitoDeOrbe`. @param fase Fase actual. */
export function publicarFaseOrbe (ambito: string, fase: FaseConversacion): void {
  if (leerFaseOrbe(ambito) === fase) return
  if (fase === 'reposo') fases.delete(ambito)
  else fases.set(ambito, fase)
  avisar()
}

/** Olvida todas las fases. Solo para pruebas. */
export function vaciarFasesOrbe (): void {
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
 */
export function usePublicarFaseOrbe (ambito: string, fase: FaseConversacion, conservar: readonly FaseConversacion[] = NO_CONSERVAR): void {
  const ultima = useRef(fase)
  useEffect(() => {
    ultima.current = fase
    publicarFaseOrbe(ambito, fase)
  }, [ambito, fase])
  useEffect(() => () => {
    if (!conservar.includes(ultima.current)) publicarFaseOrbe(ambito, 'reposo')
  }, [ambito, conservar])
}
