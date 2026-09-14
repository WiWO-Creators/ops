'use client'

import { useEffect, useId, useState } from 'react'
import { Plus } from 'lucide-react'
import { Boton } from '@/componentes/formularios/Boton'
import { Campo } from '@/componentes/formularios/Campo'
import { AreaTexto, Entrada } from '@/componentes/formularios/Entrada'
import { formatearDuracion } from '@/componentes/proyecto/cronometro'
import { AYUDA_DURACION, validarTimesheet } from '@/componentes/proyecto/timesheet'
import { ContenidoDialogo, Dialogo } from '@/componentes/superposiciones/Dialogo'
import { pedirSobre } from '@/datos/cliente'
import { leerError } from '@/datos/errores'
import type { ResumenDeJornada } from '@/datos/live'
import { agruparCierre, nombreDeItem, segundosDeItem } from '@/dominio/cierre-jornada'
import { GLOSARIO } from '@/dominio/glosario'
import { avisarCambioDeMedidor } from './medidor'
import { SelectorEspacio } from './SelectorEspacio'
import { SelectorTarea } from './SelectorTarea'

/**
 * El repaso obligatorio antes de cerrar la jornada.
 *
 * === POR QUE OBLIGATORIO, Y POR QUE NO ES UNA TRAMPA ===
 *
 * Cerrar la jornada era un clic sin consecuencias visibles, y con el se iba la ultima oportunidad del
 * dia de mirar el reparto del tiempo. Al dia siguiente ese reparto ya es historia: nadie vuelve a
 * abrir el dia de ayer para decir en que trabajo. Por eso el dialogo no se cierra con `Escape` ni
 * clicando fuera — los dos gestos con los que se descarta una ventana **sin leerla**.
 *
 * Salida siempre hay, y son dos botones explicitos: **Seguir trabajando** deja la jornada abierta tal
 * cual estaba, y **Confirmar cierre** la cierra. Obligatorio quiere decir que hay que decidir, no que
 * no se pueda salir.
 *
 * === EL NUMERO QUE IMPORTA ES EL QUE FALTA ===
 *
 * La jornada mide presencia declarada y los medidores miden trabajo imputado. La diferencia
 * —`uncovered_seconds`— es el tiempo que despues nadie sabe a que cargar, y es la razon de existir de
 * esta pantalla: por eso se muestra junto al total medido y no escondido al final.
 *
 * === CUANDO EL BACKEND NO ESTA ===
 *
 * `GET /me/jornada/resumen` puede fallar. Cuando falla se dice y **se deja cerrar igual**: un resumen
 * que no carga no puede dejar a nadie con la jornada abierta para siempre. El tiempo ya medido esta
 * en la base con o sin esta pantalla.
 *
 * === EL COMENTARIO ES OPCIONAL; PASAR POR AQUI NO ===
 *
 * La caja de comentarios (`<ComentarioDeCierre>`) recoge lo que no cabe en ninguna ficha de tiempo:
 * un bloqueo, una reunion que se comio la tarde, algo que retomar mañana. Se escribe **una vez por
 * dia**, no por Proceso, y por eso es un campo del dialogo y no del formulario de agregar tiempo.
 *
 * Vacia se puede cerrar igual, y es a proposito: el acuerdo pide "comentarios adicionales", no un
 * peaje. Exigir texto a las ocho de la noche produce "ok" y "nada" — ruido que despues hay que leer.
 *
 * Ojo con el otro campo "Nota" de esta misma pantalla: ese pertenece a `<AgregarTiempo>` y viaja a
 * `POST /projects/{id}/timesheets` como la nota de UNA ficha de tiempo. No son el mismo dato ni van
 * al mismo lado; este viaja en el cuerpo del `POST /me/jornada/cierre`.
 */

interface PropsCierreJornada {
  abierto: boolean
  /** "Seguir trabajando", y tambien el cierre del dialogo tras confirmar. */
  onSeguir: () => void
  /** De quien son las Tareas del formulario de agregado. */
  staffId: number
  /** `true` mientras el `POST /me/jornada/cierre` esta en vuelo. Lo maneja `ControlJornada`. */
  cerrando: boolean
  /** Por que no se pudo cerrar. Se pinta **dentro** del dialogo: encima no se ve nada mas. */
  aviso: string | null
  /** Recibe el comentario del dia ya recortado, o `null` si no se escribio nada. */
  onConfirmar: (comentario: string | null) => void
}

