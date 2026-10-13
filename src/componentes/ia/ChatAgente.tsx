'use client'

import { useEffect, useRef, useState, type ReactElement } from 'react'
import { Boton } from '@/componentes/formularios/Boton'
import { Cargando, Vacio } from '@/componentes/estado/Estados'
import { CargandoConOrbe } from '@/componentes/estado/Orbe'
import { ConfirmacionEnLinea } from '@/componentes/datos/ConfirmacionEnLinea'
import { pedirSobre } from '@/datos/cliente'
import {
  esDescartable,
  estaBloqueado,
  estaEditando,
  estaTrabajando,
  ESTADOS_EJECUCION,
  faseDeEjecucion,
  motivoBloqueo,
  respondeEjecucion
} from '@/dominio/ia-ejecucion'
import { ambitoDeOrbe, usePublicarFaseOrbe, type FaseConversacion } from '@/dominio/fase-orbe'
import { leerMensajesGuardados, type Mensaje } from '@/dominio/ia-chat'
import { ASISTENTE } from '@/dominio/glosario'
import type { CapacidadesAgente } from '@/dominio/orbe-capacidades'
import type { ConfiguracionConAgente } from '@/dominio/orbe-sujeto'
import { BurbujaPersona } from './BurbujaPersona'
import { TarjetaIA } from './BurbujaIA'
import { CompositorChat } from './CompositorChat'
import { MarcoConversacion } from './MarcoConversacion'
import { PlanEjecucion } from './PlanEjecucion'
import { TextoChat } from './TextoChat'
import { useAutoScroll } from './useAutoScroll'
import { useEjecucionesAgente } from './useEjecucionesAgente'

/** La espera de una decisión sigue pendiente aunque se cierre el chat: se conserva en el store de fases hasta que caduca (el umbral de «detenida») o se revalida. */
const FASES_QUE_SOBREVIVEN: readonly FaseConversacion[] = ['esperando']

interface Props {
  desplazable?: boolean
  proyecto?: { id: number, name: string }
  configuracion: ConfiguracionConAgente
  capacidades: CapacidadesAgente
}

