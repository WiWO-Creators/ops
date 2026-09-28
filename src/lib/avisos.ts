/**
 * El canal de avisos comunes (toast) del panel: éxito, error liviano, información y advertencia.
 *
 * Es un evento del `window`, igual que `lib/aviso-de-error.ts`, y no un contexto de React: quien
 * avisa casi nunca es un componente (un cliente de datos, un `catch` de una mutación) y no siempre
 * puede llamar a un hook. `useAviso()` existe para el código que sí vive dentro del árbol, pero por
 * abajo dispara el mismo evento.
 *
 * Este canal es distinto del de `aviso-de-error.ts`: ese registra un incidente con código de ocho
 * hexadecimales y no se cierra solo, porque el código hay que poder copiarlo. Este es el aviso
 * corriente —"Guardado", "No se pudo guardar", "Ya se envió"— que se lee y se va solo.
 */

/** Los cuatro niveles del aviso común. */
export type NivelAviso = 'exito' | 'error' | 'info' | 'advertencia'

/** Lo que viaja en el evento: el mensaje, el nivel y, si se quiere, cuánto dura antes de cerrarse. */
export interface AvisoEmitido {
  mensaje: string
  nivel: NivelAviso
  /** Milisegundos visible antes de auto-cerrarse. Sin esto, se usa {@link duracionPorNivel}. */
  duracionMs?: number
}

/** Nombre del evento. Con prefijo propio para no chocar con ningun evento del navegador. */
export const EVENTO_AVISO = 'ops:aviso'

/**
 * Cuanto dura un aviso en pantalla antes de cerrarse solo, segun su nivel.
 *
 * Los que informan (éxito, información) duran menos: no piden nada, solo confirman. Los que advierten
 * un problema duran mas, porque la persona necesita mas tiempo para leerlos y decidir que hacer.
 *
 * @param nivel el nivel del aviso
 * @returns milisegundos que el aviso queda visible
 */
export function duracionPorNivel (nivel: NivelAviso): number {
  switch (nivel) {
    case 'exito':
    case 'info':
      return 4000
    case 'advertencia':
    case 'error':
      return 6000
  }
}

/**
 * Emite un aviso comun para que la pila lo muestre.
 *
 * Emitir es seguro en el servidor: si no hay `window`, no pasa nada. Eso deja que el mismo modulo lo
 * importen componentes de cliente y de servidor sin partirlo en dos.
 *
 * @param aviso el mensaje, el nivel y, si se quiere, cuanto dura
 */
export function emitirAviso (aviso: AvisoEmitido): void {
  if (typeof window === 'undefined') return

  window.dispatchEvent(new CustomEvent<AvisoEmitido>(EVENTO_AVISO, { detail: aviso }))
}

/** Avisa que algo salió bien. Ej: "Cliente guardado.". */
export function avisarExito (mensaje: string, duracionMs?: number): void {
  emitirAviso({ mensaje, nivel: 'exito', duracionMs })
}

/**
 * Avisa un error corriente, sin registrarlo como incidente.
 *
 * Para un error que nadie esperaba y que hay que poder investigar despues, usa `avisarError()` de
 * `lib/aviso-de-error.ts`: ese guarda un incidente con codigo. Este es para lo que la persona misma
 * puede resolver de nuevo: "No se pudo guardar: revisa la conexión.".
 */
export function avisarFallo (mensaje: string, duracionMs?: number): void {
  emitirAviso({ mensaje, nivel: 'error', duracionMs })
}

/** Avisa algo neutro, sin exito ni error. Ej: "Se copio el enlace.". */
export function avisarInfo (mensaje: string, duracionMs?: number): void {
  emitirAviso({ mensaje, nivel: 'info', duracionMs })
}

/** Avisa algo que conviene mirar, sin ser un error. Ej: "Quedan 2 minutos de sesión.". */
export function avisarAdvertencia (mensaje: string, duracionMs?: number): void {
  emitirAviso({ mensaje, nivel: 'advertencia', duracionMs })
}

/** Lo minimo que necesita una cola para identificar sus elementos. */
interface ElementoDeCola {
  id: number
}

/**
 * Agrega un elemento a una cola con techo, descartando los mas viejos que sobren.
 *
 * Pura y generica a proposito: la usan tanto la pila de incidentes como la de avisos comunes, y una
 * prueba unitaria la puede ejercitar sin montar nada de React.
 *
 * @param cola la cola actual
 * @param nuevo el elemento a agregar, al final
 * @param maximo cuantos elementos quedan como maximo, contando el nuevo
 * @returns la cola con el nuevo elemento, recortada al maximo
 */
export function agregarACola<T extends ElementoDeCola> (cola: readonly T[], nuevo: T, maximo: number): T[] {
  // `slice(-0)` en JS devuelve el arreglo entero y no uno vacio: un techo de cero necesita su propio
  // caso, o la pila mostraria un aviso pese a que el limite dice que no cabe ninguno.
  if (maximo <= 0) return []

  const pila = [...cola, nuevo]

  return pila.slice(-maximo)
}

/**
 * Quita un elemento de la cola por su id.
 *
 * @param cola la cola actual
 * @param id el id a quitar
 * @returns la cola sin ese elemento; sin cambios si no estaba
 */
export function quitarDeCola<T extends ElementoDeCola> (cola: readonly T[], id: number): T[] {
  return cola.filter((elemento) => elemento.id !== id)
}
