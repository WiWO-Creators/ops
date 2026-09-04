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
import { VistaPreviaAlta, type MarcaPrevia } from './VistaPreviaAlta'

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

  // Las marcas se arman aca, no en la vista previa: los nombres salen de los catalogos de esta
  // pantalla y la vista previa solo pinta lo que ya viene con nombre. Aca todas son 'texto': el alta
  // rapida no llama al modelo, su gracia es ser instantanea.
  const marcas: MarcaPrevia[] = []

  if (leido.due_date !== null) {
    marcas.push({ texto: `Vence ${formatearFecha(leido.due_date)}`, origen: 'texto' })
  }
  if (leido.rel_id !== null) {
    marcas.push({ texto: nombreDe(leido.rel_id, catalogos.espacios, 'name'), origen: 'texto' })
  }
  if (leido.priority !== null) {
    marcas.push({ texto: nombreDe(leido.priority, catalogos.prioridades, 'name'), origen: 'texto' })
  }
  for (const id of leido.assignees) {
    marcas.push({ texto: nombreDe(id, catalogos.personas, 'full_name'), origen: 'texto' })
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
      setError('Escribe al menos un título.')
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
        descripcion="Escribe una línea. El proyecto puede quedar vacío y asignarse después."
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

          <VistaPreviaAlta titulo={leido.name} marcas={marcas} sinResolver={leido.sinResolver} />

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
