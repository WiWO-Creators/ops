import { GLOSARIO, nombrar } from './glosario.ts'
import type { MotivoIa } from './ajustes.ts'
import type {
  ContenidoScope,
  CuerpoScope,
  EstadoScope,
  FuenteScope,
  Interpretacion,
  Scope,
  TareaAnalizada,
  Veredicto
} from '../datos/scope.ts'

/**
 * Reglas del Scope del contrato, sin React ni red.
 *
 * Aca vive todo lo que decide la pestaña Scope y la etiqueta de la pestaña Tareas: que entrada se
 * puede mandar a interpretar, que contenido se puede guardar, como se arma cada cuerpo, como se
 * ordenan los veredictos y que se le dice a la persona cuando la IA no contesta. Los topes son los
 * del contrato (`PUT /projects/{id}/scope`): si el navegador acepta algo que la API rechaza, lo que
 * se ve es un formulario que dice que esta bien y un servidor que contesta 422.
 *
 * Se prueba con Node tal cual en `pruebas/scope.test.js`.
 */

/** Topes del contrato. Iguales a los de la API: ver la cabecera del modulo. */
export const LIMITES_SCOPE = {
  resumen: 4000,
  item: 500,
  items: 100,
  texto: 100_000,
  archivoNombre: 255,
  pdfBytes: 10 * 1024 * 1024
} as const

/** Las tres formas de cargar el Scope, en el orden en que se ofrecen. */
export const FUENTES_SCOPE: ReadonlyArray<{ valor: FuenteScope, etiqueta: string, ayuda: string }> = [
  {
    valor: 'estructurado',
    etiqueta: 'Estructurado',
    ayuda: 'Escribe el resumen y lo que incluye, lo que no incluye y los supuestos, ítem por ítem.'
  },
  {
    valor: 'texto',
    etiqueta: 'Texto libre',
    ayuda: 'Pega el texto del contrato o de la propuesta tal como está.'
  },
  {
    valor: 'pdf',
    etiqueta: 'PDF',
    ayuda: 'Sube el PDF del contrato (hasta 10 MB). Puedes sumar un texto con contexto.'
  }
]

/** Lo minimo de un archivo que hace falta para validarlo. Asi se prueba sin `File`. */
export interface ArchivoElegido {
  nombre: string
  tipo: string
  bytes: number
}

/** Lo que la persona cargo antes de interpretar. */
export interface EntradaScope {
  fuente: FuenteScope
  /** El texto libre, o el contexto opcional del PDF. */
  texto: string
  /** Lo que se escribio en el modo Estructurado. */
  estructurado: ContenidoScope
  /** El PDF elegido en esta edicion, si hay uno. */
  archivo: ArchivoElegido | null
  /** El nombre del PDF del Scope ya guardado: se conserva si no se sube otro. */
  archivoGuardado: string | null
}

/** Un contenido sin nada escrito. */
export function contenidoVacio (): ContenidoScope {
  return { resumen: '', incluye: [], excluye: [], supuestos: [] }
}

/**
 * La entrada con la que arranca el editor.
 *
 * Con un Scope guardado arranca con sus datos: el texto que se pego, lo estructurado que se escribio
 * o el nombre del PDF que se subio. Sin Scope, en Texto libre, que es lo que el área comercial tiene
 * a mano casi siempre.
 *
 * @param scope el Scope guardado, o `null`
 * @returns la entrada lista para el editor
 */
export function entradaInicial (scope: Scope | null): EntradaScope {
  if (scope === null) {
    return { fuente: 'texto', texto: '', estructurado: contenidoVacio(), archivo: null, archivoGuardado: null }
  }

  return {
    fuente: scope.fuente,
    texto: scope.fuente === 'estructurado' ? '' : (scope.texto_original ?? ''),
    estructurado: scope.fuente === 'estructurado' ? contenidoDe(scope) : contenidoVacio(),
    archivo: null,
    archivoGuardado: scope.fuente === 'pdf' ? scope.archivo_nombre : null
  }
}

/**
 * Solo la parte editable de un Scope o de una interpretacion, con las listas limpias.
 *
 * @param origen el Scope guardado o lo que devolvio la IA
 * @returns el contenido, sin `observaciones` ni metadatos
 */
