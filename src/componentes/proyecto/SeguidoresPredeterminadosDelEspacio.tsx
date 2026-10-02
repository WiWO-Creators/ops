'use client'

import { useEffect, useMemo, useState, type ReactElement } from 'react'
import { Boton } from '@/componentes/formularios/Boton'
import { SelectorPersonas } from '@/componentes/formularios/SelectorPersonas'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { AvisoEnLinea, Cargando, ErrorEstado } from '@/componentes/estado/Estados'
import { useAviso } from '@/componentes/estado/useAviso'
import { EnlacePersona } from '@/componentes/presentadores/EnlacePersona'
import { cargarAsignables } from '@/datos/asignables'
import type { SeguidoresPredeterminados } from '@/datos/recursos'
import type { StaffReferencia } from '@/datos/tipos'
import { GLOSARIO } from '@/dominio/glosario'
import { problemaDeSeguidores, seguidoresCambiaron } from '@/dominio/seguidores-predeterminados'
import { useRecurso } from './carga'

/**
 * Seguidores predeterminados del Espacio (WIW-0496): quienes siguen solas cada Tarea nueva.
 *
 * Sirve para los Espacios donde las mismas personas revisan todo —líderes de Content, jefaturas de
 * diseño— y hoy se suman a mano tarea por tarea. Solo afecta a lo que se cree desde que se guarda.
 *
 * Lo edita el responsable del Espacio (creador, Director o admin); el resto lo ve sin poder tocarlo.
 * Quién puede lo dice `can_edit` de la API, que además responde 403: esconder el botón es cosmética.
 */
export function SeguidoresPredeterminadosDelEspacio ({ proyectoId }: { proyectoId: number }): ReactElement {
  const ruta = `projects/${encodeURIComponent(String(proyectoId))}/default-followers`
  const { estado, recargar } = useRecurso<SeguidoresPredeterminados>(ruta, 'No se pudieron leer los seguidores predeterminados.')

  return (
    <section className="rounded-tarjeta border-linea bg-superficie-elevada shadow-1 border p-5">
      <h2 className="font-titular text-texto border-linea-suave mb-4 border-b pb-2 text-sm font-semibold">
        Seguidores predeterminados
      </h2>

      {estado.fase === 'cargando' && <Cargando alto="min-h-20" mensaje="Cargando los seguidores…" />}
      {estado.fase === 'error' && <ErrorEstado detalle={estado.mensaje} onReintentar={recargar} />}
      {estado.fase === 'listo' && (
        estado.datos.can_edit
          ? <FormularioDeSeguidores key={JSON.stringify(estado.datos)} ruta={ruta} inicial={estado.datos} />
          : <SeguidoresSoloLectura seguidores={estado.datos.followers} />
      )}
    </section>
  )
}

/** Explicación común a los dos modos: qué hace la lista y a qué afecta. */
function Explicacion (): ReactElement {
  const tareas = GLOSARIO.proceso.plural.toLowerCase()
  const espacio = GLOSARIO.espacio.singular.toLowerCase()

  return (
    <p className="text-texto-tenue text-sm text-pretty">
      Estas personas quedan como seguidoras de cada una de las {tareas} nuevas del {espacio} y reciben sus avisos
      como cualquier seguidor. Las {tareas} que ya existen no cambian.
    </p>
  )
}

function SeguidoresSoloLectura ({ seguidores }: { seguidores: StaffReferencia[] }): ReactElement {
  return (
    <div className="flex flex-col gap-3">
      <Explicacion />
      {seguidores.length === 0
        ? <p className="text-texto-sutil text-sm">Sin seguidores predeterminados.</p>
        : (
          <ul className="flex flex-wrap gap-x-4 gap-y-2">
            {seguidores.map((persona) => (
              <li key={persona.id}>
                <EnlacePersona id={persona.id} nombre={persona.full_name} imagen={persona.profile_image_url} />
              </li>
            ))}
          </ul>
          )}
      <p className="text-texto-sutil text-xs">Solo el responsable del {GLOSARIO.espacio.singular.toLowerCase()} puede cambiarlos.</p>
    </div>
  )
}

function FormularioDeSeguidores ({ ruta, inicial }: { ruta: string, inicial: SeguidoresPredeterminados }): ReactElement {
  const aviso = useAviso()
  const [guardados, setGuardados] = useState(inicial.followers)
  const [borrador, setBorrador] = useState<number[]>(() => inicial.followers.map((p) => p.id))
  const [equipo, setEquipo] = useState<StaffReferencia[] | null>(null)
  const [falloEquipo, setFalloEquipo] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    let vigente = true

    cargarAsignables()
      .then((personas) => { if (vigente) setEquipo(personas) })
      .catch((error: unknown) => {
        if (vigente) setFalloEquipo(error instanceof Error ? error.message : 'No se pudo cargar el equipo.')
      })

    return () => { vigente = false }
  }, [])

  // Quien quedo guardado y hoy no figura entre los activos igual se muestra, para poder sacarlo. La
  // API lo salta al crear la Tarea, pero dejarlo invisible en la lista seria esconder un dato guardado.
  const personas = useMemo((): StaffReferencia[] => {
    const activos = equipo ?? []

    return [...activos, ...guardados.filter((p) => !activos.some((a) => a.id === p.id))]
  }, [equipo, guardados])

  const idsGuardados = guardados.map((p) => p.id)
  const cambio = seguidoresCambiaron(idsGuardados, borrador)
  const problema = problemaDeSeguidores(borrador)

  /** Guarda la lista entera. Nunca lanza: el error de la API sale en el aviso. */
  async function guardar (): Promise<void> {
    setGuardando(true)
    const resultado = await escribirEnBff<SeguidoresPredeterminados>(ruta, 'PUT', { followers: borrador })
    setGuardando(false)

    if (!resultado.ok) {
      aviso.error(resultado.mensaje)
      return
    }

    setGuardados(resultado.datos.followers)
    setBorrador(resultado.datos.followers.map((p) => p.id))
    aviso.exito('Seguidores predeterminados guardados.')
  }

  return (
    <div className="flex flex-col gap-4">
      <Explicacion />

      <div className="flex max-w-md flex-col gap-2">
        <label htmlFor="seguidores-predeterminados" className="text-texto-tenue text-sm font-semibold">
          Personas que siguen cada {GLOSARIO.proceso.singular.toLowerCase()} nueva
        </label>
        {equipo === null && falloEquipo === null && <Cargando alto="min-h-10" mensaje="Cargando el equipo…" />}
        {falloEquipo !== null && <AvisoEnLinea variante="error" mensaje={falloEquipo} className="text-sm" />}
        {equipo !== null && (
          <SelectorPersonas
            id="seguidores-predeterminados"
            personas={personas}
            elegidas={borrador}
            onCambiar={setBorrador}
          />
        )}
        {problema !== null && <p className="text-texto-aviso text-sm">{problema}</p>}
      </div>

      <div className="flex justify-end">
        <Boton
          variante="primario"
          cargando={guardando}
          disabled={!cambio || problema !== null}
          onClick={() => { void guardar() }}
        >
          Guardar seguidores
        </Boton>
      </div>
    </div>
  )
}