export function CierreJornada ({
  abierto,
  onSeguir,
  staffId,
  cerrando,
  aviso,
  onConfirmar
}: PropsCierreJornada) {
  return (
    <Dialogo open={abierto} onOpenChange={(nuevo) => { if (!nuevo) onSeguir() }}>
      <ContenidoDialogo
        titulo="Antes de cerrar la jornada"
        descripcion="Revisa en qué se fue el tiempo de hoy y agrega lo que falte."
        // Los dos gestos con los que se descarta una ventana sin leerla. Ver el docblock de arriba:
        // la salida son los botones, que obligan a decidir en vez de a descuidarse.
        onEscapeKeyDown={(evento) => { evento.preventDefault() }}
        onPointerDownOutside={(evento) => { evento.preventDefault() }}
        onInteractOutside={(evento) => { evento.preventDefault() }}
      >
        {/* Radix solo monta esto mientras el dialogo esta abierto, asi que el resumen se pide al
            abrir —ese montaje ES la peticion— y no queda un efecto vigilando `abierto`. */}
        <CuerpoCierre
          staffId={staffId}
          cerrando={cerrando}
          aviso={aviso}
          onSeguir={onSeguir}
          onConfirmar={onConfirmar}
        />
      </ContenidoDialogo>
    </Dialogo>
  )
}

/**
 * Tope del comentario, en caracteres.
 *
 * El mismo numero que `Escritura\\Jornada::COMENTARIO_CIERRE_MAXIMO` en la API, que responde 422 al
 * pasarse. Aca es `maxLength`: la validacion de verdad es la del servidor, esta solo evita que
 * alguien escriba un parrafo de mas para que se lo rechacen despues.
 */
const COMENTARIO_MAXIMO = 2000

/** A partir de cuanto escrito aparece el contador. Antes seria ruido en un campo opcional. */
const AVISAR_DESDE = COMENTARIO_MAXIMO - 200

interface PropsCuerpo {
  staffId: number
  cerrando: boolean
  aviso: string | null
  onSeguir: () => void
  onConfirmar: (comentario: string | null) => void
}

