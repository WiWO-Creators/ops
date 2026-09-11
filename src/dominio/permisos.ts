/**
 * Que secciones del panel se le muestran a quien mira, segun sus permisos de Perfex.
 *
 * Existe porque la lectura ingenua —`permissions.tasks.includes('view')`— no es la regla de la API y
 * escondia pantallas que la persona si puede usar. En Perfex `view` significa "ver TODO", no "ver":
 * un perfil con `create`, `edit` y `delete` sobre tareas, o con `view_own`, trabaja normal con lo
 * suyo y nunca tuvo `view`. Al exigir `view` para dibujar la seccion, ops-v2 le dejaba el panel en
 * blanco a gente que en el panel viejo veia sus tareas sin problema.
 *
 * Las reglas de aca son las mismas que aplica la API, y estan documentadas en
 * `modules/api/Acceso/Visibilidad.php` del backend:
 *
 *   - **Procesos y Espacios**: el listado NUNCA se deniega. Sin `view` global la API filtra las
 *     filas (`Visibilidad::procesos()`, `::espacios()`): quedan las asignadas, las seguidas, las
 *     propias y las de los Espacios donde la persona es miembro. Mostrar la seccion vacia es
 *     correcto: es lo que le compete, aunque hoy no tenga nada.
 *   - **Clientes**: la API abre el listado con `view`, con `create` o con clientes asignados
 *     (`Visibilidad::puedeListarClientes()`). Los clientes asignados no viajan en `/me`, asi que aca
 *     alcanza con tener cualquier capacidad sobre el area; a quien solo tenga asignaciones le queda
 *     la seccion escondida y el acceso directo por URL, igual que antes.
 *   - **Equipo**: la API exige `view` y contesta 403 sin el (`controllers/V1.php:657`). Ofrecer la
 *     seccion seria ofrecer un error.
 *
 * Filtrar filas es trabajo de la API: esto solo decide que se dibuja. Esconder no autoriza.
 */
import type { AreaPermiso, NivelPermiso } from '@/datos/tipos'

/**
 * True si hay que dibujar la seccion de un area para quien tiene esas capacidades.
 *
 * @param capacidades Las capacidades de la persona sobre el area (`permissions[area]` de `/me`).
 * @param area El area de permisos de Perfex.
 * @returns Si la seccion se muestra.
 */
export function puedeVerSeccion (capacidades: readonly string[], area: AreaPermiso): boolean {
  if (area === 'staff') return capacidades.includes('view')
  if (area === 'customers') return capacidades.length > 0

  return true
}

/**
 * La escalera de permisos completa, de menor a mayor.
 *
 * Es la misma de `datos/tipos.ts` y la del backend (`modules/api/Acceso/Reglas.php`). Vive aca como
 * ARREGLO —y no como el catalogo de `componentes/equipo/nivelBase.ts`, que solo lista los cinco
 * escalones que ese dialogo puede escribir— porque lo unico que se le pregunta es el ORDEN: quien
 * esta de tal escalon hacia arriba.
 */
const ESCALERA: readonly NivelPermiso[] = [
  'usuario', 'focal', 'lider', 'head', 'gerente', 'admin', 'superadmin'
]

/**
 * True si hay que dibujar la entrada de Focals para quien mira.
 *
 * El cliente la pidio visible "de focal hacia arriba" y por eso deja de mostrarse a todo el mundo.
 * **Esconderla no autoriza nada**: la compuerta sigue siendo la API, que responde 403 a quien no es
 * focal ni jefatura, y la pantalla lo dice con `SinPermiso`. Esto solo evita ofrecer una puerta que
 * para la mayoria del equipo estaba cerrada.
 *
 * Ante un escalon que no se reconoce —`/me` de una API vieja que todavia no manda `nivel`, o un
 * escalon nuevo que este panel no conoce— la entrada SE MUESTRA: es el comportamiento de siempre, y
 * esconderla por no saber le sacaria la pantalla a quien si la tiene.
 *
 * @param nivel El escalon que resolvio la API en `GET /me`.
 * @returns Si la seccion se dibuja.
 */
export function puedeVerFocals (nivel: NivelPermiso | null | undefined): boolean {
  const posicion = nivel === null || nivel === undefined ? -1 : ESCALERA.indexOf(nivel)

  if (posicion === -1) return true

  return posicion >= ESCALERA.indexOf('focal')
}
