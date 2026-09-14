'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Boton } from '@/componentes/formularios/Boton'
import { Campo } from '@/componentes/formularios/Campo'
import { AreaTexto, Entrada } from '@/componentes/formularios/Entrada'
import { ContenidoDialogo, Dialogo, DisparadorDialogo } from '@/componentes/superposiciones/Dialogo'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { TareasAsignadas } from '@/componentes/mis-tareas/TareasAsignadas'
import { errorDeDescripcion } from '@/dominio/descripcion-tarea'
import { GLOSARIO } from '@/dominio/glosario'
import { SOLO_SIN_ESPACIO } from '@/dominio/mis-tareas'
import type { EstadoLookup } from '@/datos/recursos'

interface PropsTareasPrivadas {
  /** Quien mira. Es a la vez el filtro de la lista y el dueño de lo que se cree. */
  personaId: number
  /** `task_statuses` de `GET /lookups`. */
  estados: EstadoLookup[]
  /** Pantalla donde se abre el detalle. Ver `TareasAsignadas`. */
  rutaDetalle: string
}

/**
 * Las Tareas privadas de quien mira, con su propia alta.
 *
 * **Privada** es la Tarea que no cuelga de ningun Espacio y tiene dueño. No es un campo nuevo en la
 * base: es la combinacion que `POST /tasks` ya admitia —`rel_type` en NULL y un responsable— puesta
 * por fin en una vista propia. Y no la convierte en huerfana: huerfana es la que no tiene Espacio NI
 * responsable, y esta siempre tiene uno.
 *
 * Es cliente y no servidor porque hace de puente entre el alta y la lista: la lista se pide desde el
 * navegador, asi que `router.refresh()` no la tocaria. El contador de version es lo que le avisa.
 *
 * @returns La seccion de privadas: boton de alta, tabla y paginador.
 */
export function TareasPrivadas ({ personaId, estados, rutaDetalle }: PropsTareasPrivadas) {
  const [version, setVersion] = useState(0)
  const singular = GLOSARIO.proceso.singular.toLowerCase()

  return (
    <TareasAsignadas
      personaId={personaId}
      titulo={`${GLOSARIO.proceso.plural} privadas`}
      estados={estados}
      consultaExtra={SOLO_SIN_ESPACIO}
      rutaDetalle={rutaDetalle}
      version={version}
      accion={<DialogoTareaPrivada personaId={personaId} onCreada={() => { setVersion((n) => n + 1) }} />}
      vacio={{
        titulo: `No tienes ${GLOSARIO.proceso.plural.toLowerCase()} privadas`,
        descripcion: `Una ${singular} privada no cuelga de ningún ${GLOSARIO.espacio.singular.toLowerCase()}: es tuya y sólo aparece en tu hoja.`
      }}
    />
  )
}

/**
 * Alta de una Tarea privada.
 *
 * Es un formulario propio y no el alta rapida de `/procesos` envuelta: esa pide Espacio, hito, tipo,
 * recurrencia y campos personalizados, y todo eso o no aplica sin Espacio o sobra para lo que esta
 * pantalla resuelve —anotar algo propio sin buscarle una carpeta—. Los tres campos son los unicos
 * que `POST /tasks` exige o que sirven de algo sin Espacio; el resto se edita desde el detalle.
 *
 * @param personaId A quien se le asigna. Es lo que la hace privada y no huerfana.
 * @param onCreada Se llama despues de crear, para que la lista se vuelva a pedir.
 */
function DialogoTareaPrivada ({ personaId, onCreada }: { personaId: number, onCreada: () => void }) {
  const [abierto, setAbierto] = useState(false)
  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [vence, setVence] = useState('')
  const [enCurso, setEnCurso] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const singular = GLOSARIO.proceso.singular.toLowerCase()

  /** Deja el formulario como recien abierto. Sin esto, la segunda alta arranca con la primera escrita. */
  function limpiar (): void {
    setNombre('')
    setDescripcion('')
    setVence('')
    setError(null)
  }

  /**
   * Valida y manda el alta.
   *
   * La descripcion se comprueba aca ademas de en la API: `POST /tasks` la exige y responde 422, y
   * este chequeo solo ahorra el viaje y deja el mensaje al lado del campo que lo arregla.
   */
  async function crear (): Promise<void> {
    if (enCurso) return

    const titulo = nombre.trim()

    if (titulo === '') {
      setError(`La ${singular} necesita un nombre.`)
      return
    }

    const descripcionMal = errorDeDescripcion(descripcion, `La ${singular}`)

    if (descripcionMal !== null) {
      setError(descripcionMal)
      return
    }

    setEnCurso(true)
    setError(null)

    const resultado = await escribirEnBff<{ id: number }>('tasks', 'POST', {
      name: titulo,
      description: descripcion.trim(),
      // Los dos juntos y explicitos: la API trata "uno de los dos" como error, no como default.
      rel_type: null,
      rel_id: null,
      // El dueño es lo que la separa de una huerfana, y lo que la hace aparecer en esta lista.
      assignees: [personaId],
      // Privada tambien de cara al equipo: `is_public` es lo que la publica en el panel clasico.
      is_public: false,
      ...(vence === '' ? {} : { due_date: vence })
    })

    setEnCurso(false)

    if (!resultado.ok) {
      setError(resultado.mensaje)
      return
    }

    limpiar()
    setAbierto(false)
    onCreada()
  }

  return (
    <Dialogo
      open={abierto}
      onOpenChange={(siguiente) => {
        setAbierto(siguiente)
        if (!siguiente) limpiar()
      }}
    >
      <DisparadorDialogo asChild>
        <Boton variante="primario" tamano="chico">
          <Plus aria-hidden="true" className="size-4" />
          Nueva {singular} privada
        </Boton>
      </DisparadorDialogo>

      <ContenidoDialogo
        titulo={`Nueva ${singular} privada`}
        descripcion={`No cuelga de ningún ${GLOSARIO.espacio.singular.toLowerCase()} y queda asignada a ti.`}
      >
        <div className="mt-4 flex flex-col gap-4">
          <Campo etiqueta="Nombre" requerido>
            {(props) => (
              <Entrada
                {...props}
                value={nombre}
                onChange={(evento) => { setNombre(evento.target.value) }}
                placeholder={`Qué hay que hacer`}
                maxLength={255}
              />
            )}
          </Campo>

          <Campo
            etiqueta="Descripción"
            requerido
            ayuda="La API la exige: es lo que hace que la tarea se entienda sin preguntarte."
          >
            {(props) => (
              <AreaTexto
                {...props}
                value={descripcion}
                onChange={(evento) => { setDescripcion(evento.target.value) }}
              />
            )}
          </Campo>

          <Campo etiqueta="Vence" ayuda="Opcional.">
            {(props) => (
              <Entrada
                {...props}
                type="date"
                value={vence}
                onChange={(evento) => { setVence(evento.target.value) }}
              />
            )}
          </Campo>

          {error !== null && <p role="alert" className="text-texto-peligro text-sm">{error}</p>}

          <div className="flex justify-end gap-2">
            <Boton onClick={() => { setAbierto(false) }}>Cancelar</Boton>
            <Boton variante="primario" cargando={enCurso} onClick={() => { void crear() }}>
              Crear
            </Boton>
          </div>
        </div>
      </ContenidoDialogo>
    </Dialogo>
  )
}
