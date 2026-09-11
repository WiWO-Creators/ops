/**
 * El árbol de dependencias del equipo (`GET /jerarquia`).
 *
 * Módulo propio y no un bloque más en `recursos.ts`, por lo mismo que `datos/live.ts`: lo consume
 * una sola pantalla y tiene su propia forma. La fuente es `modules/api/Escritura/Jerarquia.php`.
 *
 * **La jerarquía es por área, no persona a persona.** El jefe de alguien es quien dirige el área que
 * lleva puesta; sus subordinados directos son la gente de las áreas que dirige. No hay tabla de
 * "jefe de una persona" y no hace falta: se deriva. El porqué está en `docs/modulos/09-jerarquias.md`.
 */

/**
 * Una persona en el árbol: lo mínimo para dibujarla y moverla.
 *
 * Sin `area_id`: en `areas[].personas` lo dice el área que la contiene y en `sin_area` es `null` por
 * definición, así que emitirlo sería un segundo lugar donde el mismo hecho puede quedar desfasado.
 */
export interface PersonaDeJerarquia {
  id: number
  full_name: string
  /**
   * Si sigue en el equipo.
   *
   * Importa porque **`areas[].personas` NO filtra las bajas** (`Jerarquia.php::personasPorArea()`
   * consulta por `area_id` y nada más), mientras que `sin_area` y `asignables` sí traen solo activos.
   * Una baja que quedó colgada de un área se marca en vez de esconderse, y no se cuenta: si no, un
   * área dice "3 personas" donde solo trabajan 2.
   */
  active: boolean
}

/** Un área con su lugar en el árbol y su gente. */
export interface AreaDelEquipo {
  id: number
  name: string
  /** De qué área cuelga. `null` es una raíz del organigrama. */
  area_superior_id: number | null
  /** Quién la dirige. `null` es un área sin jefatura: su gente no reporta a nadie. */
  jefe_staffid: number | null
  /**
   * Si quien mira puede moverla.
   *
   * Lo resuelve la API por área y no la pantalla: quien no administra ve su rama entera pero solo
   * edita lo que dirige, y deducir esa regla acá sería mantener dos copias de la misma.
   */
  editable: boolean
  /** La gente de esta área, bajas incluidas. No incluye la de las áreas hijas: esas cuelgan aparte. */
  personas: PersonaDeJerarquia[]
  /**
   * `false` cuando el nombre del área **no** figura entre las opciones del campo "Área de la
   * compañía" de los Procesos.
   *
   * Las áreas del equipo y las de la compañía son las mismas y se cruzan **por texto**: un área
   * desalineada no cruza con ningún Proceso y nadie se entera — no hay error, simplemente no trae
   * nada. Es también el motivo por el que renombrar está bloqueado. Un área recién creada nace en
   * `true`, porque el alta sincroniza el nombre sola.
   */
  en_tareas: boolean
}

/**
 * Respuesta de `GET /jerarquia`, y de **las cuatro escrituras**.
 *
 * Cada escritura devuelve el árbol entero y la pantalla reemplaza el que tenía: mover a alguien puede
 * cambiar quién cuelga de quién y qué se puede editar, y recalcularlo en el navegador sería una
 * segunda copia de las reglas de la API.
 *
 * La API responde **403** a quien no dirige ningún área y no administra, con un mensaje ya redactado.
 */
export interface Jerarquia {
  /**
   * `false` en una instalación **sin las columnas del árbol**, no en una sin áreas cargadas.
   *
   * Lo resuelve `Organigrama::hay()` mirando `information_schema` por `area_superior_id` y
   * `jefe_staffid`. La diferencia importa: sin el módulo, `GET /jerarquia` responde 200 con `areas`
   * vacío y **toda escritura vuelve con un 409**, así que ofrecer "creá la primera área" sería
   * ofrecer un botón que no puede funcionar.
   */
  hay_organigrama: boolean
  /** Administra el sistema: ve el organigrama entero y es el único que crea y borra áreas. */
  es_admin: boolean
  areas: AreaDelEquipo[]
  /**
   * Gente activa sin área.
   *
   * Hoy son las 184 personas de la instalación, y vaciar esta lista es el trabajo que la pantalla
   * existe para permitir. Por eso tiene lugar propio en la interfaz y no un rincón.
   */
  sin_area: PersonaDeJerarquia[]
  /** Catálogo de personas activas para los selectores de jefatura y de destino. */
  asignables: PersonaDeJerarquia[]
}
