/**
 * La logica de los anuncios de pantalla: que es un anuncio que la API va a aceptar y en que orden
 * salen en la pared.
 *
 * Vive aparte del componente por la misma razon que `pantallas-panel.ts`: esto es lo unico de la
 * pantalla que se puede equivocar en silencio. Un reordenado que pierde un id deja un anuncio fuera
 * de la rotacion sin que nadie lo note —el televisor simplemente no lo muestra, y nadie esta mirando
 * cuando eso pasa—, y un borrador incoherente (un formato "solo imagen" con un titulo escrito) vuelve
 * de la API como un 422 que la persona no puede interpretar.
 *
 * === POR QUE LOS TOPES ESTAN REPETIDOS ACA ===
 *
 * 191, 1200, 5 MB y los tres mimes son los de la API, y estan duplicados a proposito. No es para
 * ahorrarse el viaje: es para que el formulario no deje *armar* algo que la API va a rechazar. Un
 * contador que avisa en el caracter 1180 evita el 422; un 422 sobre un texto de 1200 caracteres
 * obliga a recortar a ciegas. La copia se paga con el riesgo de que las dos listas se separen, y por
 * eso cada constante dice de donde sale.
 */
import type { AnuncioDePantallaEnPanel, PantallaDeAreaEnPanel, TipoDeAnuncio } from '@/datos/recursos'

/** Tope de `titulo`, el mismo que valida la API. Un titulo mas largo no entra en la pared igual. */
export const TITULO_MAXIMO = 191

/**
 * Tope de `texto`, el mismo que valida la API.
 *
 * Mil doscientos caracteres son unas doscientas palabras: mucho mas de lo que alguien lee de pie y de
 * paso, asi que el tope real no es este sino el buen gusto. El contador existe para que el limite se
 * vea venir, no para que se use entero.
 */
export const TEXTO_MAXIMO = 1200

/** Rango de `orden` que acepta la API. Se escribe con los botones, no a mano, pero el campo existe. */
export const ORDEN_MINIMO = 0
export const ORDEN_MAXIMO = 9999

/** Tope de la imagen en bytes (5 MB), el mismo que valida la API. */
export const IMAGEN_BYTES_MAXIMO = 5242880

/**
 * Los mimes que acepta la API, y las extensiones equivalentes para el `accept` del selector.
 *
 * Van los dos porque no sirven para lo mismo: el mime es lo que se comprueba —el nombre del archivo
 * se puede renombrar a `.png` sin que el contenido cambie—, y la extension es lo unico que entiende
 * el dialogo de archivos de algunos sistemas.
 */
export const MIMES_DE_IMAGEN: readonly string[] = ['image/jpeg', 'image/png', 'image/webp']
export const ACEPTA_IMAGEN = 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp'

/**
 * Que puede llevar cada formato.
 *
 * Es la misma regla que la API valida con tres ramas, escrita como datos para que el formulario la
 * consulte en vez de repetirla en cada `if`. `exigeImagen` y `admiteImagen` no son opuestos:
 * `imagen_con_texto` exige imagen y la admite, `texto` no la exige **y ademas no la tolera**, y esa
 * tercera combinacion —admitir sin exigir— no existe hoy pero el tipo la deja expresar sin tocar la
 * logica.
 *
 * El orden de `TIPOS_DE_ANUNCIO` es el de la interfaz, no el de la API: primero el formato que se usa
 * casi siempre (una foto con una bajada), despues la foto sola, y al final el de solo texto, que es el
 * recurso de quien no tiene una imagen a mano.
 */
export interface FormatoDeAnuncio {
  nombre: string
  descripcion: string
  exigeImagen: boolean
  admiteImagen: boolean
  admiteTexto: boolean
}

export const TIPOS_DE_ANUNCIO: TipoDeAnuncio[] = ['imagen_con_texto', 'imagen', 'texto']

export const FORMATOS: Record<TipoDeAnuncio, FormatoDeAnuncio> = {
  imagen_con_texto: {
    nombre: 'Imagen con texto',
    descripcion: 'Una foto a pantalla completa con un título y una bajada encima.',
    exigeImagen: true,
    admiteImagen: true,
    admiteTexto: true
  },
  imagen: {
    nombre: 'Solo imagen',
    descripcion: 'La foto sola, sin nada escrito encima. Para un afiche que ya trae su propio texto.',
    exigeImagen: true,
    admiteImagen: true,
    admiteTexto: false
  },
  texto: {
    nombre: 'Solo texto',
    descripcion: 'Un título y una bajada en grande, sin imagen.',
    exigeImagen: false,
    admiteImagen: false,
    admiteTexto: true
  }
}

