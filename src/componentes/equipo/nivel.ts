/**
 * El nivel de una persona: un solo eje con tres escalones, sobre dos banderas de la API.
 *
 * Vive en un `.ts` y no dentro del diálogo por la regla de `docs/convenciones.md`: Node despoja los
 * tipos de un `.ts` pero no el JSX, así que solo lo que está fuera del componente se puede probar. Y
 * lo que hay acá decide qué se escribe en `tblstaff.admin` y `tblstaff.superadmin`, que no es un
 * detalle de pintura.
 *
 * === Por qué tres escalones y no dos casillas ===
 *
 * La API expone `is_admin` e `is_superadmin` por separado, y esa forma admite una combinación que no
 * significa nada: **superadministrador sin ser administrador**. En el panel viejo esa combinación
 * deja a la persona sin permisos, porque `staff_can()` de Perfex no conoce la columna `superadmin` y
 * `admin = 0` la manda a `tblstaff_permissions`, donde un superadmin no tiene filas. Con dos casillas
 * ese estado se alcanza con un clic; con tres escalones no se puede expresar.
 *
 * Por eso `banderasDe('superadmin')` pone **las dos** en `true`. No es defensivo: es la traducción
 * correcta de "acceso a todo" a un backend que tiene dos columnas para decirlo.
 *
 * === Esta lista ya no es la fuente de verdad de los escalones ===
 *
 * Desde que existe `GET /accesos/catalogo` (`src/datos/accesos.ts`), los escalones —con su piso, su
 * alcance y cuánta gente los usa— los publica la API y se administran en `/administracion/accesos`.
 * Lo de acá sigue vivo porque este diálogo escribe las DOS BANDERAS de Perfex, que son otra cosa: no
 * son una fila de `tblwiwo_escalones` sino las columnas que abren el panel y la configuración.
 */
import type { FichaPersona } from '@/datos/recursos'

/** Los tres escalones, de menor a mayor. */
export type Nivel = 'colaborador' | 'admin' | 'superadmin'

/** Las dos banderas de la API que componen un nivel. */
export interface BanderasDeNivel {
  is_admin: boolean
  is_superadmin: boolean
}

/** Cada escalón con su nombre y qué agrega, en orden de lectura. */
export const NIVELES: Array<{ valor: Nivel, etiqueta: string, ayuda: string }> = [
  {
    valor: 'colaborador',
    etiqueta: 'Colaborador',
    ayuda: 'Trabaja con lo que tiene asignado. Lo que ve y edita lo decide su matriz de permisos.'
  },
  {
    valor: 'admin',
    etiqueta: 'Administrador',
    ayuda: 'Ve y edita todo el producto. Mientras lo sea, sus permisos por área no se guardan.'
  },
  {
    valor: 'superadmin',
    etiqueta: 'Superadministrador',
    ayuda: 'Suma la configuración de la instalación: avisos por correo, acceso con Google y niveles.'
  }
]

/**
 * Qué nivel tiene puesto una persona hoy.
 *
 * `is_superadmin` se mira primero: es el escalón más alto y en la base hay cuentas con las dos
 * banderas encendidas, que es justamente lo que `banderasDe()` escribe.
 *
 * @param persona Lo que devolvió la API para esa persona.
 * @returns El escalón que le corresponde.
 */
export function nivelDe (persona: BanderasDeNivel): Nivel {
  if (persona.is_superadmin) return 'superadmin'
  if (persona.is_admin) return 'admin'

  return 'colaborador'
}

/**
 * Las dos banderas que componen un nivel.
 *
 * @param nivel El escalón elegido.
 * @returns El par `is_admin` / `is_superadmin` que lo representa.
 */
export function banderasDe (nivel: Nivel): BanderasDeNivel {
  return {
    is_admin: nivel !== 'colaborador',
    is_superadmin: nivel === 'superadmin'
  }
}

/**
 * El cuerpo del `PATCH`: solo las banderas que cambian.
 *
 * Repetir el valor que ya estaba no es inocuo — dispara los guards de la API (bajarse el nivel a uno
 * mismo, dejar la instalación sin superadministrador) aunque el estado final sea idéntico al inicial.
 *
 * @param destino El escalón elegido.
 * @param actuales Las banderas que la persona tiene hoy.
 * @returns Un cuerpo con cero, una o dos claves.
 */
export function cuerpoDeNivel (destino: Nivel, actuales: BanderasDeNivel): Partial<BanderasDeNivel> {
  const nuevas = banderasDe(destino)
  const cuerpo: Partial<BanderasDeNivel> = {}

  if (nuevas.is_admin !== actuales.is_admin) cuerpo.is_admin = nuevas.is_admin
  if (nuevas.is_superadmin !== actuales.is_superadmin) cuerpo.is_superadmin = nuevas.is_superadmin

  return cuerpo
}

/** Nombre en español del nivel de una persona, para la tabla y la cabecera. */
export function nombreDeNivel (persona: Pick<FichaPersona, 'is_admin' | 'is_superadmin'>): string {
  const nivel = nivelDe(persona)

  return NIVELES.find((opcion) => opcion.valor === nivel)?.etiqueta ?? 'Colaborador'
}
