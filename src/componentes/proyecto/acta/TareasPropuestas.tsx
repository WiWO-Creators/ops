'use client'

import { useId, useState, type ReactElement } from 'react'
import { ChevronDown, Sparkles } from 'lucide-react'
import { AvisoEnLinea } from '@/componentes/estado/Estados'
import { Boton } from '@/componentes/formularios/Boton'
import { Plegable } from '@/componentes/estructura/Plegable'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { ConfirmarBorrado, useConfirmarBorrado } from '@/componentes/datos/ConfirmarBorrado'
import { cn } from '@/lib/clases'
import type { PropuestaDeTarea } from '@/definiciones/actas'
import { DialogoDePropuesta } from './DialogoDePropuesta'
import { ListaDePropuestas } from './ListaDePropuestas'
import { useCatalogosDePropuestas } from './useCatalogosDePropuestas'
import { usePropuestasDelActa } from './usePropuestasDelActa'
import { useTraerALaVista } from './useTraerALaVista'

/**
 * Las tareas que el modelo leyó dentro de un Meeting Paper y todavía no son Procesos.
 *
 * === POR QUÉ SON PROPUESTAS Y NO TAREAS ===
 *
 * Lo que un acta dice —"Juan manda la propuesta el viernes"— se parece a una Tarea pero no lo es:
 * lo escribió un modelo a partir de lo que alguien dijo en una reunión, y crearlo directo en el
 * tablero llenaría el Espacio de Procesos que nadie revisó, con responsables inventados y fechas que
 * la reunión nunca fijó. Acá viven aparte, con su propio estado, hasta que una persona del equipo
 * las mira, las corrige y decide cuáles existen de verdad.
 *
 * Por eso la fila se edita **antes** de crear y no después: corregir el título de un Proceso ya
 * creado obliga a abrirlo, y descartar uno mal propuesto obliga a borrarlo, que deja rastro en la
 * actividad del Espacio. Una propuesta descartada no llegó a ser nada.
 *
 * === LO QUE EL MODELO NO PUDO RESOLVER SE DICE, NO SE ESCONDE ===
 *
 * `no_resuelto` es la lista de campos que el acta nombró y el catálogo no reconoció: un "Juan" que
 * no está en el equipo, una etiqueta que no existe. Esos campos llegan vacíos, y una fila con el
 * responsable en blanco y sin explicación se lee como un descuido del modelo. Dicho al lado, es una
 * instrucción: falta completarlo a mano.
 *
 * === SE MONTA SOLO DONDE EL RECURSO EXISTE ===
 *
 * La ruta entra por prop y ya viene resuelta: `fuente.actaTareas` es `null` en el portal —proponer y
 * crear Procesos es trabajo del equipo—, así que allí la sección ni se dibuja y no hay ninguna rama
 * por sujeto acá adentro. Ver `dominio/fuente-proyecto.ts`.
 */

interface PropsTareasPropuestas {
  /** Ruta del recurso, con el id del acta ya resuelto. Sin barra inicial: la pone el BFF. */
  ruta: string
  /** Catálogos, para traducir la prioridad a su nombre y su color. Sale de la fuente. */
  rutaLookups: string
  /** El Espacio al que pertenece el acta: arma el enlace a la Tarea creada y la ruta de la IA. */
  proyectoId: number
  /** El acta de la que salieron. Va en el cuerpo de "Analizar buscando tareas". */
  actaId: number
  /**
   * Crear, editar y descartar propuestas. Es la capacidad `create` sobre Procesos, no sobre el acta:
   * lo que esta sección produce son Tareas. Sin ella la sección queda en solo lectura.
   */
  puedeCrear: boolean
  /** Si la capa de IA responde. Con ella apagada, `/ia/*` da 404 y analizar no se ofrece. */
  conIa: boolean
  /**
   * El acta se acaba de generar. Las propuestas ya vienen calculadas —el backend las guarda antes
   * de cerrar el stream—, así que la sección se abre, se trae a la vista y dice cuántas encontró:
   * debajo de un documento de 46rem nadie las descubre solo.
   */
  destacar?: boolean
}

