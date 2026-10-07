'use client'

import { useEffect, useState, type ReactElement } from 'react'
import { escribirEnBff, leerDelBff } from '@/componentes/datos/mutaciones'
import { AvisoEnLinea, Cargando } from '@/componentes/estado/Estados'
import { useAviso } from '@/componentes/estado/useAviso'
import { Boton } from '@/componentes/formularios/Boton'
import { Campo } from '@/componentes/formularios/Campo'
import { AreaTexto, Entrada } from '@/componentes/formularios/Entrada'
import { Interruptor } from '@/componentes/formularios/Interruptor'
import { Fecha } from '@/componentes/presentadores/Fecha'
import {
  DOMINIOS_MCP, EVENTOS_MCP, alternarEnLista, leerSistemaMcp, motivoDeClaveInvalida, motivoDeTtlInvalido
} from '@/dominio/mcp-externo'
import type { SistemaMcp } from '@/datos/accesos'

/**
 * La configuración de un sistema MCP: sus claves públicas, qué herramientas puede usar, qué eventos
 * recibe y cuánto duran sus propuestas.
 *
 * Los interruptores se guardan al pulsarlos (como en Interruptores de Accesos); las claves y la
 * duración, con su botón. Del PEM no se guarda copia en el navegador y la API no lo devuelve: de cada
 * clave solo se ve su `kid` y desde cuándo rige.
 */
export function ConfiguracionMcp ({ integracionId }: { integracionId: number }): ReactElement {
  const [sistema, setSistema] = useState<SistemaMcp | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let vigente = true

    void leerDelBff<unknown>(`accesos/integraciones/${integracionId}/mcp`).then((resultado) => {
      if (!vigente) return

      const leido = resultado.ok ? leerSistemaMcp(resultado.datos) : null

      if (leido !== null) setSistema(leido)
      else setError(resultado.ok ? 'La respuesta de la API no tiene la forma esperada.' : resultado.mensaje)
    })

    return () => { vigente = false }
  }, [integracionId])

  if (error !== null) return <AvisoEnLinea variante="error" mensaje={error} />
  if (sistema === null) return <Cargando />

  return (
    <div className="border-linea flex flex-col gap-5 border-t pt-4">
      <p className="text-texto-tenue text-sm">
        Identificador: <code className="text-texto font-mono">{sistema.system}</code>. Toda escritura de este sistema queda como propuesta que la persona aprueba en Ops.
      </p>
      <Alternables
        titulo="Qué puede usar"
        catalogo={DOMINIOS_MCP.map((d) => ({ clave: d.clave, nombre: d.nombre, descripcion: d.descripcion }))}
        encendidos={sistema.domains}
        campo="dominios"
        integracionId={integracionId}
        onGuardado={setSistema}
      />
      <Alternables
        titulo="De qué se le avisa"
        catalogo={EVENTOS_MCP.map((e) => ({ clave: e.clave, nombre: e.nombre, descripcion: e.clave }))}
        encendidos={sistema.events}
        campo="eventos"
        integracionId={integracionId}
        onGuardado={setSistema}
      />
      <DuracionDePropuestas sistema={sistema} onGuardado={setSistema} />
      <ClavesPublicas sistema={sistema} onGuardado={setSistema} />
    </div>
  )
}

/** Una lista de interruptores que guarda cada cambio al pulsarlo. */
function Alternables ({ titulo, catalogo, encendidos, campo, integracionId, onGuardado }: {
  titulo: string
  catalogo: Array<{ clave: string, nombre: string, descripcion: string }>
  encendidos: string[]
  campo: 'dominios' | 'eventos'
  integracionId: number
  onGuardado: (sistema: SistemaMcp) => void
}): ReactElement {
  const aviso = useAviso()
  const [trabajando, setTrabajando] = useState<string | null>(null)

  async function alternar (clave: string): Promise<void> {
    setTrabajando(clave)

    const nuevos = alternarEnLista(encendidos, clave, catalogo)
    const resultado = await escribirEnBff<unknown>(`accesos/integraciones/${integracionId}/mcp`, 'PUT', { [campo]: nuevos })

    setTrabajando(null)

    const guardado = resultado.ok ? leerSistemaMcp(resultado.datos) : null

    if (guardado === null) {
      aviso.error(resultado.ok ? 'No se pudo leer lo guardado.' : resultado.mensaje)

      return
    }

    onGuardado(guardado)
  }

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-texto mb-1 text-sm font-medium">{titulo}</legend>
      {catalogo.map((item) => (
        <div key={item.clave} className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-col">
            <span className="text-texto text-sm">{item.nombre}</span>
            <span className="text-texto-tenue text-xs">{item.descripcion}</span>
          </div>
          <Interruptor
            encendido={encendidos.includes(item.clave)}
            etiqueta={item.nombre}
            deshabilitado={trabajando !== null}
            onPulsar={() => { void alternar(item.clave) }}
          />
        </div>
      ))}
    </fieldset>
  )
}

