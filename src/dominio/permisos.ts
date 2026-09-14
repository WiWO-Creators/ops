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
import { GLOSARIO } from './glosario.ts'
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
 * Cliente. Quien no es focal de nadie no la ve, porque no es una pantalla de supervision sino la
 * cartera propia, y a quien no tiene cartera le mostraba una lista vacia.
 *
 * La excepcion son la superadministracion y la gerencia ({@link puedeVerTodosLosFocals}): para ellas
 * la pantalla SI es de supervision —todas las cuentas, con su focal al lado— y exigirles figurar en
 * `tblwiwo_focales` les escondia una vista que les corresponde por su lugar, no por su cartera.
 *
 * Antes se decidia por el escalon ("de focal hacia arriba"),
 * que era una aproximacion equivocada en las dos direcciones: hay focales de tres cuentas de escalon
 * `staff` —que se quedaban sin su propia pantalla— y jefaturas sin ninguna cuenta a cargo que si
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
export function puedeVerFocals (yo: Pick<Yo, 'es_focal' | 'is_superadmin' | 'escalon'>): boolean {
  if (puedeVerTodosLosFocals(yo)) return true

  return yo.es_focal ?? true
}

/**
 * True si a quien mira le corresponde la cartera ENTERA y no la suya: superadministracion y gerencia.
 *
 * Es la diferencia entre "mis cuentas" y "todas las cuentas, con su focal al lado". Quien pasa por
 * aca no necesita figurar en `tblwiwo_focales`: la pantalla le muestra cada cliente como si fuera su
 * focal, que es justo lo que una gerencia necesita para saber como va la operacion sin que alguien
 * la tenga que agregar a mano a cada cuenta.
 *
 * **Por que estos dos y no `is_admin` ni `director`.** `is_admin` la tiene medio equipo y es el eje
 * de las filas, no el del puesto; `director` conduce una parte del arbol y su cartera propia es la
 * respuesta correcta para el. La cartera entera es una vista de direccion general, y los dos roles
 * que la describen son la superadministracion —el rol de sistema mas alto— y el escalon `gerencia`.
 *
 * **Esconder no autoriza, pero acá tampoco hace falta**: la API ya le abre la cartera entera a
 * cualquiera de escalon `director` para arriba y a los administradores (`V1::scoresRuta()`). Esto no
 * agranda ese permiso: elige, dentro de lo que la API ya contesta, a quien se le muestra todo y a
 * quien su propia cartera.
 *
 * @param yo Quien mira, tal como lo devolvio `GET /me`.
 * @returns Si la pantalla muestra todas las cuentas.
 */
export function puedeVerTodosLosFocals (yo: Pick<Yo, 'is_superadmin' | 'escalon'>): boolean {
  return yo.is_superadmin === true || yo.escalon === 'gerencia'
}

/**
 * True si hay que dibujar la entrada de "Mi Área" para quien mira.
 *
 * **Siempre.** La pantalla dejo de ser la lista de la propia area y paso a ser el organigrama
 * (`GET /organigrama`), que le responde algo a todo el mundo: quien no tiene area ni gente se ve a
 * si mismo y a sus jefes, y quien no tiene jefes se ve a si mismo. Justamente las 31 cuentas sin
 * area son las que mas necesitan mirarlo, y la llave anterior —tener area puesta— era la unica que
 * se la escondia.
 *
 * Se conserva la funcion en vez de borrar la llamada para que el motivo quede escrito y el dia que
 * alguien quiera volver a condicionarla sepa que hubo dos reglas antes que esta: `is_director`
 * —el cargo de `tblcargos`, que hoy es "Staff" en las 184 cuentas y no le abria la puerta a nadie— y
 * la pertenencia a un area.
 *
 * Como con Focals: esconder no autoriza. La API decide, y la pantalla muestra `SinPermiso` ante su
 * 403.
 *
 * @returns Si la seccion se dibuja. Siempre `true`.
 */
export function puedeVerMiArea (): boolean {
  return true
}

/**
 * Nombre en español de cada área de permisos.
 *
 * Son cinco y no doce: con el modelo de dos ejes la matriz por persona desapareció y `permissions`
 * pasó a ser constante, así que las áreas de Perfex que este producto nunca usó —facturas, tickets,
 * propuestas— dejaron de llegar. Lo que no esté acá cae a su clave en vez de esconderse: un permiso
 * que desaparece de la vista sin desaparecer de la base es la clase de mentira que este modelo vino a
 * sacar.
 */
const NOMBRE_DE_AREA: Record<string, string> = {
  tasks: GLOSARIO.proceso.plural,
  projects: GLOSARIO.espacio.plural,
  customers: GLOSARIO.cliente.plural,
  staff: 'Equipo',
  leads: 'Prospectos'
}

/** Nombre en español de cada capacidad. Misma regla que `NOMBRE_DE_AREA` con las que no están. */
const NOMBRE_DE_CAPACIDAD: Record<string, string> = {
  view: 'ver',
  create: 'crear',
  edit: 'editar',
  delete: 'borrar',
  edit_milestones: 'editar hitos'
}

/** Nombre legible de un área de permisos. Cae a la clave cuando no la conoce. */
export function etiquetaDeArea (area: string): string {
  return NOMBRE_DE_AREA[area] ?? area
}

/** Nombre legible de una capacidad. Cae a la clave cuando no la conoce. */
export function etiquetaDeCapacidad (capacidad: string): string {
  return NOMBRE_DE_CAPACIDAD[capacidad] ?? capacidad
}
