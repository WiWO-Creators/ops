/**
 * Los siete estados del orbe, en un modulo sin JSX.
 *
 * Viven acá y no en `componentes/estado/Orbe.tsx` por una razon de herramienta y no de diseño: el
 * runner de pruebas de Node quita tipos de un `.ts` pero **no sabe leer un `.tsx`**, y `dominio/ia.ts`
 * —que valida contra esta lista lo que llega por la red— se prueba con `node --test`. Con la lista
 * dentro del componente, `pruebas/ia.test.js` no arranca.
 *
 * Sigue habiendo UNA sola lista: `Orbe.tsx` la reexporta y todos sus consumidores la importan de ahi
 * como siempre. Que sea un `const` y que el tipo salga de ella tampoco es cosmetico: escrita a mano
 * en dos lados, la de validacion se queda corta sin que TypeScript diga nada.
 *
 * Que significa cada uno esta documentado en el componente, que es donde se ve.
 */
export const ESTADOS_ORBE = [
  'idle',
  'listening',
  'thinking',
  'generating',
  'routing',
  'success',
  'error'
] as const

export type EstadoOrbe = typeof ESTADOS_ORBE[number]

/** Hasta esta medida (2rem = 32px) el orbe es un detalle de un botón o de una línea de texto, no un protagonista. */
const MEDIDA_LIGERA_REM = 2

/**
 * Indica si el orbe se dibuja en su variante ligera.
 *
 * La variante ligera deja el núcleo y una capa, sin partículas, destellos ni blur: a 16-32 px nadie
 * distingue las demás capas, y cada orbe de línea (el de un botón, el cursor de la respuesta) pagaba
 * unos treinta nodos animados.
 *
 * @param tamano tamaño discreto del orbe
 * @param medida medida libre, si hay; solo se reconocen `rem` y `px`
 * @returns `true` si mide 2rem o menos
 */
export function esOrbeLigero (tamano: string, medida?: string): boolean {
  if (medida === undefined) return tamano === 'chico'
  const coincidencia = /^(\d*\.?\d+)(rem|px)$/.exec(medida.trim())
  if (coincidencia === null) return false
  const valor = Number(coincidencia[1])
  return coincidencia[2] === 'rem' ? valor <= MEDIDA_LIGERA_REM : valor <= MEDIDA_LIGERA_REM * 16
}
