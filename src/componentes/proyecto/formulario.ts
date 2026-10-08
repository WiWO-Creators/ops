/**
 * Logica pura del formulario generico de las pestañas del detalle.
 *
 * Notas e Hitos son altas con la misma forma: un puñado de campos, un `POST` o un
 * `PATCH`, y errores por campo. En vez de un formulario por alta casi iguales hay una descripcion de campos
 * y este modulo, que valida y arma el cuerpo. La parte visual vive en `FormularioRecurso.tsx`.
 */

import { LARGO_MAXIMO_ETIQUETA } from '../../dominio/etiquetas.ts'
import { aFechaLocal } from '../../lib/fechas.ts'
import { esHtml, htmlVacio, textoAHtml, textoPlano } from '../../dominio/texto-rico.ts'

/**
 * `etiquetas` es una lista de NOMBRES, no de ids: la API crea el nombre que no existe. Sus `opciones`
 * son el catálogo que se sugiere mientras se escribe, no un límite de lo que se puede poner.
 *
 * `rico` es un `area` con texto enriquecido (`EditorRico`): su valor es HTML, el cuerpo lleva
 * `format: 'html'` y el vacio, el largo y el valor inicial se miden sobre el texto visible. Se activa
 * por campo: lo que la API todavia no sanea como HTML sigue siendo `area`.
 */
export type TipoCampo = 'texto' | 'area' | 'rico' | 'fecha' | 'color' | 'booleano' | 'numero' | 'seleccion' | 'seleccion-multiple' | 'etiquetas'

/** Una opcion de un campo `seleccion`. El valor viaja como cadena y se convierte al armar el cuerpo. */
export interface OpcionCampo {
  valor: string
  etiqueta: string
}

export interface CampoFormulario {
  /** Nombre del campo tal como lo espera la API. No se traduce. */
  clave: string
  etiqueta: string
  tipo: TipoCampo
  requerido?: boolean
  ayuda?: string
  /** Solo para `fecha`: cota inferior, en `YYYY-MM-DD`. */
  min?: string
  /** Solo para `fecha`: cota superior, en `YYYY-MM-DD`. */
  max?: string
  /** Largo maximo para `texto`. La API rechaza con 422 lo que exceda la columna. */
  maximo?: number
  /** Solo para `seleccion`. La opcion vacia se agrega sola cuando el campo no es requerido. */
  opciones?: OpcionCampo[]
  /**
   * Texto de esa opcion vacia. Por defecto dice "Sin definir".
   *
   * Existe para los campos donde el vacio tiene nombre propio: en el alta de Hito la opcion de
   * reposo es "Sin plantilla", y decir "Sin definir" daria a entender que falta completar algo.
   */
  etiquetaSinValor?: string
  /**
   * Titulo que precede a este campo, para partir un formulario largo en bloques.
   *
   * Va en el campo y no en una lista aparte para que agregar un campo a un bloque sea una linea y no
   * dos ediciones que se pueden desincronizar.
   */
  seccion?: string
  /**
   * Apaga el boton de redaccion con IA en un campo `area`.
   *
   * El asistente se ofrece **por defecto** en toda caja de descripcion: son todas la misma caja en
   * blanco delante de la misma persona, y pedirle a cada formulario que lo encienda termina en siete
   * formularios donde seis se olvidaron. Quedar fuera es la excepcion y se dice acá, en una linea,
   * en vez de duplicar el componente para el caso que no aplica.
   *
   * Solo tiene sentido en `area`; en los demas tipos no se mira.
   */
  sinAsistenteIa?: boolean
  /**
   * Regla propia de un campo de texto, aplicada despues de `requerido` y `maximo` y solo si hay algo
   * escrito. Devuelve el mensaje a mostrar, o `null` si el valor sirve.
   *
   * Existe para que un formato que la API rechaza (un link sin `https://`) se marque en el campo y
   * no llegue como un 422 generico al pie del formulario.
   */
  validar?: (texto: string) => string | null
  /**
   * Si esta vacio, el campo no viaja en el cuerpo.
   *
   * Existe por la contraseña: en una edicion, dejarla en blanco quiere decir "no la cambies", y
   * mandar `null` la convertiria en un intento de borrarla.
   */
  omitirSiVacio?: boolean
}

