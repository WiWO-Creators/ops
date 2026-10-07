'use client'

import { KeyRound, MonitorPlay, Plug, RefreshCw, Trash2 } from 'lucide-react'
import { useCallback, useState, type FormEvent, type ReactElement } from 'react'
import { BotonCopiar } from '@/componentes/datos/BotonCopiar'
import { ConfirmarBorrado, useConfirmarBorrado } from '@/componentes/datos/ConfirmarBorrado'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { AvisoEnLinea, Vacio } from '@/componentes/estado/Estados'
import { useAviso } from '@/componentes/estado/useAviso'
import { Boton } from '@/componentes/formularios/Boton'
import { Campo } from '@/componentes/formularios/Campo'
import { Entrada } from '@/componentes/formularios/Entrada'
import { Segmentado } from '@/componentes/formularios/Segmentado'
import { Fecha } from '@/componentes/presentadores/Fecha'
import { ConfiguracionMcp } from '@/componentes/administracion/ConfiguracionMcp'
import { LlamadasMcp } from '@/componentes/administracion/LlamadasMcp'
import { WebhookDeIntegracion } from '@/componentes/administracion/WebhookDeIntegracion'
import { motivoDeSlugInvalido } from '@/dominio/mcp-externo'
import type { IntegracionDeAccesos } from '@/datos/accesos'

interface Props {
  inicial: IntegracionDeAccesos[]
}

/** Una llave recién emitida: se muestra esta única vez y no se puede volver a leer. */
interface LlaveEmitida {
  nombre: string
  llave: string
}

const TIPOS = [
  { valor: 'mcp', etiqueta: 'Sistema wiwo (MCP)' },
  { valor: 'pantallas', etiqueta: 'Solo lectura de pantallas' }
] as const

/**
 * Las integraciones: otros sistemas que usan la API sin ser una persona.
 *
 * Las de alcance `mcp` (Metriq, WiwoLab…) además actúan en nombre de una persona que ellas identifican
 * por correo; cada una se configura abajo con sus claves, sus dominios y sus eventos. Las de
 * `pantallas` solo leen lo que muestran los televisores.
 *
 * === LA LLAVE SE VE UNA VEZ ===
 *
 * Al emitirla o regenerarla. La API guarda solo su hash, así que no hay «ver la llave»: quien la
 * pierde la regenera, y la anterior deja de servir en el mismo instante.
 */
export function IntegracionesAdmin ({ inicial }: Props): ReactElement {
  const [filas, setFilas] = useState(inicial)
  const [emitida, setEmitida] = useState<LlaveEmitida | null>(null)

  const agregar = useCallback((fila: IntegracionDeAccesos, llave: string): void => {
    setFilas((previas) => [fila, ...previas.filter((f) => f.id !== fila.id)])
    setEmitida({ nombre: fila.name, llave })
  }, [])

  const quitar = useCallback((id: number): void => {
    setFilas((previas) => previas.filter((f) => f.id !== id))
  }, [])

  return (
    <div className="flex flex-col gap-4">
      <FormularioDeAlta onCreada={agregar} />

      {emitida !== null && <LlaveVisible emitida={emitida} onCerrar={() => { setEmitida(null) }} />}

      {filas.length === 0
        ? <Vacio titulo="No hay integraciones" descripcion="Crea una para que otro sistema pueda usar Ops. Su llave se mostrará una sola vez." />
        : (
          <ul className="flex flex-col gap-2">
            {filas.map((fila) => (
              <FilaDeIntegracion
                key={fila.id}
                fila={fila}
                onLlave={(llave) => { setEmitida({ nombre: fila.name, llave }) }}
                onRevocada={quitar}
              />
            ))}
          </ul>
          )}
    </div>
  )
}