export function contenidoDe (origen: ContenidoScope | Interpretacion): ContenidoScope {
  return {
    resumen: typeof origen.resumen === 'string' ? origen.resumen : '',
    incluye: normalizarLista(origen.incluye),
    excluye: normalizarLista(origen.excluye),
    supuestos: normalizarLista(origen.supuestos)
  }
}

/**
 * Limpia una lista: recorta cada item y descarta los vacios y lo que no es texto.
 *
 * El editor deja agregar filas en blanco para ir escribiendo; la API las rechaza como `invalid`.
 *
 * @param items la lista tal como esta en pantalla
 * @returns los items con texto, en el mismo orden
 */
export function normalizarLista (items: readonly unknown[] | null | undefined): string[] {
  if (!Array.isArray(items)) return []

  return items
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item !== '')
}

/** `true` si el nombre o el tipo dicen PDF. Algunos navegadores mandan el tipo vacio. */
function esPdf (archivo: ArchivoElegido): boolean {
  return archivo.tipo === 'application/pdf' || (archivo.tipo === '' && /\.pdf$/i.test(archivo.nombre))
}

/**
 * Valida el PDF elegido antes de subirlo.
 *
 * @param archivo el archivo elegido, o `null`
 * @returns el motivo por el que no sirve, o `null` si sirve
 */
export function errorDeArchivo (archivo: ArchivoElegido | null): string | null {
  if (archivo === null) return 'Elige el PDF del contrato.'
  if (!esPdf(archivo)) return 'El archivo tiene que ser un PDF.'
  if (archivo.bytes <= 0) return 'El PDF está vacío.'
  if (archivo.bytes > LIMITES_SCOPE.pdfBytes) return 'El PDF pesa más de 10 MB.'

  return null
}

/**
 * Lo que impide mandar la entrada a interpretar.
 *
 * @param entrada lo que la persona cargo
 * @returns el motivo, o `null` si se puede interpretar
 */
export function errorDeEntrada (entrada: EntradaScope): string | null {
  if (entrada.texto.length > LIMITES_SCOPE.texto) return 'El texto supera los 100.000 caracteres.'

  if (entrada.fuente === 'texto') {
    return entrada.texto.trim() === '' ? 'Pega el texto del contrato para interpretarlo.' : null
  }

  if (entrada.fuente === 'pdf') return errorDeArchivo(entrada.archivo)

  const errores = erroresDeContenido(entrada.estructurado)

  return Object.values(errores)[0] ?? null
}

/**
 * El cuerpo JSON de `POST .../scope/interpretar` para Texto libre y Estructurado.
 *
 * El PDF no pasa por aca: viaja como multipart y lo arma `camposDeInterpretacionPdf`.
 *
 * @param entrada lo que la persona cargo
 * @returns el cuerpo listo para mandar
 */
export function cuerpoDeInterpretacion (entrada: EntradaScope): Record<string, unknown> {
  if (entrada.fuente === 'estructurado') {
    return { fuente: 'estructurado', ...contenidoDe(entrada.estructurado) }
  }

  return { fuente: 'texto', texto: entrada.texto.trim() }
}

/**
 * Los campos de texto del multipart de un PDF. El archivo lo agrega quien tiene el `File`.
 *
 * @param entrada lo que la persona cargo
 * @returns pares `[campo, valor]`; el texto solo va si hay texto
 */
export function camposDeInterpretacionPdf (entrada: EntradaScope): Array<[string, string]> {
  const texto = entrada.texto.trim()

  return texto === '' ? [['fuente', 'pdf']] : [['fuente', 'pdf'], ['texto', texto]]
}

/**
 * Valida el contenido antes de guardarlo, con las mismas reglas que la API.
 *
 * @param contenido el resumen y las tres listas
 * @returns un mensaje por campo con problemas; vacio si se puede guardar
 */