/** Valores del formulario en crudo, tal como los escribe el navegador. */
export type ValoresFormulario = Record<string, string | boolean | string[]>

/**
 * Valida los campos antes de mandar nada.
 *
 * Validar en el borde no reemplaza al backend, lo adelanta: un requerido vacio no merece un viaje a
 * la API ni un mensaje generico.
 *
 * @param campos la descripcion del formulario
 * @param valores lo que hay escrito
 * @returns un mapa clave -> mensaje; vacio si esta todo bien
 */
export function validarFormulario (
  campos: CampoFormulario[],
  valores: ValoresFormulario
): Record<string, string> {
  const errores: Record<string, string> = {}

  for (const campo of campos) {
    const valor = valores[campo.clave]

    if (campo.tipo === 'seleccion-multiple') {
      // Sin valor es sin marcas, igual que en `cuerpoDelFormulario`: un borrador nuevo todavía no
      // tiene la clave y no puede frenar el guardado de un campo que nadie tocó.
      const elegidas = valor === undefined ? [] : valor

      if (!Array.isArray(elegidas) || elegidas.some((id) => !(campo.opciones ?? []).some((opcion) => opcion.valor === id))) {
        errores[campo.clave] = 'Elige opciones válidas.'
      } else if (campo.requerido === true && elegidas.length === 0) {
        errores[campo.clave] = 'Este campo es obligatorio.'
      }
      continue
    }

    if (campo.tipo === 'etiquetas') {
      const nombres = Array.isArray(valor) ? valor : []

      if (nombres.some((nombre) => nombre.trim().length > LARGO_MAXIMO_ETIQUETA)) {
        errores[campo.clave] = `Cada etiqueta puede tener hasta ${LARGO_MAXIMO_ETIQUETA} caracteres.`
      } else if (campo.requerido === true && nombres.length === 0) {
        errores[campo.clave] = 'Este campo es obligatorio.'
      }
      continue
    }

    if (campo.tipo === 'booleano') continue

    const texto = textoDelCampo(campo, valor)

    if (campo.requerido === true && texto === '') {
      errores[campo.clave] = 'Este campo es obligatorio.'
      continue
    }

    if (texto === '') continue

    if (campo.maximo !== undefined && (campo.tipo === 'rico' ? textoPlano(texto) : texto).length > campo.maximo) {
      errores[campo.clave] = `Máximo ${campo.maximo} caracteres.`
      continue
    }

    if (campo.tipo === 'fecha') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
        // El mensaje nombra el formato que se ESCRIBE, no el que viaja: el campo pide `DD/MM/AAAA` y
        // `ControlDeCampo` traduce. Decir "AAAA-MM-DD" mandaria a corregir algo que no esta a la
        // vista.
        errores[campo.clave] = 'Usa el formato DD/MM/AAAA.'
        continue
      }
      if (campo.min !== undefined && texto < campo.min) {
        errores[campo.clave] = `No puede ser anterior al ${aFechaLocal(campo.min)}.`
        continue
      }
      if (campo.max !== undefined && texto > campo.max) {
        errores[campo.clave] = `No puede ser posterior al ${aFechaLocal(campo.max)}.`
        continue
      }
    }

    if (campo.tipo === 'numero' && !Number.isFinite(Number(texto))) {
      errores[campo.clave] = 'Tiene que ser un número.'
      continue
    }

    const propio = campo.validar?.(texto) ?? null
    if (propio !== null) errores[campo.clave] = propio
  }

  return errores
}

/**
 * Arma el cuerpo del `POST`/`PATCH` a partir de los valores.
 *
 * Los textos vacios viajan como `null` y no como `""`: la columna admite nulo, y guardar la cadena
 * vacia hace que despues no se pueda distinguir "sin descripcion" de "descripcion borrada".
 *
 * @param campos la descripcion del formulario
 * @param valores lo que hay escrito, ya validado
 * @returns el objeto listo para serializar
 */