/**
 * El anuncio mientras se edita.
 *
 * Todo es `string` —incluidas las fechas y el orden llega como numero aparte— porque esto es lo que
 * hay dentro de un `<input>`: un campo de fecha a medio escribir vale `'2026-0'`, y convertirlo a
 * `Date` en cada pulsacion obligaria a inventar que significa una fecha imposible. La conversion
 * ocurre una vez, al armar el cuerpo, y la validacion trabaja sobre el texto crudo.
 *
 * La imagen **no** esta acá: es un `File` del navegador o una que ya estaba guardada en el servidor,
 * dos cosas que no se pueden comparar ni serializar juntas. El componente las lleva aparte y le pasa
 * a este modulo lo unico que importa para validar: si al terminar va a haber imagen o no.
 */
export interface BorradorDeAnuncio {
  tipo: TipoDeAnuncio
  titulo: string
  texto: string
  /** `YYYY-MM-DD` o vacio. Vacio es "desde siempre". */
  vigenteDesde: string
  /** `YYYY-MM-DD` o vacio. Vacio es "hasta que se borre". */
  vigenteHasta: string
  orden: number
}

export type CampoConError = 'titulo' | 'texto' | 'imagen' | 'orden' | 'vigencia'

/** Los problemas del borrador, uno por campo. Vacio significa que la API lo va a aceptar. */
export type ErroresDelBorrador = Partial<Record<CampoConError, string>>

/**
 * Un borrador nuevo, o el de un anuncio que ya existe.
 *
 * El formato por defecto de uno nuevo es `imagen_con_texto` porque es el que se usa casi siempre, y
 * porque es el unico que no cierra ninguna puerta: quien elige ese formato y no escribe nada todavia
 * puede pasarse a "solo imagen" sin perder lo tecleado.
 *
 * @param anuncio La fila que se edita, o `null` para uno nuevo.
 * @param ordenSugerido Donde cae uno nuevo. Se le pasa el largo de la lista para que entre al final,
 *   que es donde el ojo lo busca despues de crearlo.
 */
export function borradorDesde (
  anuncio: AnuncioDePantallaEnPanel | null,
  ordenSugerido = 0
): BorradorDeAnuncio {
  if (anuncio === null) {
    return {
      tipo: 'imagen_con_texto',
      titulo: '',
      texto: '',
      vigenteDesde: '',
      vigenteHasta: '',
      orden: acotarOrden(ordenSugerido)
    }
  }

  return {
    tipo: anuncio.tipo,
    titulo: anuncio.titulo ?? '',
    texto: anuncio.texto ?? '',
    vigenteDesde: anuncio.vigente_desde ?? '',
    vigenteHasta: anuncio.vigente_hasta ?? '',
    orden: acotarOrden(anuncio.orden)
  }
}

/**
 * Cambia el formato y deja el borrador coherente con el nuevo.
 *
 * Pasar a "solo imagen" **borra** el titulo y el texto en vez de esconderlos. Esconderlos seria mas
 * amable con quien se equivoca de formato y vuelve atras, pero significa que lo que se ve en el
 * formulario no es lo que se va a guardar: la API deja esos dos campos en `null` para ese formato,
 * asi que un titulo escondido es un titulo que se va a perder igual, solo que sin avisar. Se borra a
 * la vista, y la vista previa lo muestra al instante.
 *
 * Lo que este funcion NO toca es la imagen: quitarla al pasar a "solo texto" es una decision con
 * consecuencias en el servidor (`quitar_imagen`) y la toma el componente, que es quien sabe si la
 * imagen esta en un `File` sin subir o ya guardada.
 */
export function aplicarTipo (borrador: BorradorDeAnuncio, tipo: TipoDeAnuncio): BorradorDeAnuncio {
  if (borrador.tipo === tipo) return borrador

  if (!FORMATOS[tipo].admiteTexto) {
    return { ...borrador, tipo, titulo: '', texto: '' }
  }

  return { ...borrador, tipo }
}

