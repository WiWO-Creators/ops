import { getSchema } from '@tiptap/core'
import { generateHTML, generateJSON } from '@tiptap/html'
import {
  prosemirrorJSONToYDoc,
  prosemirrorJSONToYXmlFragment,
  yDocToProsemirrorJSON
} from '@tiptap/y-tiptap'
import type { Document } from '@hocuspocus/server'
import type { Doc } from 'yjs'

import { extensionesDeTexto } from '../../../src/lib/en-vivo/extensiones-texto.ts'
import type { ClienteBoard } from '../cliente-board.ts'
import { registrar } from '../registro.ts'
import { descartarEditorSinPermiso, desenvolver, esperaTransitoria } from './comun.ts'
import {
  ErrorDeAdaptador,
  type AdaptadorDeDocumento,
  type EstadoDeDocumento,
  type ResultadoDeGuardado,
  type ResultadoDeSincronia
} from './tipos.ts'

/**
 * Adaptador genérico de los textos enriquecidos internos (descripción de una tarea, borrador de la
 * respuesta de un ticket) entre el documento Yjs y el board.
 *
 * El board guarda HTML; Yjs guarda un árbol. Se convierte en los dos sentidos con el esquema de
 * `extensionesDeTexto()`, el mismo del editor del navegador. Lo que cambia entre un texto y otro —la
 * ruta del board, el cuerpo del guardado y si la revisión puede faltar— lo da una {@link DefinicionDeTexto}.
 *
 * La revisión es un texto opaco que el board calcula solo con el texto (para la tarea, `sha1(description)`):
 * no cambia si se toca otro campo de la tarea. Por eso se trata igual que la del acta: si difiere de la
 * conocida, otra persona cambió el texto y se recarga; un 409 al guardar significa lo mismo.
 */

/** Nombre del fragmento Yjs donde vive el texto. */
const CAMPO = 'default'

/** Lo que el board contestó al pedir el texto. */
interface TextoDelBoard {
  content: string
  /** Texto opaco; `null` solo si la definición admite revisión nula y el board todavía no tiene texto. */
  revision: string | null
}

/** Cómo habla con el board un tipo de texto. */
export interface DefinicionDeTexto {
  /** Nombre del documento sin el id (`tarea`, `ticket-borrador`): se usa en los registros. */
  documento: string
  /** Ruta del board del texto, sin barra inicial (`en-vivo/tareas/5`). */
  ruta: (id: number) => string
  /** El cuerpo del `PUT` de guardado. */
  cuerpoDeGuardado: (estado: EstadoDeDocumento, html: string, staffId: number) => Record<string, unknown>
  /** `true` si el board puede no tener texto todavía y contestar `date_updated: null`. */
  revisionNula: boolean
}

/** Convierte HTML en un documento Yjs con el esquema del texto. */
export function textoAYDoc (html: string): Doc {
  const extensiones = extensionesDeTexto({ conHistorial: false })

  return prosemirrorJSONToYDoc(getSchema(extensiones), generateJSON(html, extensiones), CAMPO)
}

/** Convierte un documento Yjs del texto en el HTML que se guarda en el board. */
export function yDocATexto (documento: Doc): string {
  return generateHTML(yDocToProsemirrorJSON(documento, CAMPO), extensionesDeTexto({ conHistorial: false }))
}

/**
 * Lee la revisión (`date_updated`) de una respuesta del board.
 *
 * @param datos el cuerpo contestado
 * @param revisionNula si `date_updated: null` es una respuesta válida
 * @returns `{revision}` (que puede ser `null` si se admite), o `null` si la respuesta no la trae bien
 */
function leerRevision (datos: unknown, revisionNula: boolean): { revision: string | null } | null {
  const revision = desenvolver(datos)?.date_updated

  if (typeof revision === 'string' && revision !== '') return { revision }
  if (typeof revision === 'number') return { revision: String(revision) }
  if (revisionNula && revision === null) return { revision: null }

  return null
}

