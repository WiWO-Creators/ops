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
 * @param roles catalogo `roles` de `GET /lookups`
 * @param alta `true` para el formulario de alta
 */
export function camposDePersona (roles: OpcionCampo[], alta: boolean): CampoFormulario[] {
  return [
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
        ? 'Mínimo 8 caracteres. No se envía ningún correo: entregásela por otro medio.'
        : 'Dejala en blanco para no cambiarla.'
    },
    {
      clave: 'role_id',
      etiqueta: 'Rol',
      tipo: 'seleccion',
      opciones: roles,
      ...(alta ? { ayuda: 'Estrena la cuenta con los permisos del rol.' } : {})
    },
    { clave: 'hourly_rate', etiqueta: 'Valor hora', tipo: 'numero', ayuda: 'Se usa para valorizar las horas registradas.' }
  ]
}
