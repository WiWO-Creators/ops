import { GLOSARIO } from '../../dominio/glosario.ts'

/**
 * Edicion de un recurso que vive en dos filas: el Espacio y sus datos propios.
 *
 * Una Licitacion y un Upsell son un Espacio (`tblprojects`) con una fila propia al lado. Quien edita
 * piensa en "la licitacion" o "la oportunidad", no en dos tablas, asi que el formulario es uno solo y
 * esto reparte lo que cambio entre `PATCH /projects/{id}` y la ruta propia.
 *
 * Las claves del Espacio llegan anidadas bajo `espacio` (así las arma `cuerpoDelFormulario` a partir
 * de `espacio.*`); las propias, planas.
 */

/** Cuerpos de una edicion combinada, uno por recurso. `null` si ese recurso no se toca. */
export interface EdicionCombinada {
  propios: Record<string, unknown> | null
  espacio: Record<string, unknown> | null
}

/**
 * Parte el cuerpo del formulario en lo que va a cada ruta, con solo lo que cambio.
 *
 * Mandar solo lo cambiado importa por dos cosas: si una de las dos peticiones falla, reintentar no
 * reescribe lo que ya se guardo; y una descripcion con formato que nadie toco no se pisa con su
 * version en texto plano.
 *
 * @param cuerpo El cuerpo armado con los campos del formulario y lo que hay escrito.
 * @param inicial El mismo cuerpo armado con los valores con que se abrio el formulario.
 * @param propias Las claves que acepta la ruta propia; cualquier otra plana se descarta.
 * @returns El cuerpo de cada `PATCH`, o `null` en el que no hay nada que mandar.
 */
export function partirEdicionCombinada (
  cuerpo: Record<string, unknown>,
  inicial: Record<string, unknown>,
  propias: readonly string[]
): EdicionCombinada {
  return {
    propios: cambiados(cuerpo, inicial, propias),
    espacio: cambiados(anidado(cuerpo), anidado(inicial), null)
  }
}

/** Las dos rutas de una edicion combinada, sin barra inicial. */
export interface RutasDeEdicion {
  espacio: string
  propia: string
}

/**
 * Manda cada parte de la edicion a su ruta: primero el Espacio, despues la propia.
 *
 * El Espacio va primero porque es el que mas rechaza (nombre obligatorio, fechas, archivado); si
 * falla no se guardo nada. Si falla la segunda, el mensaje dice que la primera si quedo, y como solo
 * viaja lo cambiado, guardar otra vez manda solo lo que falto.
 *
 * Una parte de la que no llego respuesta puede haberse guardado: se devuelve `parcial` para que quien
 * llama vuelva a pedir lo real, y el mensaje no afirma que no se guardo. No se sigue con la segunda
 * parte, para no escribir sobre un Espacio cuyo estado se ignora.
 *
 * @param rutas La ruta del Espacio y la propia.
 * @param partes Lo cambiado, repartido por `partirEdicionCombinada`.
 * @returns `null` si todo se guardo (o no habia nada), o el mensaje y si quedo algo guardado.
 */
export async function guardarEdicionCombinada (
  rutas: RutasDeEdicion,
  partes: EdicionCombinada
): Promise<{ mensaje: string, parcial: boolean } | null> {
  // Se importa al usarlo: este modulo tambien lo cargan las pruebas de los campos, que no escriben nada.
  const { escribirEnBff } = await import('../datos/mutaciones')

  if (partes.espacio !== null) {
    const resultado = await escribirEnBff(rutas.espacio, 'PATCH', partes.espacio)

    if (!resultado.ok) return { mensaje: resultado.mensaje, parcial: resultado.incierta === true }
  }

  if (partes.propios !== null) {
    const resultado = await escribirEnBff(rutas.propia, 'PATCH', partes.propios)

    if (!resultado.ok) {
      if (resultado.incierta === true) return { mensaje: resultado.mensaje, parcial: true }

      return partes.espacio === null
        ? { mensaje: resultado.mensaje, parcial: false }
        : { mensaje: `Se guardaron los datos del ${GLOSARIO.espacio.singular.toLowerCase()}, pero no el resto: ${resultado.mensaje}`, parcial: true }
    }
  }

  return null
}

/**
 * Las claves de `cuerpo` cuyo valor difiere del de `inicial`.
 *
 * @param cuerpo Lo que se va a mandar.
 * @param inicial Lo que habia al abrir.
 * @param permitidas Las claves que se aceptan, o `null` para todas.
 * @returns Las claves cambiadas, o `null` si no cambio ninguna.
 */
function cambiados (
  cuerpo: Record<string, unknown>,
  inicial: Record<string, unknown>,
  permitidas: readonly string[] | null
): Record<string, unknown> | null {
  const entradas = Object.entries(cuerpo).filter(([clave, valor]) =>
    (permitidas === null || permitidas.includes(clave)) && !mismoValor(valor, inicial[clave])
  )

  return entradas.length > 0 ? Object.fromEntries(entradas) : null
}

/**
 * ¿Es el mismo valor? Las listas (las etiquetas) se comparan por contenido y en orden: con `!==`
 * dos listas iguales son siempre distintas, y el Espacio se reescribiria en cada guardado.
 */
function mismoValor (a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((item, indice) => item === b[indice])

  return a === b
}

/**
 * El bloque `espacio` de un cuerpo, o un objeto vacio si no viene.
 *
 * @param cuerpo Un cuerpo armado por `cuerpoDelFormulario`.
 * @returns Los campos del Espacio.
 */
function anidado (cuerpo: Record<string, unknown>): Record<string, unknown> {
  return typeof cuerpo.espacio === 'object' && cuerpo.espacio !== null
    ? cuerpo.espacio as Record<string, unknown>
    : {}
}