/**
 * Lee `{content, date_updated}` del sobre del board.
 *
 * @param datos el cuerpo contestado
 * @param revisionNula si `date_updated: null` es una respuesta válida
 * @returns el texto, o `null` si la forma no es la esperada
 */
function leerTexto (datos: unknown, revisionNula: boolean): TextoDelBoard | null {
  const content = desenvolver(datos)?.content
  const leida = leerRevision(datos, revisionNula)

  return typeof content === 'string' && leida !== null ? { content, revision: leida.revision } : null
}

/**
 * Crea el adaptador de un tipo de texto.
 *
 * @param board el cliente firmado del board
 * @param definicion cómo habla con el board este tipo de texto
 * @returns las cuatro operaciones del adaptador
 */
export function crearAdaptadorDeTexto (board: ClienteBoard, definicion: DefinicionDeTexto): AdaptadorDeDocumento {
  const nombreDe = (id: number): string => `${definicion.documento}:${id}`

  /** Pide el texto al board; `sin_acceso` si ya no existe o la función está apagada. */
  async function pedir (id: number): Promise<TextoDelBoard> {
    const { estado, datos } = await board('GET', definicion.ruta(id))

    if (estado === 403 || estado === 404) throw new ErrorDeAdaptador('sin_acceso')

    const texto = estado === 200 ? leerTexto(datos, definicion.revisionNula) : null

    if (texto === null) throw new ErrorDeAdaptador(estado === 200 ? 'respuesta_invalida' : 'board_no_disponible')

    return texto
  }

  /** Deja el estado como el board: lo recién leído ya está guardado. */
  function marcarAlDia (estado: EstadoDeDocumento, revision: string | null, html: string): void {
    estado.revision = revision
    estado.ultimoHtml = html
    estado.autores.clear()
    estado.ultimoEditor = null
  }

  async function cargar (id: number): Promise<{ ydoc: Doc, estado: EstadoDeDocumento }> {
    const texto = await pedir(id)
    const ydoc = textoAYDoc(texto.content)

    return {
      ydoc,
      estado: {
        id,
        espacioId: null,
        revision: texto.revision,
        // Lo que el board tendría si se guardara hoy mismo este documento: comparar contra el HTML
        // crudo del board daría un guardado falso por cada diferencia de formato.
        ultimoHtml: yDocATexto(ydoc),
        autores: new Set(),
        ultimoEditor: null,
        vetados: new Set(),
        origen: 'colaborativo',
        pendiente: false,
        reintentos: 0,
        temporizadorDeReintento: null
      }
    }
  }

  async function recargar (documento: Document, estado: EstadoDeDocumento, motivo: string): Promise<ResultadoDeSincronia> {
    let texto: TextoDelBoard

    try {
      texto = await pedir(estado.id)
    } catch (error) {
      return error instanceof ErrorDeAdaptador && error.motivo === 'sin_acceso' ? 'sin_acceso' : 'error'
    }

    const extensiones = extensionesDeTexto({ conHistorial: false })
    const json = generateJSON(texto.content, extensiones)
    const fragmento = documento.getXmlFragment(CAMPO)

    // `skipStoreHooks`: lo que se acaba de leer del board ya está en el board; guardarlo de vuelta
    // sería un PUT sin sentido.
    documento.transact(() => {
      fragmento.delete(0, fragmento.length)
      prosemirrorJSONToYXmlFragment(getSchema(extensiones), json, fragmento)
    }, { source: 'local', skipStoreHooks: true })

    marcarAlDia(estado, texto.revision, yDocATexto(documento))
    documento.broadcastStateless(JSON.stringify({ t: 'recargado', motivo }))

    return 'recargado'
  }

  async function sincronizar (documento: Document, estado: EstadoDeDocumento): Promise<ResultadoDeSincronia> {
    let texto: TextoDelBoard

    try {
      texto = await pedir(estado.id)
    } catch (error) {
      return error instanceof ErrorDeAdaptador && error.motivo === 'sin_acceso' ? 'sin_acceso' : 'error'
    }

    if (texto.revision === estado.revision) return 'sin_cambios'

    return await recargar(documento, estado, 'externo')
  }

  /**
   * Resuelve un 409: otra persona cambió el texto desde la revisión que se conocía.
   *
   * Si el texto que tiene ahora el board es justo el que se iba a guardar no hay nada que hacer; en
   * cualquier otro caso se recarga lo del board y se pierde lo no guardado, igual que en el acta.
   */
  async function alConflicto (documento: Document, estado: EstadoDeDocumento, html: string): Promise<ResultadoDeGuardado> {
    let texto: TextoDelBoard

    try {
      texto = await pedir(estado.id)
    } catch (error) {
      return error instanceof ErrorDeAdaptador && error.motivo === 'sin_acceso' ? 'sin_acceso' : 'reintentar'
    }

    const delBoard = yDocATexto(textoAYDoc(texto.content))

    if (delBoard === html) {
      marcarAlDia(estado, texto.revision, html)

      return 'sin_cambios'
    }

    const recarga = await recargar(documento, estado, 'conflicto')

    return recarga === 'recargado' ? 'recargado' : recarga === 'sin_acceso' ? 'sin_acceso' : 'reintentar'
  }

  /**
   * El board negó guardar como el último editor (403/404): se lo descarta y se reintenta con otra
   * persona que haya escrito; si no queda ninguna, se recarga lo del board. Solo si el propio texto ya
   * no está disponible (la lectura da 403/404) el resultado es `sin_acceso` y se cierra para todos.
   */
  async function alNegarseElGuardado (documento: Document, estado: EstadoDeDocumento): Promise<ResultadoDeGuardado> {
    if (descartarEditorSinPermiso(documento, estado, nombreDe(estado.id))) return await guardar(documento, estado)

    const recarga = await recargar(documento, estado, 'sin_permiso')

    return recarga === 'recargado' ? 'recargado' : recarga === 'sin_acceso' ? 'sin_acceso' : 'reintentar'
  }

  /** Manda el `PUT` y traduce la respuesta. */
  async function enviar (documento: Document, estado: EstadoDeDocumento, html: string): Promise<ResultadoDeGuardado> {
    const autores = [...estado.autores]
    const staffId = estado.ultimoEditor

    if (staffId === null) return 'sin_cambios'

    const { estado: http, datos } = await board('PUT', definicion.ruta(estado.id), definicion.cuerpoDeGuardado(estado, html, staffId))

    if (http === 200) {
      const guardada = leerRevision(datos, definicion.revisionNula)

      if (guardada === null) {
        registrar({ evento: 'guardado_sin_revision', documento: nombreDe(estado.id) })

        return 'rechazado'
      }

      estado.revision = guardada.revision
      estado.ultimoHtml = html
      // Solo se descuentan los que iban en este guardado: otros pueden haber editado mientras tanto.
      for (const autor of autores) estado.autores.delete(autor)
      if (estado.autores.size === 0) estado.ultimoEditor = null

      return 'guardado'
    }

    if (http === 409) return await alConflicto(documento, estado, html)
    if (http === 403 || http === 404) return await alNegarseElGuardado(documento, estado)
    if (esperaTransitoria(http)) return 'reintentar'

    registrar({ evento: 'guardado_rechazado', documento: nombreDe(estado.id), estado: http })

    return 'rechazado'
  }

  async function guardar (documento: Document, estado: EstadoDeDocumento): Promise<ResultadoDeGuardado> {
    const html = yDocATexto(documento)

    if (html === estado.ultimoHtml || estado.ultimoEditor === null) {
      // Se editó y se volvió atrás: nadie cambió nada, nadie figura como autor.
      estado.autores.clear()
      estado.ultimoEditor = null

      return 'sin_cambios'
    }

    return await enviar(documento, estado, html)
  }

  return { cargar, guardar, recargar, sincronizar }
}
