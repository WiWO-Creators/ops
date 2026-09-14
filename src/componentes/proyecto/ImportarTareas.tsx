'use client'

import { useEffect, useState, type ReactElement } from 'react'
import { Boton } from '@/componentes/formularios/Boton'
import { Campo } from '@/componentes/formularios/Campo'
import { Entrada } from '@/componentes/formularios/Entrada'
import {
  ContenidoSelector,
  DisparadorSelector,
  Opcion,
  Selector
} from '@/componentes/formularios/Selector'
import { Cargando, ErrorEstado } from '@/componentes/estado/Estados'
import { ContenidoDialogo, Dialogo } from '@/componentes/superposiciones/Dialogo'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { pedirSobre } from '@/datos/cliente'
import { GLOSARIO } from '@/dominio/glosario'
import {
  cargarProyectosOrigen,
  cuerpoDeImportacion,
  filtrarOrigenes,
  habilitaArchivar,
  resumenDelInforme,
  rutaHitosDestino,
  rutaImportar,
  rutaInforme,
  validarImportacion,
  type HitoDestino,
  type InformeImportacion,
  type ProyectoCandidato
} from './importar-tareas'

/**
 * Trae las tareas de otro Proyecto a un Hito de este, deja comprobar la copia y archiva el viejo.
 *
 * Los tres pasos viven juntos a proposito. El pedido no es "copiar tareas": es reorganizar
 * Proyectos-por-mes en Hitos de un Proyecto, y ese trabajo no esta hecho hasta que el Proyecto viejo
 * salio de la lista. Repartirlo en tres pantallas es confiar en que alguien se acuerde de volver a
 * comprobar, y lo que pasa cuando no vuelve es que quedan las tareas duplicadas en dos lugares.
 *
 * DOS PUERTAS, UN SOLO CUERPO. Se entra desde el menu "Mas" de la ficha —ahi hay que elegir el Hito—
 * y desde el "+" de una columna del kanban de Hitos, donde el Hito ya esta decidido por la columna
 * en la que se apreto. Por eso `CuerpoImportarTareas` esta separado del dialogo: la segunda puerta
 * ya vive dentro de un dialogo, y anidar uno adentro de otro deja dos capas de foco peleandose.
 *
 * El boton de archivar solo se habilita cuando el informe del backend dice `listo`. La regla no se
 * reimplementa aca: dos versiones de la misma condicion se separan en cuanto una cambia.
 */

/** Lo que se esta mostrando. */
type Fase = 'elegir' | 'informe'

/** Carga de una lista que alimenta un selector. */
type Carga<T> =
  | { fase: 'cargando' }
  | { fase: 'error', mensaje: string }
  | { fase: 'listo', datos: T }

interface PropsImportarTareas {
  /** El Proyecto que recibe las tareas: el que se esta mirando. */
  destino: { id: number, name: string }
  abierto: boolean
  onAbiertoCambia: (abierto: boolean) => void
  /** Se llama cuando algo cambio de verdad, para que la ficha se recargue. */
  onImportado: () => void
  /** Se llama tras archivar el Proyecto de origen, que ya no va a aparecer en el listado. */
  onArchivado: () => void
}

/** Puerta desde el menu "Mas" de la ficha: dialogo propio, con el Hito a elegir. */
export function ImportarTareas ({
  destino,
  abierto,
  onAbiertoCambia,
  onImportado,
  onArchivado
}: PropsImportarTareas): ReactElement {
  const [ocupado, setOcupado] = useState(false)

  return (
    <Dialogo
      open={abierto}
      onOpenChange={(siguiente) => {
        if (ocupado) return
        onAbiertoCambia(siguiente)
      }}
    >
      <ContenidoDialogo
        titulo={`Importar ${GLOSARIO.proceso.plural.toLowerCase()} de otro ${GLOSARIO.espacio.singular.toLowerCase()}`}
        descripcion={`Se copian todas las ${GLOSARIO.proceso.plural.toLowerCase()} del `
          + `${GLOSARIO.espacio.singular.toLowerCase()} que elijas a un ${GLOSARIO.hito.singular.toLowerCase()} `
          + `de "${destino.name}". Las originales no se tocan: primero comprobás que la copia quedó `
          + 'igual y recién después archivás el viejo.'}
        ancho="grande"
      >
        {/* Se desmonta al cerrar —`abierto &&`— y no solo se oculta: es lo que devuelve el diálogo a
            su primer paso sin un `limpiar()` que haya que acordarse de llamar en cada salida. */}
        {abierto && (
          <CuerpoImportarTareas
            destino={destino}
            onImportado={onImportado}
            onArchivado={onArchivado}
            onCerrar={() => { onAbiertoCambia(false) }}
            onOcupado={setOcupado}
          />
        )}
      </ContenidoDialogo>
    </Dialogo>
  )
}

