'use client'

import { useEffect, useState, type ReactElement } from 'react'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { Cargando } from '@/componentes/estado/Estados'
import { Boton } from '@/componentes/formularios/Boton'
import { Campo } from '@/componentes/formularios/Campo'
import { ContenidoSelector, DisparadorSelector, Opcion, Selector } from '@/componentes/formularios/Selector'
import { ContenidoDialogo, Dialogo } from '@/componentes/superposiciones/Dialogo'
import { mensajeDeRespuesta } from '@/datos/cliente'
import { mensajeDeCodigo } from '@/datos/errores'
import {
  cuerpoDeLimpieza, OPCIONES_DETENCION, rutaDeLimpieza, seleccionInicial, textoDeConfirmacion, textoDeOmision, textosDeMotivos,
  type Detencion, type ResultadoDeLimpieza, type ValidacionDeLimpieza
} from '@/dominio/copias-recurrencia'
import { formatearFecha } from '@/lib/fechas'

/** La regla a limpiar: basta con nombrarla. */
export interface ReglaALimpiar { id: number, name: string }

/**
 * Limpiar las copias sin uso de una recurrencia. Solo lo abre un administrador; la API lo vuelve a
 * exigir (`403 solo_administradores`).
 *
 * En dos pasos, porque borrar tareas no se hace de un clic: primero `validar` dice cuales son
 * candidatas y cuales se conservan (y por que), despues se elige, se confirma el numero exacto y
 * recien ahi `aplicar`. La API revisa cada copia otra vez antes de borrarla; las que alguien toco en
 * el intermedio vuelven como omitidas, y el resultado las nombra.
 *
 * @param regla la regla, o null con el dialogo cerrado
 * @param onCerrar se llama al cerrar, haya limpiado o no
 */
export function LimpiezaDeCopias ({ regla, onCerrar }: { regla: ReglaALimpiar | null, onCerrar: () => void }): ReactElement {
  return (
    <Dialogo open={regla !== null} onOpenChange={(abierto) => { if (!abierto) onCerrar() }}>
      {regla !== null && (
        <ContenidoDialogo titulo="Limpiar copias sin uso" descripcion={regla.name} ancho="grande" cerrable>
          <FlujoDeLimpieza key={regla.id} regla={regla} onCerrar={onCerrar} />
        </ContenidoDialogo>
      )}
    </Dialogo>
  )
}

/** Donde va el flujo. */
type Paso =
  | { fase: 'validando' }
  | { fase: 'error', mensaje: string }
  | { fase: 'eligiendo', validacion: ValidacionDeLimpieza }
  | { fase: 'confirmando', validacion: ValidacionDeLimpieza }
  | { fase: 'resultado', resultado: ResultadoDeLimpieza, validacion: ValidacionDeLimpieza }

/**
 * Pide `validar` sin pasar por `escribirEnBff`: no escribe nada, y por esa via dispararia
 * `ops:tareas-cambiadas` y el listado de atras se recargaria sin motivo.
 */