export function erroresDeContenido (contenido: ContenidoScope): Partial<Record<keyof ContenidoScope, string>> {
  const errores: Partial<Record<keyof ContenidoScope, string>> = {}
  const resumen = contenido.resumen.trim()
  const incluye = normalizarLista(contenido.incluye)

  if (resumen.length > LIMITES_SCOPE.resumen) errores.resumen = 'El resumen supera los 4.000 caracteres.'
  if (resumen === '' && incluye.length === 0) {
    errores.resumen = 'Escribe un resumen o al menos un ítem en «Incluye».'
  }

  for (const clave of ['incluye', 'excluye', 'supuestos'] as const) {
    const lista = normalizarLista(contenido[clave])

    if (lista.length > LIMITES_SCOPE.items) errores[clave] = `${ROTULO_LISTA[clave]}: máximo 100 ítems.`
    else if (lista.some((item) => item.length > LIMITES_SCOPE.item)) {
      errores[clave] = `${ROTULO_LISTA[clave]}: cada ítem admite hasta 500 caracteres.`
    }
  }

  return errores
}

/** Como se llama cada lista en pantalla. */
export const ROTULO_LISTA: Record<'incluye' | 'excluye' | 'supuestos', string> = {
  incluye: 'Incluye',
  excluye: 'No incluye',
  supuestos: 'Supuestos y condiciones'
}

/**
 * El cuerpo de `PUT /projects/{id}/scope`.
 *
 * `texto_original` guarda lo que la persona entrego, para poder volver a editarlo: el texto pegado,
 * el contexto del PDF, o lo estructurado serializado como JSON.
 *
 * @param entrada lo que se cargo antes de interpretar
 * @param contenido lo que se reviso en el preview
 * @returns el cuerpo listo para mandar
 */
export function cuerpoDeGuardado (entrada: EntradaScope, contenido: ContenidoScope): CuerpoScope {
  const limpio = contenidoDe(contenido)
  const texto = entrada.texto.trim()

  return {
    fuente: entrada.fuente,
    ...limpio,
    resumen: limpio.resumen.trim(),
    texto_original: entrada.fuente === 'estructurado'
      ? JSON.stringify(contenidoDe(entrada.estructurado))
      : (texto === '' ? null : texto),
    archivo_nombre: entrada.fuente === 'pdf'
      ? (entrada.archivo?.nombre ?? entrada.archivoGuardado)?.slice(0, LIMITES_SCOPE.archivoNombre) ?? null
      : null
  }
}

/** Que significa cada motivo del `details` de un 422 del Scope. */
const MOTIVO_DE_CAMPO: Record<string, string> = {
  required: 'falta',
  invalid: 'no es válido',
  too_long: 'es demasiado largo',
  no_editable: 'no se puede escribir'
}

/** Como se llama cada campo del contrato en pantalla. */
const ROTULO_CAMPO: Record<string, string> = {
  fuente: 'Forma de carga',
  resumen: 'Resumen',
  incluye: 'Incluye',
  excluye: 'No incluye',
  supuestos: 'Supuestos',
  texto: 'Texto',
  texto_original: 'Texto original',
  archivo: 'Archivo',
  archivo_nombre: 'Nombre del archivo'
}

/**
 * Traduce el `details` de un 422 a lineas legibles.
 *
 * Un campo o un motivo que no esten en los mapas se muestran crudos: inventar un texto para algo que
 * no se conoce esconde justamente el caso que hay que investigar.
 *
 * @param detalles el `details` del error, si vino
 * @returns una linea por campo rechazado
 */
export function detallesLegibles (detalles: Record<string, unknown> | undefined): string[] {
  if (detalles === undefined) return []

  return Object.entries(detalles)
    .filter(([, motivos]) => Array.isArray(motivos))
    .map(([campo, motivos]) => {
      const razones = (motivos as unknown[]).map((m) => MOTIVO_DE_CAMPO[String(m)] ?? String(m)).join(', ')

      return `${ROTULO_CAMPO[campo] ?? campo}: ${razones}`
    })
}

/** Lo que devuelve `escribirEnBff` cuando falla: lo que hace falta para elegir el mensaje. */
export interface FalloIa {
  mensaje: string
  estado?: number
  codigo?: string
  detalles?: Record<string, unknown>
  reintentarEnSegundos?: number | null
}

