'use client'

import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react'
import { AvisoEnLinea, Cargando, ErrorEstado, Vacio } from '@/componentes/estado/Estados'
import { useAviso } from '@/componentes/estado/useAviso'
import { Boton } from '@/componentes/formularios/Boton'
import { Campo } from '@/componentes/formularios/Campo'
import { Entrada } from '@/componentes/formularios/Entrada'
import { SelectorBuscable } from '@/componentes/formularios/Selector'
import { ContenidoDialogo, Dialogo } from '@/componentes/superposiciones/Dialogo'
import { confirmacionCoincideCon } from '@/dominio/confirmar-borrado'
import {
  DIAS_PARA_DESHACER,
  PALABRA_DE_FUSION,
  eleccionesIniciales,
  nombreDeEntidadFusionable,
  puedeConfirmarFusion,
  salidaDelOrigen,
  totalDeFilas,
  type EleccionesDeFusion,
  type EntidadFusionable,
  type LadoDeFusion,
  type OpcionDeDestino,
  type PrevisualizacionDeFusion,
  type ReferenciaDeFusion
} from '@/dominio/fusion'
import { cargarDestinos, cargarPrevia, ejecutarFusion } from './llamadas'
import { VistaPreviaDeFusion } from './VistaPreviaDeFusion'

/** Los tres pasos, en orden. */
type Paso = 'destino' | 'previa' | 'confirmar'

const PASOS: ReadonlyArray<{ clave: Paso, titulo: string }> = [
  { clave: 'destino', titulo: 'Elige con cuál fusionar' },
  { clave: 'previa', titulo: 'Revisa qué cambia' },
  { clave: 'confirmar', titulo: 'Confirma la fusión' }
]

/** Una carga que puede estar en curso, haber fallado o haber llegado. */
type Carga<T> =
  | { estado: 'cargando' }
  | { estado: 'error', mensaje: string }
  | { estado: 'listo', datos: T }

interface PropsDialogoFusion {
  entidad: EntidadFusionable
  /** Lo que se fusiona: queda en la Papelera y su contenido pasa al destino. */
  origen: ReferenciaDeFusion
  abierto: boolean
  onCerrar: () => void
  /** Se llama cuando la fusion se hizo, con el destino que quedo: quien llama decide como refrescar. */
  onFusionado: (destino: ReferenciaDeFusion) => void
}

/**
 * Fusionar una entidad con otra, en tres pasos: elegir el destino, revisar la vista previa y
 * confirmar escribiendo la palabra.
 *
 * Es un solo dialogo y no tres: el origen y el destino se tienen que ver en los tres pasos, y cerrar
 * uno para abrir el siguiente le haria perder a la persona el hilo (y el foco). Mientras la fusion
 * esta en curso no se cierra por ningun lado.
 *
 * @param entidad cual de las tres entidades es
 * @param origen el que se fusiona
 * @param abierto si el dialogo esta abierto
 * @param onCerrar cierra sin fusionar
 * @param onFusionado avisa que se fusiono, con el destino
 */
export function DialogoFusion ({ entidad, origen, abierto, onCerrar, onFusionado }: PropsDialogoFusion): ReactElement {
  const [ocupado, setOcupado] = useState(false)
  const nombre = nombreDeEntidadFusionable(entidad).toLowerCase()

  return (
    <Dialogo open={abierto} onOpenChange={(siguiente) => { if (!siguiente && !ocupado) onCerrar() }}>
      <ContenidoDialogo
        ancho="grande"
        titulo={`Fusionar ${nombre}`}
        descripcion={`Se fusiona «${origen.nombre}» con otro ${nombre}.`}
        onEscapeKeyDown={(evento) => { if (ocupado) evento.preventDefault() }}
        onInteractOutside={(evento) => { if (ocupado) evento.preventDefault() }}
      >
        <Asistente
          entidad={entidad}
          origen={origen}
          onOcupado={setOcupado}
          onCerrar={onCerrar}
          onFusionado={onFusionado}
        />
      </ContenidoDialogo>
    </Dialogo>
  )
}

/**
 * El cuerpo del dialogo. Separado para que Radix lo desmonte al cerrar y el estado nazca de cero cada
 * vez que se abre.
 */