export function cuerpoDelFormulario (
  campos: CampoFormulario[],
  valores: ValoresFormulario
): Record<string, unknown> {
  const cuerpo: Record<string, unknown> = {}

  for (const campo of campos) {
    const valor = valores[campo.clave]

    if (campo.tipo === 'seleccion-multiple') {
      escribirEn(cuerpo, campo.clave, [...new Set(Array.isArray(valor) ? valor : [])]
        .map((id) => /^\d+$/.test(id) ? Number(id) : id))
      continue
    }

    if (campo.tipo === 'etiquetas') {
      escribirEn(cuerpo, campo.clave, Array.isArray(valor) ? valor.map((nombre) => nombre.trim()).filter((nombre) => nombre !== '') : [])
      continue
    }

    if (campo.tipo === 'booleano') {
      escribirEn(cuerpo, campo.clave, valor === true)
      continue
    }

    const texto = textoDelCampo(campo, valor)

    if (campo.tipo === 'rico') cuerpo.format = 'html'

    if (texto === '') {
      if (campo.omitirSiVacio === true) continue

      escribirEn(cuerpo, campo.clave, campo.requerido === true ? '' : null)
      continue
    }

    const numerico = campo.tipo === 'numero' || (campo.tipo === 'seleccion' && /^\d+$/.test(texto))

    escribirEn(cuerpo, campo.clave, numerico ? Number(texto) : texto)
  }

  return cuerpo
}

/**
 * El texto de un campo listo para validar y enviar: recortado, y para `rico` convertido a HTML.
 *
 * Un campo `rico` que nadie toco puede traer todavia el texto plano de una fila vieja (la API no
 * mando su version en HTML): se convierte aca para que `format: 'html'` nunca acompañe texto plano.
 * Lo que el editor deja sin nada visible (`<p></p>`) cuenta como vacio.
 *
 * @param campo la descripcion del campo
 * @param valor lo que hay escrito
 * @returns el texto, o `''` si no hay nada
 */
function textoDelCampo (campo: CampoFormulario, valor: ValoresFormulario[string] | undefined): string {
  const texto = typeof valor === 'string' ? valor.trim() : ''

  if (campo.tipo !== 'rico') return texto
  if (htmlVacio(texto)) return ''

  return esHtml(texto) ? texto : textoAHtml(texto)
}

/**
 * Escribe un valor en el cuerpo, creando los objetos que pida una clave con puntos.
 *
 * `billing.street` termina en `{ billing: { street: … } }`, que es la forma que espera el contrato
 * para las direcciones de un cliente. Sin esto habria que escribir un formulario propio para el unico
 * recurso que anida.
 */
function escribirEn (cuerpo: Record<string, unknown>, clave: string, valor: unknown): void {
  const partes = clave.split('.')
  const ultima = partes.pop()

  if (ultima === undefined) return

  let destino = cuerpo

  for (const parte of partes) {
    if (typeof destino[parte] !== 'object' || destino[parte] === null) destino[parte] = {}

    destino = destino[parte] as Record<string, unknown>
  }

  destino[ultima] = valor
}

/**
 * Lee un valor del registro siguiendo una clave con puntos.
 *
 * @param registro el registro que se edita
 * @param clave `company` o `billing.street`
 * @returns el valor, o `undefined` si algun tramo del camino no existe
 */
function leerDe (registro: object, clave: string): unknown {
  let actual: unknown = registro

  for (const parte of clave.split('.')) {
    if (typeof actual !== 'object' || actual === null) return undefined

    actual = (actual as Record<string, unknown>)[parte]
  }

  return actual
}

/**
 * Valores iniciales del formulario a partir de un registro existente.
 *
 * @param campos la descripcion del formulario
 * @param registro el registro a editar, o `null` para un alta
 * @returns los valores, con cadena vacia o `false` donde el registro no traiga nada
 */
