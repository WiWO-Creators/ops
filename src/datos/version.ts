import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Que version del codigo esta sirviendo este servidor.
 *
 * Existe para una sola cosa: que una pestaña abierta hace horas se entere de que el codigo que tiene
 * cargado ya no es el que hay. El navegador no puede saberlo solo —su JavaScript es justamente el
 * viejo—, asi que lo pregunta.
 */

/** Sin variable ni build id: 5 minutos. Una pestaña vieja no es una urgencia. */
const POR_DEFECTO = 300
/** Por debajo de esto el chequeo deja de ser un chequeo y empieza a ser trafico. */
const MINIMO = 30
/** Por encima de una hora el aviso llega tan tarde que da lo mismo no tenerlo. */
const MAXIMO = 3600

/**
 * La version, resuelta UNA sola vez cuando arranca el proceso.
 *
 * Que se resuelva al arrancar y no en cada peticion no es una optimizacion: es lo que hace que el
 * aviso sea cierto. `next build` reescribe `.next/BUILD_ID` en cuanto termina, pero el proceso que
 * esta atendiendo sigue teniendo el codigo viejo en memoria hasta que alguien lo reinicia. Leyendo el
 * archivo en cada peticion, el aviso saldria en esa ventana, la persona recargaria, recibiria el
 * mismo bundle viejo y el aviso volveria a salir: un "actualiza" que no se arregla actualizando.
 *
 * Leido al arrancar, el valor describe al proceso vivo, que es lo unico que el navegador recibe.
 */
const VERSION = resolverVersion()

/**
 * Resuelve la version del proceso, en orden de preferencia.
 *
 * 1. `OPS_VERSION` del entorno, para despliegues que no conservan `.next` junto al servidor
 *    (contenedor, artefacto copiado) o que prefieren fijarla al SHA del commit.
 * 2. `.next/BUILD_ID`, que Next reescribe en cada build. Es la señal exacta: cambia cuando cambia el
 *    codigo y no cambia cuando el proceso se reinicia solo.
 * 3. El instante de arranque. Es mas grueso —un reinicio sin despliegue tambien avisa— pero nunca
 *    deja el chequeo sin respuesta, y avisar de mas es preferible a no avisar.
 *
 * @returns la version, siempre un texto no vacio
 */
function resolverVersion (): string {
  const delEntorno = process.env.OPS_VERSION?.trim() ?? ''

  if (delEntorno !== '') return delEntorno

  try {
    const id = readFileSync(join(process.cwd(), '.next', 'BUILD_ID'), 'utf8').trim()

    if (id !== '') return id
  } catch {
    // Sin `.next` al lado —dev con Turbopack, o el servidor corriendo desde otra carpeta— se cae al
    // instante de arranque, que es peor pero sirve.
  }

  return `arranque-${Date.now()}`
}

/**
 * La version que este servidor esta sirviendo.
 *
 * @returns el identificador de version, estable durante toda la vida del proceso
 */
export function versionDelServidor (): string {
  return VERSION
}

/**
 * Cada cuantos segundos una pestaña abierta vuelve a preguntar por la version.
 *
 * Se resuelve en el servidor y viaja al navegador como prop, igual que el intervalo de la campana y
 * el del latido. No es `NEXT_PUBLIC_` para no abrir una segunda forma de configurar lo mismo.
 *
 * Se acota en vez de fallar: un valor mal escrito no puede convertir el chequeo en un martillo contra
 * el servidor ni dejar a todo el mundo sin aviso.
 *
 * @returns el intervalo en segundos, siempre dentro de los limites
 */
export function intervaloDeVersion (): number {
  const crudo = Number(process.env.VERSION_INTERVALO_SEGUNDOS)

  if (!Number.isFinite(crudo) || crudo <= 0) return POR_DEFECTO

  return Math.min(Math.max(Math.round(crudo), MINIMO), MAXIMO)
}
