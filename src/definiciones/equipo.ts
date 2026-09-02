import type { DefinicionRecurso } from './tipos.ts'
import type { MiembroEquipo } from '../datos/recursos.ts'

/**
 * Definicion del recurso Equipo.
 *
 * Fuente: `docs/modulos/04-equipo.md`. El alta, la edicion y las dos formas de eliminar viven en
 * `componentes/equipo/`: necesitan formularios y confirmacion, y las acciones declarativas de esta
 * definicion solo saben de llamadas sin cuerpo.
 *
 * `GET /staff` exige el permiso `staff.view`; sin el devuelve `403`, asi que la seccion se oculta
 * cuando `permissions.staff` no lo incluye.
 */
export const EQUIPO: DefinicionRecurso<MiembroEquipo> = {
  ruta: 'staff',
  titulo: { singular: 'Persona', plural: 'Equipo' },

  columnas: [
    // `full_name` es virtual y viene armado: no concatenar nombre y apellido aca.
    { clave: 'full_name', encabezado: 'Nombre', ordenPor: 'firstname', presentar: (m) => m.full_name },
    { clave: 'email', encabezado: 'Correo', presentar: (m) => m.email },
    { clave: 'active', encabezado: 'Activo', presentar: (m) => (m.active ? 'Sí' : 'No') },
    {
      clave: 'last_login',
      encabezado: 'Último acceso',
      ordenPor: 'last_login',
      presentar: (m) => m.last_login ?? 'Nunca'
    }
  ],

  filtros: [
    { clave: 'active', etiqueta: 'Activo', tipo: 'booleano' },
    { clave: 'role_id', etiqueta: 'Rol', tipo: 'seleccion', desdeLookup: 'roles' }
  ],

  ordenables: ['firstname', 'lastname', 'last_login'],
  ordenPorDefecto: 'firstname',
  busqueda: true,
  includes: []
}
