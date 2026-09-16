'use client'

import { useMemo, useState, type ReactElement } from 'react'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { Cargando, ErrorEstado } from '@/componentes/estado/Estados'
import { Boton } from '@/componentes/formularios/Boton'
import { Avatar } from '@/componentes/presentadores/Avatar'
import { Fecha } from '@/componentes/presentadores/Fecha'
import { GLOSARIO } from '@/dominio/glosario'
import { numerarIteraciones } from '@/lib/iteraciones'
import { useRecurso } from './carga'
import { FormularioRecurso } from './FormularioRecurso'
import type { CampoFormulario, OpcionCampo } from './formulario'
import type { IteracionProceso, MotivoIteracion } from '@/datos/recursos'

/**
 * Las iteraciones de una Tarea: por que hubo que rehacer el trabajo, cuando lo pidio el cliente,
 * quien lo anoto y en que ronda va.
 *
 * Va pegada a la descripcion y no al final del detalle: una iteracion es una nota sobre lo que se
 * rehizo, y se lee junto a lo que se rehizo.
 *
 * Se pide aparte del detalle porque el alta tiene que poder recargar solo esta lista sin volver a
 * traer la Tarea entera y los catalogos.
 *
 * **La lista vacia no se distingue de "el modulo no esta instalado"**, y esta bien que sea asi: si
 * `tblwiwo_task_iterations` no existe, la API devuelve `[]` en vez de un `500`. Las dos situaciones
 * se leen igual —no hubo iteraciones— y el alta es la unica que sabe la diferencia, porque ahi el
 * `409` llega con su mensaje dentro del dialogo.
 *
 * TRES COSAS QUE CONVIENE SABER ANTES DE TOCAR ESTO
 *
 *   1. **El motivo sale de un catalogo cerrado** (`GET /motivos-iteracion`), que se administra en
 *      Administracion → Motivos de iteración. Acá NO hay lista hardcodeada: si el catalogo llega
 *      vacio —o la instalacion todavia no lo tiene— el formulario vuelve a pedir el motivo en texto
 *      libre, que es como funcionaba antes, y la API valida lo mismo.
 *
 *   2. **El numero de ronda lo resuelve `numerarIteraciones()`**, no el indice del `map`. Desde la
 *      migracion `0682` la ronda es una columna y borrar una iteracion intermedia deja un hueco en
 *      vez de correr las demas hacia atras.
 *
 *   3. **La cota de la fecha de solicitud que manda es la de la API.** Acá solo se pone `max` = hoy,
 *      para atajar el dedazo de año antes del viaje. La cota inferior —la creacion de la Tarea— se
 *      valida en el servidor, que es el unico que la conoce en la zona horaria del negocio: ponerla
 *      acá desde un instante UTC rechazaria un dia valido cerca de medianoche.
 */

/** El detalle libre, que ahora acompaña al motivo del catalogo en vez de reemplazarlo. */
const CAMPO_DETALLE: CampoFormulario = {
  clave: 'reason',
  etiqueta: 'Detalle (opcional)',
  tipo: 'area',
  maximo: 2000,
  ayuda: 'El matiz que el catálogo no cubre. Se puede dejar vacío.',
  // Sin el boton de IA, que en las demas cajas de descripcion viene por defecto. El asistente redacta
  // *que hay que hacer* a partir de tres preguntas —que, para quien, con que se cierra— y acá la
  // pregunta es otra: por que lo que ya se hizo no sirvio. Contestarla es un dato que solo tiene
  // quien estuvo, no algo que se pueda redactar mejor.
  sinAsistenteIa: true
}

/** Constante compartida: un `[]` nuevo por render invalidaria los memos que dependen de el. */
const SIN_MOTIVOS: MotivoIteracion[] = []

/** El formulario de antes del catalogo, que sigue vivo donde el catalogo no esta. */
const CAMPOS_SIN_CATALOGO: CampoFormulario[] = [
  { ...CAMPO_DETALLE, etiqueta: '¿Por qué se rehace?', requerido: true, ayuda: undefined }
]

