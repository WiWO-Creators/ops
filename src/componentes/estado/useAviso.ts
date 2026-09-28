'use client'

import { avisarAdvertencia, avisarExito, avisarFallo, avisarInfo } from '@/lib/avisos'

/** Lo que `useAviso()` devuelve: una funcion por nivel, todas con la firma `(mensaje, duracionMs?)`. */
export interface FuncionesDeAviso {
  /** Algo salio bien. Ej: `exito('Cliente guardado.')`. */
  exito: (mensaje: string, duracionMs?: number) => void
  /** Un error corriente, que la persona puede resolver de nuevo. No registra incidente. */
  error: (mensaje: string, duracionMs?: number) => void
  /** Algo neutro, para confirmar sin exito ni error. */
  info: (mensaje: string, duracionMs?: number) => void
  /** Algo que conviene mirar, sin ser un error. */
  advertencia: (mensaje: string, duracionMs?: number) => void
}

/**
 * El toast comun del panel: éxito, error, información y advertencia.
 *
 * Es un hook solo por comodidad de uso dentro de componentes de cliente: por abajo llama a las
 * funciones de `lib/avisos.ts`, que ya son estables (viven a nivel de modulo), asi que no hace falta
 * memoizar nada aca. La pila que dibuja los avisos es `<AvisosDeError />`, montada una sola vez en el
 * layout raiz.
 *
 * @returns las cuatro funciones de aviso
 */
export function useAviso (): FuncionesDeAviso {
  return { exito: avisarExito, error: avisarFallo, info: avisarInfo, advertencia: avisarAdvertencia }
}
