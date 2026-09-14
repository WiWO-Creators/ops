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