interface PropsCuerpo {
  destino: { id: number, name: string }
  /**
   * Hito ya decidido. Cuando viene, el paso de elegirlo no se muestra: es el caso del "+" de una
   * columna del kanban, donde la columna en la que se apretó ES la respuesta.
   */
  hitoFijo?: HitoDestino
  onImportado: () => void
  onArchivado: () => void
  onCerrar: () => void
  /** Avisa que hay una escritura en curso, para que el diálogo que lo contiene no se cierre encima. */
  onOcupado?: (ocupado: boolean) => void
}

/** El cuerpo de la operacion, sin dialogo propio. Sirve a las dos puertas. */
export function CuerpoImportarTareas ({
  destino,
  hitoFijo,
  onImportado,
  onArchivado,
  onCerrar,
  onOcupado
}: PropsCuerpo): ReactElement {
  const [fase, setFase] = useState<Fase>('elegir')
  const [busqueda, setBusqueda] = useState('')
  const [origenId, setOrigenId] = useState<number | null>(null)
  const [hitoId, setHitoId] = useState<number | null>(hitoFijo?.id ?? null)
  const [informe, setInforme] = useState<InformeImportacion | null>(null)
  const [enCurso, setEnCurso] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [intento, setIntento] = useState(0)

  const [origenes, setOrigenes] = useState<Carga<ProyectoCandidato[]>>({ fase: 'cargando' })
  const [hitos, setHitos] = useState<Carga<HitoDestino[]>>(
    hitoFijo === undefined ? { fase: 'cargando' } : { fase: 'listo', datos: [hitoFijo] }
  )

  /** Un solo lugar donde se marca la escritura en curso, para no olvidar avisar hacia afuera. */
  function marcarEnCurso (valor: boolean): void {
    setEnCurso(valor)
    onOcupado?.(valor)
  }

  useEffect(() => {
    const control = new AbortController()

    void cargarProyectosOrigen(pedirSobre, control.signal)
      .then((datos) => {
        if (!control.signal.aborted) setOrigenes({ fase: 'listo', datos })
      })
      .catch((fallo: unknown) => {
        if (!control.signal.aborted) setOrigenes({ fase: 'error', mensaje: mensajeDe(fallo) })
      })

    // Con el Hito ya decidido no hay nada que elegir, así que la lista no se pide: es una petición
    // entera ahorrada en la puerta que más se va a usar.
    if (hitoFijo === undefined) {
      void pedirSobre<HitoDestino[]>(rutaHitosDestino(destino.id), control.signal)
        .then((sobre) => {
          if (!control.signal.aborted) setHitos({ fase: 'listo', datos: sobre.data })
        })
        .catch((fallo: unknown) => {
          if (!control.signal.aborted) setHitos({ fase: 'error', mensaje: mensajeDe(fallo) })
        })
    }

    return () => { control.abort() }
  }, [destino.id, hitoFijo, intento])

  /**
   * Trae el informe de verificacion.
   *
   * Es la misma llamada antes de importar (previsualizacion: cuantas van a venir) y despues
   * (comprobacion: en que difiere cada copia). El endpoint es uno solo porque la pregunta es la
   * misma; lo unico que cambia es cuantas copias ya existen cuando se hace.
   */
  async function comprobar (): Promise<void> {
    const invalido = validarImportacion(origenId, hitoId, destino.id)

    if (invalido !== null) {
      setError(invalido)
      return
    }

    marcarEnCurso(true)
    setError(null)

    try {
      const sobre = await pedirSobre<InformeImportacion>(
        rutaInforme(destino.id, origenId as number, hitoId as number),
        new AbortController().signal
      )

      setInforme(sobre.data)
      setFase('informe')
    } catch (fallo: unknown) {
      setError(mensajeDe(fallo))
    } finally {
      marcarEnCurso(false)
    }
  }

  /**
   * Ejecuta la copia. El backend devuelve el informe ya actualizado, asi que no hace falta un
   * segundo viaje para saber como quedo.
   */
  async function importar (): Promise<void> {
    if (origenId === null || hitoId === null) return

    marcarEnCurso(true)
    setError(null)

    const respuesta = await escribirEnBff<InformeImportacion>(
      rutaImportar(destino.id),
      'POST',
      cuerpoDeImportacion(origenId, hitoId)
    )

    marcarEnCurso(false)

    if (!respuesta.ok) {
      setError(respuesta.mensaje)
      return
    }

    setInforme(respuesta.datos)
    setFase('informe')
    onImportado()
  }

  /**
   * Archiva el Proyecto de origen, que es el final del trabajo.
   *
   * Se cierra al terminar: el Proyecto que se acaba de vaciar ya no tiene nada que mostrar aca, y
   * dejar el informe abierto invita a apretar "Importar" otra vez.
   */
  async function archivarOrigen (): Promise<void> {
    if (informe === null) return

    marcarEnCurso(true)
    setError(null)

    const respuesta = await escribirEnBff(`projects/${informe.origen.id}/actions/archive`, 'POST')

    marcarEnCurso(false)

    if (!respuesta.ok) {
      setError(respuesta.mensaje)
      return
    }

    onCerrar()
    onArchivado()
  }

  const candidatos = origenes.fase === 'listo'
    ? filtrarOrigenes(origenes.datos, destino.id, busqueda)
    : []

  return (
    <div className="flex flex-col">
      {fase === 'elegir'
        ? (
          <PasoElegir
            origenes={origenes}
            hitos={hitos}
            hitoFijo={hitoFijo}
            candidatos={candidatos}
            busqueda={busqueda}
            origenId={origenId}
            hitoId={hitoId}
            enCurso={enCurso}
            onBusqueda={setBusqueda}
            onOrigen={setOrigenId}
            onHito={setHitoId}
            onReintentar={() => {
              setOrigenes({ fase: 'cargando' })
              if (hitoFijo === undefined) setHitos({ fase: 'cargando' })
              setIntento((n) => n + 1)
            }}
          />
          )
        : (
          <PasoInforme informe={informe} />
          )}

      {error !== null && <p role="alert" className="text-texto-peligro mt-3 text-sm">{error}</p>}

      <div className="mt-4 flex flex-wrap justify-end gap-2">
        {fase === 'elegir'
          ? (
            <>
              <Boton variante="sutil" disabled={enCurso} onClick={onCerrar}>Cancelar</Boton>
              <Boton variante="primario" cargando={enCurso} onClick={() => { void comprobar() }}>
                Ver qué se va a copiar
              </Boton>
            </>
            )
          : (
            <>
              <Boton variante="sutil" disabled={enCurso} onClick={() => { setFase('elegir') }}>
                Volver
              </Boton>

              {informe !== null && informe.pendientes > 0 && (
                <Boton variante="primario" cargando={enCurso} onClick={() => { void importar() }}>
                  Copiar {informe.pendientes} {informe.pendientes === 1
                    ? GLOSARIO.proceso.singular.toLowerCase()
                    : GLOSARIO.proceso.plural.toLowerCase()}
                </Boton>
              )}

              {informe !== null && informe.pendientes === 0 && (
                <Boton variante="secundario" cargando={enCurso} onClick={() => { void comprobar() }}>
                  Volver a comprobar
                </Boton>
              )}

              {/* Archivar cierra el ciclo, y por eso esta aca y no en otro menu: quien acaba de
                  comprobar que la copia esta bien es quien tiene que poder terminar el trabajo. */}
              <Boton
                variante="peligro"
                disabled={!habilitaArchivar(informe) || enCurso}
                onClick={() => { void archivarOrigen() }}
              >
                Archivar {informe === null ? '' : `"${informe.origen.nombre}"`}
              </Boton>
            </>
            )}
      </div>
    </div>
  )
}