function Asistente ({ entidad, origen, onOcupado, onCerrar, onFusionado }: Omit<PropsDialogoFusion, 'abierto'> & {
  onOcupado: (ocupado: boolean) => void
}): ReactElement {
  const aviso = useAviso()
  const [paso, setPaso] = useState<Paso>('destino')
  const [destinos, setDestinos] = useState<Carga<OpcionDeDestino[]>>({ estado: 'cargando' })
  const [intento, setIntento] = useState(0)
  const [destinoId, setDestinoId] = useState('')
  const [previa, setPrevia] = useState<Carga<PrevisualizacionDeFusion>>({ estado: 'cargando' })
  const [elecciones, setElecciones] = useState<EleccionesDeFusion>({})
  const [escrito, setEscrito] = useState('')
  const [enCurso, setEnCurso] = useState(false)
  const [fallo, setFallo] = useState<string | null>(null)

  const encabezado = useRef<HTMLHeadingElement>(null)
  const primerPaso = useRef(true)

  const numeroDePaso = PASOS.findIndex((p) => p.clave === paso) + 1
  const nombre = nombreDeEntidadFusionable(entidad).toLowerCase()

  // El catalogo de destinos se pide al abrir y cada vez que se aprieta "Reintentar" (`intento`).
  useEffect(() => {
    let vigente = true

    void cargarDestinos(entidad, origen.id).then((resultado) => {
      if (!vigente) return

      setDestinos(resultado.ok ? { estado: 'listo', datos: resultado.datos } : { estado: 'error', mensaje: resultado.mensaje })
    })

    return () => { vigente = false }
  }, [entidad, origen.id, intento])

  /** Vuelve a pedir el catalogo de destinos. */
  function reintentarDestinos (): void {
    setDestinos({ estado: 'cargando' })
    setIntento((n) => n + 1)
  }

  // Al cambiar de paso el foco pasa al encabezado: sin esto, el boton que se apreto desaparece y el
  // foco cae al <body>, que es justo donde quien navega con teclado o lector de pantalla se pierde.
  useEffect(() => {
    if (primerPaso.current) {
      primerPaso.current = false
      return
    }

    encabezado.current?.focus()
  }, [paso])

  const elegir = useCallback((campo: string, lado: LadoDeFusion): void => {
    setElecciones((actuales) => ({ ...actuales, [campo]: lado }))
  }, [])

  /** Pide la vista previa del par elegido y pasa al segundo paso. */
  async function revisar (): Promise<void> {
    setPaso('previa')
    setPrevia({ estado: 'cargando' })

    const resultado = await cargarPrevia(entidad, origen.id, Number(destinoId))

    if (!resultado.ok) {
      setPrevia({ estado: 'error', mensaje: resultado.mensaje })
      return
    }

    setElecciones(eleccionesIniciales(resultado.datos.conflictos))
    setPrevia({ estado: 'listo', datos: resultado.datos })
  }

  /** Vuelve del segundo paso al primero conservando lo elegido. */
  function volverAlDestino (): void {
    setPaso('destino')
  }

  /** Hace la fusion. Si falla, el dialogo sigue abierto con el motivo pegado al boton. */
  async function fusionar (): Promise<void> {
    if (previa.estado !== 'listo' || enCurso || !confirmacionCoincideCon(PALABRA_DE_FUSION, escrito)) return

    const { destino } = previa.datos

    setEnCurso(true)
    onOcupado(true)
    setFallo(null)

    const resultado = await ejecutarFusion(entidad, origen.id, destino.id, elecciones)

    setEnCurso(false)
    onOcupado(false)

    if (!resultado.ok) {
      setFallo(resultado.mensaje)
      return
    }

    aviso.exito(
      `«${origen.nombre}» se fusionó con «${destino.nombre}». Puedes deshacerlo durante ${DIAS_PARA_DESHACER} días desde Fusiones.`
    )
    onFusionado(destino)
    onCerrar()
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-texto-sutil text-xs">Paso {numeroDePaso} de {PASOS.length}</p>
        <h3 ref={encabezado} tabIndex={-1} className="text-texto text-base font-semibold outline-none">
          {PASOS[numeroDePaso - 1]?.titulo}
        </h3>
      </div>

      {paso === 'destino' && (
        <PasoDestino
          nombre={nombre}
          plural={nombreDeEntidadFusionable(entidad, true).toLowerCase()}
          destinos={destinos}
          valor={destinoId}
          onElegir={setDestinoId}
          onReintentar={reintentarDestinos}
          onCancelar={onCerrar}
          onContinuar={() => { void revisar() }}
        />
      )}

      {paso === 'previa' && (
        <PasoPrevia
          entidad={entidad}
          previa={previa}
          elecciones={elecciones}
          onElegir={elegir}
          onVolver={volverAlDestino}
          onReintentar={() => { void revisar() }}
          onContinuar={() => { setEscrito(''); setFallo(null); setPaso('confirmar') }}
        />
      )}

      {paso === 'confirmar' && previa.estado === 'listo' && (
        <PasoConfirmar
          entidad={entidad}
          previa={previa.datos}
          escrito={escrito}
          enCurso={enCurso}
          fallo={fallo}
          onEscribir={setEscrito}
          onVolver={() => { setPaso('previa') }}
          onConfirmar={() => { void fusionar() }}
        />
      )}
    </div>
  )
}

