/**
 * El Scope del contrato de un Proyecto: tipos del contrato y la lectura silenciosa de la pestaña
 * Tareas.
 *
 * Contrato: `GET|PUT /projects/{id}/scope`, `POST /ia/proyectos/{id}/scope/interpretar` y
 * `POST /ia/proyectos/{id}/scope/analizar`. El scope principal vive en el Contrato
 * (`GET|PUT /contratos/{id}/scope`, `POST /ia/contratos/{id}/scope/interpretar`) y los Proyectos
 * creados «dentro del scope» lo heredan. Las escrituras van por `escribirEnBff()`; aca solo vive
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

/** De quien es el Scope que se lee: del Proyecto mismo o heredado de su Contrato. */
export type OrigenScope = 'propio' | 'contrato'

/** El Scope guardado. */
export interface Scope extends ContenidoScope {
  origen: OrigenScope
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

/** A que Contrato se vinculo el Proyecto al crearlo. `dentro_scope` falso es cotizacion aparte. */
export interface VinculoScope {
  contrato_id: number
  asunto: string
  dentro_scope: boolean
}

/** `data` de `GET|PUT /projects/{id}/scope`. */
export interface EstadoScope {
  puede_editar: boolean
  /** `null` si el Proyecto se creo sin Contrato. */
  vinculo: VinculoScope | null
  scope: Scope | null
  analisis: AnalisisScope | null
}

/** Un Proyecto que usa el Scope de un Contrato, o que se cotizo aparte de el. */
export interface ProyectoDelContrato {
  id: number
  nombre: string
  dentro_scope: boolean
}

/** `data` de `GET|PUT /contratos/{id}/scope`. */
export interface EstadoScopeContrato {
  puede_editar: boolean
  scope: Scope | null
  proyectos: ProyectoDelContrato[]
}

/** Las dos rutas que necesita el editor, sea de un Proyecto o de un Contrato. */
export interface RutasEditablesDeScope {
  scope: string
  interpretar: string
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

/** Rutas del Scope principal de un Contrato, sin la base del BFF ni barra inicial. */
export function rutasDeScopeContrato (contratoId: number): RutasEditablesDeScope {
  const id = encodeURIComponent(String(contratoId))

  return {
    scope: `contratos/${id}/scope`,
    interpretar: `ia/contratos/${id}/scope/interpretar`
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
