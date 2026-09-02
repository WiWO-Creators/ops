import type { CampoFormulario, OpcionCampo } from '@/componentes/proyecto/formulario'

/**
 * Campos del formulario de Cliente.
 *
 * Vive en un `.ts` y no dentro de un `.tsx` por la misma razon que `proyecto/formulario.ts`: Node
 * despoja los tipos de un `.ts` pero no el JSX, asi que solo lo que esta fuera del componente se
 * puede probar. Y esto merece prueba: un `clave` mal escrito no rompe nada visible —el campo se
 * pinta igual— y manda a la API un cuerpo que ella rechaza con un 422 que nadie sabe leer.
 *
 * Las claves son las del contrato, sin traducir. Las anidadas (`billing.street`) las resuelve
 * `cuerpoDelFormulario`.
 */

/** Largos maximos, tomados del esquema. Adelantan el 422 en vez de esperarlo. */
const LARGOS = {
  company: 191,
  vat: 50,
  phonenumber: 30,
  city: 100,
  state: 50,
  zip: 15,
  address: 191,
  website: 150,
  calle: 200
}

/**
 * Los dieciocho campos de un cliente.
 *
 * No estan los grupos, el vault ni las etiquetas: la API no los escribe y `GET /clients` tampoco los
 * devuelve, asi que un control para ellos prometeria algo que despues no se puede releer.
 *
 * @param paises catalogo `countries` de `GET /lookups`
 * @param monedas catalogo `currencies`
 */
export function camposDeCliente (paises: OpcionCampo[], monedas: OpcionCampo[]): CampoFormulario[] {
  return [
    { clave: 'company', etiqueta: 'Nombre o razón social', tipo: 'texto', requerido: true, maximo: LARGOS.company },
    { clave: 'vat', etiqueta: 'RUT', tipo: 'texto', maximo: LARGOS.vat },
    { clave: 'phonenumber', etiqueta: 'Teléfono', tipo: 'texto', maximo: LARGOS.phonenumber },
    { clave: 'website', etiqueta: 'Sitio web', tipo: 'texto', maximo: LARGOS.website },

    { clave: 'address', etiqueta: 'Dirección', tipo: 'texto', maximo: LARGOS.address, seccion: 'Ubicación' },
    { clave: 'city', etiqueta: 'Ciudad', tipo: 'texto', maximo: LARGOS.city },
    { clave: 'state', etiqueta: 'Región', tipo: 'texto', maximo: LARGOS.state },
    { clave: 'zip', etiqueta: 'Código postal', tipo: 'texto', maximo: LARGOS.zip },
    { clave: 'country_id', etiqueta: 'País', tipo: 'seleccion', opciones: paises },

    // Las etiquetas dicen «de facturación» y «de envío» aunque el titulo de la seccion ya lo diga:
    // un lector de pantalla que recorre campo por campo no lee los titulos, y tres «Ciudad» seguidas
    // en el mismo formulario no se distinguen.
    { clave: 'billing.street', etiqueta: 'Calle de facturación', tipo: 'texto', maximo: LARGOS.calle, seccion: 'Facturación' },
    { clave: 'billing.city', etiqueta: 'Ciudad de facturación', tipo: 'texto', maximo: LARGOS.city },
    { clave: 'billing.state', etiqueta: 'Región de facturación', tipo: 'texto', maximo: LARGOS.city },
    { clave: 'billing.zip', etiqueta: 'Código postal de facturación', tipo: 'texto', maximo: LARGOS.city },
    { clave: 'billing.country_id', etiqueta: 'País de facturación', tipo: 'seleccion', opciones: paises },

    { clave: 'shipping.street', etiqueta: 'Calle de envío', tipo: 'texto', maximo: LARGOS.calle, seccion: 'Envío' },
    { clave: 'shipping.city', etiqueta: 'Ciudad de envío', tipo: 'texto', maximo: LARGOS.city },
    { clave: 'shipping.state', etiqueta: 'Región de envío', tipo: 'texto', maximo: LARGOS.city },
    { clave: 'shipping.zip', etiqueta: 'Código postal de envío', tipo: 'texto', maximo: LARGOS.city },
    { clave: 'shipping.country_id', etiqueta: 'País de envío', tipo: 'seleccion', opciones: paises },

    { clave: 'default_currency', etiqueta: 'Moneda', tipo: 'seleccion', opciones: monedas, seccion: 'Preferencias' }
  ]
}
