/**
 * Logica de presentacion del detalle de Cliente.
 *
 * Vive en un `.ts` y no dentro de los componentes porque es la parte que se puede probar: el runner
 * de Node despoja tipos pero no entiende JSX. Los imports son relativos y con extension por la misma
 * razon — el alias `@/` no se resuelve fuera de Next.
 *
 * Nada de esto inventa datos. Cuando la API no trae un campo, la funcion devuelve `null` y el
 * componente decide si esconde la fila o muestra un vacio honesto.
 */

import type {
  Cliente,
  Contacto,
  DireccionCliente,
  EstadoLookup,
  Moneda
} from '../../datos/recursos.ts'

/** Una fila de una lista de definiciones (`<dl>`): rotulo y valor ya listo para mostrar. */
export interface Dato {
  etiqueta: string
  valor: string
}

/**
 * Idiomas que Perfex guarda como nombre de carpeta en `application/language/`.
 *
 * Es un mapa y no un lookup de la API porque el valor que llega es el nombre del directorio, no un
 * id de catalogo: `GET /lookups` no expone idiomas. Lo que no este en el mapa se muestra
 * capitalizado, que para "portuguese" o "italian" sigue siendo legible.
 */
const IDIOMAS: Record<string, string> = {
  spanish: 'Español',
  english: 'Inglés',
  portuguese: 'Portugués',
  french: 'Francés',
  german: 'Alemán',
  italian: 'Italiano'
}

/**
 * Nombre legible del idioma del cliente.
 *
 * @param codigo Valor de `default_language`; `null` cuando el cliente no eligio ninguno.
 * @returns El nombre del idioma, o `null` si el cliente usa el del sistema.
 */
export function nombreDeIdioma (codigo: string | null | undefined): string | null {
  if (typeof codigo !== 'string') return null

  const limpio = codigo.trim().toLowerCase()

  if (limpio === '') return null

  return IDIOMAS[limpio] ?? limpio.charAt(0).toUpperCase() + limpio.slice(1)
}

/**
 * Convierte el sitio web del cliente en una URL navegable.
 *
 * Perfex guarda el campo tal como lo escribieron: `www.abastible.cl` sin esquema es el caso comun, y
 * un `href` asi lo interpreta el navegador como ruta relativa y termina en `/clientes/113/www...`.
 *
 * @param website Valor crudo de `website`.
 * @returns La URL absoluta, o `null` si el campo esta vacio o no es http(s).
 */
export function enlaceDeSitio (website: string | null | undefined): string | null {
  if (typeof website !== 'string') return null

  const limpio = website.trim()

  if (limpio === '') return null

  const conEsquema = /^https?:\/\//i.test(limpio) ? limpio : `https://${limpio}`

  try {
    const url = new URL(conEsquema)

    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null
  } catch {
    // Un texto que no es una URL (una direccion postal pegada en el campo equivocado, que en esta
    // base pasa) no puede convertirse en un enlace roto: se muestra como texto plano.
    return null
  }
}

/** Las partes de una direccion, con el pais ya resuelto a nombre. */
export interface PartesDireccion {
  calle: string | null
  ciudad: string | null
  estado: string | null
  codigoPostal: string | null
  pais: string | null
}

/**
 * Nombre de un pais del catalogo `countries` de `GET /lookups`.
 *
 * El `0` no es una fila de `tblcountries`: significa "sin pais", y por eso no se muestra como id
 * huerfano. Un id que el catalogo no conoce tampoco se inventa.
 *
 * @param paises Catalogo `countries` ya cargado.
 * @param id Valor de `country_id`.
 * @returns El nombre del pais, o `null` si no hay pais que mostrar.
 */
export function nombreDePais (paises: EstadoLookup[], id: number): string | null {
  if (id <= 0) return null

  return paises.find((pais) => pais.id === id)?.name ?? null
}

/**
 * Arma las lineas visibles de una direccion, salteando lo que no vino.
 *
 * Se devuelven lineas y no un solo texto porque una direccion se lee en varios renglones; unirlas
 * con comas produce el parrafo ilegible del panel viejo.
 *
 * @param partes Los campos de la direccion, con el pais ya resuelto.
 * @returns Las lineas no vacias, en orden de lectura. Vacio si no hay ningun dato.
 */
