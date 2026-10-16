import { getSchema } from '@tiptap/core'
import { generateJSON } from '@tiptap/html'
import { prosemirrorJSONToYXmlFragment } from '@tiptap/y-tiptap'
import type { Document } from '@hocuspocus/server'
import type { Doc } from 'yjs'

import { extensionesDeActa } from '../../../src/lib/en-vivo/extensiones-acta.ts'
import { CAMPO, fusionarConLoAjeno, htmlAYDoc, yDocAHtml, type ResultadoDeFusion } from '../bloques-acta.ts'
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
 * Adaptador del Meeting Paper (`acta:{id}`) entre el documento Yjs y el board.
 *
 * El board guarda HTML; Yjs guarda un árbol. Se convierte en los dos sentidos con el esquema de
 * `extensionesDeActa()`, el mismo del editor del navegador. El campo Yjs es `default`, el que
 * usa la extensión de colaboración de TipTap.
 *
 * La revisión (`date_updated` del GET y del PUT) es un texto opaco que el board arma como
 * `<ISO>~<huella>`: el servicio solo la guarda, la compara por igualdad y la devuelve tal cual; no la
 * interpreta como fecha.
 */

/** Motivos de recarga en los que lo escrito sin guardar se combina con lo del board en vez de descartarse. */
const MOTIVOS_QUE_FUSIONAN = new Set(['conflicto', 'externo'])

/** Cuántas veces seguidas se vuelve a guardar tras fusionar un 409, antes de dejarlo al reintento normal. */
const MAXIMO_DE_FUSIONES_SEGUIDAS = 3

/** Etiqueta con la que el board rotula en el historial lo guardado desde la edición conjunta. */
const ORIGEN_COLABORATIVO = 'colaborativo'

interface ActaDelBoard {
  content: string
  revision: string
  espacioId: number
}

function leerActa (datos: unknown): ActaDelBoard | null {
  const cuerpo = desenvolver(datos)

  if (cuerpo === null) return null

  const { content, date_updated: revision, espacio_id: espacioId } = cuerpo

  if (typeof content !== 'string') return null
  if (typeof revision !== 'string' && typeof revision !== 'number') return null
  if (typeof espacioId !== 'number' || !Number.isSafeInteger(espacioId)) return null

  return { content, revision: String(revision), espacioId }
}

function leerRevision (datos: unknown): string | null {
  const cuerpo = desenvolver(datos)
  const revision = cuerpo?.date_updated

  return typeof revision === 'string' || typeof revision === 'number' ? String(revision) : null
}

export { htmlAYDoc, yDocAHtml }

/** Pide el acta al board; `sin_acceso` si ya no existe o la edición conjunta está apagada. */
async function pedirActa (board: ClienteBoard, id: number): Promise<ActaDelBoard> {
  const { estado, datos } = await board('GET', `en-vivo/actas/${id}`)

  if (estado === 403 || estado === 404) throw new ErrorDeAdaptador('sin_acceso')

  const acta = estado === 200 ? leerActa(datos) : null

  if (acta === null) throw new ErrorDeAdaptador(estado === 200 ? 'respuesta_invalida' : 'board_no_disponible')

  return acta
}

/**
 * Crea el adaptador de actas.
 *
 * @param board el cliente firmado del board
 * @returns las cuatro operaciones del adaptador
 */
