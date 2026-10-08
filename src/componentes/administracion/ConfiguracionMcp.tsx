'use client'

import { useEffect, useState, type ReactElement } from 'react'
import { leerDelBff } from '@/componentes/datos/mutaciones'
import { AvisoEnLinea, Cargando } from '@/componentes/estado/Estados'
import { useAviso } from '@/componentes/estado/useAviso'
import { Boton } from '@/componentes/formularios/Boton'
import { Campo } from '@/componentes/formularios/Campo'
import { Entrada } from '@/componentes/formularios/Entrada'
import { DOMINIOS_MCP, EVENTOS_MCP, leerSistemaMcp, motivoDeTtlInvalido } from '@/dominio/mcp-externo'
import type { SistemaMcp } from '@/datos/accesos'
import { AlternablesMcp } from './AlternablesMcp'
import { ClavesMcp } from './ClavesMcp'
import { CuotasMcp } from './CuotasMcp'
import { DecisionRemotaMcp } from './DecisionRemotaMcp'
import { DominiosVinculoMcp } from './DominiosVinculoMcp'
import { guardarSistemaMcp } from './guardarSistemaMcp'

/**
 * La configuración de un sistema MCP: qué herramientas puede usar, de qué se le avisa, cuánto duran
 * sus propuestas, sus cuotas, los dominios de sus vínculos, qué puede aprobar desde fuera y sus claves
 * públicas.
 *
 * Los interruptores se guardan al pulsarlos (como en Interruptores de Accesos); lo demás, con su
 * botón. Del PEM no se guarda copia en el navegador y la API no lo devuelve: de cada clave solo se ve
 * su `kid`, su huella y su estado.
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
      <AlternablesMcp
        titulo="Qué puede usar"
        catalogo={DOMINIOS_MCP}
        encendidos={sistema.domains}
        campo="dominios"
        integracionId={integracionId}
        onGuardado={setSistema}
      />
      <AlternablesMcp
        titulo="De qué se le avisa"
        catalogo={EVENTOS_MCP.map((e) => ({ clave: e.clave, nombre: e.nombre, descripcion: e.clave }))}
        encendidos={sistema.events}
        campo="eventos"
        integracionId={integracionId}
        onGuardado={setSistema}
      />
      <DuracionDePropuestas sistema={sistema} onGuardado={setSistema} />
      <CuotasMcp sistema={sistema} onGuardado={setSistema} />
      <DominiosVinculoMcp sistema={sistema} onGuardado={setSistema} />
      <DecisionRemotaMcp sistema={sistema} onGuardado={setSistema} />
      <ClavesMcp sistema={sistema} onGuardado={setSistema} />
    </div>
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

    const resultado = await guardarSistemaMcp(sistema.id, { ttl_propuesta_horas: Number(horas) })

    setEnviando(false)

    if (!resultado.ok) {
      aviso.error(resultado.mensaje)

      return
    }

    onGuardado(resultado.sistema)
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
