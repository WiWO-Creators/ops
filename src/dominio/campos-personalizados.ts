import type { DefinicionCampoPersonalizado, ValorCampoPersonalizado } from '@/datos/recursos'

/**
 * Campos personalizados de una entidad: del formulario al `PATCH /custom-fields/values` y de vuelta.
 *
 * Vive en un `.ts` y no dentro del formulario porque es la unica parte que se puede probar sin
 * navegador, y porque la escriben tres pantallas —alta de Tarea, edicion de Tarea y lo que venga—
 * que no pueden interpretar el contrato cada una a su manera. `docs/convenciones.md` nombra
 * `esquemaDeCamposPersonalizados()` como prueba obligatoria: esta en `pruebas/campos-personalizados.test.js`.
 *
 * **Es un renderizador generico, no un campo "Area" a mano.** La base tiene 29 definiciones y el
 * catalogo se administra desde el panel: cualquier campo que agreguen manaña aparece solo.
 *
 * Dos cosas NO se deciden aca, a proposito:
 *
 *   - `only_admin`: `GET /custom-fields?para=tasks` ya omite esos campos para quien no es admin, y
 *     `CampoPersonalizado::guardarValores()` los vuelve a rechazar al escribir. Repetir la regla en
 *     el navegador daria una tercera copia que se puede contradecir con las otras dos.
 *   - `active`: el listado solo devuelve los encendidos salvo que se pida `todos=1`, que es cosa de
 *     la pantalla que administra el catalogo.
 *
 * **Desviacion declarada de `docs/convenciones.md`**, la misma que ya documenta `src/dominio/ia.ts`:
 * la convencion pide zod para validar el borde, pero zod **no esta instalado** en este proyecto y
 * agregarlo para construir un validador de diez tipos conocidos no se paga. `esquemaDeCamposPersonalizados()`
 * devuelve el mismo contrato que daria un esquema zod construido en runtime —un objeto con `validar()`
 * que devuelve los errores por campo— escrito a mano y con prueba runnable. La validacion no se
 * saltea: se hace entera y antes de escribir, que es lo que la convencion protege.
 */

/** Valor de un campo en el formulario: escalar como cadena, multivalor como lista de opciones. */
export type ValorDeCampo = string | string[]

/**
 * Valores del formulario indexados **por id de campo**.
 *
 * Por id y no por `slug` porque es lo que espera el cuerpo del `PATCH`; traducir slug a id al enviar
 * daria una conversion mas que puede perder un campo en silencio.
 */
export type ValoresDeCampos = Record<number, ValorDeCampo>

/** Cuerpo de `PATCH /custom-fields/values`. Es un parche parcial: solo viaja lo que cambio. */
export interface ParcheCamposPersonalizados {
  for: string
  rel_id: number
  values: Record<number, string | string[] | null>
}

/** Errores de validacion, indexados por id de campo. Vacio significa que se puede enviar. */
export type ErroresDeCampos = Record<number, string>

/** Un validador construido a partir de las definiciones vigentes. */
export interface EsquemaCampos {
  /**
   * Valida los valores del formulario contra las definiciones.
   *
   * @param valores lo que hay cargado en el formulario
   * @returns los errores por id de campo; objeto vacio si todo pasa
   */
  validar: (valores: ValoresDeCampos) => ErroresDeCampos
}

/** Los tipos que guardan varias opciones a la vez. Es la misma lista que `CampoPersonalizado.php`. */
const TIPOS_MULTIPLES = ['multiselect', 'checkbox']

/** Tope de un `textarea` en la base (`mediumtext`), tal como lo exige el backend. */
const LARGO_TEXTAREA = 65535

/** Tope de un campo de texto de una linea, tal como lo exige el backend. */
const LARGO_TEXTO = 1000

/** Tope de un `link`, tal como lo exige el backend. */
const LARGO_ENLACE = 2048

/**
 * `true` si el campo guarda varias opciones a la vez.
 *
 * @param tipo el `type` de la definicion
 */
export function esMultiple (tipo: string): boolean {
  return TIPOS_MULTIPLES.includes(tipo)
}

/**
 * Las definiciones en el orden en que se pintan.
 *
 * `order` manda, y a igualdad el nombre, para que el formulario no dependa de como devolvio las
 * filas la base. Devuelve una copia: `sort` muta, y las definiciones son estado compartido.
 *
 * @param definiciones lo que devuelve `GET /custom-fields?para=tasks`
 */
