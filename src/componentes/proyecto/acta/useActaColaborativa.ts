'use client'

import { useEffect, useRef, useState } from 'react'
import { HocuspocusProvider } from '@hocuspocus/provider'
import { Doc } from 'yjs'
import { useConfigEnVivo } from '@/componentes/en-vivo/ProveedorEnVivo'
import {
  PLAZO_DE_SINCRONIZACION_MS,
  esperaDeReconexion,
  leerMensajeDelDocumento,
  type EstadoColaborativo,
  type MensajeDelDocumento
} from '@/dominio/acta-colaborativa'
import { ErrorDeBoleto, pedirBoletoDelActa } from './boletoDelActa'

export interface ActaColaborativa {
  /** El proveedor de la sesión vigente; `null` mientras no hay una sincronizada. */
  provider: HocuspocusProvider | null
  /** El documento Yjs de esa sesión; cambia en cada reconexión. */
  ydoc: Doc | null
  estado: EstadoColaborativo
  /** Marca (ms) del último «guardado» que avisó el servicio, o `null` si aún no hubo ninguno. */
  ultimoGuardado: number | null
  /** La revisión (`date_updated`) que dejó el último guardado del servicio. */
  revision: string | null
  /** Cuántas veces el servicio recargó el documento desde el board (un conflicto de versión). */
  recargados: number
}

/** Lo que `abrirSesion` necesita saber de quien la usa. */
interface OpcionesDeSesion {
  url: string
  actaId: number
  espacioId: number
  alSincronizar: () => void
  /** La conexión se cerró (o nunca abrió). */
  alCerrarse: () => void
  /** El servidor o el BFF negaron el boleto; `transitorio` si puede arreglarse con reintentar. */
  alFallarLaAutenticacion: (transitorio: boolean) => void
  alRecibir: (mensaje: MensajeDelDocumento) => void
}

/** Un documento Yjs con su proveedor, y cómo desarmarlos juntos. */
interface SesionAbierta {
  provider: HocuspocusProvider
  ydoc: Doc
  destruir: () => void
}

/**
 * Abre una sesión nueva: un `Doc` vacío y un proveedor que se conecta con un boleto recién pedido.
 *
 * El `Doc` es siempre nuevo. Un cliente que reconecta con su documento viejo después de que el
 * servicio se reinició o descargó el documento le entrega al servidor su historial entero, y el
 * servidor —que cargó el contenido del board desde cero— lo suma al que ya tiene: el acta aparece
 * duplicada. Por eso nunca se reutiliza.
 *
 * @param opciones adónde conectar y a quién avisar
 * @returns el documento, su proveedor y cómo destruirlos
 */
function abrirSesion (opciones: OpcionesDeSesion): SesionAbierta {
  const ydoc = new Doc()
  let transitorio = false
  let destruida = false

  const provider = new HocuspocusProvider({
    url: `${opciones.url}/doc`,
    name: `acta:${opciones.actaId}`,
    document: ydoc,
    token: async () => {
      try {
        return await pedirBoletoDelActa(opciones.actaId, opciones.espacioId)
      } catch (fallo) {
        transitorio = fallo instanceof ErrorDeBoleto && fallo.transitorio
        throw fallo
      }
    },
    onSynced: ({ state }) => { if (state) opciones.alSincronizar() },
    onClose: opciones.alCerrarse,
    onAuthenticationFailed: () => { opciones.alFallarLaAutenticacion(transitorio) },
    onStateless: ({ payload }) => {
      const mensaje = leerMensajeDelDocumento(payload)

      if (mensaje !== null) opciones.alRecibir(mensaje)
    }
  })

  return {
    provider,
    ydoc,
    destruir: () => {
      if (destruida) return

      destruida = true
      provider.destroy()
      ydoc.destroy()
    }
  }
}

/**
 * La sesión de edición conjunta de un Meeting Paper.
 *
 * Conecta al servicio «Ops en vivo» con un boleto que el BFF emite tras comprobar el permiso, y
 * entrega el documento Yjs y el proveedor para el editor. Solo los expone una vez sincronizados: un
 * editor que se monta sobre un documento todavía vacío mezclaría lo que se escribe con lo que llega.
 *
 * - Sin sincronizar en {@link PLAZO_DE_SINCRONIZACION_MS}, o con el boleto negado, el estado pasa a
 *   `sin_conexion`: quien lo use vuelve a la edición de siempre.
 * - Si la conexión se pierde después de haber andado, se destruyen proveedor y documento y se
 *   reconecta con unos nuevos, con espera creciente. Tras varios intentos fallidos pasa a `sin_conexion`.
 * - Si el servicio avisa `sin_acceso` (la persona perdió el permiso) el estado es final: no se reconecta.
 *
 * @param actaId id del Meeting Paper
 * @param espacioId id del Proyecto (Espacio) al que pertenece
 * @param activo `false` mantiene todo apagado; pasar a `true` abre la sesión
 * @returns el documento, el proveedor y el estado de la sesión
 */