/** Primer paso: de dónde salen las tareas y —si no vino decidido— a qué hito entran. */
function PasoElegir ({
  origenes,
  hitos,
  hitoFijo,
  candidatos,
  busqueda,
  origenId,
  hitoId,
  enCurso,
  onBusqueda,
  onOrigen,
  onHito,
  onReintentar
}: {
  origenes: Carga<ProyectoCandidato[]>
  hitos: Carga<HitoDestino[]>
  hitoFijo?: HitoDestino
  candidatos: ProyectoCandidato[]
  busqueda: string
  origenId: number | null
  hitoId: number | null
  enCurso: boolean
  onBusqueda: (texto: string) => void
  onOrigen: (id: number) => void
  onHito: (id: number) => void
  onReintentar: () => void
}): ReactElement {
  if (origenes.fase === 'error' || hitos.fase === 'error') {
    return (
      <ErrorEstado
        detalle={origenes.fase === 'error' ? origenes.mensaje : (hitos as { mensaje: string }).mensaje}
        onReintentar={onReintentar}
      />
    )
  }

  if (origenes.fase === 'cargando' || hitos.fase === 'cargando') {
    return <Cargando alto="min-h-32" mensaje="Buscando…" />
  }

  return (
    <div className="flex flex-col gap-4">
      <Campo etiqueta={`Buscar el ${GLOSARIO.espacio.singular.toLowerCase()} de origen`}>
        {(props) => (
          <Entrada
            value={busqueda}
            onChange={(evento) => { onBusqueda(evento.target.value) }}
            placeholder="Parte del nombre"
            disabled={enCurso}
            {...props}
          />
        )}
      </Campo>

      {candidatos.length === 0
        ? (
          <p className="text-texto-sutil px-1 py-6 text-center text-xs">
            {origenes.datos.length <= 1
              ? `No hay otro ${GLOSARIO.espacio.singular.toLowerCase()} del que traer ${GLOSARIO.proceso.plural.toLowerCase()}.`
              : 'Ninguno coincide con lo que escribiste.'}
          </p>
          )
        : (
          <ul className="border-linea rounded-tarjeta flex max-h-56 flex-col divide-y divide-linea overflow-y-auto border">
            {candidatos.map((proyecto) => (
              <li key={proyecto.id}>
                <Boton
                  variante={proyecto.id === origenId ? 'secundario' : 'sutil'}
                  disabled={enCurso}
                  className="w-full justify-start rounded-none text-left"
                  onClick={() => { onOrigen(proyecto.id) }}
                >
                  {proyecto.name}
                  {proyecto.archived === true && (
                    <span className="text-texto-sutil ml-2 text-xs">(archivado)</span>
                  )}
                </Boton>
              </li>
            ))}
          </ul>
          )}

      {hitoFijo === undefined
        ? (
          <Campo etiqueta={`${GLOSARIO.hito.singular} de destino`} requerido>
            {(props) => (
              <Selector
                value={hitoId === null ? undefined : String(hitoId)}
                onValueChange={(valor) => { onHito(Number(valor)) }}
                disabled={enCurso}
              >
                <DisparadorSelector
                  marcador={hitos.datos.length === 0
                    ? `Este ${GLOSARIO.espacio.singular.toLowerCase()} no tiene ${GLOSARIO.hito.plural.toLowerCase()}`
                    : `Elegí un ${GLOSARIO.hito.singular.toLowerCase()}`}
                  id={props.id}
                />
                <ContenidoSelector>
                  {hitos.datos.map((hito) => (
                    <Opcion key={hito.id} value={String(hito.id)}>{hito.name}</Opcion>
                  ))}
                </ContenidoSelector>
              </Selector>
            )}
          </Campo>
          )
        : (
          <p className="text-texto-sutil text-xs">
            Entran a <strong className="text-texto font-medium">{hitoFijo.name}</strong>.
          </p>
          )}
    </div>
  )
}