/**
 * Cuantos segundos esperar despues de un 429.
 *
 * El contrato lo manda en `details.retry_after`; la cabecera `Retry-After` y
 * `reintentar_en_segundos` ya los leyo `escribirEnBff` y llegan como respaldo.
 *
 * @param fallo el error de la escritura
 * @returns los segundos, redondeados hacia arriba, o `null` si nadie lo dijo
 */
export function segundosDeEspera (fallo: FalloIa): number | null {
  const valor = Number(fallo.detalles?.retry_after)

  if (Number.isFinite(valor) && valor > 0) return Math.ceil(valor)

  return fallo.reintentarEnSegundos ?? null
}

/**
 * El mensaje de un fallo de interpretar o analizar.
 *
 * Cada codigo se arregla en un lugar distinto y la frase tiene que decir cual: la IA apagada es un
 * ajuste, la cuota es esperar, el proveedor caido es volver a intentar.
 *
 * @param fallo el error de la escritura
 * @param accion que se estaba haciendo
 * @returns la frase para mostrar
 */
export function mensajeDeFalloIa (fallo: FalloIa, accion: 'interpretar' | 'analizar'): string {
  if (fallo.estado === 404) {
    return 'Las funciones con IA no están disponibles en esta instalación. Se encienden en Administración → Ajustes → Funciones con IA.'
  }

  if (fallo.estado === 429) {
    const segundos = segundosDeEspera(fallo)

    return segundos === null
      ? `Se acaba de analizar este ${GLOSARIO.espacio.singular.toLowerCase()}. Espera un momento antes de volver a intentarlo.`
      : `Se acaba de analizar este ${GLOSARIO.espacio.singular.toLowerCase()}. Vuelve a intentarlo en ${segundos} s.`
  }

  if (fallo.estado === 409) {
    return accion === 'analizar'
      ? `${fallo.mensaje} Si alguien más lo está analizando, espera a que termine.`
      : fallo.mensaje
  }

  if (fallo.estado === 502) {
    return 'El modelo de IA respondió algo que no se pudo leer. Vuelve a intentarlo en un momento.'
  }

  if (fallo.estado === 503) {
    return 'La IA no está configurada en el servidor (falta el proveedor o su clave). Avísale a quien administra.'
  }

  if (fallo.estado === 422) {
    const lineas = detallesLegibles(fallo.detalles)

    return lineas.length === 0 ? fallo.mensaje : `${fallo.mensaje} ${lineas.join('. ')}.`
  }

  return fallo.mensaje
}

/**
 * El texto de espera del analisis. Puede tardar un minuto: decir cuantas Tareas es lo que explica
 * por que.
 *
 * @param total cuantas Tareas se van a clasificar, si se sabe
 * @returns la frase con el conteo, o sin el
 */
export function textoAnalizando (total: number | null): string {
  if (total === null || total <= 0) return `Analizando las ${GLOSARIO.proceso.plural.toLowerCase()}…`

  return `Analizando ${total} ${nombrar('proceso', total).toLowerCase()}…`
}

/** Orden de lectura: primero lo que hay que conversar con el cliente. */
export const ORDEN_VEREDICTOS: readonly Veredicto[] = ['fuera', 'dudoso', 'dentro']

/** Como se dice cada veredicto en pantalla. */
export const ETIQUETA_VEREDICTO: Record<Veredicto, string> = {
  fuera: `Fuera de ${GLOSARIO.scope.singular.toLowerCase()}`,
  dudoso: `${GLOSARIO.scope.singular} dudoso`,
  dentro: `Dentro de ${GLOSARIO.scope.singular.toLowerCase()}`
}

/** El tono de `Insignia` de cada veredicto. */
export const TONO_VEREDICTO: Record<Veredicto, 'peligro' | 'aviso' | 'exito'> = {
  fuera: 'peligro',
  dudoso: 'aviso',
  dentro: 'exito'
}

/** `true` si el valor es uno de los tres veredictos del contrato. */
function esVeredicto (valor: unknown): valor is Veredicto {
  return valor === 'fuera' || valor === 'dudoso' || valor === 'dentro'
}