/** Alta de una integración. Un sistema MCP lleva además su identificador estable (el slug). */
function FormularioDeAlta ({ onCreada }: { onCreada: (fila: IntegracionDeAccesos, llave: string) => void }): ReactElement {
  const aviso = useAviso()
  const [abierto, setAbierto] = useState(false)
  const [tipo, setTipo] = useState<string>('mcp')
  const [nombre, setNombre] = useState('')
  const [slug, setSlug] = useState('')
  const [errorSlug, setErrorSlug] = useState<string | undefined>()
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function crear (evento: FormEvent): Promise<void> {
    evento.preventDefault()

    const motivo = tipo === 'mcp' ? motivoDeSlugInvalido(slug) : null

    setErrorSlug(motivo ?? undefined)
    if (nombre.trim() === '' || motivo !== null || enviando) return

    setEnviando(true)
    setError(null)

    const cuerpo = tipo === 'mcp' ? { nombre: nombre.trim(), sistema: slug, alcance: 'mcp' } : { nombre: nombre.trim() }
    const resultado = await escribirEnBff<{ id: number, key: string }>('accesos/integraciones', 'POST', cuerpo)

    setEnviando(false)

    if (!resultado.ok) {
      setError(resultado.mensaje)

      return
    }

    onCreada({
      id: resultado.datos.id,
      name: nombre.trim(),
      scope: tipo,
      key_start: resultado.datos.key.slice(0, 8),
      created_at: new Date().toISOString(),
      created_by: null,
      key_issued_at: new Date().toISOString(),
      last_used_at: null
    }, resultado.datos.key)
    aviso.exito('Integración creada. Copia la llave: no se vuelve a mostrar.')
    setNombre('')
    setSlug('')
    setAbierto(false)
  }

  if (!abierto) {
    return (
      <div>
        <Boton variante="primario" tamano="chico" onClick={() => { setAbierto(true) }}>
          <Plug size={14} aria-hidden="true" />
          Nueva integración
        </Boton>
      </div>
    )
  }

  return (
    <form onSubmit={(e) => { void crear(e) }} className="border-linea bg-superficie-elevada flex flex-col gap-3 rounded-lg border p-4">
      <Segmentado etiqueta="Tipo de integración" opciones={TIPOS} activo={tipo} onElegir={setTipo} />

      <Campo etiqueta="Nombre" requerido ayuda="Cómo la reconoces en esta lista, por ejemplo «Metriq»."
        error={nombre.trim() === '' && error !== null ? 'Escribe un nombre.' : undefined}>
        {(props) => <Entrada {...props} value={nombre} maxLength={191} onChange={(e) => { setNombre(e.target.value) }} />}
      </Campo>

      {tipo === 'mcp' && (
        <Campo etiqueta="Identificador" requerido error={errorSlug}
          ayuda="Es estable: los vínculos y propuestas del sistema lo usan. No se puede cambiar después.">
          {(props) => <Entrada {...props} value={slug} maxLength={31} onChange={(e) => { setSlug(e.target.value.toLowerCase()) }} />}
        </Campo>
      )}

      {error !== null && <AvisoEnLinea variante="error" mensaje={error} />}

      <div className="flex gap-2">
        <Boton type="submit" variante="primario" tamano="chico" cargando={enviando} disabled={enviando}>Crear</Boton>
        <Boton type="button" variante="sutil" tamano="chico" disabled={enviando} onClick={() => { setAbierto(false) }}>Cancelar</Boton>
      </div>
    </form>
  )
}

/** La llave en claro, visible hasta que se cierre. Nunca se guarda en el navegador. */
function LlaveVisible ({ emitida, onCerrar }: { emitida: LlaveEmitida, onCerrar: () => void }): ReactElement {
  return (
    <div role="status" className="border-linea bg-superficie-elevada flex flex-col gap-2 rounded-lg border p-4">
      <p className="text-texto text-sm font-medium">Llave de «{emitida.nombre}»</p>
      <code className="border-linea bg-superficie text-texto block break-all rounded-md border px-3 py-2 font-mono text-sm">
        {emitida.llave}
      </code>
      <p className="text-texto-tenue text-sm">
        Guárdala ahora en el otro sistema. Ops solo conserva una huella: si la pierdes, tendrás que regenerarla y la anterior dejará de servir.
      </p>
      <div className="flex gap-2">
        <BotonCopiar valor={() => emitida.llave} etiqueta="Copiar llave" etiquetaCopiado="Copiada" mensajeError="No pudimos copiar. Selecciona la llave y cópiala a mano." />
        <Boton variante="sutil" tamano="chico" onClick={onCerrar}>Ya la guardé</Boton>
      </div>
    </div>
  )
}

type Panel = 'configuracion' | 'webhook' | 'llamadas' | null