export function lineasDeDireccion (partes: PartesDireccion): string[] {
  const lineas: string[] = []
  const calle = texto(partes.calle)

  if (calle !== null) lineas.push(calle)

  const localidad = [partes.ciudad, partes.estado, partes.codigoPostal]
    .map(texto)
    .filter((parte): parte is string => parte !== null)
    .join(', ')

  if (localidad !== '') lineas.push(localidad)

  const pais = texto(partes.pais)

  if (pais !== null) lineas.push(pais)

  return lineas
}

/**
 * La direccion principal del cliente.
 *
 * @param cliente Cliente ya cargado.
 * @param paises Catalogo `countries`.
 * @returns Las partes listas para `lineasDeDireccion`.
 */
export function direccionPrincipal (cliente: Cliente, paises: EstadoLookup[]): PartesDireccion {
  return {
    calle: cliente.address,
    ciudad: cliente.city,
    estado: cliente.state,
    codigoPostal: cliente.zip,
    pais: nombreDePais(paises, cliente.country_id)
  }
}

/**
 * Una direccion secundaria del cliente: la de facturacion o la de envio.
 *
 * Las dos tienen la misma forma en la API, asi que las lee la misma funcion en vez de dos gemelas.
 *
 * @param direccion `billing` o `shipping` tal como llegaron.
 * @param paises Catalogo `countries`.
 * @returns Las partes listas para `lineasDeDireccion`.
 */
export function direccionSecundaria (direccion: DireccionCliente, paises: EstadoLookup[]): PartesDireccion {
  return {
    calle: direccion.street,
    ciudad: direccion.city,
    estado: direccion.state,
    codigoPostal: direccion.zip,
    pais: nombreDePais(paises, direccion.country_id)
  }
}

/**
 * La moneda con la que se le factura al cliente.
 *
 * `default_currency: 0` no es "sin moneda": es la moneda base de la instalacion, la unica del
 * catalogo con `is_default`. Mostrar un vacio ahi seria decir que no se sabe con que se le cobra.
 *
 * @param monedas Catalogo `currencies` de `GET /lookups`.
 * @param id Valor de `default_currency`.
 * @returns La moneda, o `null` si el catalogo no alcanza para resolverla.
 */
export function monedaDelCliente (monedas: Moneda[], id: number): Moneda | null {
  if (id > 0) return monedas.find((moneda) => moneda.id === id) ?? null

  return monedas.find((moneda) => moneda.is_default) ?? null
}

/**
 * Ordena los contactos para mostrarlos: el primario arriba, el resto alfabetico.
 *
 * La API los devuelve en el orden de la base, que no significa nada. Quien abre un cliente busca a
 * quien hay que llamar, y ese es el primario.
 *
 * @param contactos Los contactos tal como llegaron; `undefined` si no se pidio el include.
 * @returns Una lista nueva; la original no se muta.
 */
export function ordenarContactos (contactos: Contacto[] | undefined): Contacto[] {
  return [...(contactos ?? [])].sort((a, b) => {
    if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1

    return a.full_name.localeCompare(b.full_name, 'es')
  })
}

/**
 * Preferencias del cliente: moneda e idioma.
 *
 * La moneda se muestra siempre —con la base cuando el cliente no eligio ninguna— porque es un dato
 * de facturacion: esconderlo obliga a ir a buscar con que se le cobra a otra pantalla. Se marca
 * cuando es la heredada, para no hacerla pasar por una decision que nadie tomo.
 *
 * @param cliente Cliente ya cargado.
 * @param monedas Catalogo `currencies` de `GET /lookups`.
 * @returns Las filas con valor; vacio si no se pudo resolver nada.
 */
export function preferencias (cliente: Cliente, monedas: Moneda[]): Dato[] {
  const filas: Dato[] = []
  const moneda = monedaDelCliente(monedas, cliente.default_currency)

  if (moneda !== null) {
    const heredada = cliente.default_currency <= 0 ? ' (la del sistema)' : ''

    filas.push({ etiqueta: 'Moneda', valor: `${moneda.name} ${moneda.symbol}${heredada}` })
  }

  const idioma = nombreDeIdioma(cliente.default_language)

  if (idioma !== null) filas.push({ etiqueta: 'Idioma', valor: idioma })

  return filas
}

/**
 * Normaliza un texto opcional de la API.
 *
 * El contrato promete `null` en vez de `""`, pero la base tiene filas viejas con espacios sueltos.
 *
 * @param valor Texto crudo.
 * @returns El texto sin espacios sobrantes, o `null` si no queda nada.
 */
function texto (valor: string | null | undefined): string | null {
  if (typeof valor !== 'string') return null

  const limpio = valor.trim()

  return limpio === '' ? null : limpio
}