export function TareasPropuestas ({
  ruta,
  rutaLookups,
  proyectoId,
  actaId,
  puedeCrear,
  conIa,
  destacar = false
}: PropsTareasPropuestas): ReactElement {
  const idPanel = useId()
  /**
   * Si la sección está desplegada, o `null` mientras nadie la haya tocado.
   *
   * Con `null` manda el contenido: se abre sola cuando hay algo que mirar y se queda cerrada cuando
   * de esa acta no salió nada, que es lo que evita un bloque abierto y vacío bajo cada acta vieja.
   * Una decisión explícita gana sobre eso hasta que se cambie de acta.
   */
  const [desplegada, setDesplegada] = useState<boolean | null>(null)
  const [editando, setEditando] = useState<PropuestaDeTarea | null>(null)
  const [confirmandoTodas, setConfirmandoTodas] = useState(false)
  const confirmarReanalisis = useConfirmarBorrado()

  const propuestas = usePropuestasDelActa({ ruta, proyectoId, actaId, onAnalizada: () => { setDesplegada(true) } })
  const { carga, pendientes, creadas, hayPendientes, sinAnalizar, error, aviso, enCurso } = propuestas
  const { prioridades, personas, errorEquipo } = useCatalogosDePropuestas(hayPendientes && puedeCrear, rutaLookups)
  const seccion = useTraerALaVista<HTMLElement>(destacar, carga.fase === 'listo')

  /** Pedir propuestas nuevas gasta IA y escribe: las mismas dos condiciones que el resto de la pantalla. */
  const puedeProponer = puedeCrear && conIa
  const abierta = desplegada ?? (hayPendientes || creadas.length > 0 || destacar || (sinAnalizar && puedeProponer))

  /**
   * El botón de abajo: crea lo marcado o, si no hay nada marcado, todas las pendientes.
   *
   * Sin selección no queda deshabilitado —antes lo estaba, y un botón gris sin explicación no dice
   * que hacía falta marcar casillas—. Crear todas de una vez sí se confirma: son varias Tareas que
   * aparecen en el tablero del Espacio y deshacerlo es borrarlas una por una.
   */
  function crearTanda (): void {
    if (propuestas.seleccionadas.length > 0) {
      void propuestas.crear(propuestas.seleccionadas, null)

      return
    }

    setConfirmandoTodas(true)
  }

  /** Segundo paso de "Crear todas": crea las pendientes que haya en ese momento. */
  function crearTodas (): void {
    setConfirmandoTodas(false)
    void propuestas.crear(pendientes.map((propuesta) => propuesta.id), null)
  }

  /** Vuelve a analizar. Con propuestas pendientes, pregunta antes: se pierden las que ya se corrigieron. */
  function proponer (): void {
    if (hayPendientes) {
      confirmarReanalisis.abrir()
      return
    }

    void propuestas.analizar()
  }

  return (
    <section ref={seccion} className="flex scroll-mt-6 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => { setDesplegada(!abierta) }}
          aria-expanded={abierta}
          aria-controls={carga.fase === 'listo' ? idPanel : undefined}
          className="text-texto rounded-control hover:bg-hover ease-neo -ml-1.5 flex cursor-pointer items-center gap-2 p-1.5 text-sm font-semibold transition-colors duration-rapida"
        >
          <ChevronDown
            size={16}
            strokeWidth={2}
            aria-hidden="true"
            className={cn('text-texto-sutil ease-neo shrink-0 transition-transform duration-rapida', !abierta && '-rotate-90')}
          />
          Tareas propuestas
          {hayPendientes && (
            <Insignia tono="acento" tamano="chico">
              {pendientes.length === 1 ? '1 pendiente' : `${pendientes.length} pendientes`}
            </Insignia>
          )}
        </button>

        {puedeProponer && carga.fase === 'listo' && (
          <Boton
            variante={sinAnalizar ? 'primario' : 'sutil'}
            tamano="chico"
            cargando={enCurso?.que === 'proponiendo'}
            disabled={enCurso !== null}
            onClick={proponer}
          >
            <Sparkles size={14} strokeWidth={2} aria-hidden="true" className="shrink-0" />
            {sinAnalizar ? 'Analizar buscando tareas' : 'Volver a analizar'}
          </Boton>
        )}
      </div>

      {error !== null && (
        <AvisoEnLinea variante="error" mensaje={error} className="bg-superficie-peligro rounded-chico px-3 py-2 text-sm" />
      )}

      {aviso !== null && (
        <p role="status" className="border-linea bg-superficie-acentuada rounded-chico border px-3 py-2 text-sm">
          {aviso}
        </p>
      )}

      {enCurso?.que === 'proponiendo' && (
        <p role="status" className="text-texto-sutil text-sm">
          Analizando el Meeting Paper con IA… puede tardar unos segundos.
        </p>
      )}

      {destacar && carga.fase === 'listo' && hayPendientes && (
        <p role="status" className="border-linea bg-superficie-acentuada rounded-chico border px-3 py-2 text-sm">
          La IA encontró {pendientes.length === 1 ? '1 tarea' : `${pendientes.length} tareas`} en este
          Meeting Paper. Revísalas, corrige lo que haga falta y crea las que correspondan.
        </p>
      )}

      {carga.fase === 'cargando' && (
        <p role="status" className="text-texto-sutil text-sm">
          Buscando las tareas de este Meeting Paper…
        </p>
      )}

      {carga.fase === 'error' && (
        <div className="bg-superficie-peligro rounded-chico flex flex-wrap items-center gap-3 px-3 py-2">
          <AvisoEnLinea variante="error" mensaje={carga.mensaje} className="text-sm" />
          <Boton variante="sutil" tamano="chico" onClick={propuestas.reintentar}>
            Reintentar
          </Boton>
        </div>
      )}

      {/* `-mt-3` devuelve el `gap-3` de la seccion y `pt-3` lo repone adentro: plegado, el panel
          queda con alto cero y no deja hueco al pie. */}
      {carga.fase === 'listo' && (
        <Plegable id={idPanel} abierto={abierta} className="-mt-3" claseContenido="flex flex-col gap-3 pt-3">
          <ListaDePropuestas
            propuestas={propuestas}
            prioridades={prioridades}
            proyectoId={proyectoId}
            puedeCrear={puedeCrear}
            puedeProponer={puedeProponer}
            confirmandoTodas={confirmandoTodas}
            onEditar={setEditando}
            onCrearTanda={crearTanda}
            onCrearTodas={crearTodas}
            onCancelarTodas={() => { setConfirmandoTodas(false) }}
          />
        </Plegable>
      )}

      {editando !== null && (
        <DialogoDePropuesta
          propuesta={editando}
          personas={personas}
          errorEquipo={errorEquipo}
          prioridades={prioridades}
          onGuardar={async (parche) => await propuestas.parchear(editando.id, parche)}
          onCerrar={() => { setEditando(null) }}
        />
      )}

      <ConfirmarBorrado
        abierto={confirmarReanalisis.abierto}
        onCerrar={confirmarReanalisis.cerrar}
        tamano="chico"
        titulo="Volver a analizar"
        advertencia="Reemplaza las tareas pendientes de este Meeting Paper, incluidas las que ya corregiste."
        etiquetaConfirmar="Analizar de nuevo"
        onConfirmar={propuestas.analizar}
      />
    </section>
  )
}
