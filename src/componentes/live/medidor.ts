/**
 * "El medidor cambió": el aviso que mantiene sincronizada la cabecera con el resto del panel.
 *
 * === EL PROBLEMA ===
 *
 * El cronometro se arranca y se detiene desde cuatro lugares distintos —el control de la cabecera,
 * `proyecto/Cronometros.tsx`, `proyecto/PanelTiempos.tsx` y `proyecto/RegistroRapido.tsx`— y todos
 * escriben sobre el MISMO recurso de la API. Sin este aviso, detener un cronometro desde la ficha de
 * un proceso deja el contador de la cabecera corriendo hasta el proximo intervalo: dos numeros
 * distintos sobre el mismo hecho, en la misma pantalla.
 *
 * === POR QUE UN MODULO Y NO UN CONTEXTO ===
 *
 * Exactamente por lo mismo que `auditoria/accion.ts`, del que esto es una copia deliberada: hay un
 * solo `ControlJornada` en todo el panel y lo unico que necesita es enterarse. Un provider obligaria
 * a envolver el armazon entero y a re-renderizar cada panel de tiempos cuando cambie un estado que
 * no le importa. Aca no se renderiza nada: se avisa.
 *
 * Tampoco hay estado que guardar. Quien escucha vuelve a preguntarle a la API, que es la unica que
 * sabe como quedo: copiar aca el medidor abierto seria una segunda fuente de verdad, que es
 * justamente el problema que este modulo existe para cerrar.
 */

const oyentes = new Set<() => void>()

/**
 * Avisa que alguien arranco, detuvo o registro tiempo.
 *
 * Se llama **antes** del refresco propio de quien muta, no despues: asi los dos viajes salen a la
 * vez y la cabecera no espera a que termine el de la otra pantalla.
 */
export function avisarCambioDeMedidor (): void {
  for (const oyente of oyentes) oyente()
}

/**
 * Se entera cuando el medidor cambia en cualquier parte del panel.
 *
 * @param oyente se llama despues de cada cambio
 * @returns la funcion para dejar de escuchar
 */
export function escucharMedidor (oyente: () => void): () => void {
  oyentes.add(oyente)

  return () => { oyentes.delete(oyente) }
}