function CuerpoCierre ({ staffId, cerrando, aviso, onSeguir, onConfirmar }: PropsCuerpo) {
  const [resumen, setResumen] = useState<ResumenDeJornada | null>(null)
  const [errorResumen, setErrorResumen] = useState<string | null>(null)
  /** Se incrementa tras agregar tiempo: el resumen se vuelve a pedir en vez de parchearse a mano. */
  const [recarga, setRecarga] = useState(0)
  /**
   * El comentario del dia. Vive aca y no en `ControlJornada` porque muere con el dialogo, igual que
   * el resumen: lo que se escribio y se descarto con "Seguir trabajando" no es un borrador que
   * alguien espere encontrar mañana. Un cierre que FALLA no desmonta nada, asi que el texto sigue
   * escrito para el reintento, que es cuando de verdad importa no perderlo.
   */
  const [comentario, setComentario] = useState('')

  useEffect(() => {
    const control = new AbortController()

    pedirSobre<ResumenDeJornada>('me/jornada/resumen', control.signal)
      .then((sobre) => {
        setResumen(sobre.data)
        setErrorResumen(null)
      })
      .catch(() => {
        if (control.signal.aborted) return

        // El texto crudo de la API no sirve aca: mientras el endpoint no exista responde un 404 con
        // "Subrecurso desconocido", que no le dice nada a quien solo quiere cerrar su dia.
        setResumen(null)
        setErrorResumen('No se pudo cargar el resumen de hoy. Puedes cerrar la jornada igual: el tiempo ya medido no se pierde.')
      })

    return () => { control.abort() }
  }, [recarga])

  const cargando = resumen === null && errorResumen === null
  const grupos = resumen === null ? [] : agruparCierre(resumen.items)

  return (
    <div className="flex flex-col gap-4">
      {cargando && <p className="text-texto-sutil text-sm">Cargando el resumen de hoy…</p>}

      {errorResumen !== null && (
        <p role="status" className="border-linea bg-superficie-hundida text-texto-tenue rounded-chico border px-3 py-2 text-sm text-pretty">
          {errorResumen}
        </p>
      )}

      {resumen !== null && <Totales resumen={resumen} />}

      {resumen !== null && grupos.length === 0 && (
        <p className="text-texto-sutil text-sm text-pretty">
          No mediste tiempo en esta jornada. Agrega abajo en qué trabajaste antes de cerrarla.
        </p>
      )}

      {grupos.length > 0 && (
        <ul className="flex flex-col gap-3">
          {grupos.map((grupo) => (
            <li key={grupo.espacioId ?? 'sin-espacio'} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-texto truncate text-sm font-semibold">{grupo.nombre}</span>
                <span data-numerico className="text-texto-tenue shrink-0 font-mono text-xs tabular-nums">
                  {formatearDuracion(grupo.segundos)}
                </span>
              </div>

              {/* La sangria es la jerarquia que se pidio: Proyecto → Tarea → tiempo. */}
              <ul className="border-linea-suave flex flex-col gap-1 border-l pl-3">
                {grupo.items.map((item, indice) => (
                  <li
                    key={item.task?.id ?? `sin-tarea-${indice}`}
                    className="flex items-baseline justify-between gap-3"
                  >
                    <span className="text-texto-tenue min-w-0 truncate text-sm">
                      {nombreDeItem(item)}
                      {item.corriendo && (
                        <span className="text-texto-aviso ml-1.5 text-xs">· corriendo</span>
                      )}
                    </span>
                    <span data-numerico className="text-texto-tenue shrink-0 font-mono text-xs tabular-nums">
                      {formatearDuracion(segundosDeItem(item))}
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}

      <AgregarTiempo
        staffId={staffId}
        deshabilitado={cerrando}
        onAgregado={() => { setRecarga((previo) => previo + 1) }}
      />

      <ComentarioDeCierre
        valor={comentario}
        onCambiar={setComentario}
        deshabilitado={cerrando}
      />

      {aviso !== null && (
        <p role="alert" className="text-texto-peligro text-sm text-pretty">{aviso}</p>
      )}

      <div className="border-linea flex flex-wrap justify-end gap-2 border-t pt-4">
        <Boton variante="secundario" disabled={cerrando} onClick={onSeguir}>
          Seguir trabajando
        </Boton>
        <Boton
          variante="primario"
          cargando={cerrando}
          onClick={() => {
            // Se recorta aca y no en el servidor nada mas: " " no es un comentario, y mandarlo
            // haria que la API guardara una fila con texto en blanco en vez de NULL.
            const limpio = comentario.trim()
            onConfirmar(limpio === '' ? null : limpio)
          }}
        >
          Confirmar cierre
        </Boton>
      </div>
    </div>
  )
}

/**
 * Los tres numeros del dia.
 *
 * "Sin cubrir" va destacado y no al final: es el unico de los tres sobre el que se puede hacer algo
 * mientras el dialogo esta abierto.
 */
function Totales ({ resumen }: { resumen: ResumenDeJornada }) {
  return (
    <dl className="border-linea bg-superficie-hundida rounded-chico grid grid-cols-2 gap-x-4 gap-y-2 border p-3 sm:grid-cols-3">
      <Total etiqueta="Jornada" segundos={resumen.jornada.seconds} />
      <Total etiqueta="Medido" segundos={resumen.measured_seconds} />
      <Total etiqueta="Sin cubrir" segundos={resumen.uncovered_seconds} destacado />
    </dl>
  )
}

function Total ({
  etiqueta,
  segundos,
  destacado = false
}: { etiqueta: string, segundos: number, destacado?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col">
      <dt className="text-texto-sutil text-xs">{etiqueta}</dt>
      <dd
        data-numerico
        className={
          destacado && segundos > 0
            ? 'text-texto-aviso font-mono text-sm font-semibold tabular-nums'
            : 'text-texto font-mono text-sm font-semibold tabular-nums'
        }
      >
        {formatearDuracion(segundos)}
      </dd>
    </div>
  )
}

interface PropsComentario {
  valor: string
  onCambiar: (valor: string) => void
  deshabilitado: boolean
}

/**
 * La caja de comentarios del cierre (RQ-JOR-8).
 *
 * === POR QUE AQUI Y NO DENTRO DE `<AgregarTiempo>` ===
 *
 * Porque no es la nota de una ficha de tiempo. `<AgregarTiempo>` tiene su propio campo "Nota", que
 * describe UN tramo imputado a UN Proceso y se va con el a `POST /projects/{id}/timesheets`. Esto
 * es el comentario del DIA: uno solo, del cierre entero, y viaja en el cuerpo del cierre. Juntarlos
 * haria que escribir el resumen del dia dependiera de estar agregando tiempo que falto.
 *
 * Por eso tambien va despues del formulario y pegado a los botones: es lo ultimo que se escribe,
 * justo antes de confirmar.
 *
 * === POR QUE NO ES OBLIGATORIO ===
 *
 * El dialogo si lo es —no se sale sin decidir—, pero el texto no. Ver el docblock de arriba.
 *
 * El contador aparece solo cerca del tope: un campo opcional con "0 / 2000" desde el primer render
 * se lee como una cuota que hay que llenar, que es exactamente lo contrario de lo que es.
 */
function ComentarioDeCierre ({ valor, onCambiar, deshabilitado }: PropsComentario) {
  const restantes = COMENTARIO_MAXIMO - valor.length

  return (
    <section className="border-linea flex flex-col gap-1.5 border-t pt-4">
      <Campo
        etiqueta="Comentario del día (opcional)"
        ayuda="Lo que no queda en ninguna ficha de tiempo: un bloqueo, una reunión que se alargó, algo que retomar mañana."
      >
        {(props) => (
          <AreaTexto
            {...props}
            value={valor}
            rows={3}
            maxLength={COMENTARIO_MAXIMO}
            placeholder="Cómo estuvo el día"
            disabled={deshabilitado}
            onChange={(evento) => { onCambiar(evento.target.value) }}
          />
        )}
      </Campo>

      {valor.length >= AVISAR_DESDE && (
        <p
          role="status"
          data-numerico
          className={restantes === 0 ? 'text-texto-aviso text-xs' : 'text-texto-sutil text-xs'}
        >
          {restantes === 0
            ? `Llegaste al máximo de ${COMENTARIO_MAXIMO} caracteres.`
            : `Te quedan ${restantes} caracteres.`}
        </p>
      )}
    </section>
  )
}

interface PropsAgregar {
  staffId: number
  deshabilitado: boolean
  onAgregado: () => void
}

/**
 * Sumar una Tarea que no aparece en el resumen.
 *
 * Manda a `POST /projects/{id}/timesheets`, el mismo endpoint que el Registro de horas del Espacio y
 * que `proyecto/RegistroRapido`, y valida con `validarTimesheet()`, la misma funcion: una segunda
 * validacion de duracion terminaria aceptando aca lo que alla es un 422.
 */
function AgregarTiempo ({ staffId, deshabilitado, onAgregado }: PropsAgregar) {
  const idEspacio = useId()
  const idTarea = useId()
  const [espacio, setEspacio] = useState<number | null>(null)
  const [tarea, setTarea] = useState<number | null>(null)
  const [duracion, setDuracion] = useState('')
  const [nota, setNota] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [agregado, setAgregado] = useState(false)
  const [enCurso, setEnCurso] = useState(false)

  async function agregar (): Promise<void> {
    if (espacio === null) {
      setError(`Elige el ${GLOSARIO.espacio.singular.toLowerCase()}.`)
      return
    }

    const validacion = validarTimesheet({
      modo: 'duracion',
      taskId: tarea === null ? '' : String(tarea),
      // Vacio a proposito: sin `staff_id` la API imputa el tiempo a quien manda el token, que es
      // justamente de quien es esta jornada.
      staffId: '',
      inicio: '',
      fin: '',
      duracion,
      nota,
      etiquetas: ''
    })

    if (!validacion.ok) {
      setError(validacion.mensaje)
      return
    }

    setEnCurso(true)
    setError(null)
    setAgregado(false)

    try {
      const respuesta = await fetch(`/api/bff/projects/${espacio}/timesheets`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(validacion.cuerpo)
      })

      if (!respuesta.ok) {
        setError((await leerError(respuesta)).message)
        return
      }

      setTarea(null)
      setDuracion('')
      setNota('')
      setAgregado(true)
      // El contador de la cabecera cuenta el tiempo cubierto por marcajes, y acaba de cambiar.
      avisarCambioDeMedidor()
      onAgregado()
    } catch {
      setError('No se pudo agregar el tiempo: revisa la conexión.')
    } finally {
      setEnCurso(false)
    }
  }

  return (
    <section className="border-linea flex flex-col gap-3 border-t pt-4">
      <div className="flex flex-col">
        <h3 className="text-texto text-sm font-semibold">
          Agregar {GLOSARIO.proceso.singular.toLowerCase()} que falte
        </h3>
        <p className="text-texto-sutil text-xs text-pretty">
          Para lo que trabajaste sin el medidor andando y no aparece arriba.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={idEspacio} className="text-texto text-sm font-medium">
            {GLOSARIO.espacio.singular}
          </label>
          <SelectorEspacio
            id={idEspacio}
            valor={espacio}
            onElegir={(id) => {
              setEspacio(id)
              // La Tarea elegida pertenecia al Espacio anterior: dejarla seleccionada mandaria un
              // `task_id` de otro proyecto, que la API rechaza con un 422 confuso.
              setTarea(null)
            }}
            deshabilitado={deshabilitado || enCurso}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={idTarea} className="text-texto text-sm font-medium">
            {GLOSARIO.proceso.singular}
          </label>
          {espacio === null
            ? (
              <p className="text-texto-sutil text-xs">
                Elige primero el {GLOSARIO.espacio.singular.toLowerCase()}.
              </p>
              )
            : (
              <SelectorTarea
                id={idTarea}
                espacioId={espacio}
                staffId={staffId}
                valor={tarea}
                onElegir={setTarea}
                deshabilitado={deshabilitado || enCurso}
              />
              )}
        </div>

        <Campo etiqueta="Duración" ayuda={AYUDA_DURACION}>
          {(props) => (
            <Entrada
              {...props}
              value={duracion}
              inputMode="numeric"
              placeholder="2:30"
              disabled={deshabilitado || enCurso}
              onChange={(evento) => { setDuracion(evento.target.value) }}
            />
          )}
        </Campo>

        <Campo etiqueta="Nota">
          {(props) => (
            <Entrada
              {...props}
              value={nota}
              placeholder="En qué trabajaste"
              disabled={deshabilitado || enCurso}
              onChange={(evento) => { setNota(evento.target.value) }}
            />
          )}
        </Campo>
      </div>

      {error !== null && (
        <p role="alert" className="text-texto-peligro text-xs text-pretty">{error}</p>
      )}

      {/*
        El alta se guarda como un tramo que TERMINA ahora y empieza hacia atras, asi que una duracion
        mas larga que lo que lleva abierta la jornada empieza antes que ella — y el resumen, que
        recorta por la ventana de la jornada, no la lista. Sin este acuse la persona ve que no pasa
        nada y vuelve a agregarla: horas facturadas por duplicado que despues alguien tiene que ir a
        borrar. Verificado contra la API.
      */}
      {agregado && error === null && (
        <p role="status" className="text-texto-exito text-xs text-pretty">
          Tiempo agregado. Si no aparece arriba es porque empezó antes de tu jornada: quedó registrado
          igual.
        </p>
      )}

      <Boton
        variante="secundario"
        tamano="chico"
        className="self-start"
        cargando={enCurso}
        disabled={deshabilitado || enCurso}
        onClick={() => { void agregar() }}
      >
        <Plus size={14} strokeWidth={2} aria-hidden="true" />
        Agregar tiempo
      </Boton>
    </section>
  )
}
