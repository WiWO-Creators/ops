'use client'

import { useState, type ReactElement } from 'react'
import { Cargando, ErrorEstado } from '@/componentes/estado/Estados'
import { Boton } from '@/componentes/formularios/Boton'
import { Avatar } from '@/componentes/presentadores/Avatar'
import { Fecha } from '@/componentes/presentadores/Fecha'
import { GLOSARIO } from '@/dominio/glosario'
import { ordenarIteraciones } from '@/lib/iteraciones'
import { useRecurso } from './carga'
import { FormularioRecurso } from './FormularioRecurso'
import type { CampoFormulario } from './formulario'
import type { IteracionProceso } from '@/datos/recursos'

/**
 * Las iteraciones de una Tarea: por que hubo que rehacer el trabajo, quien lo anoto y cuando.
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
 */

/**
 * El unico campo del alta.
 *
 * `maximo` repite el limite del contrato para que un motivo de 2001 caracteres se ataje antes del
 * viaje: la API lo rechaza igual con un `422`, pero el mensaje del borde dice cuanto sobra.
 */
const CAMPOS: CampoFormulario[] = [
  { clave: 'reason', etiqueta: '¿Por qué se rehace?', tipo: 'area', requerido: true, maximo: 2000 }
]

export function ListaIteraciones ({ procesoId }: { procesoId: number }): ReactElement {
  const [sumando, setSumando] = useState(false)
  const ruta = `tasks/${encodeURIComponent(String(procesoId))}/iterations`
  const { estado, recargar } = useRecurso<IteracionProceso[]>(
    ruta,
    'No se pudieron cargar las iteraciones.'
  )

  const laTarea = GLOSARIO.proceso.singular.toLowerCase()

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

      {/* Sin marco: un estado vacio enmarcado se lee como "algo fallo"; sin marco, como "no hay
          nada", que es lo cierto. Cero iteraciones es un valor legitimo y buena noticia. */}
      {estado.fase === 'listo' && estado.datos.length === 0 && (
        <p className="text-texto-sutil text-sm">
          Todavía no hubo iteraciones en esta {laTarea}.
        </p>
      )}

      {estado.fase === 'listo' && estado.datos.length > 0 && (
        <ol className="border-linea bg-superficie-elevada divide-linea-suave rounded-tarjeta divide-y border">
          {ordenarIteraciones(estado.datos).map((iteracion) => (
            <Iteracion key={iteracion.id} iteracion={iteracion} />
          ))}
        </ol>
      )}

      <FormularioRecurso
        abierto={sumando}
        onAbiertoCambia={setSumando}
        titulo="Sumar iteración"
        descripcion={`Queda asentada en esta ${laTarea}: no se edita ni se borra.`}
        campos={CAMPOS}
        ruta={ruta}
        metodo="POST"
        ancho="chico"
        onGuardado={recargar}
      />
    </section>
  )
}

/**
 * Una iteracion de la lista: el motivo arriba, la firma debajo.
 *
 * El motivo se recorta a dos lineas —un motivo pegado desde un chat puede ser un parrafo— y el texto
 * completo queda en el `title`. Se pinta como texto y nunca como HTML: la API lo manda en plano y sin
 * purificar.
 *
 * Sin autor se muestra solo la fecha. Un guion donde va un nombre de persona se lee como si alguien
 * se llamara asi.
 */
function Iteracion ({ iteracion }: { iteracion: IteracionProceso }): ReactElement {
  return (
    <li className="flex flex-col gap-1.5 p-3">
      <p className="text-texto line-clamp-2 text-sm" title={iteracion.reason}>
        {iteracion.reason}
      </p>

      <div className="text-texto-sutil flex min-w-0 items-center gap-1.5 text-xs">
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
        <Fecha valor={iteracion.date_added} />
      </div>
    </li>
  )
}
