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

import type { Cliente, Contacto } from '../../datos/recursos.ts'

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

/** Las partes de una direccion, ya traducidas desde los dos formatos que expone la API. */
export interface PartesDireccion {
  calle: string | null
  ciudad: string | null
  estado: string | null
  codigoPostal: string | null
  paisId: number
}

/**
 * Arma las lineas visibles de una direccion, salteando lo que no vino.
 *
 * Se devuelven lineas y no un solo texto porque una direccion se lee en varios renglones; unirlas
 * con comas produce el parrafo ilegible del panel viejo.
 *
 * `paisId` se muestra como codigo crudo a proposito: la API expone `country_id` pero no hay catalogo
 * de paises en `GET /lookups`, y traducir el numero adivinando seria inventar el dato.
 *
 * @param partes Los campos de la direccion.
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

  if (partes.paisId > 0) lineas.push(`País (código ${partes.paisId})`)

  return lineas
}

/**
 * La direccion principal del cliente, en el formato comun.
 *
 * @param cliente Cliente ya cargado.
 * @returns Las partes listas para `lineasDeDireccion`.
 */
export function direccionPrincipal (cliente: Cliente): PartesDireccion {
  return {
    calle: cliente.address,
    ciudad: cliente.city,
    estado: cliente.state,
    codigoPostal: cliente.zip,
    paisId: cliente.country_id
  }
}

/**
 * La direccion de facturacion, en el formato comun.
 *
 * @param cliente Cliente ya cargado.
 * @returns Las partes listas para `lineasDeDireccion`.
 */
export function direccionDeFacturacion (cliente: Cliente): PartesDireccion {
  return {
    calle: cliente.billing.street,
    ciudad: cliente.billing.city,
    estado: cliente.billing.state,
    codigoPostal: cliente.billing.zip,
    paisId: cliente.billing.country_id
  }
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

/**
 * Preferencias del cliente: moneda e idioma.
 *
 * `default_currency` llega como id y `GET /lookups` no expone el catalogo de monedas, asi que se
 * muestra el codigo crudo en vez de adivinar el simbolo. El `0` significa "la del sistema", no una
 * moneda desconocida, y por eso no genera fila.
 *
 * @param cliente Cliente ya cargado.
 * @returns Las filas con valor; vacio si el cliente usa todo lo predeterminado.
 */
export function preferencias (cliente: Cliente): Dato[] {
  const filas: Dato[] = []

  if (cliente.default_currency > 0) {
    filas.push({ etiqueta: 'Moneda', valor: `Código ${cliente.default_currency}` })
  }

  const idioma = nombreDeIdioma(cliente.default_language)

  if (idioma !== null) filas.push({ etiqueta: 'Idioma', valor: idioma })

  return filas
}