export function useActaColaborativa (actaId: number, espacioId: number, activo: boolean): ActaColaborativa {
  const { url } = useConfigEnVivo()
  const [sesion, setSesion] = useState<{ provider: HocuspocusProvider, ydoc: Doc } | null>(null)
  const [estado, setEstado] = useState<EstadoColaborativo>('conectando')
  const [ultimoGuardado, setUltimoGuardado] = useState<number | null>(null)
  const [revision, setRevision] = useState<string | null>(null)
  const [recargados, setRecargados] = useState(0)
  const [intento, setIntento] = useState(0)
  /** Lo que sobrevive de una conexión a la siguiente: si alguna vez sincronizó y cuántos intentos fallaron. */
  const memoria = useRef({ sincronizada: false, fallidos: 0 })

  // Cambiar de acta, de servicio o apagar la edición empieza una sesión desde cero.
  useEffect(() => () => {
    memoria.current = { sincronizada: false, fallidos: 0 }
    setIntento(0)
    setEstado('conectando')
  }, [actaId, espacioId, activo, url])

  useEffect(() => {
    if (!activo || url === '') return

    const recuerdo = memoria.current
    const temporizadores = new Set<number>()
    let abierta: SesionAbierta | null = null
    let vigente = true
    let listo = false

    const programar = (accion: () => void, espera: number): number => {
      const id = window.setTimeout(accion, espera)

      temporizadores.add(id)

      return id
    }

    const desarmar = (): void => {
      vigente = false
      temporizadores.forEach((id) => { window.clearTimeout(id) })
      temporizadores.clear()
      abierta?.destruir()
      setSesion(null)
    }

    const terminar = (final: 'sin_conexion' | 'sin_acceso'): void => {
      if (!vigente) return

      desarmar()
      setEstado(final)
    }

    /** La conexión se perdió: reconectar con una sesión nueva, o rendirse si nunca anduvo o ya se insistió demasiado. */
    const perdida = (): void => {
      if (!vigente) return

      const espera = recuerdo.sincronizada ? esperaDeReconexion(++recuerdo.fallidos) : null

      if (espera === null) {
        terminar('sin_conexion')

        return
      }

      desarmar()
      setEstado('conectando')
      programar(() => { setIntento((anterior) => anterior + 1) }, espera)
    }

    // Los cierres se difieren un turno: destruir el proveedor dentro de su propio callback le
    // deja a medias lo que hacía después de avisar.
    abierta = abrirSesion({
      url,
      actaId,
      espacioId,
      alSincronizar: () => {
        if (!vigente || abierta === null) return

        listo = true
        recuerdo.sincronizada = true
        recuerdo.fallidos = 0
        setSesion({ provider: abierta.provider, ydoc: abierta.ydoc })
        setEstado('listo')
      },
      alCerrarse: () => { programar(perdida, 0) },
      alFallarLaAutenticacion: (transitorio) => {
        programar(transitorio ? perdida : () => { terminar('sin_conexion') }, 0)
      },
      alRecibir: (mensaje) => {
        if (!vigente) return

        if (mensaje.t === 'guardado') {
          setUltimoGuardado(Date.now())
          setRevision(mensaje.revision)
        } else if (mensaje.t === 'recargado') {
          setRecargados((anterior) => anterior + 1)
        } else {
          programar(() => { terminar('sin_acceso') }, 0)
        }
      }
    })

    programar(() => { if (!listo) perdida() }, PLAZO_DE_SINCRONIZACION_MS)

    return () => {
      if (!vigente) {
        temporizadores.forEach((id) => { window.clearTimeout(id) })

        return
      }

      desarmar()
    }
  }, [actaId, espacioId, activo, url, intento])

  return {
    provider: sesion?.provider ?? null,
    ydoc: sesion?.ydoc ?? null,
    estado,
    ultimoGuardado,
    revision,
    recargados
  }
}