/** Segundo paso: qué dice el informe de verificación. */
function PasoInforme ({ informe }: { informe: InformeImportacion | null }): ReactElement {
  if (informe === null) return <Cargando alto="min-h-32" mensaje="Comprobando…" />

  return (
    <div className="flex flex-col gap-3">
      <p className={informe.listo ? 'text-sm' : 'text-texto-sutil text-sm'} role="status">
        {resumenDelInforme(informe)}
      </p>

      {informe.diferencias.length > 0 && (
        <div className="border-linea rounded-tarjeta max-h-56 overflow-auto border">
          <table className="w-full text-left text-xs">
            <thead className="text-texto-sutil border-linea border-b">
              <tr>
                <th scope="col" className="px-2 py-1 font-medium">{GLOSARIO.proceso.singular}</th>
                <th scope="col" className="px-2 py-1 font-medium">Dato</th>
                <th scope="col" className="px-2 py-1 font-medium">Original</th>
                <th scope="col" className="px-2 py-1 font-medium">Copia</th>
              </tr>
            </thead>
            <tbody className="divide-linea divide-y">
              {informe.diferencias.map((diferencia) => (
                <tr key={`${diferencia.tarea_origen}-${diferencia.campo}`}>
                  <td className="px-2 py-1">{diferencia.nombre}</td>
                  <td className="px-2 py-1 font-mono">{diferencia.campo}</td>
                  <td className="px-2 py-1">{diferencia.origen}</td>
                  <td className="text-texto-peligro px-2 py-1">{diferencia.copia}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/** Mensaje legible de un fallo de red o de contrato. */
function mensajeDe (fallo: unknown): string {
  return fallo instanceof Error ? fallo.message : 'No se pudo contactar al servidor.'
}
