/**
 * El Scope del contrato de un Proyecto: tipos del contrato y la lectura silenciosa de la pestaña
 * Tareas.
 *
 * Contrato: `GET|PUT /projects/{id}/scope`, `POST /ia/proyectos/{id}/scope/interpretar` y
 * `POST /ia/proyectos/{id}/scope/analizar`. Las escrituras van por `escribirEnBff()`; aca solo vive
 * lo que ninguna otra capa del panel ya resuelve.
 */

/** Como se cargo el Scope. */
export type FuenteScope = 'estructurado' | 'texto' | 'pdf'

/** Donde cae una Tarea respecto del Scope. */
export type Veredicto = 'dentro' | 'fuera' | 'dudoso'

/** Quien hizo algo, tal como lo devuelve la API. `null` si la persona ya no existe. */
export interface AutorScope {
  id: number
  nombre: string
}

/** Lo que se entendio del contrato: la parte del Scope que la persona revisa y corrige. */
export interface ContenidoScope {
  resumen: string
  incluye: string[]
  excluye: string[]
  supuestos: string[]
}

/** El Scope guardado. */
export interface Scope extends ContenidoScope {
  fuente: FuenteScope
  texto_original: string | null
  archivo_nombre: string | null
  actualizado_por: AutorScope | null
  actualizado_en: string
}

/** Una Tarea clasificada por el analisis. */
export interface TareaAnalizada {
  task_id: number
  nombre: string
  estado: number
  veredicto: Veredicto
  motivo: string
  /** El item del Scope en el que se apoya el veredicto, o `null`. */
  referencia: string | null
}

/** El ultimo analisis de las Tareas contra el Scope. */
export interface AnalisisScope {
  id: number
  creado_en: string
  creado_por: AutorScope | null
  /** El Scope cambio despues de este analisis: los veredictos pueden no valer. */
  scope_desactualizado: boolean
  resumen: string
  conteo: { total: number, dentro: number, fuera: number, dudoso: number }
  tareas: TareaAnalizada[]
}

/** `data` de `GET|PUT /projects/{id}/scope`. */
export interface EstadoScope {
  puede_editar: boolean
  scope: Scope | null
  analisis: AnalisisScope | null
}

/** `data` de `POST /ia/proyectos/{id}/scope/interpretar`. No guarda nada. */
export interface Interpretacion extends ContenidoScope {
  /** Ambiguedades o vacios del contrato que conviene aclarar antes de guardar. */
  observaciones: string[]
}

/** Cuerpo de `PUT /projects/{id}/scope`. */
export interface CuerpoScope extends ContenidoScope {
  fuente: FuenteScope
  texto_original: string | null
  archivo_nombre: string | null
}

/** Rutas del Scope, sin la base del BFF ni barra inicial. */
export function rutasDeScope (proyectoId: number): { scope: string, interpretar: string, analizar: string } {
  const id = encodeURIComponent(String(proyectoId))

  return {
    scope: `projects/${id}/scope`,
    interpretar: `ia/proyectos/${id}/scope/interpretar`,
    analizar: `ia/proyectos/${id}/scope/analizar`
  }
}

/**
 * Lee el Scope sin avisar nada si falla.
 *
 * La usa la pestaña Tareas para las etiquetas «Fuera de scope»: es un adorno de la tabla, y un
 * Proyecto sin Scope, una API que todavia no expone la ruta o la red caida terminan en lo mismo
 * —ninguna etiqueta—. No pasa por `pedirSobre()` a proposito: ese levanta el aviso flotante de error,
 * y una tabla que saluda con un cartel rojo por un adorno es peor que la tabla sin el.
 *
 * @param ruta la ruta del Scope, sin la base del BFF
 * @param senal señal del componente, para soltar la peticion si se desmonta
 * @returns el estado del Scope, o `null` si no se pudo leer
 */
export async function leerScopeEnSilencio (ruta: string, senal: AbortSignal): Promise<EstadoScope | null> {
  try {
    const respuesta = await fetch(`/api/bff/${ruta}`, { signal: senal })

    if (!respuesta.ok) return null

    const sobre = await respuesta.json() as { data?: EstadoScope }

    return sobre.data ?? null
  } catch {
    return null
  }
}
