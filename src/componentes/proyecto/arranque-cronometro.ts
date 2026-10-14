import { avisarCambioDeMedidor } from '@/componentes/live/medidor'
import type { FuncionesDeAviso } from '@/componentes/estado/useAviso'
import { leerArranque } from './estado-proceso'

/**
 * Reacciona a `meta.timer` despues de pasar una tarea a "En progreso".
 *
 * Si el cronometro arranco, avisa al resto del panel para que la cabecera lo muestre ya (sin esperar
 * al siguiente sondeo). Si no pudo arrancar, el cambio de estado igual se guardo y se le dice a la
 * persona por que no hay cronometro, con el toast comun, para que no crea que esta midiendo tiempo.
 *
 * @param meta el `meta` de la respuesta de la escritura
 * @param avisar las funciones de `useAviso()`
 */
export function atenderArranque (meta: unknown, avisar: FuncionesDeAviso): void {
  const arranque = leerArranque(meta)

  if (arranque === null) return

  if (arranque.started) {
    avisarCambioDeMedidor()

    return
  }

  if (arranque.message !== null) avisar.advertencia(arranque.message)
}
