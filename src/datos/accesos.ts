/**
 * El módulo de accesos (`/accesos`): escalones, personas, el árbol, áreas, cargos y el interruptor.
 *
 * Módulo propio y no un bloque más en `recursos.ts` por lo mismo que `datos/jerarquia.ts` y
 * `datos/live.ts`: lo consume una sola pantalla —`/administracion/accesos`— y tiene su propia forma.
 * La fuente es el contrato del módulo de accesos de la API, que exige superadministrador en todas
 * sus rutas y responde 403 al resto.
 *
 * **Acá solo están las formas del contrato.** Los cuatro escalones —su clave, su nombre y su orden—
 * viven en `dominio/escalon.ts`, que es la única lista del frontend; el catálogo de la API llega con
 * los mismos cuatro y con cuánta gente hay en cada uno, que es lo que el frontend no puede saber.
 */
import type { Escalon } from '../dominio/escalon.ts'

/**
 * Un escalón tal como lo publica el catálogo: los cuatro fijos, con cuánta gente lo tiene puesto.
 *
 * No trae piso ni alcance, y no es un olvido: el escalón dejó de repartir capacidades. Lo que decide
 * cuánto ve alguien es el árbol de personas, y por eso esta pantalla tiene una pestaña para verlo.
 */
export interface EscalonDeAccesos {
  clave: Escalon
  nombre: string
  /** Posición en la escalera, de menor a mayor. Ordena la lista; no hereda nada. */
  orden: number
  personas: number
}

/** Un área de `tblareas` con su lugar en el árbol. */
export interface AreaDeAccesos {
  id: number
  nombre: string
  /** De qué área cuelga. `null` es una raíz del organigrama. */
  area_superior_id: number | null
  /**
   * Quién la dirige. `null` es un área sin jefatura.
   *
   * Es la **segunda fuente del alcance**: quien figura acá ve a toda la gente del subárbol de áreas
   * que cuelga de ella, además de su propia descendencia por la cadena de jefes.
   */
  jefe_staffid: number | null
  personas: number
}

/** Un cargo de `tblcargos`. */
export interface CargoDeAccesos {
  id: number
  nombre: string
  personas: number
}

/**
 * El interruptor de emergencia de la jerarquía, con su nombre legible y qué pasa al apagarlo.
 *
 * `valor` es una cadena y no un booleano porque así viven en `tbloptions`: `'1'` y `'0'`.
 */
export interface InterruptorDeAccesos {
  clave: string
  valor: string
  nombre: string
  descripcion: string
}

/** Todo lo que la pantalla necesita, en una sola llamada (`GET /accesos/catalogo`). */
export interface CatalogoDeAccesos {
  escalones: EscalonDeAccesos[]
  areas: AreaDeAccesos[]
  cargos: CargoDeAccesos[]
  /** El catálogo de capacidades de Perfex: `feature -> capacidades posibles`. */
  features: Record<string, string[]>
  interruptores: InterruptorDeAccesos[]
}

/** Una fila del listado paginado de `GET /accesos/personas`. */
export interface PersonaDeAccesos {
  staffid: number
  nombre: string
  correo: string
  escalon: Escalon
  /** De quién cuelga en el árbol. `null` es alguien desenganchado. */
  jefe_staffid: number | null
  /** El nombre del jefe, resuelto por la API para no pedir la lista entera solo para pintarlo. */
  jefe_nombre: string | null
  area_id: number | null
  cargo_id: number | null
  activo: boolean
  /**
   * Si coordina varias áreas: **lee** todos los Procesos, Espacios y Clientes de la casa y sigue
   * escribiendo solo los suyos y los de su descendencia.
   *
   * Es el tercer rol del eje 1, al lado de `is_admin` y `is_superadmin`, y el único que se reparte
   * desde esta pantalla. No abre nada de Administración.
   */
  coordinador_multiarea: boolean
}

/**
 * Cuerpo de `PUT /accesos/personas/{staffId}`: solo lo que cambia.
 *
 * Cada campo es opcional y la API escribe únicamente el que venga. `jefe_staffid: null` **no** es "no
 * mandar nada": desengancha a la persona del árbol y la deja viendo solo lo suyo.
 */
export interface CambioDePersona {
  escalon?: Escalon
  jefe_staffid?: number | null
  area_id?: number | null
  cargo_id?: number | null
  coordinador_multiarea?: boolean
}

/** Un nodo de `GET /accesos/arbol`: quién es, qué puesto tiene y de quién cuelga. */
export interface NodoDeArbol {
  staffid: number
  nombre: string
  escalon: Escalon
  jefe_staffid: number | null
}

/**
 * Lo que hay dentro de un área (`GET /accesos/areas/{id}/uso`).
 *
 * No viene en el catálogo y se pide recién al abrir el borrado: contar los Procesos etiquetados
 * recorre el campo personalizado de todas las tareas, y eso no se paga para pintar una tabla.
 */
export interface UsoDeArea {
  id: number
  nombre: string
  /** Personas asignadas al área, activas o no. */
  personas: number
  /** Áreas que cuelgan de ella. */
  hijas: number
  /** Procesos marcados con el nombre del área en su campo personalizado. */
  procesos: number
}

/** Cuerpo de `POST|PUT /accesos/areas`. */
export interface CuerpoDeArea {
  nombre: string
  area_superior_id: number | null
  jefe_staffid: number | null
}
