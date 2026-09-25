'use client'

import { useEffect, useState, type ReactElement } from 'react'
import { Boton } from '@/componentes/formularios/Boton'
import { Campo } from '@/componentes/formularios/Campo'
import { Entrada } from '@/componentes/formularios/Entrada'
import { Segmentado } from '@/componentes/formularios/Segmentado'
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
  hitoDelInforme,
  LARGO_MAXIMO_HITO,
  OPCIONES_MODO_HITO,
  previsualizarHitoNuevo,
  resumenDelInforme,
  rutaHitosDestino,
  rutaImportar,
  rutaInforme,
  validarImportacion,
  type EleccionHito,
  type HitoDestino,
  type InformeImportacion,
  type ProyectoCandidato
} from './importar-tareas'

/**
 * Trae las tareas de otro Proyecto a este, deja comprobar la copia y archiva el viejo.
 *
 * DONDE QUEDAN. Por defecto sueltas en el Proyecto, sin Hito: cada copia guarda por escrito de que
 * Proyecto vino, asi que agruparlas ya no es la unica forma de saber de donde salieron. Si se
 * quieren agrupar, se elige un Hito existente o se escribe el nombre de uno nuevo, que el backend
 * crea en la misma operacion.
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

/** Modo del selector de destino. */
type ModoHito = EleccionHito['modo']

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
          + `${GLOSARIO.espacio.singular.toLowerCase()} que elijas a "${destino.name}", y cada una guarda `
          + 'de dónde vino. Las originales no se tocan: primero comprobás que la copia quedó igual y '
          + 'recién después archivás el viejo.'}
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
  const [modoHito, setModoHito] = useState<ModoHito>(hitoFijo === undefined ? 'ninguno' : 'existente')
  const [hitoId, setHitoId] = useState<number | null>(hitoFijo?.id ?? null)
  const [nombreHito, setNombreHito] = useState('')
  const [informe, setInforme] = useState<InformeImportacion | null>(null)
  const [enCurso, setEnCurso] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [intento, setIntento] = useState(0)

  const [origenes, setOrigenes] = useState<Carga<ProyectoCandidato[]>>({ fase: 'cargando' })
  const [hitos, setHitos] = useState<Carga<HitoDestino[]>>(
    hitoFijo === undefined ? { fase: 'cargando' } : { fase: 'listo', datos: [hitoFijo] }
  )

  // Los tres valores viven por separado para que cambiar de modo y volver no borre lo ya elegido o
  // escrito; la eleccion que viaja se arma de ellos en cada render.
  const eleccion: EleccionHito = modoHito === 'existente'
    ? { modo: 'existente', hitoId }
    : modoHito === 'nuevo'
      ? { modo: 'nuevo', nombre: nombreHito }
      : { modo: 'ninguno' }

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
    const invalido = validarImportacion(origenId, destino.id, eleccion)

    if (invalido !== null) {
      setError(invalido)
      return
    }

    marcarEnCurso(true)
    setError(null)

    try {
      const sobre = await pedirSobre<InformeImportacion>(
        rutaInforme(destino.id, origenId as number, hitoDelInforme(eleccion)),
        new AbortController().signal
      )

      setInforme(eleccion.modo === 'nuevo' ? previsualizarHitoNuevo(sobre.data, eleccion.nombre) : sobre.data)
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
   *
   * Si el Hito era nuevo, desde aca pasa a ser un Hito existente: "Volver a comprobar" y un segundo
   * "Importar" tienen que apuntar al que se acaba de crear, no crear otro con el mismo nombre.
   */
  async function importar (): Promise<void> {
    if (origenId === null || validarImportacion(origenId, destino.id, eleccion) !== null) return

    marcarEnCurso(true)
    setError(null)

    const respuesta = await escribirEnBff<InformeImportacion>(
      rutaImportar(destino.id),
      'POST',
      cuerpoDeImportacion(origenId, eleccion)
    )

    marcarEnCurso(false)

    if (!respuesta.ok) {
      setError(respuesta.mensaje)
      return
    }

    const creado = respuesta.datos.hito
    if (eleccion.modo === 'nuevo' && creado !== null) {
      setHitos((actual) => actual.fase === 'listo'
        ? { fase: 'listo', datos: [...actual.datos, { id: creado.id, name: creado.nombre }] }
        : actual)
      setHitoId(creado.id)
      setModoHito('existente')
      setNombreHito('')
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
            destino={destino}
            modoHito={modoHito}
            hitoId={hitoId}
            nombreHito={nombreHito}
            enCurso={enCurso}
            onBusqueda={setBusqueda}
            onOrigen={(id) => { setOrigenId(id); setError(null) }}
            onModoHito={(modo) => { setModoHito(modo); setError(null) }}
            onHito={(id) => { setHitoId(id); setError(null) }}
            onNombreHito={(nombre) => { setNombreHito(nombre); setError(null) }}
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

/** Primer paso: de dónde salen las tareas y, si no vino decidido, dónde quedan. */
function PasoElegir ({
  origenes,
  hitos,
  hitoFijo,
  candidatos,
  busqueda,
  origenId,
  destino,
  modoHito,
  hitoId,
  nombreHito,
  enCurso,
  onBusqueda,
  onOrigen,
  onModoHito,
  onHito,
  onNombreHito,
  onReintentar
}: {
  origenes: Carga<ProyectoCandidato[]>
  hitos: Carga<HitoDestino[]>
  hitoFijo?: HitoDestino
  candidatos: ProyectoCandidato[]
  busqueda: string
  origenId: number | null
  destino: { id: number, name: string }
  modoHito: ModoHito
  hitoId: number | null
  nombreHito: string
  enCurso: boolean
  onBusqueda: (texto: string) => void
  onOrigen: (id: number) => void
  onModoHito: (modo: ModoHito) => void
  onHito: (id: number) => void
  onNombreHito: (nombre: string) => void
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
          <DestinoDeLasTareas
            destino={destino}
            hitos={hitos.datos}
            modo={modoHito}
            hitoId={hitoId}
            nombre={nombreHito}
            enCurso={enCurso}
            onModo={onModoHito}
            onHito={onHito}
            onNombre={onNombreHito}
          />
          )
        : (
          <p className="text-texto-sutil text-xs">
            Entran a <strong className="text-texto font-medium">{hitoFijo.name}</strong>.
          </p>
          )}
    </div>
  )
}

/**
 * Dónde quedan las tareas: sueltas, en un Hito que ya existe o en uno que se crea al importar.
 *
 * Un control segmentado y no un selector con "Crear nuevo…" adentro: las tres salidas son
 * decisiones del mismo peso, y esconder dos detrás de un desplegable hacía que "sin hito" pareciera
 * un olvido en vez de una opción.
 */
function DestinoDeLasTareas ({
  destino,
  hitos,
  modo,
  hitoId,
  nombre,
  enCurso,
  onModo,
  onHito,
  onNombre
}: {
  destino: { id: number, name: string }
  hitos: HitoDestino[]
  modo: ModoHito
  hitoId: number | null
  nombre: string
  enCurso: boolean
  onModo: (modo: ModoHito) => void
  onHito: (id: number) => void
  onNombre: (nombre: string) => void
}): ReactElement {
  /** Solo acepta los tres modos conocidos: el control entrega texto. */
  function elegir (valor: string): void {
    const opcion = OPCIONES_MODO_HITO.find((candidata) => candidata.valor === valor)
    if (opcion !== undefined) onModo(opcion.valor)
  }

  return (
    <fieldset className="flex flex-col gap-2" disabled={enCurso}>
      <legend className="text-texto mb-1.5 text-sm font-medium">Dónde quedan</legend>

      <Segmentado
        etiqueta="Dónde quedan las tareas importadas"
        etiquetaVisible={false}
        tamano="chico"
        activo={modo}
        onElegir={elegir}
        opciones={OPCIONES_MODO_HITO}
        className="self-start"
      />

      {modo === 'ninguno' && (
        <p className="text-texto-sutil text-xs">
          Entran sueltas en <strong className="text-texto font-medium">{destino.name}</strong>. Cada una
          muestra de qué {GLOSARIO.espacio.singular.toLowerCase()} vino.
        </p>
      )}

      {modo === 'existente' && (
        hitos.length === 0
          ? (
            <p className="text-texto-sutil text-xs">
              Este {GLOSARIO.espacio.singular.toLowerCase()} todavía no tiene {GLOSARIO.hito.plural.toLowerCase()}.{' '}
              <button
                type="button"
                className="text-texto underline underline-offset-2"
                onClick={() => { onModo('nuevo') }}
              >
                Crear uno al importar
              </button>
            </p>
            )
          : (
            <Campo etiqueta={GLOSARIO.hito.singular} requerido className="animate-entrar-abajo">
              {(props) => (
                <Selector
                  value={hitoId === null ? undefined : String(hitoId)}
                  onValueChange={(valor) => { onHito(Number(valor)) }}
                  disabled={enCurso}
                >
                  <DisparadorSelector marcador={`Elegí un ${GLOSARIO.hito.singular.toLowerCase()}`} id={props.id} />
                  <ContenidoSelector>
                    {hitos.map((hito) => (
                      <Opcion key={hito.id} value={String(hito.id)}>{hito.name}</Opcion>
                    ))}
                  </ContenidoSelector>
                </Selector>
              )}
            </Campo>
            )
      )}

      {modo === 'nuevo' && (
        <Campo
          etiqueta={`Nombre del ${GLOSARIO.hito.singular.toLowerCase()}`}
          ayuda="Se crea al importar. Sus fechas salen de las tareas que entran."
          requerido
          className="animate-entrar-abajo"
        >
          {(props) => (
            <Entrada
              value={nombre}
              onChange={(evento) => { onNombre(evento.target.value) }}
              placeholder="Por ejemplo, Septiembre 2026"
              maxLength={LARGO_MAXIMO_HITO}
              {...props}
            />
          )}
        </Campo>
      )}
    </fieldset>
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
