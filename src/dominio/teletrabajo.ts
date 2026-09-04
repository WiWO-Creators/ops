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

/** Como queda repartido el mosaico de fichas. */
export interface Mosaico {
  columnas: number
  filas: number
  /** Ancho exacto de cada ficha, en pixeles. El alto sale de la proporcion. */
  anchoDeFicha: number
}

/**
 * Cuanto puede achicarse una ficha a cambio de repartir a lo ancho.
 *
 * Sin esta holgura, dos personas en una pantalla apaisada terminan **apiladas**: la cuenta dice que
 * una sola columna deja la ficha un 3% mas grande, y gana por eso. Pero un 3% de lado no se nota y
 * media pantalla vacia a los costados si. Dentro de este margen manda el reparto con mas columnas,
 * que es el que se parece a una reunion y no a una lista.
 */
const HOLGURA_A_LO_ANCHO = 0.9

/**
 * Tope de participantes que acepta el servidor (`livekit/livekit.yaml`, `max_participants`).
 *
 * Acota el barrido de `mosaico`: sin tope, una cantidad absurda haria un bucle igual de absurdo.
 */
const MAXIMO_DE_FICHAS = 50

/**
 * Reparte N fichas en el escenario buscando la ficha mas grande posible.
 *
 * Es la pieza que faltaba y por la que un video en una sala vacia salia del tamaño de la pantalla:
 * una grilla de `auto-fit` sabe cuantas columnas entran a lo ancho, pero **no sabe cuantas filas
 * hay**, asi que no puede repartir el alto. Con una sola persona, la unica celda se comia el
 * escenario entero y el `object-fit: cover` del video recortaba la cara hasta llenarlo.
 *
 * El metodo es fuerza bruta: se prueba cada cantidad de columnas y gana la que deja la ficha mas
 * grande conservando la proporcion pedida. Son como mucho 50 candidatos —el tope del servidor— y
 * corre una vez por cambio de tamaño del contenedor, no por fotograma.
 *
 * Recibe la medida en vez de leerla del DOM para poder probarse sin navegador.
 *
 * @param cantidad   Cuantas fichas hay que colocar.
 * @param ancho      Ancho disponible del escenario, en pixeles.
 * @param alto       Alto disponible del escenario, en pixeles.
 * @param hueco      Separacion entre fichas, en pixeles.
 * @param proporcion Proporcion deseada de cada ficha (ancho / alto). 16:9 por defecto.
 * @returns Columnas y filas del mosaico. Nunca menos de 1 de cada una.
 */
export function mosaico (
  cantidad: number,
  ancho: number,
  alto: number,
  hueco: number,
  proporcion: number = 16 / 9
): Mosaico {
  const fichas = Math.min(Math.max(Math.trunc(cantidad), 1), MAXIMO_DE_FICHAS)

  // Antes del primer `ResizeObserver` el contenedor todavia no mide nada. Repartir en cuadrado es
  // la aproximacion correcta para ese fotograma: la medida real llega enseguida y corrige.
  if (!(ancho > 0) || !(alto > 0)) {
    const columnas = Math.ceil(Math.sqrt(fichas))
    return { columnas, filas: Math.ceil(fichas / columnas), anchoDeFicha: 0 }
  }

  let mejor: Mosaico = { columnas: 1, filas: fichas, anchoDeFicha: 0 }
  let mejorLado = -1

  for (let columnas = 1; columnas <= fichas; columnas++) {
    const filas = Math.ceil(fichas / columnas)

    const anchoDeCelda = (ancho - hueco * (columnas - 1)) / columnas
    const altoDeCelda = (alto - hueco * (filas - 1)) / filas

    // Una celda que ya no entra no compite: con muchas columnas el ancho disponible se vuelve
    // negativo y, sin este corte, ganaria por comparar numeros sin sentido.
    if (anchoDeCelda <= 0 || altoDeCelda <= 0) continue

    // La ficha es la caja de la proporcion pedida **mas grande que entra en la celda**, no la celda
    // entera. Estirar el video hasta los bordes de una celda apaisada es lo que lo hacia aparecer
    // recortado y enorme: llena por `cover` y lo que sobra se corta.
    const lado = Math.min(anchoDeCelda, altoDeCelda * proporcion)

    // Gana el que deja la ficha mas grande, salvo dentro de la holgura: ahi gana el de mas
    // columnas, que es el que se sigue evaluando despues. Ver `HOLGURA_A_LO_ANCHO`.
    if (lado >= mejorLado * HOLGURA_A_LO_ANCHO) {
      mejorLado = Math.max(lado, mejorLado)
      mejor = { columnas, filas, anchoDeFicha: lado }
    }
  }

  return mejor
}

/**
 * Saca la foto de perfil de la metadata de un participante.
 *
 * LiveKit no tiene un campo para la foto: `metadata` es el unico lugar donde un dato del producto
 * llega a los demas participantes, y viaja como texto. Por eso se parsea con desconfianza — puede
 * venir vacia, de una version anterior del formato, o de un token firmado a mano — y cualquier cosa
 * rara devuelve `null` en vez de tirar la pantalla entera de la llamada.
 *
 * Vive en dominio y no dentro de un componente porque la usan tres lugares: las fichas de video, el
 * panel de participantes y la consulta de quien esta dentro que corre en el servidor.
 *
 * @param metadata Cadena cruda del participante.
 * @returns La URL de la foto, o `null` si no hay o no se pudo leer.
 */
export function imagenDeMetadata (metadata: string | undefined): string | null {
  if (metadata === undefined || metadata === '') return null

  try {
    const leido: unknown = JSON.parse(metadata)

    if (typeof leido !== 'object' || leido === null) return null

    const imagen = (leido as { imagen?: unknown }).imagen

    return typeof imagen === 'string' && imagen !== '' ? imagen : null
  } catch {
    return null
  }
}
