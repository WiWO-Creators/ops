'use client'

import { useEffect, useMemo, useState, type ReactElement } from 'react'
import { Boton } from '@/componentes/formularios/Boton'
import { Interruptor } from '@/componentes/formularios/Interruptor'
import { SelectorPersonas } from '@/componentes/formularios/SelectorPersonas'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { Cargando, ErrorEstado } from '@/componentes/estado/Estados'
import { cargarAsignables } from '@/datos/asignables'
import type { AvisosDeTicket } from '@/datos/recursos'
import type { StaffReferencia } from '@/datos/tipos'
import {
  avisosCambiaron,
  borradorDeAvisos,
  cuerpoDeAvisos,
  problemaDeAvisos,
  type BorradorDeAvisos
} from '@/dominio/avisos-de-ticket'
import { GLOSARIO } from '@/dominio/glosario'
import { useRecurso } from './carga'

/**
 * A quien se avisa cuando entra un ticket nuevo a este Proyecto (contrato T3).
 *
 * Encendido, avisa a todo el equipo del Proyecto, que es como siempre funciono. Apagado, avisa solo a
 * las personas elegidas. Se guarda con un boton y no al tocar: apagar el interruptor sin haber
 * elegido a nadie es un estado intermedio que la API rechaza, y guardarlo al toque obligaria a
 * mostrar un error por un paso que la persona todavia no termino.
 */
export function AvisosDeTicketNuevo ({ proyectoId }: { proyectoId: number }): ReactElement {
  const ruta = `projects/${encodeURIComponent(String(proyectoId))}/ticket-notifications`
  const { estado, recargar } = useRecurso<AvisosDeTicket>(ruta, 'No se pudo leer a quién se avisa.')

  return (
    <section className="rounded-tarjeta border-linea bg-superficie-elevada shadow-1 border p-5">
      <h2 className="font-titular text-texto border-linea-suave mb-4 border-b pb-2 text-sm font-semibold">
        Avisos de {GLOSARIO.ticket.plural.toLowerCase()} nuevos
      </h2>

      {estado.fase === 'cargando' && <Cargando alto="min-h-20" mensaje="Cargando los avisos…" />}
      {estado.fase === 'error' && <ErrorEstado detalle={estado.mensaje} onReintentar={recargar} />}
      {estado.fase === 'listo' && (
        <FormularioDeAvisos key={JSON.stringify(estado.datos)} ruta={ruta} guardado={estado.datos} />
      )}
    </section>
  )
}

function FormularioDeAvisos ({ ruta, guardado: inicial }: { ruta: string, guardado: AvisosDeTicket }): ReactElement {
  const [guardado, setGuardado] = useState(inicial)
  const [borrador, setBorrador] = useState<BorradorDeAvisos>(() => borradorDeAvisos(inicial))
  const [equipo, setEquipo] = useState<StaffReferencia[] | null>(null)
  const [falloEquipo, setFalloEquipo] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [fallo, setFallo] = useState<string | null>(null)
  const [listo, setListo] = useState(false)

  useEffect(() => {
    let vigente = true

    cargarAsignables()
      .then((personas) => { if (vigente) setEquipo(personas) })
      .catch((error: unknown) => {
        if (vigente) setFalloEquipo(error instanceof Error ? error.message : 'No se pudo cargar el equipo.')
      })

    return () => { vigente = false }
  }, [])

  // Quien ya estaba elegido y hoy no figura entre los activos igual se muestra, para poder sacarlo:
  // si no, quedaria guardado sin que nadie lo vea. La API manda solo activos al enviar el correo.
  const personas = useMemo((): StaffReferencia[] => {
    const activos = equipo ?? []
    const faltantes = guardado.personas
      .filter((p) => !activos.some((a) => a.id === p.id))
      .map((p) => ({ id: p.id, full_name: p.nombre, profile_image_url: null }))

    return [...activos, ...faltantes]
  }, [equipo, guardado.personas])

  const problema = problemaDeAvisos(borrador, guardado.correos)
  const cambio = avisosCambiaron(borrador, guardado)

  /** Guarda el borrador. Nunca lanza: el 422 de la API se lee debajo del formulario. */
  async function guardar (): Promise<void> {
    setGuardando(true)
    setFallo(null)
    setListo(false)

    const resultado = await escribirEnBff<AvisosDeTicket>(ruta, 'PUT', cuerpoDeAvisos(borrador, guardado.correos))

    setGuardando(false)

    if (!resultado.ok) {
      setFallo(resultado.mensaje)
      return
    }

    setGuardado(resultado.datos)
    setBorrador(borradorDeAvisos(resultado.datos))
    setListo(true)
  }

  const espacio = GLOSARIO.espacio.singular.toLowerCase()

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <Interruptor
          encendido={borrador.avisoAlEquipo}
          etiqueta={`Avisar a todo el equipo del ${espacio}`}
          deshabilitado={guardando}
          onPulsar={() => {
            setListo(false)
            setBorrador((b) => ({ ...b, avisoAlEquipo: !b.avisoAlEquipo }))
          }}
        />
        <div className="flex flex-col gap-0.5">
          <span className="text-texto text-sm font-medium">Avisar a todo el equipo del {espacio}</span>
          <span className="text-texto-tenue text-sm text-pretty">
            {borrador.avisoAlEquipo
              ? `Cada ${GLOSARIO.ticket.singular.toLowerCase()} nuevo le llega a todas las personas del ${espacio}.`
              : 'Solo les llega a las personas que elijas abajo.'}
          </span>
        </div>
      </div>

      {!borrador.avisoAlEquipo && (
        <div className="flex max-w-md flex-col gap-2">
          <label htmlFor="avisos-personas" className="text-texto-tenue text-sm font-semibold">
            Personas que reciben el aviso
          </label>
          {equipo === null && falloEquipo === null && <Cargando alto="min-h-10" mensaje="Cargando el equipo…" />}
          {falloEquipo !== null && <p role="alert" className="text-texto-peligro text-sm">{falloEquipo}</p>}
          {equipo !== null && (
            <SelectorPersonas
              id="avisos-personas"
              personas={personas}
              elegidas={borrador.personas}
              onCambiar={(ids) => {
                setListo(false)
                setBorrador((b) => ({ ...b, personas: ids }))
              }}
            />
          )}
        </div>
      )}

      {cambio && problema !== null && <p className="text-texto-aviso text-sm">{problema}</p>}
      {fallo !== null && <p role="alert" className="text-texto-peligro text-sm">{fallo}</p>}
      {listo && !cambio && <p role="status" className="text-texto-exito text-sm">Avisos guardados.</p>}

      <div className="flex justify-end">
        <Boton
          variante="primario"
          cargando={guardando}
          disabled={!cambio || problema !== null}
          onClick={() => { void guardar() }}
        >
          Guardar avisos
        </Boton>
      </div>
    </div>
  )
}
