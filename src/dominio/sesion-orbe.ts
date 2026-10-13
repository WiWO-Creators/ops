import { vaciarCapacidadesOrbe } from './cache-capacidades.ts'
import { vaciarFasesOrbe } from './fase-orbe.ts'
import { vaciarHilos } from './ia-chat.ts'

/**
 * Olvida todo el estado del orbe que vive en memoria: hilos, capacidades (también las que aún
 * vuelan) y fases. Es lo que hay que llamar al cerrar sesión: el módulo dura lo que la pestaña, y
 * quien inicie sesión después en el mismo navegador no debe ver nada de la persona anterior.
 */
export function cerrarSesionOrbe (): void {
  vaciarHilos()
  vaciarCapacidadesOrbe()
  vaciarFasesOrbe()
}
