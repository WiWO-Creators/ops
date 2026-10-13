const nombres = new Map<number, string>()

/**
 * Nombre ya conocido de un Proyecto.
 *
 * @param proyectoId El Proyecto.
 * @returns El nombre, o `undefined` si aún no se pidió.
 */
export function nombreDeProyectoGuardado (proyectoId: number): string | undefined {
  return nombres.get(proyectoId)
}

/** Recuerda el nombre de un Proyecto mientras viva la pestaña. @param proyectoId El Proyecto. @param nombre Su nombre. */
export function guardarNombreDeProyecto (proyectoId: number, nombre: string): void {
  nombres.set(proyectoId, nombre)
}

/** Olvida los nombres: son datos de la persona que cierra sesión. */
export function vaciarNombresDeProyecto (): void {
  nombres.clear()
}
