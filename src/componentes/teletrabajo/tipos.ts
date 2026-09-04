/**
 * Tipos compartidos del modulo de Teletrabajo.
 *
 * Viven aparte de los componentes para que la antesala, la llamada y las paginas del servidor
 * hablen del mismo dato sin importarse componentes entre si.
 */

/** Quien mira, tal como lo necesita el modulo. Es un recorte de `Yo`, no la respuesta entera. */
export interface Quien {
  nombre: string
  imagen: string | null
}

/**
 * Lo que la antesala decide y la llamada obedece.
 *
 * Se elige antes de conectar y no despues: pedirle a LiveKit que arranque con un microfono y
 * despues cambiarlo produce un salto de audio que se oye en la sala.
 */
export interface EleccionDeEntrada {
  microfono: boolean
  camara: boolean
  /** `undefined` = el dispositivo por defecto del sistema. */
  idMicrofono?: string
  idCamara?: string
}
