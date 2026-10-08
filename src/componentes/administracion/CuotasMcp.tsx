'use client'

import { useState, type ReactElement } from 'react'
import { useAviso } from '@/componentes/estado/useAviso'
import { Boton } from '@/componentes/formularios/Boton'
import { Campo } from '@/componentes/formularios/Campo'
import { Entrada } from '@/componentes/formularios/Entrada'
import { LOCALE } from '@/lib/fechas'
import { RPM_MAXIMO, TOPE_VIVAS_MAXIMO, cuotaDeTexto, motivoDeCuotaInvalida } from '@/dominio/mcp-externo'
import type { CuotasDeSistema, SistemaMcp } from '@/datos/accesos'
import { guardarSistemaMcp } from './guardarSistemaMcp'

type ClaveDeCuota = 'rpm_persona' | 'rpm_sistema' | 'tope_vivas'

/** Cada cuota: cómo se llama el campo del `PUT`, dónde se lee en `limits` y qué techo tiene. */
const CUOTAS: ReadonlyArray<{
  campo: ClaveDeCuota
  limite: keyof Omit<CuotasDeSistema, 'effective'>
  etiqueta: string
  ayuda: string
  maximo: number
}> = [
  { campo: 'rpm_persona', limite: 'rpm_person', etiqueta: 'Llamadas por minuto, por persona', ayuda: 'Lo que puede pedir el sistema en nombre de una misma persona.', maximo: RPM_MAXIMO },
  { campo: 'rpm_sistema', limite: 'rpm_system', etiqueta: 'Llamadas por minuto, en total', ayuda: 'Lo que puede pedir el sistema entre todas las personas.', maximo: RPM_MAXIMO },
  { campo: 'tope_vivas', limite: 'max_pending', etiqueta: 'Propuestas pendientes, por persona', ayuda: 'Cuántas puede dejar esperando a la vez a una misma persona.', maximo: TOPE_VIVAS_MAXIMO }
]

/** El texto de un campo a partir de lo configurado: vacío si usa el valor por defecto. */
function textoDeLimite (valor: number | null): string {
  return valor === null ? '' : String(valor)
}

/**
 * Las cuotas de un sistema. Un campo vacío significa «usa el valor por defecto», y el placeholder dice
 * cuál es el que rige hoy.
 *
 * @param sistema el sistema leído
 * @param onGuardado recibe el sistema tal como quedó
 */
export function CuotasMcp ({ sistema, onGuardado }: { sistema: SistemaMcp, onGuardado: (s: SistemaMcp) => void }): ReactElement {
  const aviso = useAviso()
  const [valores, setValores] = useState<Record<ClaveDeCuota, string>>({
    rpm_persona: textoDeLimite(sistema.limits.rpm_person),
    rpm_sistema: textoDeLimite(sistema.limits.rpm_system),
    tope_vivas: textoDeLimite(sistema.limits.max_pending)
  })
  const [enviando, setEnviando] = useState(false)

  const motivos = Object.fromEntries(CUOTAS.map((c) => [c.campo, motivoDeCuotaInvalida(valores[c.campo], c.maximo)])) as Record<ClaveDeCuota, string | null>
  const hayError = Object.values(motivos).some((m) => m !== null)
  const hayCambios = CUOTAS.some((c) => cuotaDeTexto(valores[c.campo]) !== sistema.limits[c.limite])

  async function guardar (): Promise<void> {
    if (hayError || enviando) return

    setEnviando(true)

    const resultado = await guardarSistemaMcp(sistema.id, Object.fromEntries(CUOTAS.map((c) => [c.campo, cuotaDeTexto(valores[c.campo])])))

    setEnviando(false)

    if (!resultado.ok) {
      aviso.error(resultado.mensaje)

      return
    }

    onGuardado(resultado.sistema)
    aviso.exito('Cuotas guardadas.')
  }

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="text-texto mb-1 text-sm font-medium">Cuotas</legend>
      <p className="text-texto-tenue text-xs">Déjalas vacías para usar los valores por defecto. Pasada una cuota, la API responde 429 y lo anota en Llamadas.</p>
      <div className="flex flex-wrap items-start gap-3">
        {CUOTAS.map((cuota) => {
          const rige = sistema.limits.effective[cuota.limite]
          const porDefecto = sistema.limits[cuota.limite] === null && rige !== null

          return (
            <Campo key={cuota.campo} etiqueta={cuota.etiqueta} error={motivos[cuota.campo] ?? undefined} ayuda={rige === null ? cuota.ayuda : `${cuota.ayuda} Hoy rige ${rige.toLocaleString(LOCALE)}.`} className="w-56">
              {(props) => (
                <Entrada
                  {...props}
                  inputMode="numeric"
                  placeholder={porDefecto ? `Por defecto (${rige.toLocaleString(LOCALE)})` : 'Por defecto'}
                  value={valores[cuota.campo]}
                  onChange={(e) => { setValores((previos) => ({ ...previos, [cuota.campo]: e.target.value })) }}
                />
              )}
            </Campo>
          )
        })}
      </div>
      <div>
        <Boton variante="secundario" tamano="chico" cargando={enviando} disabled={enviando || hayError || !hayCambios} onClick={() => { void guardar() }}>
          Guardar cuotas
        </Boton>
      </div>
    </fieldset>
  )
}
