'use client'

import { useId, useState, type CSSProperties, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import { mensajeDeRespuesta } from '@/datos/cliente'
import type { Horario as Datos, TextosHorario } from './tipos'

type Cambio = Partial<Pick<Datos, 'activo' | 'hora' | 'omitir'>>

const DIA = new Intl.DateTimeFormat('es-CL', { weekday: 'short', day: '2-digit', month: '2-digit' })

/** `YYYY-MM-DD` como fecha local: `new Date(texto)` la leeria en UTC y correria el dia. */
function fechaLocal (texto: string): Date {
  const [anio = 0, mes = 1, dia = 1] = texto.split('-').map(Number)
  return new Date(anio, mes - 1, dia)
}

function hoy (): string {
  const d = new Date()
  return [d.getFullYear(), d.getMonth() + 1, d.getDate()].map(n => String(n).padStart(2, '0')).join('-')
}

function finDeSemana (fecha: string): boolean {
  const dia = fechaLocal(fecha).getDay()
  return dia === 0 || dia === 6
}

/** `YYYY-MM-DD HH:MM` como "jue., 01-10 · 09:00". */
function legible (instante: string): string {
  const [fecha = '', hora = ''] = instante.split(' ')
  return `${DIA.format(fechaLocal(fecha))} · ${hora}`
}

function estadoDe (datos: Datos): string {
  if (!datos.activo) return 'Apagado'
  return datos.proximo === null ? 'Sin próxima' : `Próxima · ${legible(datos.proximo)}`
}

export function Horario ({ datos, escritura, textos, indice }: {
  datos: Datos
  escritura: string
  textos: TextosHorario
  indice: number
}) {
  const router = useRouter()
  const id = useId()
  const [hora, setHora] = useState(datos.hora)
  const [fecha, setFecha] = useState('')
  const [enVuelo, setEnVuelo] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * Manda un cambio parcial y relee del servidor.
   *
   * @returns `true` si el servidor lo acepto
   */
  async function enviar (cambio: Cambio): Promise<boolean> {
    setEnVuelo(true)
    setError(null)

    try {
      const respuesta = await fetch(escritura, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(cambio)
      })

      if (!respuesta.ok) {
        setError(await mensajeDeRespuesta(respuesta))
        return false
      }

      router.refresh()
      return true
    } catch {
      setError('Se perdió la conexión con el servidor. No cambió nada.')
      return false
    } finally {
      setEnVuelo(false)
    }
  }

  function guardarHora (evento: FormEvent) {
    evento.preventDefault()
    void enviar({ hora })
  }

  async function omitir (evento: FormEvent) {
    evento.preventDefault()

    if (finDeSemana(fecha)) {
      setError('Ese día cae en fin de semana: ya no corre.')
      return
    }

    if (await enviar({ omitir: [...datos.omitir, fecha] })) setFecha('')
  }

  return (
    <section className="pn__bloque pn__ancho" style={{ '--i': indice } as CSSProperties}>
      <p className="pn__rotulo">{textos.rotulo}</p>

      <button
        type="button"
        className="pn__int"
        disabled={enVuelo}
        aria-pressed={datos.activo}
        onClick={() => { void enviar({ activo: !datos.activo }) }}
      >
        <span>
          <span className="pn__int-nombre">{textos.interruptor}</span>
          <span className="pn__int-grupo">{estadoDe(datos)}</span>
        </span>
        <span className={datos.activo ? 'pn__llave pn__llave--on' : 'pn__llave'} aria-hidden="true" />
      </button>

      <div className="pn__horario">
        <form className="pn__form" onSubmit={guardarHora}>
          <label className="pn__clave" htmlFor={`${id}-hora`}>Hora</label>
          <div className="pn__linea">
            <input
              id={`${id}-hora`}
              type="time"
              className="pn__campo"
              value={hora}
              max={datos.hora_corte}
              required
              onChange={(e) => { setHora(e.target.value) }}
            />
            <button type="submit" className="pn__boton" disabled={enVuelo || hora === '' || hora === datos.hora}>
              Guardar
            </button>
          </div>
          <p className="pn__ayuda">Antes de las {datos.hora_corte}</p>
        </form>

        <form className="pn__form" onSubmit={(e) => { void omitir(e) }}>
          <label className="pn__clave" htmlFor={`${id}-fecha`}>Omitir un día</label>
          <div className="pn__linea">
            <input
              id={`${id}-fecha`}
              type="date"
              className="pn__campo"
              value={fecha}
              min={hoy()}
              required
              suppressHydrationWarning
              onChange={(e) => { setFecha(e.target.value) }}
            />
            <button type="submit" className="pn__boton" disabled={enVuelo || fecha === ''}>Omitir</button>
          </div>

          {datos.omitir.length === 0
            ? <p className="pn__ayuda">Ningún día omitido</p>
            : (
              <ul className="pn__chips">
                {datos.omitir.map(dia => (
                  <li key={dia} className="pn__chip">
                    <span>{DIA.format(fechaLocal(dia))}</span>
                    <button
                      type="button"
                      className="pn__chip-quitar"
                      disabled={enVuelo}
                      aria-label={`Quitar ${DIA.format(fechaLocal(dia))}`}
                      onClick={() => { void enviar({ omitir: datos.omitir.filter(f => f !== dia) }) }}
                    >
                      <X size={12} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
              )}
        </form>
      </div>

      {error !== null && <p className="pn__error" role="alert">{error}</p>}

      <p className="pn__aviso">{textos.nota}</p>
    </section>
  )
}
