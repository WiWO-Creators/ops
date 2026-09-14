/**
 * El escalón jerárquico de una persona: el eje 2 del modelo de permisos.
 *
 * **Fuente única de los cuatro escalones en el frontend.** No hay una segunda lista en ningún panel
 * ni en ningún diálogo: la pantalla de accesos pinta los nombres que publica `GET /accesos/catalogo`,
 * y todo lo que decida algo con el escalón de quien mira lo hace con lo de acá.
 *
 * === Qué es y qué no es ===
 *
 * El escalón **nombra el puesto y no otorga nada**. Quién ve qué sale del árbol de personas —la
 * cadena de `jefe_staffid` más la jefatura de área—, no de esta escalera: un `director` sin nadie
 * colgando ve exactamente lo suyo. Por eso acá no hay pisos, ni capacidades, ni alcances; eso era el
 * modelo viejo, donde el escalón repartía permisos y nadie podía explicar por qué alguien veía algo.
 *
 * El otro eje —administrador y superadministrador— es independiente y vive en `rol-sistema.ts`:
 * alguien puede ser `admin` y además `director`.
 *
 * Vive en un `.ts` y no dentro de un componente por la regla de `docs/convenciones.md`: Node despoja
 * los tipos de un `.ts` pero no el JSX, así que solo lo que está fuera del componente se puede probar.
 */

/** Los cuatro escalones, de menor a mayor. Son fijos: no se crean ni se borran. */
export type Escalon = 'staff' | 'lead' | 'director' | 'gerencia'

/** Un escalón con su nombre en español, su lugar en la escalera y qué puesto describe. */
export interface DescripcionDeEscalon {
  clave: Escalon
  nombre: string
  /** Posición en la escalera, de 1 en adelante. Ordena; no hereda nada. */
  orden: number
  ayuda: string
}

/** La escalera completa, en orden de lectura. */
export const ESCALONES: readonly DescripcionDeEscalon[] = [
  {
    clave: 'staff',
    nombre: 'Staff',
    orden: 1,
    ayuda: 'El piso: lo suyo y aquello de lo que forma parte. No conduce a nadie.'
  },
  {
    clave: 'lead',
    nombre: 'Lead',
    orden: 2,
    ayuda: 'Conduce un equipo. Ve lo de la gente que cuelga de él en el árbol.'
  },
  {
    clave: 'director',
    nombre: 'Director',
    orden: 3,
    ayuda: 'Conduce leads. Ve lo de sus leads y lo de la gente de sus leads.'
  },
  {
    clave: 'gerencia',
    nombre: 'Gerencia',
    orden: 4,
    ayuda: 'Conduce directores. Ve su descendencia completa en el árbol.'
  }
]

/** El escalón más bajo: el que le toca a quien no tiene ninguno puesto. */
export const ESCALON_POR_DEFECTO: Escalon = 'staff'

/**
 * Si una cadena cualquiera es uno de los cuatro escalones.
 *
 * Existe para no colar en el estado de un formulario lo que venga de un selector o de la API: un
 * escalón inventado llegaría al `PUT` y volvería como 422 sin que la pantalla supiera por qué.
 *
 * @param valor La cadena a comprobar.
 * @returns `true` si es un escalón conocido.
 */
export function esEscalon (valor: string): valor is Escalon {
  return ESCALONES.some((escalon) => escalon.clave === valor)
}

/**
 * Nombre en español de un escalón.
 *
 * Cae a la clave cuando no la conoce en vez de esconder la celda: una API que agregara un escalón
 * dejaría filas en blanco sin explicación, y ver la clave cruda dice qué pasó.
 *
 * @param clave La clave del escalón, o `null` si la persona no tiene ninguno.
 * @returns El nombre, la clave, o un guion cuando no hay clave.
 */
export function etiquetaDeEscalon (clave: string | null): string {
  if (clave === null) return '—'

  return ESCALONES.find((escalon) => escalon.clave === clave)?.nombre ?? clave
}

/**
 * Si el escalón nombra un puesto de conducción.
 *
 * Es lo único que el escalón decide por sí solo en el panel: si se OFRECE una pantalla pensada para
 * quien conduce gente —el resumen del equipo de las 20:00, hoy—. **Esconder no autoriza**: la
 * compuerta es la API, que contesta 403 a quien no corresponde, y el alcance real lo sigue dando el
 * árbol. Esto solo evita enseñarle una puerta cerrada a media empresa.
 *
 * @param escalon El escalón de la persona.
 * @returns `true` de `lead` hacia arriba.
 */
export function esJefatura (escalon: Escalon): boolean {
  return escalon !== 'staff'
}
