/**
 * Formas de `/notifications`, la bandeja de avisos de quien mira.
 *
 * La API las sirve desde hace tiempo y hasta ahora no las consumia nadie: el panel solo leia
 * `/notifications/settings` y `/notifications/mail-queue` desde Administracion. Esto es lo que la
 * campana necesita, y nada mas — las preferencias por persona (`/notifications/preferences`) quedan
 * fuera a proposito: son una pantalla de ajustes, no un desplegable.
 */

/** Una fila de la bandeja. */
export interface Aviso {
  id: number
  /**
   * Ya viene resuelto por la API: el panel guarda una clave de idioma y Ops guarda texto escrito, y
   * el recurso resuelve las dos. Aca llega listo para pintar.
   */
  text: string
  read: boolean
  date: string
  /**
   * Ruta **del panel clasico** (`#taskid=512`), no de Ops. No se convierte en enlace: llevaria a la
   * gente fuera de este panel, a una pantalla que quizas ni exista alla.
   */
  link: string | null
  /** `null` cuando el aviso lo escribio el sistema y no una persona. */
  from: { id: number, name: string } | null
}

/** `GET /notifications/count`: el punto rojo, sin traerse la lista. */
export interface ConteoDeAvisos {
  total: number
  unread: number
}

/** `POST /notifications/read`: devuelve el contador ya actualizado para no pedirlo aparte. */
export interface MarcadoDeAvisos extends ConteoDeAvisos {
  marked: number
}

/** Cuantos avisos trae el desplegable. Mas no entran en pantalla sin convertirlo en una tabla. */
export const AVISOS_POR_PAGINA = 15
