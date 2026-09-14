/**
 * El módulo de accesos (`/accesos`): escalones, roles, personas, áreas, cargos e interruptores.
 *
 * Módulo propio y no un bloque más en `recursos.ts` por lo mismo que `datos/jerarquia.ts` y
 * `datos/live.ts`: lo consume una sola pantalla —`/administracion/accesos`— y tiene su propia forma.
 * La fuente es el contrato del módulo de accesos de la API, que exige superadministrador en todas
 * sus rutas y responde 403 al resto.
 *
 * **Acá está la fuente de verdad de los escalones desde que existe el catálogo.** Los `NIVELES` de
 * `componentes/equipo/nivel.ts` y los `NIVELES_BASE` de `nivelBase.ts` siguen existiendo porque los
 * usan las dos puertas viejas de la ficha de una persona, pero son listas escritas a mano: acá los
 * escalones llegan de la API, con su piso y su alcance, y una fila nueva en `tblwiwo_escalones`
 * aparece sola en esta pantalla.
 */

/** Cuántas filas ve un escalón. Espeja `Acceso\Alcance`. */
export type AlcanceDeEscalon = 'propio' | 'area' | 'todo'

/**
 * Lo que un escalón otorga por sí mismo, sin heredar: `feature -> capacidades`.
 *
 * Las claves y los valores son los del catálogo de capacidades de Perfex (`catalogo.features`), no
 * una lista propia: inventar nombres acá produciría casillas que la API rechaza con 422.
 */
export type PisoDeEscalon = Record<string, string[]>

/** Una fila de `tblwiwo_escalones`, con cuánta gente la usa. */
export interface Escalon {
  /** Identificador estable, `[a-z_]{2,30}`. No se puede cambiar nunca. */
  clave: string
  nombre: string
  /** Posición en la escalera. El orden **es** la herencia del piso. */
  orden: number
  piso: PisoDeEscalon
  alcance: AlcanceDeEscalon
  /** Si cuenta como jefatura en los resúmenes de equipo. */
  jefatura: boolean
  /** Si el override por persona lo puede escribir. */
  asignable: boolean
  /** `usuario`, `admin` y `superadmin`: no se borran y no cambian orden ni alcance. */
  sistema: boolean
  personas: number
}

/** Un rol de `tblroles` y a qué escalón mapea. `escalon` en `null` es un rol sin mapeo. */
export interface RolDeAccesos {
  id: number
  nombre: string
  escalon: string | null
  personas: number
}

/** Un área de `tblareas` con su lugar en el árbol. */
export interface AreaDeAccesos {
  id: number
  nombre: string
  /** De qué área cuelga. `null` es una raíz del organigrama. */
  area_superior_id: number | null
  /** Quién la dirige. `null` es un área sin jefatura. */
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
 * Un interruptor de permisos, con su nombre legible y qué pasa al apagarlo.
 *
 * `valor` es una cadena y no un booleano porque así viven en `tbloptions`: `'1'` y `'0'`.
 */
export interface InterruptorDeAccesos {
  clave: string
  valor: string
  tipo: string
  nombre: string
  descripcion: string
}

/** Todo lo que la pantalla necesita, en una sola llamada (`GET /accesos/catalogo`). */
export interface CatalogoDeAccesos {
  escalones: Escalon[]
  roles: RolDeAccesos[]
  areas: AreaDeAccesos[]
  cargos: CargoDeAccesos[]
  /** El catálogo de capacidades de Perfex: `feature -> capacidades posibles`. */
  features: Record<string, string[]>
  alcances: AlcanceDeEscalon[]
  interruptores: InterruptorDeAccesos[]
}

/** Una fila del listado paginado de `GET /accesos/personas`. */
export interface PersonaDeAccesos {
  staffid: number
  nombre: string
  correo: string
  rol_id: number | null
  /** El escalón que gobierna hoy, con banderas, override y rol ya resueltos por la API. */
  escalon_efectivo: string
  /** Solo el override por persona, o `null` si hereda el de su rol. */
  escalon_override: string | null
  area_id: number | null
  area_ids?: number[]
  cargo_id: number | null
  activo: boolean
}

/**
 * Cuerpo de `PUT /accesos/personas/{staffId}`: solo lo que cambia.
 *
 * Cada campo es opcional y la API escribe únicamente el que venga. `escalon: null` **no** es "no
 * mandar nada": borra el override y devuelve a la persona al escalón de su rol.
 */
export interface CambioDePersona {
  rol_id?: number | null
  escalon?: string | null
  area_id?: number | null
  area_ids?: number[]
  cargo_id?: number | null
}

/** Cuerpo de `POST|PUT /accesos/escalones`. En los de sistema solo viaja `nombre`. */
export interface CuerpoDeEscalon {
  clave?: string
  nombre: string
  orden?: number
  piso?: PisoDeEscalon
  alcance?: AlcanceDeEscalon
  jefatura?: boolean
  asignable?: boolean
}

/** Cuerpo de `POST|PUT /accesos/areas`. */
export interface CuerpoDeArea {
  nombre: string
  area_superior_id: number | null
  jefe_staffid: number | null
}
