'use client'

import { useRef, useState, type ReactElement } from 'react'
import { ConfirmacionEnLinea } from '@/componentes/datos/ConfirmacionEnLinea'
import { AvisoEnLinea } from '@/componentes/estado/Estados'
import { useAviso } from '@/componentes/estado/useAviso'
import { Boton } from '@/componentes/formularios/Boton'
import { Campo } from '@/componentes/formularios/Campo'
import { EditorRico } from '@/componentes/formularios/EditorRico'
import { Entrada } from '@/componentes/formularios/Entrada'
import { EntradaFecha } from '@/componentes/formularios/EntradaFecha'
import { ContenidoSelector, DisparadorSelector, Opcion, Selector } from '@/componentes/formularios/Selector'
import type { ProcesoDeFicha } from '@/componentes/proyecto/tareas'
import { claveDeIdempotencia } from '@/datos/red'
import type { AltaDeTareas } from '@/datos/portal'
import { GLOSARIO } from '@/dominio/glosario'
import {
  CUERPO_DE_CANCELAR, CUERPO_DE_REABRIR, LARGO_NOMBRE_TAREA, PRIORIDADES_DE_TAREA, borradorDeEdicion,
  cuerpoDeEdicion, erroresDeEdicion, falloDeEdicionDeTarea, sePuedeCancelar, sePuedeEditar, sePuedeReabrir,
  type AccionSobreTarea, type BorradorDeEdicion, type CuerpoDeEdicion, type CuerpoDeEstado, type ErroresDeEdicion
} from '@/dominio/tareas-del-portal'
import { editarTareaPortal } from './tarea-portal'

/**
 * Lo que el contacto puede hacer con una Tarea suya desde el detalle: editarla, cancelarla y, si esta
 * Cancelada, reabrirla.
 *
 * Solo se monta cuando el Proyecto publica `alta_de_tareas`: mismo interruptor y mismo permiso que
 * el alta. La ficha de la Tarea la sigue pintando `DetalleTarea`; esto agrega las acciones.
 *
 * === CANCELAR NO ES ELIMINAR ===
 *
 * Cancelar deja la Tarea en el listado con el estado «Cancelada» —un estado final que el equipo ve
 * y que se puede revertir—, por eso la confirmacion lo dice con esas palabras y no usa el texto de
 * borrado. Vive en linea (`ConfirmacionEnLinea`) y no en un dialogo propio porque el detalle ya es
 * un modal.
 *
 * === ERRORES ===
 *
 * El `422` se pinta junto al campo que lo causo, con lo tipeado intacto. El `409` —la Tarea cambio de
 * estado mientras la ficha estaba abierta— se explica junto a las acciones y vuelve a pedir la ficha.
 * La API es la que decide: lo que el formulario valida antes del viaje es cortesia.
 *
 * @param tarea la ficha de la Tarea, tal como la trajo el portal
 * @param alta lo que este contacto puede hacer en el Proyecto (exige o no vencimiento)
 * @param onCambiada se llama despues de cada escritura confirmada, para que quien monta recargue la ficha
 */
