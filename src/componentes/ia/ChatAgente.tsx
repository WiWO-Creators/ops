'use client'

import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Boton } from '@/componentes/formularios/Boton'
import { AreaTexto } from '@/componentes/formularios/Entrada'
import { Cargando } from '@/componentes/estado/Estados'
import { ConfirmacionEnLinea } from '@/componentes/datos/ConfirmacionEnLinea'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { pedirSobre } from '@/datos/cliente'
import { actualizarEjecucion, estaTrabajando, ESTADOS_EJECUCION, leerEjecucion, type Ejecucion } from '@/dominio/ia-ejecucion'
import { leerMensajesGuardados, type Mensaje } from '@/dominio/ia-chat'
import { ASISTENTE } from '@/dominio/glosario'
import { pantallaDeRuta } from '@/dominio/pantalla'
import { BotonDictado } from './BotonDictado'
import { TextoChat } from './TextoChat'
import { PlanEjecucion } from './PlanEjecucion'

interface Props { desplazable?: boolean, proyecto?: { id: number, name: string }, intervalo: number, nuevasHabilitadas: boolean, maximoPregunta: number }

/** Conversación recuperable por usuario y proyecto. Cerrar la vista solo detiene el seguimiento local. */
export function ChatAgente ({ desplazable, proyecto, intervalo, nuevasHabilitadas, maximoPregunta }: Props): ReactElement {
  const [historial, setHistorial] = useState<Ejecucion[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [recuperar, setRecuperar] = useState(0)
  const [confirmandoBorrado, setConfirmandoBorrado] = useState(false)
  const [borrando, setBorrando] = useState(false)
  const [errorBorrado, setErrorBorrado] = useState('')
  const [hayHiloAnterior, setHayHiloAnterior] = useState(false)
  const [versionAnterior, setVersionAnterior] = useState(0)
  const ocupado = useRef(false)
  const solicitudPendiente = useRef<{ accion: string, texto?: string, version?: string, clave: string } | null>(null)
  const montado = useRef(true)
  const desplazador = useRef<HTMLDivElement>(null)
  const ruta = usePathname()
  const router = useRouter()
  const proyectoId = proyecto?.id ?? 0
  const ultima = historial.at(-1)
  const trabajando = ultima !== undefined && estaTrabajando(ultima)
  const editando = ultima?.estado === 'esperando_confirmacion' && ultima.plan != null
  const respondeEjecucion = editando || ultima?.estado === 'esperando_datos'
  const pendiente = ultima !== undefined && (['incompleta', 'error'].includes(ultima.estado) || (ultima.estado === 'esperando_confirmacion' && !editando))

  useEffect(() => {
    montado.current = true
    return () => { montado.current = false }
  }, [])

  /** Recupera el historial del alcance actual. @param senal Permite detener la lectura al desmontar. @returns Historial confirmado. */
  const leerHistorial = useCallback(async (senal: AbortSignal): Promise<Ejecucion[]> => {
    const sobre = await pedirSobre<unknown>(`ia/ejecuciones?proyecto_id=${proyectoId}`, senal)
    if (!Array.isArray(sobre.data)) throw new Error('No se pudo recuperar la conversación.')
    return sobre.data.map(leerEjecucion)
  }, [proyectoId])

  useEffect(() => {
    const abortador = new AbortController()
    void leerHistorial(abortador.signal).then(ejecuciones => { if (!abortador.signal.aborted) { setHistorial(ejecuciones); setError('') } }).catch((fallo: unknown) => {
      if (!abortador.signal.aborted) setError(fallo instanceof Error ? fallo.message : 'No se pudo recuperar la conversación.')
    }).finally(() => { if (!abortador.signal.aborted) setCargando(false) })
    return () => { abortador.abort() }
  }, [leerHistorial, recuperar])

  useEffect(() => {
    if (!ultima || !trabajando || error !== '' || enviando) return
    const abortador = new AbortController()
    const temporizador = setTimeout(() => {
      void pedirSobre<unknown>(`ia/ejecuciones/${ultima.id}?proyecto_id=${proyectoId}`, abortador.signal)
        .then(sobre => {
          const ejecucion = leerEjecucion(sobre.data)
          if (!abortador.signal.aborted) {
            setHistorial(actual => actualizarEjecucion(actual, ejecucion))
            if (ejecucion.estado === 'completada') router.refresh()
          }
        }).catch((fallo: unknown) => {
          if (!abortador.signal.aborted) setError(fallo instanceof Error ? fallo.message : 'Se perdió el seguimiento. Recupera el estado para continuar.')
        })
    }, intervalo)
    return () => { clearTimeout(temporizador); abortador.abort() }
  }, [ultima, trabajando, error, enviando, intervalo, proyectoId, router])

  useEffect(() => {
    const caja = desplazador.current
    if (caja && caja.scrollHeight - caja.scrollTop - caja.clientHeight < 180) caja.scrollTop = caja.scrollHeight
  }, [historial])

  /** Envía una operación una sola vez y recupera su snapshot. @param accion Acción sobre la ejecución o creación. @param respuesta Aclaración escrita. @returns Finalización de la petición. */
  async function operar (accion: 'crear' | 'confirmar' | 'reanudar' | 'cancelar', respuesta?: string): Promise<void> {
    if (ocupado.current || (accion !== 'crear' && !ultima) || (accion === 'confirmar' && texto.trim() !== '')) return
    ocupado.current = true
    setEnviando(true)
    setError('')
    const pantalla = pantallaDeRuta(ruta)
    const previa = solicitudPendiente.current
    const version = editando ? ultima?.plan?.version : undefined
    const clave = previa?.accion === accion && previa.texto === respuesta && previa.version === version ? previa.clave : crypto.randomUUID()
    solicitudPendiente.current = { accion, texto: respuesta, version, clave }
    const cuerpo = accion === 'crear'
      ? { pregunta: respuesta, clave_idempotencia: clave, proyecto_id: proyectoId, ...(proyectoId === 0 && pantalla ? { pantalla } : {}) }
      : { proyecto_id: proyectoId, ...((accion === 'confirmar' || (accion === 'reanudar' && editando && respuesta)) ? { plan_id: ultima?.plan?.id, version: ultima?.plan?.version } : {}), ...(respuesta ? { respuesta, clave_idempotencia: clave } : {}) }
    const endpoint = accion === 'crear' ? 'ia/ejecuciones' : `ia/ejecuciones/${ultima?.id}/${accion}`
    try {
      const resultado = await escribirEnBff<unknown>(endpoint, 'POST', cuerpo)
      if (!resultado.ok) throw new Error(resultado.mensaje)
      const ejecucion = leerEjecucion(resultado.datos)
      solicitudPendiente.current = null
      if (!montado.current) return
      setHistorial(actual => actualizarEjecucion(actual, ejecucion))
      if (respuesta) setTexto('')
      if (ejecucion.estado === 'completada') router.refresh()
    } catch (fallo: unknown) {
      if (montado.current) setError(`${fallo instanceof Error ? fallo.message : 'No se recibió el resultado.'} Recupera el estado antes de repetir la operación.`)
    } finally {
      ocupado.current = false
      if (montado.current) setEnviando(false)
    }
  }

  /**
   * Vacía la conversación entera: las ejecuciones del alcance y el hilo del motor anterior.
   *
   * Pega primero `DELETE ia/ejecuciones` (el servidor responde 409 si hay una en curso) y luego el
   * del hilo anterior; la pantalla solo se vacía si ambos confirman, para no mostrar vacío algo que
   * el asistente aún recuerda. Repetir tras un fallo parcial es seguro: lo ya archivado no vuelve a contar.
   *
   * @returns Finalización del borrado; los errores del servidor quedan en `errorBorrado`.
   */
  async function eliminar (): Promise<void> {
    if (ocupado.current) return
    ocupado.current = true
    setBorrando(true)
    setErrorBorrado('')
    try {
      const ejecuciones = await escribirEnBff<unknown>(`ia/ejecuciones?proyecto_id=${proyectoId}`, 'DELETE')
      if (!ejecuciones.ok) { if (montado.current) setErrorBorrado(ejecuciones.mensaje); return }
      const hilo = await escribirEnBff<unknown>(rutaHiloAnterior(proyectoId), 'DELETE')
      if (!hilo.ok) { if (montado.current) setErrorBorrado(hilo.mensaje); return }
      if (!montado.current) return
      setHistorial([])
      setTexto('')
      setHayHiloAnterior(false)
      setVersionAnterior(n => n + 1)
      setConfirmandoBorrado(false)
      solicitudPendiente.current = null
    } finally {
      ocupado.current = false
      if (montado.current) setBorrando(false)
    }
  }

  if (cargando) return <Cargando mensaje="Recuperando conversación…" />
  const bloqueado = enviando || trabajando || pendiente || error !== '' || (!nuevasHabilitadas && !respondeEjecucion)
  return (
    <div className={desplazable ? 'flex min-h-0 flex-1 flex-col gap-4' : 'flex flex-col gap-4'}>
      {proyecto && <p className="text-texto-sutil text-sm">Esta conversación solo consulta y modifica {proyecto.name}.</p>}
      {(historial.length > 0 || hayHiloAnterior) && (
        <div className="flex flex-col items-end gap-1">
          {confirmandoBorrado
            ? (
              <ConfirmacionEnLinea
                advertencia={`Se elimina la conversación entera, también la que ${ASISTENTE} recuerda.`}
                etiquetaConfirmar="Eliminar"
                cargando={borrando}
                error={errorBorrado}
                onCancelar={() => { setConfirmandoBorrado(false); setErrorBorrado('') }}
                onConfirmar={() => { void eliminar() }}
              />
              )
            : (
              <Boton tamano="chico" variante="sutil" disabled={enviando || trabajando} onClick={() => { setConfirmandoBorrado(true) }}>
                Eliminar chat
              </Boton>
              )}
        </div>
      )}
      <div ref={desplazador} className={desplazable ? 'min-h-0 flex-1 overflow-y-auto pr-1' : ''}>
        <HistorialAnterior key={versionAnterior} proyectoId={proyectoId} alCargar={setHayHiloAnterior} />
        {historial.length === 0 && <p className="text-texto-tenue py-6">Pregunta por Ops o describe una tarea. Revisarás el plan completo antes de aplicar cambios.</p>}
        <ol aria-label="Conversación" className="flex flex-col gap-8">
          {historial.map(e => (
            <li key={e.id} className="flex min-w-0 flex-col gap-3">
              <p className="bg-relleno-neutro text-texto ml-8 self-end rounded-xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap wrap-anywhere">{e.pregunta}</p>
              {e.aclaraciones?.map((aclaracion, i) => <p key={i} className="bg-relleno-neutro text-texto ml-8 self-end rounded-xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap wrap-anywhere">{aclaracion}</p>)}
              <section aria-label={ESTADOS_EJECUCION[e.estado]} className="min-w-0 space-y-4">
                <p role={e.id === ultima?.id ? 'status' : undefined} className="text-texto text-sm font-semibold">{e.progreso || ESTADOS_EJECUCION[e.estado]}</p>
                {e.mensaje && !e.plan && <TextoChat texto={e.mensaje} />}
                {e.plan && <PlanEjecucion plan={e.plan} />}
                {e.plan && e.mensaje && <details className="text-sm">
                  <summary className="text-texto-tenue hover:text-texto cursor-pointer py-2 font-medium">Ver explicación del plan</summary>
                  <TextoChat texto={e.mensaje} className="mt-2" />
                </details>}
                {e.resultado?.resumen && e.resultado.resumen.trim() !== e.mensaje?.trim() && <TextoChat texto={e.resultado.resumen} />}
                {e.error?.mensaje && <TextoChat texto={e.error.mensaje} className="text-texto-peligro" />}
                {e.preguntas?.map((p, indice) => <div key={indice} className="space-y-2"><TextoChat texto={p.pregunta} className="font-medium" />{p.opciones && <ul className="text-texto-tenue list-disc pl-5">{p.opciones.map(o => <li key={o}><TextoChat texto={o} /></li>)}</ul>}</div>)}
                {e.id === ultima?.id && <div className="flex flex-wrap gap-2 [&>button]:min-h-11 [&>button]:whitespace-normal">
                  {e.estado === 'esperando_confirmacion' && e.plan && <Boton variante="primario" disabled={enviando || error !== '' || texto.trim() !== ''} onClick={() => { void operar('confirmar') }}>Confirmar plan completo</Boton>}
                  {(e.estado === 'incompleta' || (e.estado === 'error' && e.error?.reintentable)) && <Boton disabled={enviando || error !== ''} onClick={() => { void operar('reanudar') }}>Continuar ejecución</Boton>}
                  {!['completada', 'cancelada'].includes(e.estado) && <Boton variante="sutil" disabled={enviando || error !== ''} onClick={() => { void operar('cancelar') }}>Cancelar ejecución</Boton>}
                </div>}
              </section>
            </li>
          ))}
        </ol>
      </div>
      {error && <div role="alert" className="text-texto-peligro flex flex-col items-start gap-2"><p>{error}</p><Boton onClick={() => { setRecuperar(n => n + 1) }}>Recuperar estado</Boton></div>}
      {!nuevasHabilitadas && <p className="text-texto-sutil text-sm">Las nuevas solicitudes están pausadas. Puedes continuar las ejecuciones pendientes.</p>}
      <form className="border-linea flex flex-col gap-3 border-t pt-4" onSubmit={e => { e.preventDefault(); if (!bloqueado && texto.trim()) void operar(respondeEjecucion ? 'reanudar' : 'crear', texto.trim()) }}>
        <AreaTexto className="min-h-16 text-base" aria-label="Tu pregunta" value={texto} onChange={e => setTexto(e.target.value)} maxLength={maximoPregunta} disabled={bloqueado} placeholder={editando ? 'Describe los cambios que quieres hacer al plan…' : ultima?.estado === 'esperando_datos' ? 'Completa los datos solicitados…' : 'Pregunta lo que necesites…'} />
        {editando && texto.trim() !== '' && <p role="status" className="text-texto-sutil text-sm">Envía los cambios o borra el texto para confirmar este plan.</p>}
        <div className="flex items-center justify-between gap-3">
          <p className="text-texto-tenue text-xs leading-relaxed">Los cambios se aplican al confirmar.</p>
          <div className="flex items-center gap-2">
            <BotonDictado valor={texto} alEscribir={setTexto} maximo={maximoPregunta} deshabilitado={bloqueado} />
            <Boton type="submit" variante="primario" className="min-h-11" disabled={bloqueado || texto.trim() === ''}>{enviando ? 'Enviando…' : editando ? 'Actualizar plan' : ultima?.estado === 'esperando_datos' ? 'Responder y continuar' : 'Preguntar'}</Boton>
          </div>
        </div>
      </form>
    </div>
  )
}

/** Ruta del hilo del motor anterior. @param proyectoId Proyecto del alcance, 0 para el chat global. @returns Ruta relativa del BFF. */
function rutaHiloAnterior (proyectoId: number): string {
  return proyectoId === 0 ? 'ia/chat' : `ia/proyectos/${proyectoId}/chat`
}

/** Permite consultar el hilo anterior sin ejecutar sus propuestas ni enviar al motor retirado. */
function HistorialAnterior ({ proyectoId, alCargar }: { proyectoId: number, alCargar: (hayMensajes: boolean) => void }): ReactElement {
  const [mensajes, setMensajes] = useState<Mensaje[] | null>(null)
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)
  const peticion = useRef<AbortController | null>(null)
  useEffect(() => () => { peticion.current?.abort() }, [])

  /** Recupera una sola vez el hilo histórico del alcance actual. @returns Finalización de la lectura. */
  async function cargar (): Promise<void> {
    if (peticion.current) return
    const abortador = new AbortController()
    peticion.current = abortador
    setCargando(true)
    setError('')
    try {
      const sobre = await pedirSobre<unknown>(rutaHiloAnterior(proyectoId), abortador.signal)
      if (!abortador.signal.aborted) {
        const guardados = leerMensajesGuardados(sobre.data)
        setMensajes(guardados)
        alCargar(guardados.length > 0)
      }
    } catch (fallo: unknown) {
      if (!abortador.signal.aborted) setError(fallo instanceof Error ? fallo.message : 'No se pudo cargar la conversación anterior.')
    } finally {
      peticion.current = null
      if (!abortador.signal.aborted) setCargando(false)
    }
  }

  return <details className="border-linea mb-4 border-b pb-3" onToggle={e => { if (e.currentTarget.open && mensajes === null && !error) void cargar() }}>
    <summary className="text-texto-tenue cursor-pointer text-sm">Conversación anterior</summary>
    {cargando && <p role="status" className="mt-2 text-sm">Cargando mensajes anteriores…</p>}
    {error && <div role="alert" className="mt-2"><p>{error}</p><Boton onClick={() => { void cargar() }}>Reintentar historial</Boton></div>}
    {mensajes?.length === 0 && <p className="text-texto-sutil mt-2 text-sm">No hay mensajes anteriores.</p>}
    {mensajes && mensajes.length > 0 && <><p className="text-texto-sutil my-2 text-sm">Solo lectura. Para continuar una solicitud, escríbela en esta conversación.</p><ol aria-label="Conversación anterior" className="flex flex-col gap-3">{mensajes.map((m, i) => <li key={i} className="space-y-2"><p className="text-texto-sutil text-sm">{m.rol === 'persona' ? 'Tú' : 'Thinking Orb'}</p><TextoChat texto={m.texto} />{m.acciones.map(a => <TextoChat key={a.id} texto={a.resumen} />)}</li>)}</ol></>}
  </details>
}
