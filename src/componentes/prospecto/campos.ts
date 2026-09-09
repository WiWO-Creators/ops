import type { CampoFormulario, OpcionCampo } from '@/componentes/proyecto/formulario'
import { camposDeCliente } from '@/componentes/cliente/campos'

/**
 * Campos de los formularios de Prospecto.
 *
 * Viven en un `.ts` por la misma razon que `cliente/campos.ts`: sin JSX se pueden probar, y una
 * `clave` mal escrita no rompe nada visible pero manda a la API un cuerpo que ella contesta con 422.
 *
 * Las claves de la empresa van **anidadas por puntos** (`cliente.company`): `cuerpoDelFormulario` las
 * convierte en el objeto `cliente` que espera `POST /prospectos`. Las del contacto van PLANAS, porque
 * `POST /prospectos/{id}/contactos` recibe el contacto en la raiz del cuerpo.
 */

/** Largos maximos de las columnas del contacto, tomados de `tblcontacts`. */
const LARGOS = {
  nombre: 50,
  email: 100,
  telefono: 30,
  cargo: 40
}

/**
 * Las columnas de empresa que un Prospecto comparte con un Cliente.
 *
 * No estan moneda, idioma ni las direcciones de facturacion y envio: la candidata todavia no factura
 * nada, y pedir esos datos antes de ganar es pedir lo que nadie sabe.
 */
const CLAVES_DE_EMPRESA = [
  'company', 'vat', 'phonenumber', 'website', 'address', 'city', 'state', 'zip', 'country_id'
]

/**
 * Los campos de la empresa candidata, reusando los del formulario de Cliente.
 *
 * Se reusan y no se copian porque son literalmente los mismos controles con los mismos largos: una
 * copia se desincroniza al primer cambio de esquema. Solo cambian dos cosas: el prefijo `cliente.`
 * —el contrato de Prospecto los anida— y la seccion, porque en el formulario de Cliente `address`
 * abre un bloque "Ubicacion" que aca partiria los nueve campos en dos.
 *
 * @param paises Catalogo `countries` de `GET /lookups`.
 * @returns Los nueve campos, en el mismo orden que en el formulario de Cliente.
 */
export function camposDeProspecto (paises: OpcionCampo[]): CampoFormulario[] {
  return camposDeCliente(paises, [])
    .filter((campo) => CLAVES_DE_EMPRESA.includes(campo.clave))
    .map((campo, indice) => {
      const propio: CampoFormulario = { ...campo, clave: `cliente.${campo.clave}` }

      if (indice === 0) propio.seccion = 'Empresa candidata'
      else delete propio.seccion

      return propio
    })
}

/**
 * Los campos de una persona de contacto del prospecto.
 *
 * Los tres primeros son obligatorios porque al ganar la primera licitacion tienen que alcanzar para
 * dar de alta un contacto real sin volver a preguntar nada: la API los exige igual, y pedirlos acá
 * evita el viaje.
 */
export const CAMPOS_DE_CONTACTO: CampoFormulario[] = [
  { clave: 'firstname', etiqueta: 'Nombre', tipo: 'texto', requerido: true, maximo: LARGOS.nombre },
  { clave: 'lastname', etiqueta: 'Apellido', tipo: 'texto', requerido: true, maximo: LARGOS.nombre },
  { clave: 'email', etiqueta: 'Correo', tipo: 'texto', requerido: true, maximo: LARGOS.email },
  { clave: 'phonenumber', etiqueta: 'Teléfono', tipo: 'texto', maximo: LARGOS.telefono },
  { clave: 'title', etiqueta: 'Cargo', tipo: 'texto', maximo: LARGOS.cargo }
]

/**
 * Campos del **alta** de un Prospecto: la empresa y, opcionalmente, su primera persona de contacto.
 *
 * El contacto del alta va anidado (`contacto.…`) porque ahi si `POST /prospectos` lo recibe como
 * objeto. Los siguientes se agregan desde la pestaña Contactos, con el cuerpo plano.
 *
 * @param paises Catalogo `countries` de `GET /lookups`.
 * @returns Los campos de las dos secciones, en el orden en que se llenan.
 */
export function camposDeAltaDeProspecto (paises: OpcionCampo[]): CampoFormulario[] {
  return [
    ...camposDeProspecto(paises),
    ...CAMPOS_DE_CONTACTO.map((campo, indice) => ({
      ...campo,
      clave: `contacto.${campo.clave}`,
      // El contacto entero es opcional en el alta, asi que ninguno de sus campos puede ser
      // obligatorio: marcar "Nombre" como requerido impediria guardar un prospecto sin contacto.
      // La API valida el trio completo si el objeto viene con algo escrito.
      requerido: false,
      ...(indice === 0 ? { seccion: 'Primer contacto (opcional)' } : {})
    }))
  ]
}