/** Primer paso: elegir con cual se fusiona. */
function PasoDestino ({ nombre, plural, destinos, valor, onElegir, onReintentar, onCancelar, onContinuar }: {
  nombre: string
  plural: string
  destinos: Carga<OpcionDeDestino[]>
  valor: string
  onElegir: (valor: string) => void
  onReintentar: () => void
  onCancelar: () => void
  onContinuar: () => void
}): ReactElement {
  if (destinos.estado === 'cargando') return <Cargando alto="min-h-40" mensaje={`Cargando ${plural}…`} />

  if (destinos.estado === 'error') {
    return <ErrorEstado detalle={destinos.mensaje} onReintentar={onReintentar} />
  }

  if (destinos.datos.length === 0) {
    return (
      <>
        <Vacio titulo={`No hay otro ${nombre}`} descripcion={`Hace falta al menos otro ${nombre} para poder fusionar.`} />
        <div className="flex justify-end">
          <Boton variante="sutil" onClick={onCancelar}>Cerrar</Boton>
        </div>
      </>
    )
  }

  return (
    <>
      <Campo
        etiqueta={`Fusionar con este ${nombre}`}
        ayuda="Lo que cuelga del actual pasa a este. Lo ves en el paso siguiente, antes de confirmar."
        requerido
      >
        {(props) => (
          <SelectorBuscable
            id={props.id}
            valor={valor}
            onElegir={onElegir}
            opciones={destinos.datos.map((destino) => ({ valor: destino.valor, etiqueta: destino.etiqueta }))}
            marcador={`Elige un ${nombre}`}
            nombre={nombre}
          />
        )}
      </Campo>

      <div className="flex justify-end gap-2">
        <Boton variante="sutil" onClick={onCancelar}>Cancelar</Boton>
        <Boton variante="primario" disabled={valor === ''} onClick={onContinuar}>Continuar</Boton>
      </div>
    </>
  )
}

/** Segundo paso: la vista previa, con sus estados de carga y de error. */
function PasoPrevia ({ entidad, previa, elecciones, onElegir, onVolver, onReintentar, onContinuar }: {
  entidad: EntidadFusionable
  previa: Carga<PrevisualizacionDeFusion>
  elecciones: EleccionesDeFusion
  onElegir: (campo: string, lado: LadoDeFusion) => void
  onVolver: () => void
  onReintentar: () => void
  onContinuar: () => void
}): ReactElement {
  return (
    <>
      {previa.estado === 'cargando' && <Cargando alto="min-h-48" mensaje="Calculando qué cambiaría…" />}

      {previa.estado === 'error' && <ErrorEstado detalle={previa.mensaje} onReintentar={onReintentar} />}

      {previa.estado === 'listo' && (
        <VistaPreviaDeFusion entidad={entidad} previa={previa.datos} elecciones={elecciones} onElegir={onElegir} />
      )}

      <div className="flex justify-end gap-2">
        <Boton variante="sutil" onClick={onVolver}>Volver</Boton>
        <Boton
          variante="primario"
          disabled={previa.estado !== 'listo' || !puedeConfirmarFusion(previa.datos)}
          onClick={onContinuar}
        >
          Continuar
        </Boton>
      </div>
    </>
  )
}

/** Tercer paso: lo que se va a hacer, dicho una vez mas, y la palabra para confirmarlo. */
function PasoConfirmar ({ entidad, previa, escrito, enCurso, fallo, onEscribir, onVolver, onConfirmar }: {
  entidad: EntidadFusionable
  previa: PrevisualizacionDeFusion
  escrito: string
  enCurso: boolean
  fallo: string | null
  onEscribir: (texto: string) => void
  onVolver: () => void
  onConfirmar: () => void
}): ReactElement {
  const filas = totalDeFilas(previa.conteos)

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(evento) => { evento.preventDefault(); onConfirmar() }}
    >
      <p className="text-sm">
        <span className="font-medium">{previa.origen.nombre}</span> se fusiona dentro de{' '}
        <span className="font-medium">{previa.destino.nombre}</span>
        {filas > 0 ? ` y le pasa ${filas === 1 ? '1 registro' : `${filas} registros`}` : ''}.
        El origen {salidaDelOrigen(entidad)} y puedes deshacer la fusión durante {DIAS_PARA_DESHACER} días desde Fusiones.
      </p>

      <Campo etiqueta={`Escribe «${PALABRA_DE_FUSION}» para confirmar`} requerido>
        {(props) => (
          <Entrada
            {...props}
            value={escrito}
            autoComplete="off"
            disabled={enCurso}
            onChange={(evento) => { onEscribir(evento.target.value) }}
          />
        )}
      </Campo>

      {fallo !== null && <AvisoEnLinea variante="error" mensaje={fallo} className="text-sm" />}

      <div className="flex justify-end gap-2">
        <Boton variante="sutil" disabled={enCurso} onClick={onVolver}>Volver</Boton>
        <Boton
          type="submit"
          variante="peligro"
          cargando={enCurso}
          disabled={enCurso || !confirmacionCoincideCon(PALABRA_DE_FUSION, escrito)}
        >
          Fusionar
        </Boton>
      </div>
    </form>
  )
}
