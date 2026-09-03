import type { Paginacion } from '@/datos/tipos'

/**
 * Definiciones declarativas de recurso.
 *
 * Un modulo no escribe pantallas: escribe una definicion, y los motores de Tabla y Tablero la
 * consumen. Es lo que hace que doce modulos no sean cuarenta y siete archivos casi iguales.
 *
 * Las listas de `filtros`, `orden` e `include` deben coincidir con las whitelists del backend: un
 * valor no declarado alli devuelve `422`, no se ignora. Cuando el backend agregue un filtro, se
 * agrega aca; mientras tanto, `construirConsulta` no lo deja salir.
 */

/** Como se presenta el valor de una columna. El motor no sabe de negocio: recibe la fila y devuelve nodo. */
export type Presentador<T> = (fila: T) => React.ReactNode

export interface Columna<T> {
  /** Identifica la columna. Coincide con la clave de la API cuando la columna es un campo directo. */
  clave: string
  encabezado: string
  presentar: Presentador<T>
  /**
   * Nombre del campo por el que ordena, tal como lo acepta el backend. Ausente = no ordenable.
   * No tiene por que ser igual a `clave`: la columna "Vence" ordena por `due_date`.
   */
  ordenPor?: string
  /** Alinea a la derecha y usa cifras tabulares. Para importes y cantidades. */
  numerica?: boolean
  /**
   * Pinta el valor como insignia, resolviendo su nombre y su color contra un catalogo de `/lookups`.
   *
   * Sin esto la columna muestra el id crudo —un "2" donde deberia decir "En progreso"—, y un estado
   * que solo se distingue por color no se puede leer sin ver color. El valor que devuelve `presentar`
   * se usa como clave de busqueda.
   *
   * Ej: `'task_statuses'`, la misma clave que usan los filtros.
   */
  comoInsignia?: string
  /** La columna arranca oculta y se activa desde el selector de columnas. */
  ocultaPorDefecto?: boolean
}

export type TipoFiltro = 'seleccion' | 'multiple' | 'booleano' | 'rangoFechas'

export interface OpcionFiltro {
  valor: string
  etiqueta: string
  color?: string
}

export interface Filtro {
  /**
   * Nombre del filtro tal como lo acepta el backend, sin el envoltorio `filter[...]`.
   * Ej: `status`, `priority`, `project_id`.
   */
  clave: string
  etiqueta: string
  tipo: TipoFiltro
  /**
   * De donde salen las opciones cuando son configurables en Perfex.
   * Ej: `task_statuses`. Las opciones fijas van en `opciones`.
   */
  desdeLookup?: string
  opciones?: OpcionFiltro[]
  /**
   * Las dos claves que el backend usa para el rango, en orden desde/hasta. Solo para `rangoFechas`.
   *
   * Un rango es UN control con DOS parametros: la API expone `filter[date_from]` y `filter[date_to]`
   * por separado, y ambos van sobre el mismo campo (`duedate` en Procesos, `start_date` en Espacios).
   * Declararlos como dos filtros sueltos pinta dos controles de rango —cuatro campos de fecha— y
   * manda `filter[date_from]=a,b`, que el backend lee como `IN (a, b)` y no como rango.
   */
  clavesRango?: [string, string]
}

export interface DefinicionTablero {
  /** Clave de `GET /lookups` con las columnas del tablero. Ej: `task_statuses`. */
  columnasDesde: string
  /** Ruta de la accion de mover, con `:id`. Ej: `tasks/:id/mover`. */
  rutaMover: string
  /** Presenta una tarjeta. Recibe la misma fila que la tabla. */
  presentarTarjeta: Presentador<unknown>
}

export interface AccionRecurso {
  clave: string
  etiqueta: string
  /** Ruta relativa al recurso, con `:id`. Ej: `tasks/:id/actions/mark-complete`. */
  ruta: string
  metodo: 'POST' | 'DELETE'
  /** Capacidad que hace falta para verla. Se compara contra `permissions` de `/me`. */
  requiere?: 'view' | 'create' | 'edit' | 'delete'
}

export interface DefinicionRecurso<T> {
  /** Primer segmento de la ruta en la API. Ej: `tasks`. */
  ruta: string
  /** Clave del glosario que da el nombre visible. */
  titulo: { singular: string, plural: string }
  columnas: Array<Columna<T>>
  filtros: Filtro[]
  /** Campos que el backend acepta en `sort`. */
  ordenables: string[]
  /**
   * Orden por defecto, con `-` para descendente. Cada campo debe estar en `ordenables`.
   * Un arreglo compone un orden de varios campos (ej. `['completed', '-date_added']`).
   */
  ordenPorDefecto: string | string[]
  /** El recurso acepta el parametro `q`. */
  busqueda: boolean
  /** Valores que el backend acepta en `include`. */
  includes: string[]
  /** Includes que se piden siempre. Deben estar en `includes`. */
  incluirSiempre?: string[]
  /**
   * Query string que se manda **siempre**, fuera del control de la vista. Sin `?` inicial.
   *
   * Existe para acotar un listado a un dueño que la ruta no expresa: `GET /tasks` no tiene forma
   * `/clients/{id}/tasks`, asi que la pestaña Tareas de un Cliente se acota con
   * `filter[clientid]=113`. Declararlo como un filtro comun lo dejaria en la URL, editable por
   * quien mira, y bastaria cambiar el numero para ver las Tareas de otro cliente bajo este
   * encabezado. Lo que va aca no viaja en la URL y no lo poda `construirConsulta`.
   */
  consultaFija?: string
  tablero?: DefinicionTablero
  acciones?: AccionRecurso[]
}

/**
 * Estado de una vista de lista, tal como viaja en la URL.
 *
 * Vive en la URL a proposito: asi una vista filtrada se comparte con un enlace y el boton "atras"
 * hace lo que la persona espera.
 */
export interface EstadoConsulta {
  pagina: number
  porPagina: number
  /** Multiples valores por filtro se envian como lista separada por comas: el backend los traduce a `IN`. */
  filtros: Record<string, string[]>
  /** Campos de orden, con `-` para descendente. */
  orden: string[]
  busqueda: string
  includes: string[]
}

export interface ResultadoLista<T> {
  filas: T[]
  paginacion: Paginacion | undefined
}