/**
 * Los problemas del borrador, para pintarlos junto a cada campo y apagar el boton de guardar.
 *
 * @param borrador Lo que hay escrito en el formulario.
 * @param tendraImagen Si al terminar de guardar el anuncio va a tener imagen. Es el estado
 *   **resultante**, no el actual: una fila con imagen guardada que se va a mandar con `quitar_imagen`
 *   entra acá como `false`, porque lo que la API va a validar es como queda, no como estaba.
 * @returns Un objeto vacio si no hay nada que corregir.
 */
export function erroresDelBorrador (
  borrador: BorradorDeAnuncio,
  tendraImagen: boolean
): ErroresDelBorrador {
  const formato = FORMATOS[borrador.tipo]
  const errores: ErroresDelBorrador = {}
  const titulo = borrador.titulo.trim()
  const texto = borrador.texto.trim()

  if (formato.exigeImagen && !tendraImagen) {
    errores.imagen = `El formato «${formato.nombre}» necesita una imagen.`
  }

  if (!formato.admiteImagen && tendraImagen) {
    errores.imagen = `El formato «${formato.nombre}» no lleva imagen: hay que quitarla.`
  }

  if (!formato.admiteTexto && (titulo !== '' || texto !== '')) {
    errores.titulo = `El formato «${formato.nombre}» no lleva título ni texto.`
  }

  // La API no lo exige, pero un anuncio de solo texto sin nada escrito es una pantalla en blanco
  // colgada en la pared durante doce segundos por vuelta. Se corta acá.
  if (borrador.tipo === 'texto' && titulo === '' && texto === '') {
    errores.texto = 'Escribe al menos un título o un texto.'
  }

  if (titulo.length > TITULO_MAXIMO) {
    errores.titulo = `El título no puede pasar de ${TITULO_MAXIMO} caracteres.`
  }

  if (texto.length > TEXTO_MAXIMO) {
    errores.texto = `El texto no puede pasar de ${TEXTO_MAXIMO} caracteres.`
  }

  if (!Number.isInteger(borrador.orden) || borrador.orden < ORDEN_MINIMO || borrador.orden > ORDEN_MAXIMO) {
    errores.orden = `El orden es un número entero entre ${ORDEN_MINIMO} y ${ORDEN_MAXIMO}.`
  }

  const vigencia = errorDeVigencia(borrador.vigenteDesde, borrador.vigenteHasta)

  if (vigencia !== null) errores.vigencia = vigencia

  return errores
}

/** Si el borrador se puede mandar. Azucar sobre `erroresDelBorrador` para el `disabled` del boton. */
export function sinErrores (errores: ErroresDelBorrador): boolean {
  return Object.keys(errores).length === 0
}

/**
 * El problema de las dos fechas, o `null` si no hay ninguno.
 *
 * Se comparan como texto y no como `Date`: `YYYY-MM-DD` ordena igual alfabeticamente que
 * cronologicamente, y construir dos `Date` a partir de fechas sin hora es la forma clasica de que la
 * zona horaria mueva un dia el resultado. Lo unico que necesita un `Date` es comprobar que la fecha
 * existe —un 31 de febrero pasa la expresion regular—, y para eso se compara el ida y vuelta en UTC.
 */
export function errorDeVigencia (desde: string, hasta: string): string | null {
  const inicio = desde.trim()
  const fin = hasta.trim()

  if (inicio !== '' && !esFechaValida(inicio)) return 'La fecha de inicio no existe.'
  if (fin !== '' && !esFechaValida(fin)) return 'La fecha de término no existe.'

  if (inicio !== '' && fin !== '' && fin < inicio) {
    return 'El término no puede ser anterior al inicio.'
  }

  return null
}

const FORMATO_DE_FECHA = /^\d{4}-\d{2}-\d{2}$/

/** Si el texto es un `YYYY-MM-DD` que existe en el calendario. */
export function esFechaValida (valor: string): boolean {
  if (!FORMATO_DE_FECHA.test(valor)) return false

  const fecha = new Date(`${valor}T00:00:00Z`)

  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === valor
}

/** Una fecha del formulario como la espera la API: el texto recortado, o `null` si esta vacia. */
export function fechaONula (valor: string): string | null {
  const recortada = valor.trim()

  return recortada === '' ? null : recortada
}

/** Deja el orden dentro del rango que acepta la API, redondeado. Un campo que miente no sirve. */
export function acotarOrden (orden: number): number {
  if (!Number.isFinite(orden)) return ORDEN_MINIMO

  return Math.round(Math.min(Math.max(orden, ORDEN_MINIMO), ORDEN_MAXIMO))
}

