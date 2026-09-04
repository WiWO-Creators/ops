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
import type { AreaPermiso } from '@/datos/tipos'

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