export function ListaIteraciones ({
  procesoId
}: { procesoId: number }): ReactElement {
  const [sumando, setSumando] = useState(false)
  const [editando, setEditando] = useState<IteracionProceso | null>(null)
  const [falloAlBorrar, setFalloAlBorrar] = useState<string | null>(null)

  const ruta = `tasks/${encodeURIComponent(String(procesoId))}/iterations`
  const { estado, recargar } = useRecurso<IteracionProceso[]>(
    ruta,
    'No se pudieron cargar las iteraciones.'
  )

  // El catalogo se pide siempre y no solo al abrir el dialogo: tambien lo usa la lista para nombrar
  // el motivo de una iteracion cuyo `reason_catalog` llegue nulo porque alguien lo desactivo.
  const { estado: catalogo } = useRecurso<MotivoIteracion[]>(
    'motivos-iteracion',
    'No se pudo cargar el catálogo de motivos.'
  )

  // Memoizado y no calculado al vuelo: el `[]` del caso sin catalogo es un arreglo nuevo en cada
  // render, y con eso los campos del formulario se reconstruirian siempre.
  const motivos = useMemo<MotivoIteracion[]>(
    () => catalogo.fase === 'listo' ? catalogo.datos : SIN_MOTIVOS,
    [catalogo]
  )

  const campos = useMemo<CampoFormulario[]>(
    () => motivos.length > 0 ? camposConCatalogo(motivos) : CAMPOS_SIN_CATALOGO,
    [motivos]
  )

  const laTarea = GLOSARIO.proceso.singular.toLowerCase()

  /** Borra una iteracion. Nunca lanza: el fallo se lee arriba de la lista, donde se pidio. */
  async function borrar (iteracion: IteracionProceso): Promise<void> {
    setFalloAlBorrar(null)

    const resultado = await escribirEnBff(
      `${ruta}/${encodeURIComponent(String(iteracion.id))}`,
      'DELETE'
    )

    if (!resultado.ok) {
      setFalloAlBorrar(resultado.mensaje)
      return
    }

    recargar()
  }

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-texto-tenue text-sm font-semibold">
          Iteraciones
          {estado.fase === 'listo' && estado.datos.length > 0 && (
            <span data-numerico className="text-texto-sutil ml-2 tabular-nums">
              {estado.datos.length}
            </span>
          )}
        </h4>

        <Boton variante="secundario" tamano="chico" onClick={() => { setSumando(true) }}>
          Sumar iteración
        </Boton>
      </div>

      {estado.fase === 'cargando' && <Cargando alto="min-h-24" mensaje="Cargando iteraciones…" />}

      {estado.fase === 'error' && (
        <ErrorEstado detalle={estado.mensaje} onReintentar={recargar} />
      )}

      {falloAlBorrar !== null && (
        <p className="text-peligro text-sm" role="alert">{falloAlBorrar}</p>
      )}

      {/* Sin marco: un estado vacio enmarcado se lee como "algo fallo"; sin marco, como "no hay
          nada", que es lo cierto. Cero iteraciones es un valor legitimo y buena noticia. */}
      {estado.fase === 'listo' && estado.datos.length === 0 && (
        <p className="text-texto-sutil text-sm">
          Todavía no hubo iteraciones en esta {laTarea}.
        </p>
      )}

      {estado.fase === 'listo' && estado.datos.length > 0 && (
        <ol className="border-linea bg-superficie-elevada divide-linea-suave rounded-tarjeta divide-y border">
          {numerarIteraciones(estado.datos).map((iteracion) => (
            <Iteracion
              key={iteracion.id}
              iteracion={iteracion}
              numero={iteracion.numero}
              motivos={motivos}
              onEditar={() => { setEditando(iteracion) }}
              onBorrar={() => { void borrar(iteracion) }}
            />
          ))}
        </ol>
      )}

      <FormularioRecurso
        abierto={sumando}
        onAbiertoCambia={setSumando}
        titulo="Sumar iteración"
        descripcion={`Queda asentada en esta ${laTarea} con su número de ronda, que ya no se mueve.`}
        campos={campos}
        ruta={ruta}
        metodo="POST"
        ancho="chico"
        onGuardado={recargar}
      />

      <FormularioRecurso
        abierto={editando !== null}
        onAbiertoCambia={(abierto) => { if (!abierto) setEditando(null) }}
        titulo="Corregir iteración"
        descripcion="El número de ronda no se toca: se corrige el motivo, el detalle y la fecha en que se pidió."
        campos={campos}
        ruta={editando === null ? ruta : `${ruta}/${encodeURIComponent(String(editando.id))}`}
        metodo="PATCH"
        registro={editando === null ? null : registroDe(editando)}
        ancho="chico"
        onGuardado={() => { setEditando(null); recargar() }}
      />
    </section>
  )
}

/**
 * Los campos del alta cuando hay catalogo: motivo, fecha de solicitud y detalle opcional.
 *
 * Las opciones llevan la categoria entre parentesis. Sin ella, "Cambio de preferencia del cliente" y
 * "Se sumó una pieza" se ven como dos motivos cualesquiera, y la diferencia entre los dos es
 * justamente lo que el catalogo existe para registrar.
 */