function DuracionDePropuestas ({ sistema, onGuardado }: { sistema: SistemaMcp, onGuardado: (s: SistemaMcp) => void }): ReactElement {
  const aviso = useAviso()
  const [horas, setHoras] = useState(String(sistema.proposal_ttl_hours))
  const [enviando, setEnviando] = useState(false)
  const motivo = motivoDeTtlInvalido(Number(horas))

  async function guardar (): Promise<void> {
    if (motivo !== null || enviando) return

    setEnviando(true)

    const resultado = await escribirEnBff<unknown>(`accesos/integraciones/${sistema.id}/mcp`, 'PUT', { ttl_propuesta_horas: Number(horas) })

    setEnviando(false)

    const guardado = resultado.ok ? leerSistemaMcp(resultado.datos) : null

    if (guardado === null) {
      aviso.error(resultado.ok ? 'No se pudo leer lo guardado.' : resultado.mensaje)

      return
    }

    onGuardado(guardado)
    aviso.exito('Duración guardada.')
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <Campo etiqueta="Cuánto dura una propuesta (horas)" error={motivo ?? undefined}
        ayuda="Pasado ese plazo sin respuesta, la propuesta vence.">
        {(props) => <Entrada {...props} inputMode="numeric" className="w-28" value={horas} onChange={(e) => { setHoras(e.target.value) }} />}
      </Campo>
      <Boton variante="secundario" tamano="chico" cargando={enviando} disabled={enviando || motivo !== null || Number(horas) === sistema.proposal_ttl_hours} onClick={() => { void guardar() }}>
        Guardar
      </Boton>
    </div>
  )
}

/**
 * Las claves públicas con las que Ops verifica las aserciones del sistema.
 *
 * `PUT claves` reemplaza la lista entera, y el PEM no vuelve nunca en el `GET`. Por eso lo que ya
 * estaba se reenvía **sin `pem`** —solo `kid`, `desde` y `hasta`—: la API entiende «este `kid` ya
 * existe, conserva su clave» (ver el contrato). Rotar es registrar la nueva y retirar la vieja, que
 * deja de servir en el instante de su `hasta`.
 */
function ClavesPublicas ({ sistema, onGuardado }: { sistema: SistemaMcp, onGuardado: (s: SistemaMcp) => void }): ReactElement {
  const aviso = useAviso()
  const [kid, setKid] = useState('')
  const [pem, setPem] = useState('')
  const [error, setError] = useState<string | undefined>()
  const [enviando, setEnviando] = useState(false)

  async function agregar (): Promise<void> {
    const motivo = motivoDeClaveInvalida(kid, pem)

    setError(motivo ?? undefined)
    if (motivo !== null || enviando) return

    setEnviando(true)

    const guardado = await guardarClaves([...clavesQueSeConservan(sistema), { kid: kid.trim(), pem: pem.trim() }], (m) => { setError(m) })

    setEnviando(false)
    if (guardado === null) return

    onGuardado(guardado)
    setKid('')
    setPem('')
    aviso.exito('Clave registrada.')
  }

  /** Retira una clave: queda con `hasta` ahora y deja de verificar aserciones. */
  async function retirar (kidARetirar: string): Promise<void> {
    const ahora = new Date().toISOString()
    const claves = clavesQueSeConservan(sistema).map((c) => c.kid === kidARetirar ? { ...c, hasta: ahora } : c)
    const guardado = await guardarClaves(claves, (m) => { aviso.error(m) })

    if (guardado === null) return

    onGuardado(guardado)
    aviso.exito('Clave retirada.')
  }

  async function guardarClaves (claves: unknown[], alFallar: (mensaje: string) => void): Promise<SistemaMcp | null> {
    const resultado = await escribirEnBff<unknown>(`accesos/integraciones/${sistema.id}/mcp`, 'PUT', { claves })
    const guardado = resultado.ok ? leerSistemaMcp(resultado.datos) : null

    if (guardado === null) alFallar(resultado.ok ? 'No se pudo leer lo guardado.' : resultado.mensaje)

    return guardado
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-texto text-sm font-medium">Claves públicas</p>

      {sistema.keys.length === 0
        ? <p className="text-texto-tenue text-sm">Sin claves: el sistema no puede identificar a nadie todavía.</p>
        : (
          <ul className="flex flex-col gap-1">
            {sistema.keys.map((clave) => (
              <li key={clave.kid} className="text-texto-tenue text-sm">
                <code className="text-texto font-mono">{clave.kid}</code>
                {' · desde '}<Fecha valor={clave.since} />
                {clave.until !== null && <> {' · hasta '}<Fecha valor={clave.until} /></>}
                {clave.until === null && (
                  <Boton variante="sutil" tamano="chico" className="ml-2" onClick={() => { void retirar(clave.kid) }}>Retirar</Boton>
                )}
              </li>
            ))}
          </ul>
          )}

      <Campo etiqueta="Identificador de la clave (kid)">
        {(props) => <Entrada {...props} value={kid} maxLength={64} onChange={(e) => { setKid(e.target.value) }} />}
      </Campo>
      <Campo etiqueta="Clave pública (PEM, curva P-256)" error={error}
        ayuda="Pega solo la clave pública. La privada se queda en el otro sistema, que es quien firma.">
        {(props) => (
          <AreaTexto {...props} rows={5} value={pem} onChange={(e) => { setPem(e.target.value) }} className="font-mono text-xs" />
        )}
      </Campo>
      <div>
        <Boton variante="secundario" tamano="chico" cargando={enviando} disabled={enviando} onClick={() => { void agregar() }}>
          Registrar clave
        </Boton>
      </div>
    </div>
  )
}

/** Las claves que ya estaban, sin PEM: la API conserva la clave registrada bajo ese `kid`. */
function clavesQueSeConservan (sistema: SistemaMcp): Array<{ kid: string, desde: string | null, hasta: string | null }> {
  return sistema.keys.map((c) => ({ kid: c.kid, desde: c.since, hasta: c.until }))
}