async function validar (reglaId: number): Promise<Paso> {
  try {
    const respuesta = await fetch(`/api/bff/${rutaDeLimpieza(reglaId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modo: 'validar' })
    })
    if (!respuesta.ok) {
      const codigo = await respuesta.clone().json()
        .then((sobre: { error?: { code?: string } }) => sobre.error?.code)
        .catch(() => undefined)
      return { fase: 'error', mensaje: mensajeDeCodigo(codigo, await mensajeDeRespuesta(respuesta)) }
    }
    const sobre = await respuesta.json() as { data: ValidacionDeLimpieza }

    return { fase: 'eligiendo', validacion: sobre.data }
  } catch {
    return { fase: 'error', mensaje: 'No se pudo contactar al servidor. Revisa tu conexión.' }
  }
}

/** Los pasos del flujo, de validar al resultado. */
function FlujoDeLimpieza ({ regla, onCerrar }: { regla: ReglaALimpiar, onCerrar: () => void }): ReactElement {
  const [paso, setPaso] = useState<Paso>({ fase: 'validando' })
  const [elegidas, setElegidas] = useState<number[]>([])
  const [detener, setDetener] = useState<'' | Detencion>('')
  const [enCurso, setEnCurso] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let vigente = true
    void validar(regla.id).then((siguiente) => {
      if (!vigente) return
      setPaso(siguiente)
      if (siguiente.fase === 'eligiendo') setElegidas(seleccionInicial(siguiente.validacion.candidatas))
    })

    return () => { vigente = false }
  }, [regla.id])

  /** Manda `aplicar` con lo elegido. */
  async function aplicar (validacion: ValidacionDeLimpieza): Promise<void> {
    setEnCurso(true)
    setError(null)
    const resultado = await escribirEnBff<ResultadoDeLimpieza>(rutaDeLimpieza(regla.id), 'POST', cuerpoDeLimpieza(elegidas, detener))
    setEnCurso(false)

    if (!resultado.ok) {
      setError(mensajeDeCodigo(resultado.codigo, resultado.mensaje))
      setPaso({ fase: 'eligiendo', validacion })
      return
    }

    setPaso({ fase: 'resultado', resultado: resultado.datos, validacion })
  }

  if (paso.fase === 'validando') return <Cargando alto="min-h-32" />
  if (paso.fase === 'error') {
    return (
      <div className="flex flex-col gap-4">
        <p role="alert" className="text-texto-peligro text-sm">{paso.mensaje}</p>
        <div className="flex justify-end"><Boton variante="secundario" onClick={onCerrar}>Cerrar</Boton></div>
      </div>
    )
  }
  if (paso.fase === 'resultado') return <ResultadoFinal resultado={paso.resultado} validacion={paso.validacion} onCerrar={onCerrar} />

  const { validacion } = paso

  if (paso.fase === 'confirmando') {
    const accion = OPCIONES_DETENCION.find((opcion) => opcion.valor === detener)

    return (
      <div className="flex flex-col gap-4">
        <p className="text-texto text-base font-semibold">{textoDeConfirmacion(elegidas.length)}.</p>
        <p className="text-texto-tenue text-sm">
          Van a la papelera: no se borran de forma definitiva. Justo antes de moverlas se revisa cada una otra vez; si
          alguien la tocó mientras tanto, se conserva.
          {detener !== '' && ` Además: ${accion?.etiqueta.toLowerCase() ?? ''}.`}
        </p>
        {error !== null && <p role="alert" className="text-texto-peligro text-sm">{error}</p>}
        <div className="flex justify-end gap-2">
          <Boton variante="secundario" disabled={enCurso} onClick={() => { setPaso({ fase: 'eligiendo', validacion }) }}>Volver</Boton>
          <Boton variante="peligro" cargando={enCurso} onClick={() => { void aplicar(validacion) }}>Mover a la papelera</Boton>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <section aria-labelledby="limpieza-candidatas" className="flex flex-col gap-2">
        <h3 id="limpieza-candidatas" className="text-texto text-sm font-semibold">
          Sin movimiento · {validacion.candidatas.length}
        </h3>
        {validacion.candidatas.length === 0
          ? <p className="text-texto-tenue text-sm">No hay copias sin movimiento para limpiar.</p>
          : (
            <ul className="border-linea divide-linea rounded-tarjeta flex flex-col divide-y border">
              {validacion.candidatas.map((candidata) => (
                <li key={candidata.id} className="px-3 py-2">
                  <label className="text-texto flex items-start gap-3 text-sm">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={elegidas.includes(candidata.id)}
                      onChange={(evento) => {
                        setElegidas((antes) => evento.target.checked ? [...antes, candidata.id] : antes.filter((id) => id !== candidata.id))
                      }}
                    />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate font-medium">{candidata.name}</span>
                      <span className="text-texto-sutil text-xs">
                        {candidata.start_date === null ? 'Sin fecha de inicio' : `Del ${formatearFecha(candidata.start_date)}`}
                        {candidata.vigente === true && ' · Es la copia vigente: todavía está a tiempo de usarse, por eso no viene marcada.'}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            )}
      </section>

      {validacion.conservadas.length > 0 && (
        <section aria-labelledby="limpieza-conservadas" className="flex flex-col gap-2">
          <h3 id="limpieza-conservadas" className="text-texto text-sm font-semibold">
            Se conservan · {validacion.conservadas.length}
          </h3>
          <p className="text-texto-sutil text-xs">Alguien las usó, así que no se ofrecen para limpiar.</p>
          <ul className="flex flex-col gap-1">
            {validacion.conservadas.map((conservada) => (
              <li key={conservada.id} className="text-texto-tenue flex flex-wrap gap-x-2 text-sm">
                <span className="text-texto truncate">{conservada.name}</span>
                <span className="text-texto-sutil text-xs leading-5">{textosDeMotivos(conservada.touched_reasons).join(' · ')}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Campo etiqueta="Además" className="max-w-72">
        {({ id }) => (
          <Selector value={detener === '' ? 'nada' : detener} onValueChange={(valor) => { setDetener(valor === 'nada' ? '' : valor as Detencion) }}>
            <DisparadorSelector id={id} />
            <ContenidoSelector>
              {OPCIONES_DETENCION.map((opcion) => (
                <Opcion key={opcion.valor || 'nada'} value={opcion.valor || 'nada'}>{opcion.etiqueta}</Opcion>
              ))}
            </ContenidoSelector>
          </Selector>
        )}
      </Campo>

      {error !== null && <p role="alert" className="text-texto-peligro text-sm">{error}</p>}

      <div className="flex justify-end gap-2">
        <Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton>
        <Boton
          variante="primario"
          disabled={elegidas.length === 0}
          onClick={() => { setError(null); setPaso({ fase: 'confirmando', validacion }) }}
        >
          Continuar
        </Boton>
      </div>
    </div>
  )
}

/** Que se movio a la papelera, que no y por que. */
function ResultadoFinal ({ resultado, validacion, onCerrar }: {
  resultado: ResultadoDeLimpieza
  validacion: ValidacionDeLimpieza
  onCerrar: () => void
}): ReactElement {
  const nombre = (id: number): string => validacion.candidatas.find((candidata) => candidata.id === id)?.name ?? `#${id}`
  const detenida = OPCIONES_DETENCION.find((opcion) => opcion.valor === resultado.detenida)

  return (
    <div role="status" className="flex flex-col gap-4">
      <p className="text-texto text-base font-semibold">
        {resultado.eliminadas.length === 1 ? 'Se movió 1 tarea a la papelera.' : `Se movieron ${resultado.eliminadas.length} tareas a la papelera.`}
      </p>
      {resultado.eliminadas.length > 0 && (
        <ul className="text-texto-tenue flex list-disc flex-col gap-0.5 pl-5 text-sm">
          {resultado.eliminadas.map((id) => <li key={id}>{nombre(id)}</li>)}
        </ul>
      )}
      {resultado.omitidas.length > 0 && (
        <section aria-labelledby="limpieza-omitidas" className="flex flex-col gap-1">
          <h3 id="limpieza-omitidas" className="text-texto text-sm font-semibold">No se movieron · {resultado.omitidas.length}</h3>
          <ul className="flex flex-col gap-0.5 text-sm">
            {resultado.omitidas.map((omitida) => (
              <li key={omitida.id} className="text-texto-tenue">
                <span className="text-texto">{nombre(omitida.id)}</span> — {textoDeOmision(omitida.motivo)}
              </li>
            ))}
          </ul>
        </section>
      )}
      {resultado.detenida !== null && detenida !== undefined && (
        <p className="text-texto-tenue text-sm">Además: {detenida.etiqueta.toLowerCase()}. Listo.</p>
      )}
      <div className="flex justify-end"><Boton variante="primario" onClick={onCerrar}>Cerrar</Boton></div>
    </div>
  )
}
