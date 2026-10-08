'use client'

import { useState, type ReactElement } from 'react'
import { useAviso } from '@/componentes/estado/useAviso'
import { Boton } from '@/componentes/formularios/Boton'
import { Campo } from '@/componentes/formularios/Campo'
import { AreaTexto } from '@/componentes/formularios/Entrada'
import { DOMINIOS_VINCULO_MAXIMO, dominiosDeTexto, motivoDeDominiosInvalidos } from '@/dominio/mcp-externo'
import type { SistemaMcp } from '@/datos/accesos'
import { guardarSistemaMcp } from './guardarSistemaMcp'

/**
 * Los dominios de los que Ops acepta la URL de un vínculo.
 *
 * Es una defensa contra enlaces inyectados: un sistema solo puede adjuntar a una tarea una URL de un
 * dominio que figure acá. Lista vacía = ninguna URL se acepta.
 *
 * @param sistema el sistema leído
 * @param onGuardado recibe el sistema tal como quedó
 */
export function DominiosVinculoMcp ({ sistema, onGuardado }: { sistema: SistemaMcp, onGuardado: (s: SistemaMcp) => void }): ReactElement {
  const aviso = useAviso()
  const [texto, setTexto] = useState(sistema.link_domains.join('\n'))
  const [enviando, setEnviando] = useState(false)

  const dominios = dominiosDeTexto(texto)
  const motivo = motivoDeDominiosInvalidos(dominios)
  const hayCambios = dominios.join('\n') !== sistema.link_domains.join('\n')

  async function guardar (): Promise<void> {
    if (motivo !== null || enviando) return

    setEnviando(true)

    const resultado = await guardarSistemaMcp(sistema.id, { dominios_vinculo: dominios })

    setEnviando(false)

    if (!resultado.ok) {
      aviso.error(resultado.mensaje)

      return
    }

    onGuardado(resultado.sistema)
    setTexto(resultado.sistema.link_domains.join('\n'))
    aviso.exito('Dominios guardados.')
  }

  return (
    <div className="flex flex-col gap-2">
      <Campo
        etiqueta="Dominios permitidos para vínculos"
        error={motivo ?? undefined}
        ayuda={`Uno por línea: «dominio.com» o «*.dominio.com» para todos sus subdominios (hasta ${DOMINIOS_VINCULO_MAXIMO}). Con la lista vacía, el sistema no puede adjuntar ninguna URL.`}
      >
        {(props) => (
          <AreaTexto {...props} rows={3} value={texto} className="font-mono text-xs" onChange={(e) => { setTexto(e.target.value) }} />
        )}
      </Campo>
      <div>
        <Boton variante="secundario" tamano="chico" cargando={enviando} disabled={enviando || motivo !== null || !hayCambios} onClick={() => { void guardar() }}>
          Guardar dominios
        </Boton>
      </div>
    </div>
  )
}
