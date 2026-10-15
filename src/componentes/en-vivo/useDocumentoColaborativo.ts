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
import { ErrorDeBoleto } from './boletoDeDocumento'

export interface DocumentoColaborativo {
  /** El proveedor de la sesión vigente; `null` mientras no hay una sincronizada. */
  provider: HocuspocusProvider | null
  /** El documento Yjs de esa sesión; cambia en cada reconexión. */
  ydoc: Doc | null
  estado: EstadoColaborativo
  /** Marca (ms) del último «guardado» que avisó el servicio, o `null` si aún no hubo ninguno. */
  ultimoGuardado: number | null
  /** La revisión que dejó el último guardado del servicio (`null` si aún no hubo, o si el texto quedó vacío). */
  revision: string | null
  /** Cuántas veces el servicio recargó el documento desde el board (un conflicto o un cambio externo). */
  recargados: number
}

export interface OpcionesDeDocumento {
  /** Nombre del documento en el servicio (`acta:12`, `tarea:500`, `ticket-borrador:40`). */
  nombre: string
  /**
   * Cómo conseguir un boleto nuevo. Se pide en cada conexión; puede cambiar entre renders sin reiniciar
   * la sesión (lo que reinicia es `identidad`).
   *
   * @throws ErrorDeBoleto si no se pudo
   */
  pedirBoleto: () => Promise<string>
  /** `false` mantiene todo apagado; pasar a `true` abre la sesión. */
  activo: boolean
  /**
   * Identifica a qué se conecta la sesión además del nombre (por ejemplo el Espacio del acta): si cambia
   * se empieza una sesión desde cero.
   */
  identidad: string
}

/** Cuánto se espera, al cerrar, a que lo último que se escribió llegue al servicio. */
const TOPE_DE_ENVIO_AL_CERRAR_MS = 3000

/** Cada cuánto se mira, al cerrar, si ya llegó todo al servicio. */
const SONDEO_DE_ENVIO_AL_CERRAR_MS = 100

/** Lo que `abrirSesion` necesita saber de quien la usa. */
interface OpcionesDeSesion {
  url: string
  nombre: string
  pedirBoleto: () => Promise<string>
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
  /**
   * Desarma la sesión. Con `esperarEnvio` y cambios sin enviar, deja el proveedor vivo hasta que lleguen
   * (o venza un tope) antes de destruirlo: cerrar el editor con una tecla todavía en el buffer del
   * socket la perdería.
   */
  destruir: (esperarEnvio?: boolean) => void
}

/**
 * Abre una sesión nueva: un `Doc` vacío y un proveedor que se conecta con un boleto recién pedido.
 *
 * El `Doc` es siempre nuevo. Un cliente que reconecta con su documento viejo después de que el
 * servicio se reinició o descargó el documento le entrega al servidor su historial entero, y el
 * servidor —que cargó el contenido del board desde cero— lo suma al que ya tiene: el texto aparece
 * duplicado. Por eso nunca se reutiliza.
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
    name: opciones.nombre,
    document: ydoc,
    token: async () => {
      try {
        return await opciones.pedirBoleto()
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

  const cerrar = (): void => {
    provider.destroy()
    ydoc.destroy()
  }

  return {
    provider,
    ydoc,
    destruir: (esperarEnvio = false) => {
      if (destruida) return

      destruida = true

      if (!esperarEnvio || !provider.hasUnsyncedChanges) {
        cerrar()

        return
      }

      const limite = Date.now() + TOPE_DE_ENVIO_AL_CERRAR_MS
      const vigilante = window.setInterval(() => {
        if (provider.hasUnsyncedChanges && Date.now() < limite) return

        window.clearInterval(vigilante)
        cerrar()
      }, SONDEO_DE_ENVIO_AL_CERRAR_MS)
    }
  }
}

/**
 * La sesión de edición conjunta de un documento (Meeting Paper, descripción de tarea, borrador de
 * respuesta de ticket).
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
 * - Al desmontar con cambios todavía sin enviar, espera a que lleguen (hasta un tope) antes de cerrar.
 *
 * @param opciones qué documento abrir y cómo conseguir el boleto
 * @returns el documento, el proveedor y el estado de la sesión
 */
export function useDocumentoColaborativo ({ nombre, pedirBoleto, activo, identidad }: OpcionesDeDocumento): DocumentoColaborativo {
  const { url } = useConfigEnVivo()
  const [sesion, setSesion] = useState<{ provider: HocuspocusProvider, ydoc: Doc } | null>(null)
  const [estado, setEstado] = useState<EstadoColaborativo>('conectando')
  const [ultimoGuardado, setUltimoGuardado] = useState<number | null>(null)
  const [revision, setRevision] = useState<string | null>(null)
  const [recargados, setRecargados] = useState(0)
  const [intento, setIntento] = useState(0)
  /** Lo que sobrevive de una conexión a la siguiente: si alguna vez sincronizó y cuántos intentos fallaron. */
  const memoria = useRef({ sincronizada: false, fallidos: 0 })
  const boletoRef = useRef(pedirBoleto)

  useEffect(() => { boletoRef.current = pedirBoleto })

  // Cambiar de documento, de servicio o apagar la edición empieza una sesión desde cero.
  useEffect(() => () => {
    memoria.current = { sincronizada: false, fallidos: 0 }
    setIntento(0)
    setEstado('conectando')
  }, [nombre, identidad, activo, url])

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

    const desarmar = (esperarEnvio = false): void => {
      vigente = false
      temporizadores.forEach((id) => { window.clearTimeout(id) })
      temporizadores.clear()
      abierta?.destruir(esperarEnvio)
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
      nombre,
      pedirBoleto: async () => await boletoRef.current(),
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

      desarmar(true)
    }
  }, [nombre, identidad, activo, url, intento])

  return {
    provider: sesion?.provider ?? null,
    ydoc: sesion?.ydoc ?? null,
    estado,
    ultimoGuardado,
    revision,
    recargados
  }
}
