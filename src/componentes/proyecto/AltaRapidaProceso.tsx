'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState, type FormEvent, type ReactElement } from 'react'
import { Boton } from '@/componentes/formularios/Boton'
import { Campo } from '@/componentes/formularios/Campo'
import { Entrada } from '@/componentes/formularios/Entrada'
import {
  CerrarDialogo,
  ContenidoDialogo,
  Dialogo,
  DisparadorDialogo
} from '@/componentes/superposiciones/Dialogo'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { interpretarAltaRapida, type CatalogosAlta } from '@/dominio/alta-rapida'
import { GLOSARIO } from '@/dominio/glosario'
import { formatearFecha } from '@/lib/fechas'

/**
 * Alta de un Proceso desde cualquier pantalla, en una linea.
 *
 * Existe por una razon concreta: hasta ahora la unica forma de crear una tarea era entrar al Espacio
 * y usar su formulario, lo que obliga a **saber a que Espacio pertenece antes de poder anotarla**.
 * Esa decision previa es la que termina mandando las tareas a un chat. Aca el Espacio es opcional y
 * se asigna despues.
 *
 * Lo que se escribe se interpreta con `interpretarAltaRapida`, que vive fuera de React porque es la
 * parte con reglas. Lo que el parser no reconoce **queda en el titulo**: nada se pierde en silencio.
 */

interface PropsAltaRapida {
  /** Personas, Espacios y prioridades contra los que resolver `@`, `#` y `!`. */
  catalogos: CatalogosAlta
}

export function AltaRapidaProceso ({ catalogos }: PropsAltaRapida): ReactElement {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [texto, setTexto] = useState('')
  const [enCurso, setEnCurso] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Se recalcula mientras se escribe: la vista previa es lo que hace confiable a una sintaxis que
  // nadie leyo en un manual.
  const leido = useMemo(
    () => interpretarAltaRapida(texto, catalogos),
    [texto, catalogos]
  )

  const nombreDe = (id: number, lista: ReadonlyArray<{ id: number }>, campo: 'full_name' | 'name'): string => {
    const fila = lista.find((f) => f.id === id) as Record<string, unknown> | undefined
    return fila === undefined ? '' : String(fila[campo])
  }

  function limpiar (): void {
    setTexto('')
    setError(null)
  }

  /**
   * Manda el alta.
   *
   * `sinResolver` no bloquea: si alguien escribio `@nadie`, la tarea igual se crea con ese texto en
   * el titulo. Es preferible una tarea anotada con un dato de mas que una tarea que no se anoto.
   */
  async function crear (evento: FormEvent): Promise<void> {
    evento.preventDefault()

    if (leido.name.trim() === '') {
      setError('Escribí al menos un título.')
      return
    }

    setEnCurso(true)
    setError(null)

    const resultado = await escribirEnBff<{ id: number }>('tasks', 'POST', {
      name: leido.name,
      due_date: leido.due_date,
      priority: leido.priority ?? undefined,
      assignees: leido.assignees,
      rel_type: leido.rel_type,
      rel_id: leido.rel_id
    })

    setEnCurso(false)

    if (!resultado.ok) {
      setError(resultado.mensaje)
      return
    }

    limpiar()
    setAbierto(false)
    router.refresh()
  }

  return (
    <Dialogo
      open={abierto}
      onOpenChange={(estado) => {
        setAbierto(estado)
        if (!estado) limpiar()
      }}
    >
      <DisparadorDialogo asChild>
        <Boton variante="primario">Nueva tarea</Boton>
      </DisparadorDialogo>

      <ContenidoDialogo
        titulo={`${GLOSARIO.proceso.singular} nuevo`}
        descripcion="Escribí una línea. El proyecto puede quedar vacío y asignarse después."
      >
        <form className="flex flex-col gap-4" onSubmit={(evento) => { void crear(evento) }}>
          <Campo etiqueta="Qué hay que hacer" requerido>
            {(props) => (
              <Entrada
                {...props}
                value={texto}
                autoFocus
                placeholder="Grilla Colbún septiembre mañana @franz #Colbún !alta"
                onChange={(e) => { setTexto(e.target.value) }}
              />
            )}
          </Campo>

          <VistaPrevia
            leido={leido}
            nombrePersona={(id) => nombreDe(id, catalogos.personas, 'full_name')}
            nombreEspacio={(id) => nombreDe(id, catalogos.espacios, 'name')}
            nombrePrioridad={(id) => nombreDe(id, catalogos.prioridades, 'name')}
          />

          <p className="text-texto-sutil text-xs">
            <code className="text-texto-tenue">@persona</code> asigna ·{' '}
            <code className="text-texto-tenue">#{GLOSARIO.espacio.singular.toLowerCase()}</code> lo
            vincula · <code className="text-texto-tenue">!prioridad</code> ·{' '}
            <code className="text-texto-tenue">mañana</code>, <code className="text-texto-tenue">viernes</code>{' '}
            o <code className="text-texto-tenue">30/9</code> ponen la entrega. Con espacios, entre comillas.
          </p>

          {error !== null && (
            <p role="alert" className="text-texto-peligro text-sm">{error}</p>
          )}

          <div className="flex justify-end gap-2">
            <CerrarDialogo asChild>
              <Boton variante="sutil" type="button">Cancelar</Boton>
            </CerrarDialogo>
            <Boton type="submit" variante="primario" cargando={enCurso}>Crear</Boton>
          </div>
        </form>
      </ContenidoDialogo>
    </Dialogo>
  )
}

/**
 * Lo que se entendio de la linea, mientras se escribe.
 *
 * Sin esto la sintaxis es adivinanza: la persona no sabe si `@franz` encontro a alguien hasta que la
 * tarea ya se creo mal. Lo no resuelto se muestra aparte y en tono de aviso, no de error, porque no
 * impide crear.
 */
function VistaPrevia ({
  leido,
  nombrePersona,
  nombreEspacio,
  nombrePrioridad
}: {
  leido: ReturnType<typeof interpretarAltaRapida>
  nombrePersona: (id: number) => string
  nombreEspacio: (id: number) => string
  nombrePrioridad: (id: number) => string
}): ReactElement | null {
  const marcas: string[] = []

  if (leido.due_date !== null) marcas.push(`Vence ${formatearFecha(leido.due_date)}`)
  if (leido.rel_id !== null) marcas.push(nombreEspacio(leido.rel_id))
  if (leido.priority !== null) marcas.push(nombrePrioridad(leido.priority))
  for (const id of leido.assignees) marcas.push(nombrePersona(id))

  if (leido.name.trim() === '' && marcas.length === 0 && leido.sinResolver.length === 0) return null

  return (
    <div className="border-borde bg-superficie-sutil flex flex-col gap-2 rounded-chico border p-3">
      <p className="text-texto text-sm font-medium">
        {leido.name.trim() === '' ? <span className="text-texto-sutil">Sin título todavía</span> : leido.name}
      </p>

      {marcas.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {marcas.map((marca) => (
            <li
              key={marca}
              className="border-borde text-texto-tenue rounded-chico border px-2 py-0.5 text-xs"
            >
              {marca}
            </li>
          ))}
        </ul>
      )}

      {leido.sinResolver.length > 0 && (
        <p className="text-texto-tenue text-xs">
          Sin reconocer: {leido.sinResolver.join(', ')} — queda en el título.
        </p>
      )}
    </div>
  )
}