export function crearAdaptadorDeActa (board: ClienteBoard): AdaptadorDeDocumento {
  async function cargar (id: number): Promise<{ ydoc: Doc, estado: EstadoDeDocumento }> {
    const acta = await pedirActa(board, id)
    const ydoc = htmlAYDoc(acta.content)

    return {
      ydoc,
      estado: {
        id,
        espacioId: acta.espacioId,
        revision: acta.revision,
        // Lo que el board tendría si se guardara hoy mismo este documento: comparar contra el HTML
        // crudo del board daría un guardado falso por cada diferencia de formato.
        ultimoHtml: yDocAHtml(ydoc),
        autores: new Set(),
        ultimoEditor: null,
        vetados: new Set(),
        origen: ORIGEN_COLABORATIVO,
        pendiente: false,
        reintentos: 0,
        temporizadorDeReintento: null
      }
    }
  }

  async function recargar (documento: Document, estado: EstadoDeDocumento, motivo: string): Promise<ResultadoDeSincronia> {
    let acta: ActaDelBoard

    try {
      acta = await pedirActa(board, estado.id)
    } catch (error) {
      return error instanceof ErrorDeAdaptador && error.motivo === 'sin_acceso' ? 'sin_acceso' : 'error'
    }

    const hayTextoSinGuardar = yDocAHtml(documento) !== estado.ultimoHtml

    if (MOTIVOS_QUE_FUSIONAN.has(motivo) && hayTextoSinGuardar) {
      fusionarConElBoard(documento, estado, acta)
    } else {
      reemplazarPorElBoard(documento, estado, acta, motivo)
    }

    return 'recargado'
  }

  /** Sustituye todo el documento por el acta del board; lo escrito aquí y sin guardar se descarta. */
  function reemplazarPorElBoard (documento: Document, estado: EstadoDeDocumento, acta: ActaDelBoard, motivo: string): void {
    const json = generateJSON(acta.content, extensionesDeActa())
    const fragmento = documento.getXmlFragment(CAMPO)

    // `skipStoreHooks`: lo que se acaba de leer del board ya está en el board; guardarlo de vuelta
    // sería un PUT sin sentido.
    documento.transact(() => {
      fragmento.delete(0, fragmento.length)
      prosemirrorJSONToYXmlFragment(getSchema(extensionesDeActa()), json, fragmento)
    }, { source: 'local', skipStoreHooks: true })

    estado.revision = acta.revision
    estado.ultimoHtml = yDocAHtml(documento)
    estado.autores.clear()
    estado.ultimoEditor = null
    estado.origen = ORIGEN_COLABORATIVO
    documento.broadcastStateless(JSON.stringify({ t: 'recargado', motivo }))
  }

  /**
   * Combina el cambio del board con el texto que aún no se guardó (3 bandas), sin descartar nada.
   *
   * Base es lo último que el servicio guardó; lo ajeno, el acta nueva del board; lo local, el documento
   * vivo. Si el documento no se puede emparejar con sus bloques, se conserva lo local entero y se avisa
   * (`conservado`): el siguiente guardado, con la revisión nueva, lo escribe encima del board. Autores y
   * origen no se tocan: lo escrito sigue pendiente y se guarda a continuación.
   */
  function fusionarConElBoard (documento: Document, estado: EstadoDeDocumento, acta: ActaDelBoard): void {
    const ajeno = yDocAHtml(htmlAYDoc(acta.content))
    let resultado: ResultadoDeFusion

    try {
      resultado = fusionarConLoAjeno(documento, estado.ultimoHtml, ajeno)
    } catch {
      resultado = 'no_mapeable'
    }

    estado.revision = acta.revision
    estado.ultimoHtml = ajeno
    registrar({ evento: 'acta_fusionada', documento: `acta:${estado.id}`, resultado })

    if (resultado === 'sin_cambios') return

    documento.broadcastStateless(JSON.stringify({ t: 'recargado', motivo: resultado === 'fusionado' ? 'fusionado' : 'conservado' }))
  }

  async function sincronizar (documento: Document, estado: EstadoDeDocumento): Promise<ResultadoDeSincronia> {
    const { estado: http, datos } = await board('GET', `en-vivo/actas/${estado.id}`)

    if (http === 403 || http === 404) return 'sin_acceso'
    if (http !== 200) return 'error'

    const revision = leerRevision(datos)

    if (revision === null) return 'error'
    if (revision === estado.revision) return 'sin_cambios'

    return await recargar(documento, estado, 'externo')
  }

  /**
   * El board negó guardar como el último editor (403/404): se lo descarta y se reintenta con otra persona
   * que haya escrito; si no queda ninguna, se recarga lo del board. Solo si el propio acta ya no está
   * disponible (la lectura da 403/404) el resultado es `sin_acceso` y se cierra para todos.
   */
  async function alNegarseElGuardado (documento: Document, estado: EstadoDeDocumento): Promise<ResultadoDeGuardado> {
    if (descartarEditorSinPermiso(documento, estado, `acta:${estado.id}`)) return await guardar(documento, estado)

    const recarga = await recargar(documento, estado, 'sin_permiso')

    return recarga === 'recargado' ? 'recargado' : recarga === 'sin_acceso' ? 'sin_acceso' : 'reintentar'
  }

  /**
   * @param fusiones cuántas veces seguidas se fusionó un 409 en este guardado (lo pone esta misma función)
   */
  async function guardar (documento: Document, estado: EstadoDeDocumento, fusiones = 0): Promise<ResultadoDeGuardado> {
    const html = yDocAHtml(documento)

    if (html === estado.ultimoHtml || estado.ultimoEditor === null) {
      // Se editó y se volvió atrás: nadie cambió nada, nadie figura como autor.
      estado.autores.clear()
      estado.ultimoEditor = null
      estado.origen = ORIGEN_COLABORATIVO

      return 'sin_cambios'
    }

    const autores = [...estado.autores]
    const { estado: http, datos } = await board('PUT', `en-vivo/actas/${estado.id}`, {
      espacio_id: estado.espacioId,
      staff_id: estado.ultimoEditor,
      autores,
      content: html,
      revision: estado.revision,
      origen: estado.origen
    })

    if (http === 200) {
      const revision = leerRevision(datos)

      if (revision === null) {
        registrar({ evento: 'guardado_sin_revision', documento: `acta:${estado.id}` })

        return 'rechazado'
      }

      estado.revision = revision
      estado.ultimoHtml = html
      // Solo se descuentan los que iban en este guardado: otros pueden haber editado mientras tanto.
      for (const autor of autores) estado.autores.delete(autor)
      if (estado.autores.size === 0) estado.ultimoEditor = null
      estado.origen = ORIGEN_COLABORATIVO

      return 'guardado'
    }

    if (http === 409) {
      const recarga = await recargar(documento, estado, 'conflicto')

      if (recarga === 'sin_acceso') return 'sin_acceso'
      if (recarga !== 'recargado' || fusiones >= MAXIMO_DE_FUSIONES_SEGUIDAS) return 'reintentar'

      // Con lo del board ya combinado y la revisión nueva, lo escrito aquí se guarda a continuación; si no
      // quedó nada pendiente (se reemplazó todo por el board) el segundo intento es `sin_cambios`.
      const siguiente = await guardar(documento, estado, fusiones + 1)

      return siguiente === 'sin_cambios' ? 'recargado' : siguiente
    }

    if (http === 403 || http === 404) return await alNegarseElGuardado(documento, estado)
    if (esperaTransitoria(http)) return 'reintentar'

    registrar({ evento: 'guardado_rechazado', documento: `acta:${estado.id}`, estado: http })

    return 'rechazado'
  }

  return { cargar, guardar, recargar, sincronizar }
}
