import { getSchema } from '@tiptap/core'
import { generateHTML, generateJSON } from '@tiptap/html'
import {
  prosemirrorJSONToYDoc,
  prosemirrorJSONToYXmlFragment,
  yDocToProsemirrorJSON
} from '@tiptap/y-tiptap'
import type { Document } from '@hocuspocus/server'
import type { Doc } from 'yjs'

import { extensionesDeActa } from '../../../src/lib/en-vivo/extensiones-acta.ts'
import type { ClienteBoard } from '../cliente-board.ts'
import { registrar } from '../registro.ts'
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
 */

/** Nombre del fragmento Yjs donde vive el texto. */
const CAMPO = 'default'

/** Etiqueta con la que el board rotula en el historial lo guardado desde la edición conjunta. */
const ORIGEN_COLABORATIVO = 'colaborativo'

interface ActaDelBoard {
  content: string
  revision: string
  espacioId: number
}

type Objeto = Record<string, unknown>

function esObjeto (valor: unknown): valor is Objeto {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor)
}

/** Abre el sobre `{data: …}` del contrato de la API, si lo trae. */
function desenvolver (datos: unknown): Objeto | null {
  if (!esObjeto(datos)) return null

  return esObjeto(datos.data) ? datos.data : datos
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

function esperaTransitoria (estado: number): boolean {
  return estado >= 500 || estado === 429 || estado === 408
}

/**
 * Convierte el HTML del board en un documento Yjs con el esquema del acta.
 *
 * @param html el contenido del acta tal como lo guarda el board
 * @returns un `Y.Doc` con el texto en el fragmento `default`
 */
export function htmlAYDoc (html: string): Doc {
  return prosemirrorJSONToYDoc(getSchema(extensionesDeActa()), generateJSON(html, extensionesDeActa()), CAMPO)
}

/**
 * Convierte un documento Yjs del acta en el HTML que se guarda en el board.
 *
 * @param documento el documento colaborativo
 * @returns el HTML según el esquema del acta
 */
export function yDocAHtml (documento: Doc): string {
  return generateHTML(yDocToProsemirrorJSON(documento, CAMPO), extensionesDeActa())
}

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
    documento.broadcastStateless(JSON.stringify({ t: 'recargado', motivo }))

    return 'recargado'
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

  async function guardar (documento: Document, estado: EstadoDeDocumento): Promise<ResultadoDeGuardado> {
    const html = yDocAHtml(documento)

    if (html === estado.ultimoHtml || estado.ultimoEditor === null) {
      // Se editó y se volvió atrás: nadie cambió nada, nadie figura como autor.
      estado.autores.clear()
      estado.ultimoEditor = null

      return 'sin_cambios'
    }

    const autores = [...estado.autores]
    const { estado: http, datos } = await board('PUT', `en-vivo/actas/${estado.id}`, {
      espacio_id: estado.espacioId,
      staff_id: estado.ultimoEditor,
      autores,
      content: html,
      revision: estado.revision,
      origen: ORIGEN_COLABORATIVO
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

      return 'guardado'
    }

    if (http === 409) {
      const recarga = await recargar(documento, estado, 'conflicto')

      return recarga === 'recargado' ? 'recargado' : recarga === 'sin_acceso' ? 'sin_acceso' : 'reintentar'
    }

    if (http === 403 || http === 404) return 'sin_acceso'
    if (esperaTransitoria(http)) return 'reintentar'

    registrar({ evento: 'guardado_rechazado', documento: `acta:${estado.id}`, estado: http })

    return 'rechazado'
  }

  return { cargar, guardar, recargar, sincronizar }
}
