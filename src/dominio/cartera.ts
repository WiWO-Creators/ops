/**
 * La lógica de la pantalla de Focals: resumir una cartera, filtrarla y ordenarla.
 *
 * Vive en un `.ts` y fuera del componente por la regla de `docs/convenciones.md`: Node despoja los
 * tipos de un `.ts` pero no el JSX, así que sólo lo que está acá se puede probar con `node --test`.
 * Y esto es justo lo que hay que poder probar: un recuento mal hecho no se ve roto —dice un número
 * cualquiera con toda confianza— y es el número que alguien va a usar para decidir a quién llamar.
 *
 * **Acá no se decide quién ve qué.** La API ya recortó la cartera antes de mandarla; estas funciones
 * sólo reordenan y esconden lo que quien mira pidió esconder.
 */

import { contarPorTramo, nombresDeFocales, type CuentaFocal } from '../datos/focals.ts'
import type { SemaforoCliente } from '../datos/recursos'

/**
 * Por qué se puede recortar la lista.
 *
 * Los cuatro tramos y una quinta condición que no es un tramo: la cuenta sin focal. Está en el mismo
 * eje a propósito —se elige una cosa a la vez— porque las dos preguntas que se hacen acá son
 * excluyentes en la práctica: "qué está en rojo" y "de qué no responde nadie".
 */
export type FiltroDeCartera = SemaforoCliente | 'sin_focal' | 'todas'

/** Con qué criterio se apila la cartera. */
export type OrdenDeCartera = 'peor' | 'nombre' | 'criticos'

/** El encabezado de la pantalla: de cuánto se está hablando, y cuánto de eso arde. */
export interface ResumenDeCartera {
  /** Cuántas cuentas hay en total, antes de filtrar. */
  cuentas: number
  /** Cuántas cuentas cayeron en cada tramo del semáforo. */
  porTramo: Record<SemaforoCliente, number>
  /** Cuántas cuentas no tienen a nadie nombrado como focal. */
  sinFocal: number
  /** Cuántos Proyectos suman todas las cuentas. */
  espacios: number
  /** Cuántos de esos Proyectos están en rojo. */
  espaciosCriticos: number
}

/**
 * Cuenta la cartera entera de una pasada.
 *
 * Se cuenta acá y no en el servidor porque las dos llamadas ya trajeron todo: pedir un resumen
 * aparte sería una tercera petición para sumar lo que está en memoria, y un número calculado en otro
 * lado que puede terminar contradiciendo a la lista que se ve debajo.
 *
 * @param cuentas la cartera ya agrupada por cliente
 * @returns los totales, con los cuatro tramos siempre presentes aunque valgan cero
 */
export function resumirCartera (cuentas: CuentaFocal[]): ResumenDeCartera {
  const porTramo: Record<SemaforoCliente, number> = { verde: 0, amarillo: 0, rojo: 0, sin_datos: 0 }
  let sinFocal = 0
  let espacios = 0
  let espaciosCriticos = 0

  for (const cuenta of cuentas) {
    porTramo[cuenta.cliente.semaforo] += 1

    if (nombresDeFocales(cuenta.cliente).length === 0) sinFocal += 1

    espacios += cuenta.espacios.length
    espaciosCriticos += contarPorTramo(cuenta.espacios).rojo
  }

  return { cuentas: cuentas.length, porTramo, sinFocal, espacios, espaciosCriticos }
}

/**
 * Deja sólo las cuentas que quien mira pidió ver.
 *
 * El texto se compara contra el nombre del cliente, el de sus focales y el de cada uno de sus
 * Proyectos. Los Proyectos entran en la búsqueda porque la pregunta real muchas veces no es por la
 * cuenta sino por el trabajo —"dónde está el rediseño"— y quien busca no tiene por qué recordar de
 * qué cliente cuelga.
 *
 * La comparación normaliza acentos: escribir "analitica" tiene que encontrar "Analítica", o el
 * buscador queda inservible para media lista en español.
 *
 * @param cuentas la cartera completa
 * @param texto lo que se escribió en el buscador; vacío no recorta nada
 * @param filtro el tramo o la condición elegida; `'todas'` no recorta nada
 * @returns una copia recortada; el arreglo de entrada no se toca
 */
export function filtrarCartera (
  cuentas: CuentaFocal[],
  texto: string,
  filtro: FiltroDeCartera
): CuentaFocal[] {
  const aguja = normalizar(texto)

  return cuentas.filter((cuenta) => {
    if (filtro === 'sin_focal' && nombresDeFocales(cuenta.cliente).length > 0) return false
    if (filtro !== 'todas' && filtro !== 'sin_focal' && cuenta.cliente.semaforo !== filtro) return false
    if (aguja === '') return true

    return textoDeCuenta(cuenta).includes(aguja)
  })
}

/**
 * Apila la cartera con el criterio elegido.
 *
 * `'peor'` respeta el orden que puso el servidor —del peor score al mejor, con los `sin_datos` al
 * final— y por eso no reordena nada: reimplementar acá ese criterio sería una segunda copia que
 * puede terminar mostrando un orden distinto del que el listado declara.
 *
 * @param cuentas la cartera, tal como llegó
 * @param orden el criterio elegido
 * @returns una copia ordenada; el arreglo de entrada no se toca
 */
export function ordenarCartera (cuentas: CuentaFocal[], orden: OrdenDeCartera): CuentaFocal[] {
  if (orden === 'peor') return [...cuentas]

  if (orden === 'nombre') {
    return [...cuentas].sort((una, otra) => nombreDeCuenta(una).localeCompare(nombreDeCuenta(otra), 'es'))
  }

  return [...cuentas].sort((una, otra) => {
    const diferencia = contarPorTramo(otra.espacios).rojo - contarPorTramo(una.espacios).rojo

    return diferencia !== 0
      ? diferencia
      : nombreDeCuenta(una).localeCompare(nombreDeCuenta(otra), 'es')
  })
}

/** El nombre del cliente, o una marca legible cuando el servidor no lo trae. */
export function nombreDeCuenta (cuenta: CuentaFocal): string {
  return cuenta.cliente.cliente ?? `Cliente #${cuenta.cliente.client_id}`
}

/** Todo lo que se puede escribir en el buscador para dar con una cuenta, ya normalizado. */
function textoDeCuenta (cuenta: CuentaFocal): string {
  const partes = [
    nombreDeCuenta(cuenta),
    ...nombresDeFocales(cuenta.cliente),
    ...cuenta.espacios.map((espacio) => espacio.espacio ?? '')
  ]

  return normalizar(partes.join(' '))
}

/**
 * Minúsculas y sin acentos, para que el buscador no exija teclear la tilde.
 *
 * @param texto lo que se escribió, o un nombre del listado
 * @returns el mismo texto comparable
 */
function normalizar (texto: string): string {
  return texto.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}