function camposConCatalogo (motivos: readonly MotivoIteracion[]): CampoFormulario[] {
  const opciones: OpcionCampo[] = motivos.map((motivo) => ({
    valor: String(motivo.id),
    etiqueta: `${motivo.name} · ${motivo.category_label}`
  }))

  return [
    {
      clave: 'motivo_id',
      etiqueta: 'Motivo',
      tipo: 'seleccion',
      requerido: true,
      opciones,
      ayuda: 'El catálogo lo administra un administrador en Administración → Motivos de iteración.'
    },
    {
      clave: 'solicitada_en',
      etiqueta: 'Fecha de solicitud',
      tipo: 'fecha',
      requerido: true,
      max: hoy(),
      ayuda: 'Cuándo lo pidió el cliente, que no es lo mismo que cuándo se anota acá.'
    },
    CAMPO_DETALLE
  ]
}

/**
 * Lo que el formulario de edicion lee para sembrarse.
 *
 * Las claves son las del CUERPO de la API (`motivo_id`, `solicitada_en`), no las de la respuesta
 * (`reason_id`, `requested_on`): `FormularioRecurso` busca cada campo por su clave, que es la misma
 * con la que despues lo manda.
 */
function registroDe (iteracion: IteracionProceso): Record<string, unknown> {
  return {
    motivo_id: iteracion.reason_id,
    solicitada_en: iteracion.requested_on,
    reason: iteracion.reason
  }
}

/** Hoy en la zona del navegador, en `YYYY-MM-DD`. Es una cota de cortesia; la que manda es la API. */
function hoy (): string {
  const ahora = new Date()
  const mes = String(ahora.getMonth() + 1).padStart(2, '0')
  const dia = String(ahora.getDate()).padStart(2, '0')

  return `${ahora.getFullYear()}-${mes}-${dia}`
}

/**
 * Una iteracion de la lista: la ronda y el motivo arriba, el detalle y la firma debajo.
 *
 * El detalle se recorta a dos lineas —un motivo pegado desde un chat puede ser un parrafo— y el texto
 * completo queda en el `title`. Se pinta como texto y nunca como HTML: la API lo manda en plano y sin
 * purificar.
 *
 * Sin autor se muestra solo la fecha. Un guion donde va un nombre de persona se lee como si alguien
 * se llamara asi.
 */
function Iteracion ({
  iteracion,
  numero,
  motivos,
  onEditar,
  onBorrar
}: {
  iteracion: IteracionProceso
  numero: number
  motivos: readonly MotivoIteracion[]
  onEditar: () => void
  onBorrar: () => void
}): ReactElement {
  // `reason_catalog` llega resuelto salvo que el motivo ya no este en el catalogo. El respaldo por id
  // cubre el caso de un motivo desactivado, que sigue existiendo y tiene nombre.
  const motivo = iteracion.reason_catalog
    ?? motivos.find((candidato) => candidato.id === iteracion.reason_id)
    ?? null

  return (
    <li className="flex flex-col gap-1.5 p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-texto text-sm font-medium">
          <span data-numerico className="text-texto-sutil mr-2 tabular-nums">#{numero}</span>
          {motivo?.name ?? 'Sin motivo del catálogo'}
        </p>

        <div className="flex shrink-0 items-center gap-1">
          <Boton variante="sutil" tamano="chico" onClick={onEditar}>Corregir</Boton>
          <Boton variante="sutil" tamano="chico" onClick={onBorrar}>Borrar</Boton>
        </div>
      </div>

      {motivo !== null && (
        <p className="text-texto-sutil text-xs">{motivo.category_label}</p>
      )}

      {iteracion.reason.trim() !== '' && (
        <p className="text-texto-tenue line-clamp-2 text-sm" title={iteracion.reason}>
          {iteracion.reason}
        </p>
      )}

      <div className="text-texto-sutil flex min-w-0 flex-wrap items-center gap-1.5 text-xs">
        {iteracion.staff !== null && (
          <>
            <Avatar
              nombre={iteracion.staff.full_name}
              imagen={iteracion.staff.profile_image_url}
              tamano="chico"
            />
            <span className="min-w-0 truncate">{iteracion.staff.full_name}</span>
            <span aria-hidden="true">·</span>
          </>
        )}
        <span>Solicitada el <Fecha valor={iteracion.requested_on} /></span>
        <span aria-hidden="true">·</span>
        <span>Registrada el <Fecha valor={iteracion.date_added} /></span>
      </div>
    </li>
  )
}
