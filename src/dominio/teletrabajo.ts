/**
 * Reglas de las salas de Teletrabajo.
 *
 * LiveKit no tiene usuarios ni permisos: crea la sala en cuanto le llega un token firmado y valido,
 * con el nombre que diga el token. Eso significa que **toda** la autorizacion vive de este lado, y
 * que un error aca no da un 403: da una sala a la que entra quien no debia.
 *
 * Por eso la logica esta en dominio y no dentro de las pantallas: se prueba entera sin red, sin
 * LiveKit y sin sesion, en `pruebas/teletrabajo.test.js`.
 *
 * Hay dos clases de sala y se distinguen por el nombre, no por una tabla:
 *
 * - **Comun** — nombre del catalogo fijo de abajo. Entra cualquiera del equipo.
 * - **Privada** — `espacio-<id>`. Entra solo quien sea miembro de ese Espacio en la API.
 *
 * El nombre es la clave primaria de la sala en LiveKit, asi que derivarlo de un dato que ya tiene
 * dueño conocido —el Espacio— evita mantener una lista de invitados aparte y que las dos se
 * desincronicen.
 */

/**
 * Nombres de sala aceptados.
 *
 * Minusculas, digitos y guiones. Acota lo que puede terminar dentro de un JWT firmado y, de paso,
 * deja el nombre usable como segmento de URL sin escapar.
 */
const NOMBRE_DE_SALA = /^[a-z0-9-]{1,64}$/

/** Prefijo de las salas privadas. Un Espacio, una sala. */
const PREFIJO_ESPACIO = 'espacio-'

/**
 * Salas privadas por Espacio.
 *
 * Sin ceros a la izquierda ni `espacio-0`: el id tiene que poder volver a numero y de vuelta a
 * texto sin cambiar, o dos nombres distintos apuntarian a la misma sala.
 */
const SALA_DE_ESPACIO = /^espacio-[1-9]\d*$/

export interface SalaComun {
  id: string
  nombre: string
  descripcion: string
}

/**
 * Catalogo de salas comunes.
 *
 * Fijo y en codigo a proposito: son las salas que existen siempre, y ponerlas en la base obligaria a
 * administrarlas antes de poder usar el modulo. Cuando haya que crearlas desde el panel, esta
 * constante se cambia por una consulta y el resto no se entera.
 *
 * Sin iconos: este archivo no importa nada de React para poder probarse con `node --test` sin
 * montar el arbol de componentes. El icono lo elige la pantalla que las pinta.
 */
export const SALAS_COMUNES: SalaComun[] = [
  {
    id: 'general',
    nombre: 'General',
    descripcion: 'Sala abierta del equipo. Entra cualquiera, a cualquier hora.'
  },
  {
    id: 'cafe',
    nombre: 'Café',
    descripcion: 'Para lo que no necesita agenda: dudas cortas, pausas, conversar.'
  }
]

/**
 * `true` si el texto tiene forma de nombre de sala.
 *
 * Es validacion de forma, no de permiso: que el nombre sea valido no dice que quien lo pide pueda
 * entrar. Eso lo decide `puedeEntrar`.
 *
 * @param sala Nombre crudo, tal como llega de la URL.
 */
export function esNombreDeSalaValido (sala: string): boolean {
  return NOMBRE_DE_SALA.test(sala)
}

/**
 * Busca una sala comun por su nombre.
 *
 * @returns La sala del catalogo, o `null` si el nombre no es de una comun.
 */
export function salaComunPorId (sala: string): SalaComun | null {
  return SALAS_COMUNES.find((comun) => comun.id === sala) ?? null
}

/**
 * Nombre de la sala privada de un Espacio.
 *
 * @param espacioId Id del Espacio en la API.
 * @returns El nombre de sala, o `null` si el id no es un entero positivo.
 */
export function salaDeEspacio (espacioId: number): string | null {
  if (!Number.isInteger(espacioId) || espacioId < 1) return null

  return `${PREFIJO_ESPACIO}${espacioId}`
}

/**
 * Id del Espacio al que pertenece una sala privada.
 *
 * Es la operacion inversa de `salaDeEspacio` y la que usa la pantalla de la sala para saber a que
 * Espacio pedirle los miembros.
 *
 * @param sala Nombre de sala ya validado o no; se valida aca igual.
 * @returns El id, o `null` si la sala no es de un Espacio.
 */
export function espacioDeSala (sala: string): number | null {
  if (!SALA_DE_ESPACIO.test(sala)) return null

  return Number(sala.slice(PREFIJO_ESPACIO.length))
}

/**
 * Decide si alguien puede entrar a una sala.
 *
 * Es el unico lugar donde se responde esa pregunta. Recibe los miembros ya resueltos en vez de
 * pedirlos: asi la regla se prueba sin API, y quien la llama decide como los consigue.
 *
 * Nota sobre `esAdmin`: **no** abre las salas privadas. Un administrador puede ver el Espacio en el
 * panel, pero entrar sin avisar a una conversacion en curso es otra cosa. Si mas adelante hace
 * falta, se agrega aca y se anuncia en la sala, no se cuela por omision.
 *
 * @param sala          Nombre de sala crudo, como llega de la URL.
 * @param staffId       Id de quien pide entrar.
 * @param miembrosDelEspacio Ids del staff que integra el Espacio de la sala. Vacio o `null` si la
 *                      sala no es de Espacio o si el Espacio no tiene miembros cargados.
 */
export function puedeEntrar (
  sala: string,
  staffId: number,
  miembrosDelEspacio: readonly number[] | null
): boolean {
  if (!esNombreDeSalaValido(sala)) return false
  if (!Number.isInteger(staffId) || staffId < 1) return false

  if (salaComunPorId(sala) !== null) return true

  if (espacioDeSala(sala) === null) return false

  return (miembrosDelEspacio ?? []).includes(staffId)
}

/**
 * Identidad con la que alguien se presenta ante LiveKit.
 *
 * Lleva sufijo aleatorio porque LiveKit usa la identidad como clave del participante: dos
 * conexiones con la misma identidad no conviven, la segunda expulsa a la primera. Sin el sufijo,
 * abrir la sala en dos pestañas cerraria la primera sin explicacion.
 *
 * El sufijo entra por parametro y no se genera aca para que la funcion sea determinista y se pueda
 * probar; quien la llama pasa algo aleatorio.
 *
 * @param staffId Id de la persona.
 * @param sufijo  Texto que distingue esta conexion de otra de la misma persona.
 */
export function identidadDe (staffId: number, sufijo: string): string {
  return `staff-${staffId}-${sufijo}`
}
