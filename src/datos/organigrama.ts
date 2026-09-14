/**
 * El organigrama visual (`GET /organigrama`).
 *
 * Módulo propio y no un bloque más en `recursos.ts`, por lo mismo que `datos/jerarquia.ts`: tiene su
 * propia forma y lo consume un solo componente. La fuente es `contrato-organigrama.md`.
 *
 * **Ver el organigrama no otorga acceso a los datos de nadie.** Son dos preguntas distintas: el
 * alcance decide qué filas alcanza una persona; esto decide qué parte del dibujo se le muestra, y es
 * a propósito la más permisiva de las dos — un organigrama que esconde media casa no sirve para
 * orientarse. La API ya recorta por quien pregunta: **el frontend no repite la regla de visibilidad**,
 * porque una segunda copia diverge y termina escondiendo o mostrando lo que no toca.
 */
import type { Escalon } from '../dominio/escalon.ts'

/** Quién está mirando, y qué puede hacer con lo que ve. */
export interface YoEnOrganigrama {
  staffid: number
  /**
   * Si puede reasignar jefaturas desde la pantalla.
   *
   * Es `esSuperadmin()` del lado de la API. Sin esto la pantalla es de sólo lectura: no arrastra, no
   * abre el panel de edición y no ofrece un botón que terminaría en 403.
   */
  puede_editar: boolean
  /** Las áreas que lleva puesta. Sirven para abrir la suya primero, no para recortar nada. */
  areas: number[]
}

/**
 * Un área tal como la pinta la tarjeta del mapa.
 *
 * `personas` y `leads` cuentan **sólo lo que quien pregunta puede ver**. Es deliberado: si la cuenta
 * fuera la real y el árbol mostrara menos, la tarjeta prometería gente que al entrar no aparece.
 */
export interface AreaDelOrganigrama {
  id: number
  nombre: string
  /** De qué área cuelga. `null` es una raíz. */
  area_superior_id: number | null
  /** Quién la dirige. `null` es un área sin jefatura: su gente no reporta a nadie por esta vía. */
  jefe_staffid: number | null
  personas: number
  leads: number
}

/** Una persona: lo mínimo para dibujar su caja y moverla de jefe. */
export interface PersonaDelOrganigrama {
  staffid: number
  nombre: string
  correo: string
  avatar: string | null
  escalon: Escalon
  /** De quién cuelga en el árbol. `null` es alguien desenganchado. */
  jefe_staffid: number | null
  /** El área que lleva puesta. `null` va al grupo "Sin área", que se muestra y no se esconde. */
  area_id: number | null
  activo: boolean
}

/** La respuesta entera de `GET /organigrama`. */
export interface Organigrama {
  yo: YoEnOrganigrama
  areas: AreaDelOrganigrama[]
  personas: PersonaDelOrganigrama[]
}

/**
 * Cuerpo de `PUT /accesos/personas/{staffid}` tal como lo manda esta pantalla.
 *
 * Sólo lo que cambia: la API escribe únicamente las claves presentes. `jefe_staffid: null` **no** es
 * "no mandar nada", es desenganchar a la persona del árbol.
 */
export interface CambioDeJefatura {
  escalon?: Escalon
  jefe_staffid?: number | null
  area_id?: number | null
}