/**
 * El problema de la imagen elegida, o `null` si sirve.
 *
 * Recibe la forma minima de un `File` —tipo, tamaño y nombre— y no un `File`: asi la regla se prueba
 * en Node sin inventar un archivo del navegador, que es justo lo que hace que estas comprobaciones
 * terminen sin pruebas.
 *
 * Se mira el **mime y no la extension**: renombrar un `.heic` a `.png` no cambia el contenido, y el
 * que rechaza de verdad es el servidor, doce megas mas tarde.
 */
export function problemaDeLaImagen (archivo: { type: string, size: number }): string | null {
  if (!MIMES_DE_IMAGEN.includes(archivo.type)) {
    return 'La imagen tiene que ser JPG, PNG o WebP.'
  }

  if (archivo.size > IMAGEN_BYTES_MAXIMO) {
    return `La imagen no puede pasar de ${Math.round(IMAGEN_BYTES_MAXIMO / 1048576)} MB.`
  }

  if (archivo.size === 0) {
    return 'El archivo está vacío.'
  }

  return null
}

/** Un tamaño en bytes como se lee en una fila: `1,4 MB`. Para el nombre del archivo ya guardado. */
export function pesoLegible (bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB'
  if (bytes < 1048576) return `${Math.max(1, Math.round(bytes / 1024))} KB`

  return `${(bytes / 1048576).toFixed(1).replace('.', ',')} MB`
}

/**
 * Los anuncios en el orden en que salen en la pared.
 *
 * Desempata por `id` y no deja el empate al criterio del navegador: dos anuncios con el mismo `orden`
 * —posible mientras la API no haya renumerado— se dibujarian en un orden distinto en cada render, y
 * los botones de subir y bajar moverian cosas que no son las que se ven.
 */
export function enOrden (anuncios: AnuncioDePantallaEnPanel[]): AnuncioDePantallaEnPanel[] {
  return [...anuncios].sort((uno, otro) => uno.orden - otro.orden || uno.id - otro.id)
}

/**
 * Mueve un anuncio un lugar arriba o abajo.
 *
 * Con botones y no arrastrando, **la misma decision que tomo `pantallas-panel.ts` para las escenas** y
 * por las mismas razones: funciona con el teclado, lo anuncia un lector de pantalla, y no hay forma de
 * soltar un elemento fuera de la lista y perderlo. Acá pesa todavia mas, porque la lista que se manda
 * a `PUT …/anuncios/orden` tiene que ser la completa del alcance: un elemento que se cae del arrastre
 * es un id que falta en esa lista.
 *
 * En los extremos devuelve la MISMA lista, no una copia: quien la llame puede comparar por identidad
 * para saber que no paso nada y no mandar la escritura.
 */
export function moverAnuncio<T extends { id: number }> (anuncios: T[], id: number, direccion: -1 | 1): T[] {
  const desde = anuncios.findIndex((anuncio) => anuncio.id === id)

  if (desde < 0) return anuncios

  const hasta = desde + direccion

  if (hasta < 0 || hasta >= anuncios.length) return anuncios

  const copia = [...anuncios]
  const [movido] = copia.splice(desde, 1)

  if (movido === undefined) return anuncios

  copia.splice(hasta, 0, movido)

  return copia
}

/**
 * Los ids en el orden actual, que es el cuerpo exacto de `PUT …/anuncios/orden`.
 *
 * La API exige la lista **completa del alcance y sin ids ajenos**, asi que esta funcion sale siempre
 * de la lista que se esta dibujando y nunca de una seleccion: no hay forma de llamarla con la mitad.
 */
export function idsEnOrden (anuncios: Array<{ id: number }>): number[] {
  return anuncios.map((anuncio) => anuncio.id)
}

/**
 * Renumera `orden` segun la posicion, para que la lista local diga lo mismo que va a decir la API.
 *
 * Despues de `PUT …/anuncios/orden` el servidor renumera y no devuelve las filas. Sin esto, la lista
 * en pantalla queda con los `orden` viejos: se ve bien —el orden del array manda— hasta que alguien
 * abre a editar un anuncio y el campo "orden" muestra un numero que ya no es el suyo.
 */
export function renumerar<T extends { orden: number }> (anuncios: T[]): T[] {
  return anuncios.map((anuncio, posicion) => anuncio.orden === posicion ? anuncio : { ...anuncio, orden: posicion })
}