export function EdicionTareaPortal ({ tarea, alta, onCambiada }: {
  tarea: ProcesoDeFicha
  alta: AltaDeTareas
  onCambiada: () => void
}): ReactElement | null {
  const avisar = useAviso()
  const [modo, setModo] = useState<'reposo' | 'editando' | 'cancelando'>('reposo')
  const [enCurso, setEnCurso] = useState(false)
  const [fallo, setFallo] = useState<string | null>(null)
  const enviando = useRef(false)
  const nombreTarea = GLOSARIO.proceso.singular

  /**
   * Cancela o reabre la Tarea con un `PATCH` de estado.
   *
   * Nunca lanza: el rechazo se muestra junto a las acciones. Un `409` recarga la ficha para que se
   * vea el estado de verdad.
   *
   * @param cuerpo el estado al que pasa
   * @param accion lo que se intentaba, para el texto del rechazo
   * @param exito el aviso de exito
   */
  async function cambiarEstado (cuerpo: CuerpoDeEstado, accion: AccionSobreTarea, exito: string): Promise<void> {
    if (enviando.current) return

    enviando.current = true
    setEnCurso(true)
    setFallo(null)

    const resultado = await editarTareaPortal(tarea.id, cuerpo)

    enviando.current = false
    setEnCurso(false)

    if (!resultado.ok) {
      const explicado = falloDeEdicionDeTarea(resultado, accion)

      setFallo(explicado.texto)
      if (explicado.recargar) {
        setModo('reposo')
        onCambiada()
      }

      return
    }

    setModo('reposo')
    avisar.exito(exito)
    onCambiada()
  }

  const puedeEditar = sePuedeEditar(tarea.status)
  const puedeCancelar = sePuedeCancelar(tarea.status)
  const puedeReabrir = sePuedeReabrir(tarea.status)

  if (!puedeEditar && !puedeCancelar && !puedeReabrir) return null

  return (
    <section aria-label={`Acciones sobre la ${nombreTarea.toLowerCase()}`} className="flex flex-col gap-3">
      {modo === 'reposo' && (
        <div className="flex flex-wrap items-center gap-2">
          {puedeEditar && (
            <Boton variante="secundario" tamano="chico" data-rastreo="tarea-portal.editar" onClick={() => { setFallo(null); setModo('editando') }}>
              Editar
            </Boton>
          )}
          {puedeCancelar && (
            <Boton variante="sutil" tamano="chico" data-rastreo="tarea-portal.cancelar-tarea" onClick={() => { setFallo(null); setModo('cancelando') }}>
              {`Cancelar ${nombreTarea.toLowerCase()}`}
            </Boton>
          )}
          {puedeReabrir && (
            <>
              <Boton
                variante="secundario"
                tamano="chico"
                data-rastreo="tarea-portal.reabrir"
                cargando={enCurso}
                onClick={() => { void cambiarEstado(CUERPO_DE_REABRIR, 'reabrir', `${nombreTarea} reabierta.`) }}
              >
                Reabrir
              </Boton>
              <span className="text-texto-tenue text-xs">
                {`Esta ${nombreTarea.toLowerCase()} está cancelada. Al reabrirla vuelve a «Por iniciar».`}
              </span>
            </>
          )}
        </div>
      )}

      {modo === 'cancelando' && (
        <ConfirmacionEnLinea
          advertencia={`Vas a cancelar esta ${nombreTarea.toLowerCase()}. No se elimina: queda en la lista como «Cancelada» y puedes reabrirla cuando quieras.`}
          etiquetaConfirmar={`Cancelar ${nombreTarea.toLowerCase()}`}
          etiquetaCancelar="Volver"
          varianteConfirmar="secundario"
          cargando={enCurso}
          onCancelar={() => { setModo('reposo') }}
          onConfirmar={() => { void cambiarEstado(CUERPO_DE_CANCELAR, 'cancelar', `${nombreTarea} cancelada.`) }}
        />
      )}

      {fallo !== null && modo !== 'editando' && <AvisoEnLinea variante="error" mensaje={fallo} className="text-sm" />}

      {modo === 'editando' && (
        <FormularioDeEdicion
          tarea={tarea}
          alta={alta}
          onCerrar={() => { setModo('reposo') }}
          onGuardada={() => {
            setModo('reposo')
            avisar.exito('Cambios guardados.')
            onCambiada()
          }}
          onDesactualizada={() => {
            setModo('reposo')
            onCambiada()
          }}
        />
      )}
    </section>
  )
}

/**
 * El formulario de edicion, sembrado con la Tarea al montarse.
 *
 * Se monta solo mientras se edita: asi arranca siempre en lo que la ficha trae y cerrar descarta lo
 * que no se guardo. La descripcion toma como base de comparacion el HTML que el editor produce al
 * abrir (`onListo`): el editor reescribe lo que recibe, y comparar contra lo que trajo la API
 * marcaria como cambiada una descripcion que nadie toco.
 *
 * @param tarea la ficha de la Tarea
 * @param alta la capacidad del Proyecto
 * @param onCerrar descarta el formulario
 * @param onGuardada se llama con el cambio ya confirmado
 * @param onDesactualizada se llama ante un `409`: la Tarea cambio de estado y hay que recargarla
 */
