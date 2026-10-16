/**
 * Lo que se dicen el editor del Meeting Paper y el panel de comentarios en línea (fase 10).
 *
 * El editor sabe del texto (marcar un fragmento, reconocer un clic sobre uno marcado) y el panel sabe
 * de los hilos; este contrato es el único lugar donde se tocan, así `EditorDeActa` no importa nada de
 * la API de comentarios y el panel no importa TipTap.
 */

/** Lo que el editor ofrece al panel mientras está montado. */
export interface ControlDeComentarios {
  /** Quita del texto la marca de un hilo (un comentario que no se llegó a enviar, o un hilo borrado). */
  quitar: (ancla: string) => void
  /** El texto comentado tal como está ahora en el editor; `null` si ya no está. */
  cita: (ancla: string) => string | null
}

/** Lo que el panel le da al editor para que ofrezca «Comentar». */
export interface ComentariosDelEditor {
  /** La persona eligió un fragmento y pidió comentarlo: el editor ya lo marcó con `ancla`. */
  onComentar: (ancla: string, cita: string) => void
  /** Un clic sobre un fragmento que ya tiene un hilo. */
  onElegir: (ancla: string) => void
  /** El editor entrega (o retira, con `null`, al desmontarse) sus operaciones. */
  onControl: (control: ControlDeComentarios | null) => void
}
