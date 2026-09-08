import type { CampoFormulario, OpcionCampo } from '@/componentes/proyecto/formulario'
import { camposDeCliente } from '@/componentes/cliente/campos'
import { TIPOS_DE_FACTURACION } from '@/definiciones/espacios'
import { GLOSARIO } from '@/dominio/glosario'

/**
 * Campos del formulario de Licitacion.
 *
 * Vive en un `.ts` por la misma razon que `cliente/campos.ts`: sin JSX se puede probar, y una `clave`
 * mal escrita no rompe nada visible pero manda a la API un cuerpo que ella contesta con un 422.
 *
 * Las claves son las del contrato y van **anidadas por puntos** (`cliente.company`,
 * `contacto.email`, `espacio.name`): `cuerpoDelFormulario` las convierte en los tres objetos que
 * espera el backend, asi que un solo arreglo produce el cuerpo mixto.
 */

/** Largos maximos de las columnas del contacto, tomados de `tblcontacts`. */
const LARGOS = {
  nombre: 50,
  email: 100,
  telefono: 30,
  cargo: 40,
  nombreEspacio: 191
}

/**
 * Las columnas de empresa que una Licitacion comparte con un Cliente.
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
 * —el contrato de Licitacion los anida— y la seccion, porque en el formulario de Cliente `address`
 * abre un bloque "Ubicacion" que aca partiria los nueve campos en dos.
 *
 * @param paises Catalogo `countries` de `GET /lookups`.
 * @returns Los nueve campos, en el mismo orden que en el formulario de Cliente.
 */
function camposDeEmpresa (paises: OpcionCampo[]): CampoFormulario[] {
  return camposDeCliente(paises, [])
    .filter((campo) => CLAVES_DE_EMPRESA.includes(campo.clave))
    .map((campo, indice) => {
      const propio: CampoFormulario = { ...campo, clave: `cliente.${campo.clave}` }

      if (indice === 0) propio.seccion = 'Empresa candidata'
      else delete propio.seccion

      return propio
    })
}

/** Los campos del contacto de la candidata. Al ganar se vuelve el contacto principal del Cliente. */
const CAMPOS_DE_CONTACTO: CampoFormulario[] = [
  { clave: 'contacto.firstname', etiqueta: 'Nombre', tipo: 'texto', requerido: true, maximo: LARGOS.nombre, seccion: 'Contacto' },
  { clave: 'contacto.lastname', etiqueta: 'Apellido', tipo: 'texto', requerido: true, maximo: LARGOS.nombre },
  { clave: 'contacto.email', etiqueta: 'Correo', tipo: 'texto', requerido: true, maximo: LARGOS.email },
  { clave: 'contacto.phonenumber', etiqueta: 'Teléfono del contacto', tipo: 'texto', maximo: LARGOS.telefono },
  { clave: 'contacto.title', etiqueta: 'Cargo', tipo: 'texto', maximo: LARGOS.cargo }
]

/**
 * Campos de la **edicion** de una Licitacion: empresa candidata y contacto, nada mas.
 *
 * `PATCH /licitaciones/{id}` acepta solo esos dos objetos. Lo del Espacio —nombre, fechas, estado,
 * descripcion— se edita donde siempre, con `PATCH /projects/{id}`, y ofrecerlo aca escribiria campos
 * que la ruta rechaza.
 *
 * @param paises Catalogo `countries` de `GET /lookups`.
 * @returns Los campos de las dos primeras secciones.
 */
export function camposDeCandidata (paises: OpcionCampo[]): CampoFormulario[] {
  return [...camposDeEmpresa(paises), ...CAMPOS_DE_CONTACTO]
}

/**
 * Campos del **alta** de una Licitacion: la candidata, su contacto y el Espacio que se crea con ella.
 *
 * `POST /licitaciones` crea las tres cosas de una vez; por eso el alta es el unico momento en que el
 * Espacio se describe desde esta pantalla.
 *
 * @param paises Catalogo `countries` de `GET /lookups`.
 * @returns Los campos de las tres secciones, en el orden en que se llenan.
 */
export function camposDeLicitacion (paises: OpcionCampo[]): CampoFormulario[] {
  return [
    ...camposDeCandidata(paises),
    {
      clave: 'espacio.name',
      etiqueta: `Nombre del ${GLOSARIO.espacio.singular.toLowerCase()}`,
      tipo: 'texto',
      requerido: true,
      maximo: LARGOS.nombreEspacio,
      seccion: GLOSARIO.espacio.singular
    },
    { clave: 'espacio.start_date', etiqueta: 'Fecha de inicio', tipo: 'fecha', requerido: true },
    { clave: 'espacio.deadline', etiqueta: 'Fecha de entrega', tipo: 'fecha' },
    { clave: 'espacio.billing_type', etiqueta: 'Facturación', tipo: 'seleccion', opciones: TIPOS_DE_FACTURACION },
    { clave: 'espacio.description', etiqueta: 'Descripción', tipo: 'area' }
  ]
}