export function camposOrdenados (
  definiciones: DefinicionCampoPersonalizado[]
): DefinicionCampoPersonalizado[] {
  return [...definiciones].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
}

/**
 * El valor vacio que le corresponde a un campo segun su tipo.
 *
 * @param definicion la definicion del campo
 */
export function valorVacio (definicion: DefinicionCampoPersonalizado): ValorDeCampo {
  return esMultiple(definicion.type) ? [] : ''
}

/** `true` si el valor no tiene nada cargado. Es el mismo criterio de vaciado que aplica la API. */
export function estaVacio (valor: ValorDeCampo): boolean {
  return Array.isArray(valor) ? valor.length === 0 : valor.trim() === ''
}

/**
 * `YYYY-MM-DDTHH:mm` para un `<input type="datetime-local">`, desde lo que guarda la API.
 *
 * La API devuelve `YYYY-MM-DD HH:MM:SS` en la zona del servidor, que es la misma que ve la persona.
 * No se construye un `Date` para esto: parsear y volver a formatear correria el valor una zona
 * horaria cada vez que el navegador y el servidor no coincidan.
 *
 * @param valor lo que devolvio la API
 * @returns el valor para el control, o cadena vacia si no se entiende
 */
export function fechaHoraParaControl (valor: string): string {
  const partes = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/.exec(valor)

  return partes === null ? '' : `${partes[1]}T${partes[2]}`
}

/**
 * ISO-8601 con zona para la API, desde lo que escribio un `<input type="datetime-local">`.
 *
 * El control entrega `YYYY-MM-DDTHH:mm` **sin zona**, y `Fechas::aDatetime()` exige el desplazamiento
 * o la `Z`: mandarlo tal cual devuelve `422`. `Date` interpreta esa forma como hora local —que es lo
 * que la persona escribio— y `toISOString()` le pone la zona.
 *
 * @param valor lo que escribio la persona
 * @returns el ISO-8601 en UTC, o `null` si la fecha no existe
 */
export function fechaHoraParaApi (valor: string): string | null {
  const fecha = new Date(valor)

  return Number.isNaN(fecha.getTime()) ? null : fecha.toISOString()
}

/**
 * Estado inicial del formulario a partir de los valores que trajo la API.
 *
 * Un campo sin fila en `customfieldsvalues` no viene en la lista: queda con su valor vacio, no con
 * `undefined`, para que el control sea controlado desde el primer render.
 *
 * @param definiciones las definiciones vigentes
 * @param valores lo que trajo `include=custom_fields`, o el `PATCH` de lectura
 * @returns los valores del formulario, con una entrada por definicion
 */
export function valoresIniciales (
  definiciones: DefinicionCampoPersonalizado[],
  valores: ValorCampoPersonalizado[]
): ValoresDeCampos {
  const cargados = new Map(valores.map((valor) => [valor.id, valor.value]))
  const estado: ValoresDeCampos = {}

  for (const definicion of definiciones) {
    estado[definicion.id] = desdeApi(definicion, cargados.get(definicion.id) ?? null)
  }

  return estado
}

/**
 * Estado inicial de un alta: el `default_value` de cada definicion.
 *
 * @param definiciones las definiciones vigentes
 * @returns los valores del formulario, con una entrada por definicion
 */
export function valoresPorDefecto (definiciones: DefinicionCampoPersonalizado[]): ValoresDeCampos {
  const estado: ValoresDeCampos = {}

  for (const definicion of definiciones) {
    estado[definicion.id] = desdeApi(definicion, definicion.default_value)
  }

  return estado
}

/**
 * Traduce un valor de la API al valor del control.
 *
 * El `default_value` de un campo multivalor llega como texto separado por comas —es como Perfex lo
 * guarda—, asi que se parte igual que lo hace el backend al leer.
 */
function desdeApi (
  definicion: DefinicionCampoPersonalizado,
  valor: string | string[] | null
): ValorDeCampo {
  if (esMultiple(definicion.type)) {
    const opciones = definicion.options ?? []
    const elegidas = Array.isArray(valor)
      ? valor
      : (valor ?? '').split(',').map((opcion) => opcion.trim())

    // Se conserva el orden de las opciones y no el de llegada: asi dos formularios con la misma
    // seleccion producen la misma cadena, y `cuerpoDeCamposPersonalizados()` no detecta un cambio
    // que no existe.
    return opciones.filter((opcion) => elegidas.includes(opcion))
  }

  if (valor === null) return ''

  const texto = Array.isArray(valor) ? valor.join(', ') : valor

  return definicion.type === 'date_picker_time' ? fechaHoraParaControl(texto) : texto
}

