import { crearBoardDeTextos } from './board-textos.mjs'

/**
 * Levanta el board falso de textos (`board-textos.mjs`) como proceso suelto, para las pruebas de
 * navegador de la edición conjunta (`pruebas/en-vivo-textos.browser.mjs`): es contra quien habla el
 * servicio de «Ops en vivo» cuando el panel y el mock sirven lo demás.
 *
 * Imprime la URL base (`API_BASE` del servicio) y, por cada guardado que el servicio hace, una línea
 * `PUT {...}`. El secreto de firma es el de prueba de `apoyo/en-vivo.mjs`: el servicio tiene que
 * arrancar con el mismo `EN_VIVO_SECRETO`.
 */
const board = await crearBoardDeTextos({ descripcion: '<p>Descripción inicial de la tarea</p>' })
let vistos = 0

console.log('URL', board.url)

setInterval(() => {
  while (vistos < board.estado.puts.length) console.log('PUT', JSON.stringify(board.estado.puts[vistos++]))
}, 200)
