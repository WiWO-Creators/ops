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
import type { AreaPermiso, Yo } from '@/datos/tipos'

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
 * True si hay que dibujar la entrada de Focals para quien mira.
 *
 * La regla es la PERTENENCIA y nada mas: la seccion existe para quien responde por al menos un
 * Cliente. Quien no es focal de nadie no la ve, sea quien sea —direccion y superadministracion
 * incluidas—, porque no es una pantalla de supervision sino la cartera propia, y a quien no tiene
 * cartera le mostraba una lista vacia. Antes se decidia por el escalon ("de focal hacia arriba"),
 * que era una aproximacion equivocada en las dos direcciones: hay focales de tres cuentas con nivel
 * `usuario` —que se quedaban sin su propia pantalla— y jefaturas sin ninguna cuenta a cargo que si
 * la veian.
 *
 * **Esconderla no autoriza nada**: la compuerta sigue siendo la API, que responde 403 a quien no
 * corresponde, y la pantalla lo dice con `SinPermiso`. Esto solo evita ofrecer una puerta cerrada.
 *
 * Si `/me` no manda `es_focal` —una API vieja contra un panel nuevo— la entrada SE MUESTRA: falla
 * abierta, igual que fallaba antes ante un escalon desconocido. Esconder una seccion por no saber le
 * sacaria la pantalla a quien si la tiene, y el 403 de la API sigue puesto por si no la tiene.
 *
 * @param yo Quien mira, tal como lo devolvio `GET /me`.
 * @returns Si la seccion se dibuja.
 */
export function puedeVerFocals (yo: Pick<Yo, 'es_focal'>): boolean {
  return yo.es_focal ?? true
}

/**
 * True si hay que dibujar la entrada de "Mi Área" para quien mira.
 *
 * La regla es tener area asignada, y punto: la pantalla muestra el area propia y quien la integra
 * (`GET /me/mi-area`), asi que sin area no hay nada que mostrar mas que un vacio. Antes la llave era
 * `is_director`, que es el cargo de `tblcargos`: hoy las 184 cuentas de produccion llevan cargo
 * "Staff", de modo que esa puerta no se le abria practicamente a nadie.
 *
 * Se miran DOS campos y no uno porque la pertenencia vive en dos lugares: `area_id` es la columna de
 * `tblstaff` —el area principal, la de siempre— y `area_ids` es la tabla `staff_areas`, que es la
 * que admite varias. Quien fue asignado por la via nueva puede no tener la columna vieja escrita, y
 * preguntar por una sola dejaba a esa gente sin su pantalla.
 *
 * Como con Focals: esconder no autoriza. La API decide, y la pantalla ya muestra `SinPermiso` ante
 * su 403 y un vacio explicado cuando el area es `null`.
 *
 * @param yo Quien mira, tal como lo devolvio `GET /me`.
 * @returns Si la seccion se dibuja.
 */
export function puedeVerMiArea (yo: Pick<Yo, 'area_id' | 'area_ids'>): boolean {
  return yo.area_id !== null || (yo.area_ids ?? []).length > 0
}