/**
 * Las Tareas agrupadas por veredicto, en el orden de lectura y sin grupos vacios.
 *
 * Dentro de cada grupo se respeta el orden en que llegaron. Un veredicto que no es del contrato se
 * descarta: no hay grupo honesto donde ponerlo.
 *
 * @param tareas las Tareas del analisis
 * @returns los grupos
 */
export function agruparPorVeredicto (tareas: readonly TareaAnalizada[]): Array<{ veredicto: Veredicto, tareas: TareaAnalizada[] }> {
  return ORDEN_VEREDICTOS
    .map((veredicto) => ({ veredicto, tareas: tareas.filter((t) => t.veredicto === veredicto) }))
    .filter((grupo) => grupo.tareas.length > 0)
}

/** El filtro de la lista del analisis: un veredicto o todas. */
export type FiltroVeredicto = Veredicto | 'todas'

/**
 * Filtra las Tareas del analisis por veredicto y por texto.
 *
 * @param tareas las Tareas del analisis
 * @param filtro el veredicto elegido, o `todas`
 * @param busqueda texto a buscar en el nombre, el motivo o la referencia; vacio no filtra
 * @returns las que quedan, en el mismo orden
 */
export function filtrarTareas (tareas: readonly TareaAnalizada[], filtro: FiltroVeredicto, busqueda = ''): TareaAnalizada[] {
  const texto = busqueda.trim().toLocaleLowerCase('es')

  return tareas.filter((tarea) => {
    if (filtro !== 'todas' && tarea.veredicto !== filtro) return false
    if (texto === '') return true

    return [tarea.nombre, tarea.motivo, tarea.referencia ?? '']
      .some((campo) => campo.toLocaleLowerCase('es').includes(texto))
  })
}

/**
 * Las Tareas que la pestaña Tareas marca, por id.
 *
 * Solo `fuera` y `dudoso`: marcar tambien las de adentro seria una etiqueta en casi todas las filas,
 * y el ruido tapa justo las dos que importan.
 *
 * @param estado lo que devolvio `GET /projects/{id}/scope`, o `null` si no se pudo leer
 * @returns el veredicto de cada Tarea marcada
 */
export function veredictosParaMarcar (estado: EstadoScope | null): Map<number, Exclude<Veredicto, 'dentro'>> {
  const mapa = new Map<number, Exclude<Veredicto, 'dentro'>>()
  const tareas = estado?.analisis?.tareas

  if (!Array.isArray(tareas)) return mapa

  for (const tarea of tareas) {
    if (!esVeredicto(tarea.veredicto) || tarea.veredicto === 'dentro') continue
    if (!Number.isSafeInteger(tarea.task_id)) continue

    mapa.set(tarea.task_id, tarea.veredicto)
  }

  return mapa
}

/**
 * Que se dice por cada motivo por el que no hay IA. El mismo patron que el Meeting Paper: el motivo
 * es lo que la persona puede reportar o arreglar.
 */
export const MOTIVO_IA_SCOPE: Record<MotivoIa, { chip: string, titulo: string, ayuda: string }> = {
  encendida: { chip: '', titulo: '', ayuda: '' },
  apagada: {
    chip: 'IA apagada',
    titulo: 'Las funciones con IA están apagadas en esta instalación.',
    ayuda: `Se encienden en Administración → Ajustes → Funciones con IA. El ${GLOSARIO.scope.singular} guardado se sigue leyendo igual, pero no se puede interpretar ni analizar.`
  },
  ausente: {
    chip: 'IA sin configurar',
    titulo: 'Esta instalación nunca configuró las funciones con IA.',
    ayuda: 'El ajuste "Funciones con IA" no tiene valor guardado. Hay que entrar a Administración → Ajustes, encenderlo y guardar una vez.'
  },
  no_se_pudo_leer: {
    chip: 'Estado de la IA desconocido',
    titulo: 'No se pudo leer si la IA está disponible.',
    ayuda: `Falló la lectura de los ajustes contra la API. No es el ${GLOSARIO.scope.singular}: mientras esto falle, media aplicación va a comportarse raro.`
  }
}
