import type { DefinicionRecurso } from './tipos.ts'
import type { MiembroEquipo } from '../datos/recursos.ts'
import { formatearFecha } from '../lib/fechas.ts'

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
    // El id del rol no le dice nada a nadie: `VistaEquipo` reemplaza este presentador por el que
    // resuelve el nombre contra el catalogo `roles`, que la pantalla ya carga para el filtro.
    { clave: 'role_id', encabezado: 'Rol', presentar: (m) => (m.role_id === null || m.role_id === 0 ? '' : `#${m.role_id}`) },
    // Igual que `role_id`: `VistaEquipo` reemplaza estos presentadores por los que resuelven el
    // nombre contra `cargos`/`areas`, que la pantalla ya carga para sus propios filtros.
    { clave: 'cargo_id', encabezado: 'Cargo', presentar: (m) => (m.cargo_id === null ? '' : `#${m.cargo_id}`) },
    { clave: 'area_id', encabezado: 'Área', presentar: (m) => (m.area_id === null ? '' : `#${m.area_id}`) },
    { clave: 'active', encabezado: 'Activo', presentar: (m) => (m.active ? 'Sí' : 'No') },
    {
      clave: 'last_login',
      encabezado: 'Último acceso',
      ordenPor: 'last_login',
      // Formateada, como el resto de las fechas del producto: la columna mostraba el ISO crudo.
      presentar: (m) => (m.last_login === null ? 'Nunca' : formatearFecha(m.last_login, true))
    },
    // Las cuatro llegan en cada `GET /staff` y antes no se veian en ninguna parte. Ocultas por
    // defecto: son datos de consulta puntual, y sacarlas a la vista convertiria la tabla en un legajo.
    {
      clave: 'is_admin',
      encabezado: 'Administrador',
      ocultaPorDefecto: true,
      presentar: (m) => (m.is_admin ? 'Sí' : 'No')
    },
    {
      clave: 'is_superadmin',
      encabezado: 'Superadministrador',
      ocultaPorDefecto: true,
      presentar: (m) => (m.is_superadmin ? 'Sí' : 'No')
    },
    { clave: 'phonenumber', encabezado: 'Teléfono', ocultaPorDefecto: true, presentar: (m) => m.phonenumber ?? '' },
    {
      clave: 'hourly_rate',
      encabezado: 'Valor hora',
      numerica: true,
      ocultaPorDefecto: true,
      presentar: (m) => m.hourly_rate
    },
    {
      clave: 'date_created',
      encabezado: 'Ingreso',
      ocultaPorDefecto: true,
      presentar: (m) => formatearFecha(m.date_created)
    }
  ],

  filtros: [
    { clave: 'active', etiqueta: 'Activo', tipo: 'booleano' },
    { clave: 'role_id', etiqueta: 'Rol', tipo: 'seleccion', desdeLookup: 'roles' },
    { clave: 'cargo_id', etiqueta: 'Cargo', tipo: 'seleccion', desdeLookup: 'cargos' },
    { clave: 'area_id', etiqueta: 'Área', tipo: 'seleccion', desdeLookup: 'areas' }
  ],

  ordenables: ['firstname', 'lastname', 'last_login'],
  ordenPorDefecto: 'firstname',
  busqueda: true,
  includes: []
}