/** Conversación recuperable por usuario y proyecto. Cerrar la vista solo detiene el seguimiento local. */
export function ChatAgente ({ desplazable = false, proyecto, configuracion, capacidades }: Props): ReactElement {
  const proyectoId = proyecto?.id
  const { textos: textosOrbe, agente: { textos } } = configuracion
  const { nuevas_habilitadas: nuevasHabilitadas, maximo_pregunta: maximoPregunta } = capacidades
  const [texto, setTexto] = useState('')
  const [confirmandoBorrado, setConfirmandoBorrado] = useState(false)
  const [hayHiloAnterior, setHayHiloAnterior] = useState(false)
  const [versionAnterior, setVersionAnterior] = useState(0)
  const {
    historial, ultima, cargando, error, enviando, borrando, errorBorrado, detenida,
    recuperar, operar, eliminar, limpiarErrorBorrado
  } = useEjecucionesAgente({
    configuracion,
    proyectoId,
    intervalo: capacidades.intervalo_consulta_ms,
    umbralDetenidaSegundos: capacidades.umbral_detenida_segundos,
    alLimpiarTexto: () => { setTexto('') }
  })
  const { ref: desplazador, forzarFondo } = useAutoScroll(historial, { activo: desplazable, listo: !cargando })
  usePublicarFaseOrbe(ambitoDeOrbe(configuracion.sujeto, proyectoId), faseDeEjecucion(ultima, { enviando, conError: error !== '' }), FASES_QUE_SOBREVIVEN, capacidades.umbral_detenida_segundos * 1000)

  const trabajando = ultima !== undefined && estaTrabajando(ultima)
  const editando = estaEditando(ultima)
  const descartable = esDescartable(ultima)
  const sinBorrado = ultima?.estado === 'esperando_datos' || ultima?.estado === 'esperando_confirmacion'
  const entorno = { enviando, conError: error !== '', nuevasHabilitadas }
  const bloqueado = estaBloqueado(ultima, entorno)
  const placeholder = motivoBloqueo(ultima, entorno)
    ?? (editando ? textos.placeholderEditando : ultima?.estado === 'esperando_datos' ? textos.placeholderDatos : textos.placeholderBase)

  /** Envía lo escrito como pregunta nueva o como respuesta a la ejecución abierta, si el compositor lo permite. */
  function enviar (): void {
    if (bloqueado || texto.trim() === '') return
    forzarFondo()
    void operar(respondeEjecucion(ultima) ? 'reanudar' : 'crear', texto.trim())
  }

  /** Confirma el plan completo; con texto escrito no se confirma, se actualiza el plan. */
  function confirmar (): void {
    if (texto.trim() === '') void operar('confirmar')
  }

  /** Borra la conversación entera y deja la vista como recién abierta si todo salió bien. */
  async function borrarTodo (): Promise<void> {
    const resultado = await eliminar()
    if (resultado !== 'completo') return
    setHayHiloAnterior(false)
    setVersionAnterior(n => n + 1)
    setConfirmandoBorrado(false)
  }

  if (cargando) return <Cargando mensaje="Recuperando conversación…" />
  return (
    <MarcoConversacion
      desplazable={desplazable}
      desplazadorRef={desplazador}
      encabezado={proyecto && <p className="text-texto-sutil text-sm">{textos.alcanceProyecto(proyecto.name)}</p>}
      barra={(historial.length > 0 || hayHiloAnterior || confirmandoBorrado) && (
        <div className="flex flex-col items-end gap-1">
          {confirmandoBorrado
            ? (
              <ConfirmacionEnLinea
                advertencia={`Se elimina la conversación entera, también la que ${ASISTENTE} recuerda.`}
                etiquetaConfirmar="Eliminar"
                cargando={borrando}
                error={errorBorrado}
                onCancelar={() => { setConfirmandoBorrado(false); limpiarErrorBorrado() }}
                onConfirmar={() => { void borrarTodo() }}
              />
              )
            : (
              <>
                <Boton tamano="chico" variante="sutil" disabled={enviando || trabajando || sinBorrado} title={sinBorrado ? textos.sinBorrado : undefined} onClick={() => { setConfirmandoBorrado(true) }}>
                  Eliminar chat
                </Boton>
                {sinBorrado && <p className="text-texto-tenue text-xs">{textos.sinBorrado}</p>}
              </>
              )}
        </div>
      )}
      antesDeLista={<HistorialAnterior key={versionAnterior} rutaHilo={configuracion.rutaHilo(proyectoId)} alCargar={setHayHiloAnterior} />}
      vacio={historial.length === 0 && (
        <Vacio
          titulo={`Pregúntale a ${ASISTENTE}`}
          descripcion={`${textosOrbe.descripcion(proyecto?.name)} ${textos.vacioAdicional}`}
          accion={
            <div className="flex flex-wrap justify-center gap-2">
              {textosOrbe.sugerencias.map(sugerencia => <Boton key={sugerencia} tamano="chico" disabled={bloqueado} onClick={() => { setTexto(sugerencia) }}>{sugerencia}</Boton>)}
            </div>
          }
        />
      )}
      avisos={(
        <>
          {error && <div role="alert" className="text-texto-peligro flex flex-col items-start gap-2"><p>{error}</p><Boton aria-label="Reintentar recuperar la conversación" onClick={recuperar}>Reintentar</Boton></div>}
          {!nuevasHabilitadas && <p className="text-texto-sutil text-sm">{textos.pausadas}</p>}
        </>
      )}
      pie={(
        <CompositorChat
          className="border-linea gap-3 border-t pt-4"
          claseCampo="min-h-16 text-base"
          claseEnviar="min-h-11"
          valor={texto}
          onCambio={setTexto}
          onEnviar={enviar}
          maximo={maximoPregunta}
          deshabilitado={bloqueado}
          placeholder={placeholder}
          pie={textos.pie}
          etiquetaEnviar={enviando ? 'Enviando…' : editando ? 'Actualizar plan' : ultima?.estado === 'esperando_datos' ? 'Responder y continuar' : 'Preguntar'}
          dictadoConRespaldo={configuracion.dictadoConRespaldo}
          aviso={editando && texto.trim() !== '' && <p role="status" className="text-texto-sutil text-sm">Envía los cambios o borra el texto para confirmar este plan.</p>}
        />
      )}
    >
      <ol aria-label="Conversación" className="flex flex-col gap-8">
        {historial.map(e => (
          <li key={e.id} className="flex min-w-0 flex-col gap-3">
            <BurbujaPersona texto={e.pregunta} className="self-end" />
            {e.aclaraciones?.map((aclaracion, i) => <BurbujaPersona key={i} texto={aclaracion} className="self-end" />)}
            <TarjetaIA como="section" aria-label={ESTADOS_EJECUCION[e.estado]} className="min-w-0 space-y-4 p-4">
              {e.id === ultima?.id && trabajando
                ? <CargandoConOrbe mensaje={e.progreso || ESTADOS_EJECUCION[e.estado]} retardoMs={0} />
                : <p role={e.id === ultima?.id ? 'status' : undefined} className="text-texto text-sm font-semibold">{e.progreso || ESTADOS_EJECUCION[e.estado]}</p>}
              {e.id === ultima?.id && detenida && <p role="status" className="text-texto-peligro text-sm">{textos.detenida(Math.max(1, Math.floor(capacidades.umbral_detenida_segundos / 60)))}</p>}
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
                {e.estado === 'esperando_confirmacion' && e.plan && <Boton variante="primario" disabled={enviando || error !== '' || texto.trim() !== ''} onClick={confirmar}>Confirmar plan completo</Boton>}
                {(e.estado === 'incompleta' || (e.estado === 'error' && e.error?.reintentable)) && <Boton disabled={enviando || error !== ''} aria-label="Seguir con la ejecución" onClick={() => { void operar('reanudar') }}>Seguir</Boton>}
                {/* Detener y Descartar no dependen del error de seguimiento: es justo cuando se necesitan. */}
                {descartable
                  ? <Boton variante={e.estado === 'error' ? 'primario' : 'sutil'} disabled={enviando} onClick={() => { void operar('cancelar') }}>Descartar y preguntar</Boton>
                  : !['completada', 'cancelada'].includes(e.estado) && <Boton variante="sutil" disabled={enviando} aria-label="Detener la ejecución" onClick={() => { void operar('cancelar') }}>Detener</Boton>}
              </div>}
              {e.id === ultima?.id && descartable && <p role="status" className="text-texto-sutil text-sm">{e.estado === 'error' ? 'Esta ejecución falló y no se puede reintentar. Mientras siga abierta no puedes hacer otra pregunta: descártala para empezar de nuevo.' : 'Esta ejecución quedó a medias y bloquea las preguntas nuevas. Puedes seguirla o descartarla para preguntar otra cosa.'}</p>}
            </TarjetaIA>
          </li>
        ))}
      </ol>
    </MarcoConversacion>
  )
}

/** Permite consultar el hilo anterior sin ejecutar sus propuestas ni enviar al motor retirado. */
function HistorialAnterior ({ rutaHilo, alCargar }: { rutaHilo: string, alCargar: (hayMensajes: boolean) => void }): ReactElement {
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
      const sobre = await pedirSobre<unknown>(rutaHilo, abortador.signal)
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
    {mensajes && mensajes.length > 0 && <><p className="text-texto-sutil my-2 text-sm">Solo lectura. Para continuar una solicitud, escríbela en esta conversación.</p><ol aria-label="Conversación anterior" className="flex flex-col gap-3">{mensajes.map((m, i) => <li key={i} className="space-y-2"><p className="text-texto-sutil text-sm">{m.rol === 'persona' ? 'Tú' : ASISTENTE}</p><TextoChat texto={m.texto} />{m.acciones.map(a => <TextoChat key={a.id} texto={a.resumen} />)}</li>)}</ol></>}
  </details>
}
