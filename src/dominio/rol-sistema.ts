/**
 * El rol de sistema de una persona: el eje 1 del modelo de permisos, sobre dos banderas de la API.
 *
 * Es el otro eje del de `escalon.ts` y son independientes: alguien puede ser `admin` y además
 * `director`. Este dice **qué filas ve y si toca la configuración**; el escalón solo nombra el puesto.
 *
 *     usuario      lo suyo y lo de su descendencia en el árbol
 *     admin        todas las filas del producto; cero configuración
 *     superadmin   todo, incluida la configuración de la instalación
 *
 * "Configuración" es Administración, Auditoría y el alta y baja de personas: lo único que ni siquiera
 * un administrador toca.
 *
 * === Por qué tres opciones y no dos casillas ===
 *
 * La API expone `is_admin` e `is_superadmin` por separado, y esa forma admite una combinación que no
 * significa nada: **superadministrador sin ser administrador**. En el panel viejo esa combinación
 * deja a la persona sin permisos, porque `staff_can()` de Perfex no conoce la columna `superadmin` y
 * `admin = 0` la manda a la matriz, donde un superadmin no tiene filas. Con dos casillas ese estado
 * se alcanza con un clic; con tres opciones no se puede expresar.
 *
 * Por eso `banderasDeRol('superadmin')` pone **las dos** en `true`. No es defensivo: es la traducción
 * correcta de "acceso a todo" a un backend que tiene dos columnas para decirlo.
 *
 * Vive en un `.ts` y no dentro del diálogo por la regla de `docs/convenciones.md`: Node despoja los
 * tipos de un `.ts` pero no el JSX, así que solo lo que está fuera del componente se puede probar. Y
 * lo que hay acá decide qué se escribe en `tblstaff.admin` y `tblstaff.superadmin`, que no es un
 * detalle de pintura.
 */

/** Los tres roles de sistema, de menor a mayor. */
export type RolDeSistema = 'usuario' | 'admin' | 'superadmin'

/** Las dos banderas de la API que componen un rol de sistema. */
export interface BanderasDeRol {
  is_admin: boolean
  is_superadmin: boolean
}

/** Cada rol con su nombre y qué agrega, en orden de lectura. */
export const ROLES_DE_SISTEMA: Array<{ valor: RolDeSistema, etiqueta: string, ayuda: string }> = [
  {
    valor: 'usuario',
    etiqueta: 'Usuario',
    ayuda: 'Trabaja con lo suyo y con lo de la gente que cuelga de él en el árbol. Nada más.'
  },
  {
    valor: 'admin',
    etiqueta: 'Administrador',
    ayuda: 'Ve, edita y elimina todas las filas del producto. No abre la configuración.'
  },
  {
    valor: 'superadmin',
    etiqueta: 'Superadministrador',
    ayuda: 'Suma la configuración de la instalación: accesos, interruptores, auditoría y altas.'
  }
]

/**
 * Qué rol de sistema tiene puesto una persona hoy.
 *
 * `is_superadmin` se mira primero: es el escalón más alto y en la base hay cuentas con las dos
 * banderas encendidas, que es justamente lo que `banderasDeRol()` escribe.
 *
 * @param persona Lo que devolvió la API para esa persona.
 * @returns El rol que le corresponde.
 */
export function rolDeSistemaDe (persona: BanderasDeRol): RolDeSistema {
  if (persona.is_superadmin) return 'superadmin'
  if (persona.is_admin) return 'admin'

  return 'usuario'
}

/**
 * Las dos banderas que componen un rol de sistema.
 *
 * @param rol El rol elegido.
 * @returns El par `is_admin` / `is_superadmin` que lo representa.
 */
export function banderasDeRol (rol: RolDeSistema): BanderasDeRol {
  return {
    is_admin: rol !== 'usuario',
    is_superadmin: rol === 'superadmin'
  }
}

/**
 * El cuerpo del `PATCH`: solo las banderas que cambian.
 *
 * Repetir el valor que ya estaba no es inocuo — dispara los guards de la API (bajarse el rol a uno
 * mismo, dejar la instalación sin superadministrador) aunque el estado final sea idéntico al inicial.
 *
 * @param destino El rol elegido.
 * @param actuales Las banderas que la persona tiene hoy.
 * @returns Un cuerpo con cero, una o dos claves.
 */
export function cuerpoDeRolDeSistema (
  destino: RolDeSistema,
  actuales: BanderasDeRol
): Partial<BanderasDeRol> {
  const nuevas = banderasDeRol(destino)
  const cuerpo: Partial<BanderasDeRol> = {}

  if (nuevas.is_admin !== actuales.is_admin) cuerpo.is_admin = nuevas.is_admin
  if (nuevas.is_superadmin !== actuales.is_superadmin) cuerpo.is_superadmin = nuevas.is_superadmin

  return cuerpo
}

/** Nombre en español del rol de sistema de una persona, para la tabla y la cabecera. */
export function nombreDeRolDeSistema (persona: BanderasDeRol): string {
  const rol = rolDeSistemaDe(persona)

  return ROLES_DE_SISTEMA.find((opcion) => opcion.valor === rol)?.etiqueta ?? 'Usuario'
}