/**
 * Alterna una opcion dentro de un campo multivalor.
 *
 * Devuelve la seleccion en el orden de las opciones, no en el de los clics: el valor guardado es un
 * `implode(', ')` del backend, asi que un orden distinto seria un cambio real que nadie pidio.
 *
 * @param definicion la definicion del campo
 * @param elegidas lo que ya estaba elegido
 * @param opcion la opcion que se toco
 * @returns la seleccion nueva; no muta la anterior
 */
export function alternarOpcion (
  definicion: DefinicionCampoPersonalizado,
  elegidas: string[],
  opcion: string
): string[] {
  const objetivo = elegidas.includes(opcion)
    ? elegidas.filter((elegida) => elegida !== opcion)
    : [...elegidas, opcion]

  return (definicion.options ?? []).filter((disponible) => objetivo.includes(disponible))
}

/**
 * `true` si el texto es un enlace que un navegador puede abrir.
 *
 * Mas estricto que el backend a proposito: `FILTER_VALIDATE_URL` acepta cualquier esquema con `://`,
 * y un `ftp://` guardado como "Link de Drive" es un enlace que nadie va a poder abrir desde el panel.
 *
 * @param texto lo que escribio la persona
 */
export function esEnlaceValido (texto: string): boolean {
  let url: URL

  try {
    url = new URL(texto)
  } catch {
    // `URL` lanza con cualquier cosa que no sea absoluta; para esta funcion eso es "no es enlace".
    return false
  }

  return url.protocol === 'http:' || url.protocol === 'https:'
}

/** `true` si el texto es un `YYYY-MM-DD` que existe en el calendario. */
function esDiaValido (texto: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false

  const fecha = new Date(`${texto}T00:00:00Z`)

  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === texto
}

/**
 * Construye el validador de un conjunto de definiciones.
 *
 * Es el equivalente al esquema que se armaria en runtime con zod: una regla por tipo, con los mismos
 * limites que aplica `CampoPersonalizado::valorParaGuardar()`. Existe para que el `422` no llegue —un
 * "Hay valores que no se pueden guardar. 3 falta." no le dice nada a nadie— y sobre todo para el alta,
 * donde la Tarea ya se creo cuando el `PATCH` de los campos sale: validar despues seria tarde.
 *
 * @param definiciones las definiciones vigentes
 * @returns un objeto con `validar()`
 */
export function esquemaDeCamposPersonalizados (
  definiciones: DefinicionCampoPersonalizado[]
): EsquemaCampos {
  return {
    validar (valores) {
      const errores: ErroresDeCampos = {}

      for (const definicion of definiciones) {
        const fallo = validarCampo(definicion, valores[definicion.id] ?? valorVacio(definicion))

        if (fallo !== null) errores[definicion.id] = fallo
      }

      return errores
    }
  }
}

/**
 * Valida un campo contra su definicion.
 *
 * @returns el mensaje de error, o `null` si el valor sirve
 */
function validarCampo (
  definicion: DefinicionCampoPersonalizado,
  valor: ValorDeCampo
): string | null {
  if (estaVacio(valor)) {
    return definicion.required ? 'Falta completar este campo.' : null
  }

  const opciones = definicion.options ?? []

  if (Array.isArray(valor)) {
    return valor.every((opcion) => opciones.includes(opcion))
      ? null
      : 'Hay una opción elegida que ya no existe.'
  }

  const texto = valor.trim()

  switch (definicion.type) {
    case 'select':
      return opciones.includes(texto) ? null : 'Hay que elegir una de las opciones.'
    case 'number':
      return Number.isFinite(Number(texto)) ? null : 'Tiene que ser un número.'
    case 'link':
      if (!esEnlaceValido(texto)) return 'Tiene que ser un enlace completo, con http:// o https://.'

      return texto.length <= LARGO_ENLACE ? null : 'El enlace es demasiado largo.'
    case 'colorpicker':
      return /^#[0-9a-fA-F]{6}$/.test(texto) ? null : 'Tiene que ser un color en formato #rrggbb.'
    case 'date_picker':
      return esDiaValido(texto) ? null : 'Tiene que ser una fecha válida.'
    case 'date_picker_time':
      return fechaHoraParaApi(texto) === null ? 'Tiene que ser una fecha y hora válidas.' : null
    case 'textarea':
      return texto.length <= LARGO_TEXTAREA ? null : 'El texto es demasiado largo.'
    default:
      // `input` y cualquier tipo que agreguen: texto llano con el mismo tope que la API.
      return texto.length <= LARGO_TEXTO ? null : 'El texto es demasiado largo.'
  }
}

