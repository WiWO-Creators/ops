'use client'

import { Trash2 } from 'lucide-react'
import { useState, type FormEvent, type ReactElement } from 'react'
import { Cargando, ErrorEstado } from '@/componentes/estado/Estados'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { Boton } from '@/componentes/formularios/Boton'
import { CLASES_CASILLA, Entrada } from '@/componentes/formularios/Entrada'
import { GLOSARIO } from '@/dominio/glosario'
import { cn } from '@/lib/clases'
import { aTextoPlano } from './formatos'
import { useRecurso } from './carga'
import type { ItemChecklist } from '@/datos/recursos'

/**
 * La lista de control de una Tarea: los pasos que hay que dar por hechos antes de cerrarla.
 *
 * Se pide aparte del detalle (`GET /tasks/{id}/checklist`) por el mismo motivo que las iteraciones:
 * tildar un item tiene que poder recargar solo esta lista, sin volver a traer la Tarea entera y los
 * catalogos.
 *
 * **Ninguna escritura es optimista y ninguna recarga la lista.** Lo que se pinta es siempre lo que el
 * servidor confirmo: el alta y el tilde devuelven el item ya guardado y con eso se arma la lista
 * nueva. Tildar optimista deja la pantalla mintiendo sobre trabajo dado por hecho si el pedido
 * falla; volver a pedir la lista entera la borra por un instante y hace parpadear el conteo en cada
 * tilde, que sobre una lista de cinco lineas se ve como si algo se hubiera roto.
 *
 * **El texto llega como HTML** —la API guarda el item con `nl2br()`—, asi que se pinta con
 * `aTextoPlano()` y nunca con `dangerouslySetInnerHTML`.
 *
 * Los controles se muestran a todo el mundo que ve la Tarea, y no se esconden por permiso: la API
 * solo exige ver el Proceso para agregar y para tildar, y en el borrado —lo unico que puede caer con
 * un `403`, si el item es de otra persona y falta `delete tasks`— el mensaje del contrato se pinta
 * tal cual. Adivinar el permiso de este lado esconderia controles que si funcionan.
 */

/** Limite de `description` en la API (`ChecklistProceso::MAXIMO`). Se repite para atajar antes del viaje. */
const MAXIMO = 5000