function FilaDeIntegracion ({ fila, onLlave, onRevocada }: {
  fila: IntegracionDeAccesos
  onLlave: (llave: string) => void
  onRevocada: (id: number) => void
}): ReactElement {
  const aviso = useAviso()
  const revocar = useConfirmarBorrado()
  const regenerar = useConfirmarBorrado()
  const [panel, setPanel] = useState<Panel>(null)
  const esMcp = fila.scope === 'mcp'

  async function emitirOtraLlave (): Promise<void> {
    const resultado = await escribirEnBff<{ key: string }>(`accesos/integraciones/${fila.id}/llave`, 'POST')

    if (!resultado.ok) throw new Error(resultado.mensaje)

    onLlave(resultado.datos.key)
    aviso.exito('Llave regenerada. La anterior ya no sirve.')
  }

  async function revocarIntegracion (): Promise<void> {
    const resultado = await escribirEnBff<undefined>(`accesos/integraciones/${fila.id}`, 'DELETE')

    if (!resultado.ok) throw new Error(resultado.mensaje)

    onRevocada(fila.id)
    aviso.exito('Integración revocada.')
  }

  const alternar = (destino: Exclude<Panel, null>): void => { setPanel(panel === destino ? null : destino) }

  return (
    <li className="border-linea bg-superficie-elevada flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {esMcp
            ? <Plug className="text-acento size-5 shrink-0" aria-hidden />
            : <MonitorPlay className="text-texto-tenue size-5 shrink-0" aria-hidden />}
          <div className="flex min-w-0 flex-col">
            <p className="text-texto truncate font-medium">
              {fila.name}
              <span className="text-texto-tenue ml-2 text-sm font-normal">{esMcp ? 'Sistema MCP' : 'Pantallas'}</span>
            </p>
            <p className="text-texto-tenue flex flex-wrap items-center gap-x-3 text-sm">
              <span className="inline-flex items-center gap-1">
                <KeyRound size={13} aria-hidden="true" />
                <code className="font-mono">{fila.key_start}…</code>
              </span>
              <span>Último uso: {fila.last_used_at === null ? 'nunca' : <Fecha valor={fila.last_used_at} conHora />}</span>
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {esMcp && <Boton variante="secundario" tamano="chico" aria-expanded={panel === 'configuracion'} onClick={() => { alternar('configuracion') }}>Configurar</Boton>}
          <Boton variante="secundario" tamano="chico" aria-expanded={panel === 'webhook'} onClick={() => { alternar('webhook') }}>Webhook</Boton>
          {esMcp && <Boton variante="secundario" tamano="chico" aria-expanded={panel === 'llamadas'} onClick={() => { alternar('llamadas') }}>Llamadas</Boton>}
          <Boton variante="sutil" tamano="chico" onClick={regenerar.abrir}>
            <RefreshCw size={14} aria-hidden="true" />
            Regenerar llave
          </Boton>
          <Boton variante="sutil" tamano="chico" onClick={revocar.abrir}>
            <Trash2 size={14} aria-hidden="true" />
            Revocar
          </Boton>
        </div>
      </div>

      {panel === 'configuracion' && <ConfiguracionMcp integracionId={fila.id} />}
      {panel === 'webhook' && <WebhookDeIntegracion integracionId={fila.id} />}
      {panel === 'llamadas' && <LlamadasMcp integracionId={fila.id} />}

      <ConfirmarBorrado
        abierto={regenerar.abierto}
        onCerrar={regenerar.cerrar}
        titulo="Regenerar la llave"
        advertencia={`La llave actual de «${fila.name}» dejará de servir en el mismo instante. El otro sistema fallará hasta que le pongas la nueva.`}
        etiquetaConfirmar="Regenerar"
        onConfirmar={emitirOtraLlave}
      />
      <ConfirmarBorrado
        abierto={revocar.abierto}
        onCerrar={revocar.cerrar}
        titulo="Revocar la integración"
        advertencia={`«${fila.name}» no podrá volver a usar Ops y esto no se puede deshacer: para volver a darle acceso habrá que crear otra integración.`}
        confirmacionEscrita={fila.name}
        etiquetaConfirmar="Revocar"
        onConfirmar={revocarIntegracion}
      />
    </li>
  )
}