/** `true` si los dos valores son el mismo. Las listas se comparan posicion a posicion. */
function mismoValor (uno: ValorDeCampo, otro: ValorDeCampo): boolean {
  if (Array.isArray(uno) && Array.isArray(otro)) {
    return uno.length === otro.length && uno.every((opcion, indice) => opcion === otro[indice])
  }

  return uno === otro
}

/**
 * Arma el cuerpo del `PATCH /custom-fields/values` con lo que cambio, y nada mas.
 *
 * Es un parche parcial de verdad: un campo que nadie toco no viaja. Importa porque `only_admin` se
 * decide del lado del backend —reenviar el formulario entero haria que quien no es admin recibiera un
 * `422` por un campo que ni siquiera ve— y porque cada escritura deja una linea en el registro de
 * actividad.
 *
 * El vacio viaja como `null` y no como `''` ni `[]`: la API trata a los tres igual, y una sola forma
 * evita tener que preguntar el tipo del campo para saber como se borra.
 *
 * @param para la entidad del contrato (`tasks`, `projects`, …)
 * @param relId el id de la entidad
 * @param definiciones las definiciones vigentes
 * @param iniciales los valores tal como se abrio el formulario
 * @param actuales los valores tal como quedaron
 * @returns el cuerpo del `PATCH`, o `null` si no hay nada que escribir
 */
export function cuerpoDeCamposPersonalizados (
  para: string,
  relId: number,
  definiciones: DefinicionCampoPersonalizado[],
  iniciales: ValoresDeCampos,
  actuales: ValoresDeCampos
): ParcheCamposPersonalizados | null {
  const values: ParcheCamposPersonalizados['values'] = {}

  for (const definicion of definiciones) {
    const antes = iniciales[definicion.id] ?? valorVacio(definicion)
    const ahora = actuales[definicion.id] ?? valorVacio(definicion)

    if (mismoValor(antes, ahora)) continue

    values[definicion.id] = paraApi(definicion, ahora)
  }

  return Object.keys(values).length === 0 ? null : { for: para, rel_id: relId, values }
}

/** Traduce un valor del control al valor que espera la API. El vacio siempre viaja como `null`. */
function paraApi (
  definicion: DefinicionCampoPersonalizado,
  valor: ValorDeCampo
): string | string[] | null {
  if (estaVacio(valor)) return null
  if (Array.isArray(valor)) return valor

  const texto = valor.trim()

  return definicion.type === 'date_picker_time' ? fechaHoraParaApi(texto) : texto
}

/**
 * Cuerpo del `PATCH` que **no escribe nada** y devuelve los valores vigentes de una entidad.
 *
 * Es un rodeo y esta documentado como tal: la API no expone ninguna lectura de los valores de una
 * Tarea. `GET /tasks/{id}` no honra `include=custom_fields` —`RecursoProcesos::ver()` fija los
 * includes en `['description']`— y solo el listado los trae, que no sirve para una fila sola.
 *
 * `CampoPersonalizado::guardarValores()` con `values` vacio no entra a la transaccion ni anota
 * actividad, y devuelve el conjunto completo de valores. Autoriza lo mismo que editar la entidad,
 * que es exactamente el permiso que ya hace falta para abrir el formulario.
 *
 * @param para la entidad del contrato
 * @param relId el id de la entidad
 */
export function lecturaDeCamposPersonalizados (
  para: string,
  relId: number
): ParcheCamposPersonalizados {
  return { for: para, rel_id: relId, values: {} }
}

/** Lo que devuelve `PATCH /custom-fields/values`. */
export interface RespuestaCamposPersonalizados {
  for: string
  rel_id: number
  values: ValorCampoPersonalizado[]
}