/**
 * El cuerpo que espera la API, con sus nombres de campo.
 *
 * Aplica la coherencia por ultima vez antes de salir: en un formato sin texto, `titulo` y `texto`
 * viajan como `null` aunque el borrador trajera algo. Es la red de seguridad de `aplicarTipo`, y
 * existe porque este es el unico punto por el que pasa **todo** lo que se escribe.
 *
 * @param quitarImagen Agrega `quitar_imagen`. Es lo que hay que mandar para que una fila que tenia
 *   imagen se quede sin ella — pasar a "solo texto" sin esto devuelve 422.
 */
export function cuerpoDeAnuncio (
  borrador: BorradorDeAnuncio,
  quitarImagen = false
): Record<string, string | number | null> {
  const formato = FORMATOS[borrador.tipo]
  const titulo = formato.admiteTexto ? borrador.titulo.trim() : ''
  const texto = formato.admiteTexto ? borrador.texto.trim() : ''

  const cuerpo: Record<string, string | number | null> = {
    tipo: borrador.tipo,
    titulo: titulo === '' ? null : titulo,
    texto: texto === '' ? null : texto,
    vigente_desde: fechaONula(borrador.vigenteDesde),
    vigente_hasta: fechaONula(borrador.vigenteHasta),
    orden: acotarOrden(borrador.orden)
  }

  if (quitarImagen) cuerpo.quitar_imagen = 1

  return cuerpo
}

/**
 * El mismo cuerpo, aplanado a pares de texto para un `FormData`.
 *
 * === POR QUE UN `null` VIAJA COMO CADENA VACIA ===
 *
 * En multipart no existe `null`: todo es texto. Las dos salidas posibles para "esta fecha no tiene
 * valor" son omitir el campo o mandarlo vacio, y omitirlo es peor: una edicion que omite
 * `vigente_hasta` no distingue "dejalo como esta" de "quitale el limite", asi que **borrar una fecha
 * mientras se cambia la imagen no tendria forma de expresarse**. La cadena vacia si la tiene, y es lo
 * que PHP convierte a nulo en una regla `nullable`.
 *
 * Solo hace falta cuando hay un archivo que subir; una edicion de solo texto viaja como JSON, donde
 * el `null` es un `null` de verdad. Ver `cuerpoDeAnuncio`.
 */
export function camposMultipart (cuerpo: Record<string, string | number | null>): Array<[string, string]> {
  return Object.entries(cuerpo).map(([clave, valor]) => [clave, valor === null ? '' : String(valor)])
}

/**
 * Lo minimo que hace falta saber de una pantalla para escribirle sus anuncios.
 *
 * Es un `Pick` y no la interfaz entera para que las pruebas no tengan que inventar un codigo, unas
 * escenas y un `last_seen_at` que no intervienen en nada de esto.
 */
export type AlcanceDeAnuncios = Pick<PantallaDeAreaEnPanel, 'global' | 'area_id'>

/**
 * La ruta de los anuncios de un alcance.
 *
 * Las dos ramas son rutas distintas y no la misma con un parametro: la global cuelga de
 * `/accesos/pantallas/global` y la de un area de `/accesos/areas/{id}/pantalla`. Concentrarlas acá es
 * lo que evita que un `PUT …/anuncios/orden` salga con la lista de un alcance hacia el otro, que es el
 * unico error de esta pantalla que borraria el orden de un area entera sin tocar nada suyo.
 *
 * `global` manda sobre `area_id`: una fila marcada como global con un `area_id` cargado es una
 * contradiccion de la API, y ante la duda se escribe donde la fila dice que vive.
 */
export function rutaDeAnuncios (alcance: AlcanceDeAnuncios): string {
  if (alcance.global || alcance.area_id === null) return 'accesos/pantallas/global/anuncios'

  return `accesos/areas/${alcance.area_id}/pantalla/anuncios`
}

/**
 * La clave con la que el selector de alcance nombra a una pantalla.
 *
 * Un desplegable solo sabe de textos, y `area_id` es `null` justo en la pantalla global: usar el id a
 * secas dejaria a la global con la cadena vacia, que es la que Radix reserva para "no hay nada
 * elegido". La palabra `global` no choca con ningun id porque los ids son numeros.
 */
export function claveDeAlcance (alcance: AlcanceDeAnuncios): string {
  if (alcance.global || alcance.area_id === null) return 'global'

  return String(alcance.area_id)
}
