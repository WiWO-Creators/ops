'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { useConectadoEnVivo, useEnVivo } from '@/componentes/en-vivo/useEnVivo'
import { pedirSobre } from '@/datos/cliente'
import {
  actualizarEjecucion,
  esperaDeSeguimiento,
  esperaReintentoSeguimiento,
  estaEditando,
  estaTrabajando,
  firmaDeEjecucion,
  leerEjecucion,
  mismaInstantanea,
  REINTENTOS_SEGUIMIENTO,
  type Ejecucion
} from '@/dominio/ia-ejecucion'
import { avisarEscrituraDeOrbe, pudoEscribir } from '@/dominio/orbe-escritura'
import type { ConfiguracionConAgente } from '@/dominio/orbe-sujeto'

/** Operaciones sobre la conversación del agente. */
export type AccionAgente = 'crear' | 'confirmar' | 'reanudar' | 'cancelar'

/** Cómo terminó un borrado: la conversación entera, solo las ejecuciones, o nada. */
export type ResultadoBorrado = 'completo' | 'parcial' | 'fallido'

/** El borrado y, si no salió entero, qué decir. */
export interface RespuestaBorrado {
  resultado: ResultadoBorrado
  mensaje: string
}

/** Dónde está parada la persona al crear una ejecución. Ambos campos son pistas para el servidor. */
export interface ContextoCreacion {
  /** Ruta saneada, o `null` para no mandarla. */
  pantalla: string | null
  /** Meeting Paper abierto, o `null` para no mandarlo. */
  actaId: number | null
}

interface OpcionesEjecuciones {
  configuracion: ConfiguracionConAgente
  /** Proyecto del alcance; `undefined` es el chat global. */
  proyectoId?: number
  /** Intervalo base del seguimiento, en ms. */
  intervalo: number
  /** Segundos sin avances tras los cuales una ejecución en trabajo «parece detenida». */
  umbralDetenidaSegundos: number
  /** Contexto que viaja al crear una ejecución. Se lee en el momento de enviar, no al montar. */
  contexto: ContextoCreacion
  /** El servidor rechazó el acta como contexto (422): quien llama debe quitarla para reintentar. */
  alActaRechazada: () => void
  /** Lo que el compositor debe vaciar cuando una operación con texto sale bien o se borra todo. */
  alLimpiarTexto: () => void
}

/** Lo que expone el hook a la vista. */
export interface EjecucionesAgente {
  historial: Ejecucion[]
  ultima: Ejecucion | undefined
  cargando: boolean
  error: string
  enviando: boolean
  borrando: boolean
  errorBorrado: string
  /** La última ejecución trabaja pero no avanza desde hace más que el umbral. */
  detenida: boolean
  /** Vuelve a leer el historial (tras un error de seguimiento). */
  recuperar: () => void
  operar: (accion: AccionAgente, respuesta?: string) => Promise<void>
  eliminar: () => Promise<RespuestaBorrado>
  limpiarErrorBorrado: () => void
}

/** Mensaje cuando el seguimiento se pierde sin que el servidor diga por qué. */
const MENSAJE_SEGUIMIENTO = 'Se perdió el seguimiento. Reintenta para continuar.'

/** Indica si la pestaña está a la vista. @returns `false` solo con la pestaña oculta. */
function pestanaVisible (): boolean {
  return typeof document === 'undefined' || document.visibilityState !== 'hidden'
}

/**
 * Historial de ejecuciones del agente en un alcance: carga, seguimiento, operaciones y borrado.
 *
 * El seguimiento no repinta si el snapshot no cambió, crece de `intervalo` a 5 s mientras la
 * ejecución trabaja sin novedades, se pausa con la pestaña oculta y reintenta con espera creciente
 * antes de mostrar un error. Con el bus de «Ops en vivo» conectado, un aviso `ejecucion` de la que
 * se sigue dispara la consulta al instante y el sondeo baja a respaldo cada 15 s. Las operaciones
 * viajan con clave de idempotencia estable: repetir la misma no duplica el efecto.
 *
 * @param opciones Alcance, intervalos y callback para vaciar el compositor.
 * @returns Estado y acciones para la vista.
 */
