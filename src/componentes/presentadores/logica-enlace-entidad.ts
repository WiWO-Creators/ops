/**
 * Regla comun de `EnlacePersona`, `EnlaceCliente` y `EnlaceProyecto`: cuando un enlace a la ficha de
 * una entidad se dibuja como enlace de verdad, y cuando se queda en texto plano.
 *
 * Vive aparte del componente porque es logica pura y necesita prueba sin JSX (mismo motivo que
 * `lib/personas.ts`).
 *
 * El import es relativo y con extension, y no el alias `@/`, porque su prueba corre con el runner de
 * Node (mismo motivo documentado en `dominio/autoria-tarea.ts`), que resuelve rutas de archivo.
 */
import { puedeVerSeccion } from '../../dominio/permisos.ts'
import type { AreaPermiso } from '../../datos/tipos.ts'

/**
 * Decide si un enlace a la ficha de una entidad (persona, cliente o proyecto) navega y ofrece su
 * tarjeta, o se queda en texto plano.
 *
 * En el portal del cliente nunca se enlaza: `/equipo`, `/clientes` y `/proyectos` son pantallas del
 * panel interno, y un contacto no tiene sesion para abrirlas ni razon para ver la mini-ficha de un
 * colaborador. Fuera del portal, la decision es la misma que ya usan `TablaClientes` y
 * `ColumnasProyecto`: la capacidad sobre la seccion correspondiente (`puedeVerSeccion`).
 *
 * @param capacidades Capacidades de quien mira sobre `area` (de `permissions` de `/me`).
 * @param area Seccion cuya capacidad decide el enlace: `staff`, `customers` o `projects`.
 * @param esPortal `true` si el componente se dibuja dentro del portal del cliente.
 * @returns `true` si corresponde enlazar y ofrecer la ficha.
 */
export function puedeEnlazarEntidad (
  capacidades: readonly string[],
  area: AreaPermiso,
  esPortal: boolean = false
): boolean {
  if (esPortal) return false

  return puedeVerSeccion(capacidades, area)
}
