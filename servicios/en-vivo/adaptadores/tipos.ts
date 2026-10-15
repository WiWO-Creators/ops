import type { Doc } from 'yjs'
import type { Document } from '@hocuspocus/server'

/**
 * Lo que el servicio recuerda de cada documento abierto, aparte del propio documento Yjs.
 *
 * `revision` es lo que el board entiende como «la versión que yo vi» (`date_updated` del acta): se
 * devuelve en cada guardado para que el board detecte una edición ajena y conteste 409.
 */
export interface EstadoDeDocumento {
  id: number
  espacioId: number
  revision: string
  /** El HTML del último estado que el board ya tiene (tras pasar por el esquema del editor). */
  ultimoHtml: string
  /** Personas que editaron desde el último guardado. */
  autores: Set<number>
  ultimoEditor: number | null
  /** El último intento de guardar falló por un motivo transitorio y los cambios siguen sin guardar. */
  pendiente: boolean
  reintentos: number
  temporizadorDeReintento: ReturnType<typeof setTimeout> | null
}

export type ResultadoDeGuardado = 'guardado' | 'sin_cambios' | 'recargado' | 'sin_acceso' | 'reintentar' | 'rechazado'

export type ResultadoDeSincronia = 'sin_cambios' | 'recargado' | 'sin_acceso' | 'error'

/** Cómo se carga, guarda y sincroniza un tipo de documento colaborativo contra el board. */
export interface AdaptadorDeDocumento {
  /**
   * Trae el documento del board y lo convierte a Yjs.
   *
   * @throws ErrorDeAdaptador `sin_acceso` si el board contesta 403/404; cualquier otro error si no hay respuesta
   */
  cargar: (id: number) => Promise<{ ydoc: Doc, estado: EstadoDeDocumento }>
  /** Guarda el documento en el board si cambió desde el último guardado. Nunca lanza por estado HTTP. */
  guardar: (documento: Document, estado: EstadoDeDocumento) => Promise<ResultadoDeGuardado>
  /** Sustituye el contenido por el del board y avisa a los conectados. */
  recargar: (documento: Document, estado: EstadoDeDocumento, motivo: string) => Promise<ResultadoDeSincronia>
  /** Si el board tiene una revisión distinta de la conocida, recarga. */
  sincronizar: (documento: Document, estado: EstadoDeDocumento) => Promise<ResultadoDeSincronia>
}

/** Error de un adaptador con un motivo corto y estable (nunca el cuerpo del board). */
export class ErrorDeAdaptador extends Error {
  motivo: string

  constructor (motivo: string) {
    super(motivo)
    this.name = 'ErrorDeAdaptador'
    this.motivo = motivo
  }
}

/** Un documento reconocido: qué adaptador lo maneja y su id. */
export interface DocumentoReconocido {
  adaptador: AdaptadorDeDocumento
  id: number
}