export function useEjecucionesAgente ({ configuracion, proyectoId, intervalo, umbralDetenidaSegundos, contexto, alActaRechazada, alLimpiarTexto }: OpcionesEjecuciones): EjecucionesAgente {
  const { agente, rutaHilo } = configuracion
  const [historial, setHistorial] = useState<Ejecucion[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [borrando, setBorrando] = useState(false)
  const [errorBorrado, setErrorBorrado] = useState('')
  const [lectura, setLectura] = useState(0)
  const [visible, setVisible] = useState(pestanaVisible)
  const [firmaDetenida, setFirmaDetenida] = useState<string | null>(null)
  const ocupado = useRef(false)
  const solicitudPendiente = useRef<{ accion: string, texto?: string, version?: string, clave: string } | null>(null)
  const montado = useRef(true)
  const ultimaRef = useRef<Ejecucion | undefined>(undefined)
  const volviendo = useRef(false)
  const conectado = useConectadoEnVivo()
  const conectadoRef = useRef(conectado)
  const consultarYa = useRef<(() => void) | null>(null)
  const contextoRef = useRef(contexto)
  const router = useRouter()

  const ultima = historial.at(-1)
  const ultimaId = ultima?.id
  const trabajando = ultima !== undefined && estaTrabajando(ultima)
  const editando = estaEditando(ultima)
  const firma = ultima === undefined ? '' : firmaDeEjecucion(ultima)

  /**
   * Lo que sigue a una ejecución completada: refresca lo del servidor de Next y, si el plan pudo
   * escribir, avisa a la ventana para que las pantallas con carga propia (el acta abierta) revaliden.
   */
  const alCompletarse = useCallback((ejecucion: Ejecucion): void => {
    router.refresh()
    if (pudoEscribir(ejecucion)) avisarEscrituraDeOrbe(contextoRef.current.actaId)
  }, [router])

  useEffect(() => {
    ultimaRef.current = ultima
  }, [ultima])

  useEffect(() => {
    contextoRef.current = contexto
  }, [contexto])

  useEffect(() => {
    conectadoRef.current = conectado
  }, [conectado])

  useEffect(() => {
    montado.current = true
    return () => { montado.current = false }
  }, [])

  useEffect(() => {
    const alCambiarVisibilidad = (): void => {
      const ahora = pestanaVisible()
      if (ahora) {
        volviendo.current = true
        setFirmaDetenida(null)
      }
      setVisible(ahora)
    }
    document.addEventListener('visibilitychange', alCambiarVisibilidad)
    return () => { document.removeEventListener('visibilitychange', alCambiarVisibilidad) }
  }, [])

  // Lectura inicial del historial del alcance.
  useEffect(() => {
    const abortador = new AbortController()
    void (async () => {
      try {
        const sobre = await pedirSobre<unknown>(agente.rutaEjecuciones(proyectoId), abortador.signal)
        if (!Array.isArray(sobre.data)) throw new Error('No se pudo recuperar la conversación.')
        if (abortador.signal.aborted) return
        setHistorial(sobre.data.map(leerEjecucion))
        setError('')
      } catch (fallo: unknown) {
        if (!abortador.signal.aborted) setError(fallo instanceof Error ? fallo.message : 'No se pudo recuperar la conversación.')
      } finally {
        if (!abortador.signal.aborted) setCargando(false)
      }
    })()
    return () => { abortador.abort() }
  }, [agente, proyectoId, lectura])

  // Seguimiento de la ejecución en trabajo. Un solo bucle por ejecución: no se reinicia cuando llega
  // un snapshot nuevo, así el intervalo puede crecer mientras no haya novedades.
  useEffect(() => {
    if (ultimaId === undefined || !trabajando || error !== '' || enviando || !visible) return
    const abortador = new AbortController()
    let temporizador: ReturnType<typeof setTimeout> | undefined
    let sinCambios = 0
    let fallos = 0
    let consultando = false
    let avisoPendiente = false

    // Si llega un aviso durante una consulta, la siguiente va de inmediato en vez de esperar.
    const programar = (espera: number): void => {
      temporizador = setTimeout(() => { void consultar() }, avisoPendiente ? 0 : espera)
    }

    const consultar = async (): Promise<void> => {
      consultando = true
      avisoPendiente = false
      try {
        const sobre = await pedirSobre<unknown>(agente.rutaEjecucion(ultimaId, proyectoId), abortador.signal)
        const ejecucion = leerEjecucion(sobre.data)
        if (abortador.signal.aborted) return
        fallos = 0
        if (mismaInstantanea(ultimaRef.current, ejecucion)) {
          sinCambios += 1
        } else {
          sinCambios = 0
          ultimaRef.current = ejecucion
          setHistorial(actual => actualizarEjecucion(actual, ejecucion))
          if (ejecucion.estado === 'completada') alCompletarse(ejecucion)
        }
        if (estaTrabajando(ejecucion)) programar(esperaDeSeguimiento(intervalo, sinCambios, conectadoRef.current))
      } catch (fallo: unknown) {
        if (abortador.signal.aborted) return
        fallos += 1
        if (fallos > REINTENTOS_SEGUIMIENTO) setError(fallo instanceof Error ? fallo.message : MENSAJE_SEGUIMIENTO)
        else programar(esperaReintentoSeguimiento(fallos))
      } finally {
        consultando = false
      }
    }

    consultarYa.current = () => {
      if (consultando) {
        avisoPendiente = true
        return
      }
      clearTimeout(temporizador)
      void consultar()
    }

    programar(volviendo.current ? 0 : intervalo)
    volviendo.current = false
    return () => {
      consultarYa.current = null
      clearTimeout(temporizador)
      abortador.abort()
    }
  }, [agente, ultimaId, trabajando, error, enviando, visible, intervalo, proyectoId, alCompletarse])

  // El bus avisa de cada cambio de una ejecución del dueño: se consulta la que se sigue sin esperar el sondeo.
  useEnVivo(['ejecucion'], (cambio) => {
    // El id de la ejecución es entero en el bus y texto en la lectura.
    if (cambio.id !== null && String(cambio.id) === ultimaId) consultarYa.current?.()
  })

  // «Parece detenida»: si la huella del snapshot no cambia en el umbral. Volver a la pestaña
  // reinicia la cuenta: lo que pasó con la pestaña oculta no se sondeó.
  useEffect(() => {
    if (!trabajando || !visible) return
    const temporizador = setTimeout(() => { setFirmaDetenida(firma) }, umbralDetenidaSegundos * 1000)
    return () => { clearTimeout(temporizador) }
  }, [trabajando, visible, firma, umbralDetenidaSegundos])

  const detenida = trabajando && error === '' && firmaDetenida === firma

  /**
   * Envía una operación una sola vez y recupera su snapshot.
   *
   * @param accion Acción sobre la ejecución o creación.
   * @param respuesta Aclaración escrita.
   * @returns Finalización de la petición; los fallos quedan en `error`.
   */
  const operar = async (accion: AccionAgente, respuesta?: string): Promise<void> => {
    if (ocupado.current || (accion !== 'crear' && !ultima)) return
    ocupado.current = true
    setEnviando(true)
    setError('')
    const { pantalla, actaId } = contextoRef.current
    const previa = solicitudPendiente.current
    const version = editando ? ultima?.plan?.version : undefined
    const clave = previa?.accion === accion && previa.texto === respuesta && previa.version === version ? previa.clave : crypto.randomUUID()
    solicitudPendiente.current = { accion, texto: respuesta, version, clave }
    const proyectoIdApi = agente.proyectoIdApi(proyectoId)
    const cuerpo = accion === 'crear'
      ? { pregunta: respuesta, clave_idempotencia: clave, proyecto_id: proyectoIdApi, ...(pantalla ? { pantalla } : {}), ...(actaId !== null ? { acta_id: actaId } : {}) }
      : { proyecto_id: proyectoIdApi, ...((accion === 'confirmar' || (accion === 'reanudar' && editando && respuesta)) ? { plan_id: ultima?.plan?.id, version: ultima?.plan?.version } : {}), clave_idempotencia: clave, ...(respuesta ? { respuesta } : {}) }
    const endpoint = accion === 'crear' || ultima === undefined ? agente.rutaCrear : agente.rutaOperacion(ultima.id, accion)
    try {
      const resultado = await escribirEnBff<unknown>(endpoint, 'POST', cuerpo)
      if (!resultado.ok) {
        // Un acta que el servidor no acepta (422) no se reintenta tal cual: se quita del contexto y
        // la próxima vez viaja con otra clave, porque el cuerpo ya es otro.
        if (accion === 'crear' && actaId !== null && resultado.codigo === 'validation_failed') {
          solicitudPendiente.current = null
          alActaRechazada()
        }
        throw new Error(resultado.mensaje)
      }
      const ejecucion = leerEjecucion(resultado.datos)
      solicitudPendiente.current = null
      if (!montado.current) return
      setHistorial(actual => actualizarEjecucion(actual, ejecucion))
      if (respuesta) alLimpiarTexto()
      if (ejecucion.estado === 'completada') alCompletarse(ejecucion)
    } catch (fallo: unknown) {
      if (montado.current) setError(`${fallo instanceof Error ? fallo.message : 'No se recibió el resultado.'} Reintenta antes de repetir la operación.`)
    } finally {
      ocupado.current = false
      if (montado.current) setEnviando(false)
    }
  }

  /**
   * Vacía la conversación entera: las ejecuciones del alcance y el hilo del motor anterior.
   *
   * Pega primero `DELETE ia/ejecuciones` (el servidor responde 409 si hay una en curso o esperando
   * datos/confirmación) y luego el del hilo anterior. Si las ejecuciones se borraron, la pantalla se
   * vacía aunque el hilo falle: el error solo habla del hilo y repetir es seguro, lo ya archivado no
   * vuelve a contar.
   *
   * @returns `completo`, `parcial` (ejecuciones borradas, hilo no) o `fallido`, con el mensaje a mostrar; también queda en `errorBorrado`.
   */
  const eliminar = async (): Promise<RespuestaBorrado> => {
    if (ocupado.current) return { resultado: 'fallido', mensaje: 'Hay otra operación en curso. Espera un momento.' }
    ocupado.current = true
    setBorrando(true)
    setErrorBorrado('')
    try {
      const ejecuciones = await escribirEnBff<unknown>(agente.rutaEjecuciones(proyectoId), 'DELETE')
      if (!ejecuciones.ok) { if (montado.current) setErrorBorrado(ejecuciones.mensaje); return { resultado: 'fallido', mensaje: ejecuciones.mensaje } }
      const hilo = await escribirEnBff<unknown>(rutaHilo(proyectoId), 'DELETE')
      if (!montado.current) return { resultado: 'completo', mensaje: '' }
      setHistorial([])
      alLimpiarTexto()
      solicitudPendiente.current = null
      if (!hilo.ok) {
        const mensaje = `No se pudo borrar la conversación anterior: ${hilo.mensaje}`
        setErrorBorrado(mensaje)
        return { resultado: 'parcial', mensaje }
      }
      return { resultado: 'completo', mensaje: '' }
    } finally {
      ocupado.current = false
      if (montado.current) setBorrando(false)
    }
  }

  const recuperar = useCallback((): void => { setLectura(n => n + 1) }, [])
  const limpiarErrorBorrado = useCallback((): void => { setErrorBorrado('') }, [])

  return { historial, ultima, cargando, error, enviando, borrando, errorBorrado, detenida, recuperar, operar, eliminar, limpiarErrorBorrado }
}

