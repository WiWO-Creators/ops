'use client'

import { useState, type ReactElement } from 'react'
import { AvisoEnLinea } from '@/componentes/estado/Estados'
import { CAJA_DE_AVISO } from '@/componentes/estado/cajaDeAviso'
import { useAviso } from '@/componentes/estado/useAviso'
import { Boton } from '@/componentes/formularios/Boton'
import { Campo } from '@/componentes/formularios/Campo'
import { AreaTexto, Entrada } from '@/componentes/formularios/Entrada'
import { Segmentado } from '@/componentes/formularios/Segmentado'
import { Fecha } from '@/componentes/presentadores/Fecha'
import { Insignia } from '@/componentes/presentadores/Insignia'
import {
  PROPOSITOS_CLAVE, armarClaves, describirEstadoDeClave, motivoDeClaveInvalida, type ClaveParaGuardar
} from '@/dominio/mcp-externo'
import type { PropositoDeClave, SistemaMcp } from '@/datos/accesos'
import { guardarSistemaMcp } from './guardarSistemaMcp'

/**
 * Las claves públicas con las que Ops verifica las aserciones del sistema, cada una con su propósito:
 * `mcp` firma las llamadas y `decision` firma las aprobaciones remotas.
 *
 * `PUT claves` reemplaza la lista entera, y el PEM no vuelve nunca en el `GET`: de cada clave llegan su
 * `kid`, su huella, su estado y cuántos días le quedan. Por eso lo que ya estaba se reenvía **sin
 * `pem`** (la API entiende «este `kid` ya existe, conserva su clave»; ver `armarClaves`). Rotar es
 * registrar la nueva y retirar la vieja, que deja de servir en el instante de su `hasta`.
 *
 * @param sistema el sistema leído
 * @param onGuardado recibe el sistema tal como quedó
 */
export function ClavesMcp ({ sistema, onGuardado }: { sistema: SistemaMcp, onGuardado: (s: SistemaMcp) => void }): ReactElement {
  const aviso = useAviso()
  const [kid, setKid] = useState('')
  const [pem, setPem] = useState('')
  const [proposito, setProposito] = useState<PropositoDeClave>('mcp')
  const [error, setError] = useState<string | undefined>()
  const [enviando, setEnviando] = useState(false)

  async function agregar (): Promise<void> {
    const motivo = motivoDeClaveInvalida(kid, pem)

    if (motivo !== null) {
      setError(motivo)

      return
    }

    const armadas = armarClaves(sistema.keys, { kid, pem, proposito })

    if ('motivo' in armadas) {
      setError(armadas.motivo)

      return
    }

    setError(undefined)
    if (enviando) return

    setEnviando(true)

    const resultado = await guardarSistemaMcp(sistema.id, { claves: armadas.claves })

    setEnviando(false)

    if (!resultado.ok) {
      setError(resultado.mensaje)

      return
    }

    onGuardado(resultado.sistema)
    setKid('')
    setPem('')
    aviso.exito('Clave registrada.')
  }

  /** Retira una clave: queda con `hasta` ahora y deja de verificar aserciones. */
  async function retirar (kidARetirar: string): Promise<void> {
    const armadas = armarClaves(sistema.keys)

    if ('motivo' in armadas) return

    const ahora = new Date().toISOString()
    const claves: ClaveParaGuardar[] = armadas.claves.map((c) => c.kid === kidARetirar ? { ...c, hasta: ahora } : c)
    const resultado = await guardarSistemaMcp(sistema.id, { claves })

    if (!resultado.ok) {
      aviso.error(resultado.mensaje)

      return
    }

    onGuardado(resultado.sistema)
    aviso.exito('Clave retirada.')
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-texto text-sm font-medium">Claves públicas</p>

      {sistema.keys_expiring_soon && (
        <AvisoEnLinea
          variante="aviso"
          className={CAJA_DE_AVISO}
          mensaje="Hay claves por vencer. Registra la nueva antes de que venza la actual, o el sistema dejará de poder identificar a las personas."
        />
      )}

      {sistema.keys.length === 0
        ? <p className="text-texto-tenue text-sm">Sin claves: el sistema no puede identificar a nadie todavía.</p>
        : (
          <ul className="flex flex-col gap-2">
            {sistema.keys.map((clave) => {
              const estado = describirEstadoDeClave(clave)

              return (
                <li key={clave.kid} className="text-texto-tenue flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  <code className="text-texto font-mono">{clave.kid}</code>
                  <Insignia tono="contorno" tamano="chico">{PROPOSITOS_CLAVE.find((p) => p.valor === clave.purpose)?.etiqueta ?? clave.purpose}</Insignia>
                  <Insignia tono={estado.tono} tamano="chico">{estado.texto}</Insignia>
                  <span>desde <Fecha valor={clave.since} /></span>
                  {clave.until !== null && <span>hasta <Fecha valor={clave.until} /></span>}
                  {clave.fingerprint !== '' && <code className="font-mono text-xs" title="Huella de la clave pública">{clave.fingerprint}</code>}
                  {clave.status !== 'expired' && (
                    <Boton variante="sutil" tamano="chico" onClick={() => { void retirar(clave.kid) }}>Retirar</Boton>
                  )}
                </li>
              )
            })}
          </ul>
          )}

      <Segmentado etiqueta="Para qué sirve la clave" opciones={PROPOSITOS_CLAVE.map((p) => ({ valor: p.valor, etiqueta: p.etiqueta }))} activo={proposito} onElegir={(v) => { setProposito(v === 'decision' ? 'decision' : 'mcp') }} />
      <p className="text-texto-tenue text-xs">{PROPOSITOS_CLAVE.find((p) => p.valor === proposito)?.descripcion} Puede haber hasta dos vigentes por propósito, para rotar sin cortar el servicio.</p>

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
