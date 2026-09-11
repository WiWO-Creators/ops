import type { CampoFormulario, OpcionCampo } from '@/componentes/proyecto/formulario'

/**
 * Campos del formulario de Equipo.
 *
 * Vive en un `.ts` y no dentro de un `.tsx` por la misma razon que `proyecto/formulario.ts`: Node
 * despoja los tipos de un `.ts` pero no el JSX, asi que solo lo que esta fuera del componente se
 * puede probar. Un `clave` mal escrito no rompe nada visible y manda a la API un cuerpo que ella
 * rechaza con un 422 que nadie sabe leer.
 */

/** Largos maximos, tomados del esquema de `tblstaff`. Adelantan el 422 en vez de esperarlo. */
const LARGOS = { nombre: 50, email: 100, phonenumber: 30 }

/**
 * Campos de un miembro del equipo.
 *
 * La contraseña es obligatoria en el alta y opcional en la edicion, donde ademas **no viaja si queda
 * en blanco**: dejarla vacia quiere decir "no la cambies", y mandar `null` seria un intento de
 * borrarla que la API rechaza con un 422.
 *
 * `is_admin` no esta: se decide desde el listado y solo lo ve un administrador, porque la API rechaza
 * que lo reparta cualquiera con `staff.create`.
 *
 * `empresa_id` (`tblapi_empresas`), `cargo_id` y `area_ids` (`modules/wiwo_core/cargos_areas.php`) son
 * la organizacion del staff, separada del rol (RBAC): ninguno es requerido, y dejarlos sin elegir es
 * "sin empresa/cargo/área". La empresa va primera de la seccion porque es la unica de las tres que
 * hoy tiene datos en las 178 cuentas del grupo.
 *
 * El selector de Rol solo aparece en el modelo de permisos viejo. Ahi sigue sirviendo para una cosa:
 * un alta con `role_id` estrena la cuenta con los permisos de ese rol. En el modelo consolidado no
 * hace falta —la API estrena con `PERMISOS_INICIALES`— y el rol dejo de existir como concepto.
 *
 * @param roles catalogo `roles` de `GET /lookups`
 * @param cargos catalogo `cargos` de `GET /lookups`
 * @param areas catalogo `areas` de `GET /lookups`
 * @param empresas catalogo `empresas` de `GET /lookups`
 * @param alta `true` para el formulario de alta
 * @param conRol `true` para dibujar el selector de Rol (modelo de permisos viejo)
 */
export function camposDePersona (
  roles: OpcionCampo[],
  cargos: OpcionCampo[],
  areas: OpcionCampo[],
  alta: boolean,
  conRol = true,
  empresas: OpcionCampo[] = []
): CampoFormulario[] {
  const campos: CampoFormulario[] = [
    { clave: 'firstname', etiqueta: 'Nombre', tipo: 'texto', requerido: true, maximo: LARGOS.nombre },
    { clave: 'lastname', etiqueta: 'Apellido', tipo: 'texto', requerido: true, maximo: LARGOS.nombre },
    { clave: 'email', etiqueta: 'Correo', tipo: 'texto', requerido: true, maximo: LARGOS.email },
    { clave: 'phonenumber', etiqueta: 'Teléfono', tipo: 'texto', maximo: LARGOS.phonenumber },
    {
      clave: 'password',
      etiqueta: alta ? 'Contraseña' : 'Contraseña nueva',
      tipo: 'texto',
      requerido: alta,
      omitirSiVacio: !alta,
      ayuda: alta
        ? 'Mínimo 8 caracteres. No se envía ningún correo: entrégasela por otro medio.'
        : 'Déjala en blanco para no cambiarla.'
    },
    { clave: 'hourly_rate', etiqueta: 'Valor hora', tipo: 'numero', ayuda: 'Se usa para valorizar las horas registradas.' },
    { clave: 'empresa_id', etiqueta: 'Empresa', tipo: 'seleccion', opciones: empresas, seccion: 'Organización' },
    { clave: 'cargo_id', etiqueta: 'Cargo', tipo: 'seleccion', opciones: cargos },
    { clave: 'area_ids', etiqueta: 'Áreas', tipo: 'seleccion-multiple', opciones: areas, ayuda: 'Podés marcar varias áreas. Sin marcas, queda sin área.' }
  ]

  if (!conRol) return campos

  // Antes de `hourly_rate`, que es donde estaba: el orden de un formulario que la gente ya conoce no
  // cambia por un interruptor.
  campos.splice(campos.findIndex((campo) => campo.clave === 'hourly_rate'), 0, {
    clave: 'role_id',
    etiqueta: 'Rol',
    tipo: 'seleccion',
    opciones: roles,
    ...(alta ? { ayuda: 'Estrena la cuenta con los permisos del rol.' } : {})
  })

  return campos
}