function FormularioDeEdicion ({ tarea, alta, onCerrar, onGuardada, onDesactualizada }: {
  tarea: ProcesoDeFicha
  alta: AltaDeTareas
  onCerrar: () => void
  onGuardada: () => void
  onDesactualizada: () => void
}): ReactElement {
  const [inicial, setInicial] = useState<BorradorDeEdicion>(() => borradorDeEdicion(tarea))
  const [borrador, setBorrador] = useState<BorradorDeEdicion>(inicial)
  const [intentado, setIntentado] = useState(false)
  const [rechazos, setRechazos] = useState<ErroresDeEdicion>({})
  const [fallo, setFallo] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const enviandoAhora = useRef(false)
  const baseTomada = useRef(false)
  const intento = useRef<{ huella: string, clave: string } | null>(null)
  const previos = intentado ? erroresDeEdicion(borrador, inicial, alta) : {}
  const errores: ErroresDeEdicion = { ...previos, ...rechazos }

  /** Cambia un campo y suelta el rechazo del servidor que le tocaba: ya no describe lo tipeado. */
  function cambiar (cambios: Partial<BorradorDeEdicion>, campo: keyof ErroresDeEdicion): void {
    setBorrador((actual) => ({ ...actual, ...cambios }))
    setRechazos((actual) => {
      const resto = { ...actual }

      delete resto[campo]

      return resto
    })
  }

  /**
   * Toma como base el HTML normalizado que el editor produce al abrir. Solo la primera vez.
   *
   * @param normalizado el HTML tal como lo serializa el editor al montarse
   */
  function fijarBase (normalizado: string): void {
    if (baseTomada.current) return

    baseTomada.current = true
    setInicial((previo) => ({ ...previo, descripcion: normalizado }))
    setBorrador((previo) => ({ ...previo, descripcion: normalizado }))
  }

  /** Guarda lo que cambio. Nunca lanza: el rechazo se muestra en el formulario, con lo tipeado intacto. */
  async function guardar (): Promise<void> {
    if (enviandoAhora.current) return

    setIntentado(true)
    if (Object.keys(erroresDeEdicion(borrador, inicial, alta)).length > 0) return

    const cuerpo: CuerpoDeEdicion = cuerpoDeEdicion(borrador, inicial)

    if (Object.keys(cuerpo).length === 0) {
      onCerrar()

      return
    }

    const huella = JSON.stringify(cuerpo)

    if (intento.current?.huella !== huella) intento.current = { huella, clave: claveDeIdempotencia() }

    enviandoAhora.current = true
    setEnviando(true)
    setFallo(null)
    setRechazos({})

    const resultado = await editarTareaPortal(tarea.id, cuerpo, intento.current.clave)

    enviandoAhora.current = false
    setEnviando(false)

    if (!resultado.ok) {
      const explicado = falloDeEdicionDeTarea(resultado, 'editar')

      setFallo(explicado.texto)
      setRechazos(explicado.campos)
      if (explicado.recargar) onDesactualizada()

      return
    }

    intento.current = null
    onGuardada()
  }

  return (
    <form
      className="border-linea rounded-tarjeta flex flex-col gap-4 border p-4"
      noValidate
      onSubmit={(evento) => {
        evento.preventDefault()
        void guardar()
      }}
    >
      <Campo etiqueta="Nombre" requerido error={errores.name}>
        {(props) => (
          <Entrada
            {...props}
            value={borrador.nombre}
            autoFocus
            maxLength={LARGO_NOMBRE_TAREA}
            onChange={(evento) => { cambiar({ nombre: evento.target.value }, 'name') }}
          />
        )}
      </Campo>

      <Campo etiqueta="Descripción" error={errores.description}>
        {(props) => (
          <EditorRico
            {...props}
            etiqueta="Descripción"
            filasMinimas={5}
            valorInicial={inicial.descripcion}
            deshabilitado={enviando}
            onListo={fijarBase}
            onCambio={(html) => { cambiar({ descripcion: html }, 'description') }}
          />
        )}
      </Campo>

      <div className="grid gap-3 sm:grid-cols-2">
        <Campo
          etiqueta="Vence"
          requerido={alta.vencimiento_requerido}
          error={errores.due_date}
          ayuda={alta.vencimiento_requerido ? undefined : 'Si la dejas vacía, queda sin fecha.'}
        >
          {(props) => (
            <EntradaFecha
              props={props}
              valor={borrador.vencimiento}
              alCambiar={(valor) => { cambiar({ vencimiento: valor }, 'due_date') }}
            />
          )}
        </Campo>

        <Campo etiqueta="Prioridad" error={errores.priority}>
          {(props) => (
            <Selector value={borrador.prioridad} onValueChange={(valor) => { cambiar({ prioridad: valor }, 'priority') }}>
              <DisparadorSelector id={props.id} />
              <ContenidoSelector>
                {PRIORIDADES_DE_TAREA.map((opcion) => (
                  <Opcion key={opcion.id} value={String(opcion.id)}>{opcion.etiqueta}</Opcion>
                ))}
              </ContenidoSelector>
            </Selector>
          )}
        </Campo>
      </div>

      {fallo !== null && <AvisoEnLinea variante="error" mensaje={fallo} className="text-sm" />}

      <div className="flex justify-end gap-2">
        <Boton type="button" variante="sutil" data-rastreo="tarea-portal.editar-cancelar" disabled={enviando} onClick={onCerrar}>
          Descartar
        </Boton>
        <Boton type="submit" variante="primario" data-rastreo="tarea-portal.editar-guardar" cargando={enviando}>
          Guardar cambios
        </Boton>
      </div>
    </form>
  )
}