export function ListaChecklist ({ procesoId }: { procesoId: number }): ReactElement {
  const ruta = `tasks/${encodeURIComponent(String(procesoId))}/checklist`
  const { estado, recargar } = useRecurso<ItemChecklist[]>(
    ruta,
    'No se pudo cargar la lista de control.'
  )

  const [texto, setTexto] = useState('')
  /** Que fila esta escribiendo: el id del item, `'nuevo'` para el alta, o nada. */
  const [ocupado, setOcupado] = useState<number | 'nuevo' | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** La lista despues de escribir. `null` mientras nadie escribio: manda lo que trajo la carga. */
  const [escrita, setEscrita] = useState<ItemChecklist[] | null>(null)

  const items = escrita ?? (estado.fase === 'listo' ? estado.datos : [])
  const hechos = items.filter((item) => item.finished).length
  const laTarea = GLOSARIO.proceso.singular.toLowerCase()

  /**
   * Manda una escritura del checklist y deja la lista como quedo del otro lado.
   *
   * @param clave que fila queda bloqueada mientras viaja el pedido
   * @param subruta lo que cuelga de la ruta de la lista. `''` para el alta, `/{id}` para un item
   * @param aplicar como queda la lista con lo que devolvio la API. `undefined` en el `DELETE`, que
   *   contesta `204` sin cuerpo
   * @returns `true` si la API acepto
   */
  async function escribir (
    clave: number | 'nuevo',
    subruta: string,
    metodo: 'POST' | 'PATCH' | 'DELETE',
    aplicar: (guardado: ItemChecklist | undefined) => ItemChecklist[],
    cuerpo?: unknown
  ): Promise<boolean> {
    setOcupado(clave)
    setError(null)

    const resultado = await escribirEnBff<ItemChecklist | undefined>(`${ruta}${subruta}`, metodo, cuerpo)

    setOcupado(null)

    if (!resultado.ok) {
      setError(resultado.mensaje)
      return false
    }

    setEscrita(aplicar(resultado.datos))
    return true
  }

  /** Agrega un item al final. El texto vacio no viaja: la API lo rechaza con un 422. */
  async function agregar (evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault()

    const descripcion = texto.trim()
    if (descripcion === '') return

    const sumado = await escribir(
      'nuevo',
      '',
      'POST',
      (guardado) => (guardado === undefined ? items : [...items, guardado]),
      { description: descripcion }
    )

    if (sumado) setTexto('')
  }

  /** Vuelve a pedir la lista y descarta lo escrito: el reintento parte de lo que diga el servidor. */
  function reintentar (): void {
    setEscrita(null)
    setError(null)
    recargar()
  }

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-texto-tenue text-sm font-semibold">
          Lista de control
          {items.length > 0 && (
            <span data-numerico className="text-texto-sutil ml-2 tabular-nums">
              {hechos}/{items.length}
            </span>
          )}
        </h4>
      </div>

      {estado.fase === 'cargando' && <Cargando alto="min-h-24" mensaje="Cargando la lista…" />}

      {estado.fase === 'error' && (
        <ErrorEstado detalle={estado.mensaje} onReintentar={reintentar} />
      )}

      {/* Sin marco: una lista de control vacia no es un fallo, es una tarea que no necesito pasos. */}
      {estado.fase === 'listo' && items.length === 0 && (
        <p className="text-texto-sutil text-sm">
          Esta {laTarea} todavía no tiene pasos en su lista.
        </p>
      )}

      {estado.fase === 'listo' && items.length > 0 && (
        <ul className="border-linea bg-superficie-elevada divide-linea-suave rounded-tarjeta divide-y border">
          {items.map((item) => (
            <Item
              key={item.id}
              item={item}
              bloqueado={ocupado !== null}
              onTildar={(finished) => {
                void escribir(
                  item.id,
                  `/${item.id}`,
                  'PATCH',
                  (guardado) => items.map((otro) => (otro.id === item.id ? guardado ?? otro : otro)),
                  { finished }
                )
              }}
              onQuitar={() => {
                void escribir(
                  item.id,
                  `/${item.id}`,
                  'DELETE',
                  () => items.filter((otro) => otro.id !== item.id)
                )
              }}
            />
          ))}
        </ul>
      )}

      {estado.fase !== 'error' && (
        <form className="flex items-center gap-2" onSubmit={(evento) => { void agregar(evento) }}>
          <Entrada
            value={texto}
            onChange={(evento) => { setTexto(evento.target.value) }}
            placeholder="Sumar un paso a la lista…"
            maxLength={MAXIMO}
            aria-label="Nuevo paso de la lista de control"
            disabled={ocupado !== null}
          />
          <Boton
            type="submit"
            variante="secundario"
            tamano="chico"
            cargando={ocupado === 'nuevo'}
            disabled={texto.trim() === '' || ocupado !== null}
          >
            Sumar
          </Boton>
        </form>
      )}

      {/* El error de escritura vive fuera del formulario: borrar un item tambien puede fallar, y el
          mensaje tiene que sobrevivir a la fila que lo provoco. */}
      {error !== null && <p className="text-relleno-peligro text-sm">{error}</p>}
    </section>
  )
}

/**
 * Un paso de la lista: la casilla, el texto y el boton de quitar.
 *
 * El texto tachado no baja de contraste hasta lo ilegible: un paso hecho se sigue leyendo, porque es
 * el registro de lo que se hizo.
 *
 * @param bloqueado `true` mientras cualquier fila de la lista esta escribiendo. Bloquea todas y no
 *   solo la propia: cada escritura arma la lista nueva a partir de la que tenia a la vista, y dos
 *   cruzadas dejarian el resultado de la que conteste ultima, perdiendo la otra.
 */
function Item (
  { item, bloqueado, onTildar, onQuitar }: {
    item: ItemChecklist
    bloqueado: boolean
    onTildar: (finished: boolean) => void
    onQuitar: () => void
  }
): ReactElement {
  const descripcion = aTextoPlano(item.description)

  return (
    <li className="flex items-start gap-2 p-3">
      <input
        type="checkbox"
        className={cn(CLASES_CASILLA, 'mt-0.5')}
        checked={item.finished}
        disabled={bloqueado}
        aria-label={descripcion}
        onChange={(evento) => { onTildar(evento.target.checked) }}
      />

      <span
        className={cn(
          'text-texto min-w-0 flex-1 text-sm whitespace-pre-line',
          item.finished && 'text-texto-tenue line-through'
        )}
      >
        {descripcion}
      </span>

      {/* Icono y no la palabra "Quitar": el boton se repite en cada fila, y cinco veces la misma
          palabra compite con los pasos, que son lo que hay que leer. El nombre completo va en el
          `aria-label`, que es lo que anuncia el lector de pantalla. */}
      <Boton
        variante="sutil"
        tamano="chico"
        soloIcono
        disabled={bloqueado}
        onClick={onQuitar}
        aria-label={`Quitar “${descripcion}” de la lista`}
        title="Quitar de la lista"
      >
        <Trash2 aria-hidden="true" className="size-4" />
      </Boton>
    </li>
  )
}
