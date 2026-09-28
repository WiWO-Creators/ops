/**
 * Logica pura de `ConfirmarBorrado`, separada del componente para poder probarla sin React.
 */

/**
 * Si lo escrito habilita el boton de confirmar.
 *
 * Sin `confirmacionEscrita` (lo que va a la papelera y se puede restaurar) no hace falta escribir
 * nada: siempre coincide. Con ella, tiene que calzar exacto salvo los espacios de los bordes, que se
 * descartan de los dos lados para no exigir un espacio invisible que nadie ve que falta.
 *
 * @param confirmacionEscrita el texto que hay que escribir, o `undefined` si no se pide ninguno
 * @param escrito lo que la persona escribio hasta ahora
 * @returns `true` si el boton de confirmar puede habilitarse
 */
export function confirmacionCoincideCon (confirmacionEscrita: string | undefined, escrito: string): boolean {
  if (confirmacionEscrita === undefined) return true

  return escrito.trim() === confirmacionEscrita.trim()
}