export function valoresIniciales (
  campos: CampoFormulario[],
  registro: object | null
): ValoresFormulario {
  const valores: ValoresFormulario = {}

  for (const campo of campos) {
    const crudo = registro === null ? undefined : leerDe(registro, campo.clave)

    if (campo.tipo === 'seleccion-multiple') {
      valores[campo.clave] = Array.isArray(crudo) ? [...new Set(crudo.map(String))] : []
      continue
    }

    if (campo.tipo === 'etiquetas') {
      valores[campo.clave] = Array.isArray(crudo) ? nombresDeEtiquetasCrudas(crudo) : []
      continue
    }

    if (campo.tipo === 'booleano') {
      valores[campo.clave] = crudo === true
      continue
    }

    if (campo.tipo === 'rico' && registro !== null) {
      // La version saneada que manda la API, si la hay: es la que conserva el formato.
      const html = leerDe(registro, `${campo.clave}_html`)

      if (typeof html === 'string' && !htmlVacio(html)) {
        valores[campo.clave] = html
        continue
      }
    }

    valores[campo.clave] = crudo === null || crudo === undefined ? '' : String(crudo)
  }

  return valores
}

/**
 * Los nombres de una lista de etiquetas tal como llega de la API (`[{ id, name }]`) o ya en nombres.
 *
 * @param crudo el valor leido del registro
 * @returns los nombres, sin vacios
 */
function nombresDeEtiquetasCrudas (crudo: unknown[]): string[] {
  return crudo.flatMap((etiqueta) => {
    const nombre = typeof etiqueta === 'string'
      ? etiqueta
      : typeof etiqueta === 'object' && etiqueta !== null && typeof (etiqueta as { name?: unknown }).name === 'string'
        ? (etiqueta as { name: string }).name
        : ''

    return nombre.trim() === '' ? [] : [nombre]
  })
}

/** Claves donde un registro guarda el nombre con que la persona lo reconoce, en orden de preferencia. */
const CLAVES_DE_NOMBRE = ['name', 'title', 'company', 'subject', 'full_name', 'nombre', 'empresa'] as const

/**
 * El nombre con que se reconoce un registro, buscado en lo enviado y, si no viajó, en el registro.
 *
 * @param fuentes el cuerpo enviado y el registro editado, en ese orden
 * @returns el nombre, o `null` si ninguna fuente lo trae
 */
function nombreDelRegistro (fuentes: Array<object | null>): string | null {
  for (const fuente of fuentes) {
    if (fuente === null) continue

    for (const clave of CLAVES_DE_NOMBRE) {
      const valor = leerDe(fuente, clave)
      if (typeof valor === 'string' && valor.trim() !== '') return valor.trim()
    }

    const persona = [leerDe(fuente, 'firstname'), leerDe(fuente, 'lastname')].filter((parte) => typeof parte === 'string' && parte.trim() !== '')
    if (persona.length > 0) return persona.join(' ').trim()
  }

  return null
}

/**
 * El aviso de exito tras guardar un formulario, nombrando lo guardado con «».
 *
 * Toda mutacion que cierra un dialogo confirma: sin eso, el dialogo desaparece y quien guardo no sabe
 * si entro. El nombre sale de lo enviado y, en una edicion que no lo toca, del registro.
 *
 * @param metodo `POST` para un alta, `PATCH` para una edicion
 * @param cuerpo lo que se envio
 * @param registro el registro editado, o `null` en un alta
 * @returns el texto del aviso
 */
export function avisoDeGuardado (
  metodo: 'POST' | 'PATCH',
  cuerpo: Record<string, unknown>,
  registro: object | null
): string {
  const nombre = nombreDelRegistro([cuerpo, registro])

  if (nombre === null) return metodo === 'POST' ? 'Alta guardada.' : 'Cambios guardados.'

  return metodo === 'POST' ? `«${nombre}» se creó.` : `Cambios de «${nombre}» guardados.`
}

/**
 * El texto del boton que envia un formulario de alta o de edicion.
 *
 * Una edicion dice «Guardar cambios». Un alta nombra lo que crea: «Nuevo contrato» pasa a
 * «Crear contrato»; si el titulo no empieza por «Nuevo»/«Nueva», queda «Crear».
 *
 * @param metodo `POST` para un alta, `PATCH` para una edicion
 * @param titulo el titulo del dialogo
 * @returns la etiqueta del boton de envio
 */
export function etiquetaDeEnvio (metodo: 'POST' | 'PATCH', titulo: string): string {
  if (metodo === 'PATCH') return 'Guardar cambios'

  const entidad = /^nuev[oa]s?\s+(.+)$/iu.exec(titulo.trim())?.[1]

  return entidad === undefined ? 'Crear' : `Crear ${entidad}`
}
