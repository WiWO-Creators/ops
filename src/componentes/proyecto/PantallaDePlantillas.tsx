'use client'

import { useCallback, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Trash2 } from 'lucide-react'
import { ConfirmarBorrado } from '@/componentes/datos/ConfirmarBorrado'
import { TablaRecurso } from '@/componentes/datos/TablaRecurso'
import { Boton } from '@/componentes/formularios/Boton'
import { useAviso } from '@/componentes/estado/useAviso'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import type { DefinicionRecurso, OpcionFiltro, ResultadoLista } from '@/definiciones/tipos'

/** Lo que toda plantilla trae del servidor y la pantalla necesita. */
interface PlantillaListable {
  id: number
  name: string
  can_edit: boolean
}

/** Lo que la pantalla le pasa al editor de su tipo de plantilla. */
export interface PropsEditorDePlantilla<T> {
  destino: T | 'nueva' | null
  onCerrar: () => void
  onGuardado: () => void
}

interface PropsPantallaDePlantillas<T extends PlantillaListable> {
  /** Primera pagina, ya resuelta en el servidor. El endpoint no pagina: es la lista entera. */
  inicial: ResultadoLista<T>
  definicion: DefinicionRecurso<T>
  /** Si quien mira puede crear; cada tipo lo deriva de su propio permiso. */
  puedeCrear: boolean
  opcionesDeFiltro?: Record<string, OpcionFiltro[]>
  /** Ruta del BFF para borrar una plantilla. */
  rutaDeBorrado: (plantilla: T) => string
  /** Que se pierde y que no al borrar, dicho en la confirmacion. */
  advertenciaDeBorrado: (plantilla: T) => string
  /** Dibuja el editor del tipo de plantilla. */
  editor: (props: PropsEditorDePlantilla<T>) => ReactNode
}

/**
 * Listado de plantillas con su alta, su edicion y su borrado; comun a las de {espacio} y de {hito}.
 *
 * La tabla es el motor de siempre (`TablaRecurso` sobre la definicion del tipo), no una tabla escrita
 * a mano. Lo unico propio son los dos controles de fila, que solo aparecen cuando el servidor dice
 * `can_edit`: ofrecer el boton para que la API conteste `403` es mentir.
 *
 * Los dialogos viven aca y no dentro de la tabla: el motor vuelve a pedir la pagina al refrescar, y
 * un formulario a medio completar no puede depender de eso.
 *
 * Recibe funciones, asi que no se usa desde un Server Component: cada tipo tiene su envoltorio de
 * cliente (`PantallaPlantillas`, `PantallaPlantillasHito`).
 *
 * @param props.inicial lista resuelta en el servidor
 * @param props.definicion definicion de tabla del tipo
 * @param props.puedeCrear muestra "Nueva plantilla"
 * @param props.opcionesDeFiltro catalogos extra de la tabla
 * @param props.rutaDeBorrado ruta del BFF para el `DELETE`
 * @param props.advertenciaDeBorrado texto de la confirmacion
 * @param props.editor dibuja el editor del tipo
 * @returns la pantalla completa
 */
export function PantallaDePlantillas<T extends PlantillaListable> ({
  inicial,
  definicion,
  puedeCrear,
  opcionesDeFiltro,
  rutaDeBorrado,
  advertenciaDeBorrado,
  editor
}: PropsPantallaDePlantillas<T>) {
  const router = useRouter()
  const [aEditar, setAEditar] = useState<T | 'nueva' | null>(null)
  const [aBorrar, setABorrar] = useState<T | null>(null)

  const refrescar = useCallback(() => { router.refresh() }, [router])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {puedeCrear && (
          <Boton tamano="chico" variante="primario" onClick={() => { setAEditar('nueva') }}>
            Nueva plantilla
          </Boton>
        )}
      </div>

      <TablaRecurso
        definicion={definicion}
        inicial={inicial}
        claveFila={(plantilla) => plantilla.id}
        {...(opcionesDeFiltro === undefined ? {} : { opcionesDeFiltro })}
        filaExtra={(plantilla) => (plantilla.can_edit
          ? (
            <>
              <Boton
                variante="sutil"
                tamano="chico"
                soloIcono
                aria-label={`Editar ${plantilla.name}`}
                onClick={() => { setAEditar(plantilla) }}
              >
                <Pencil size={14} aria-hidden />
              </Boton>
              <Boton
                variante="sutil"
                tamano="chico"
                soloIcono
                aria-label={`Eliminar ${plantilla.name}`}
                onClick={() => { setABorrar(plantilla) }}
              >
                <Trash2 size={14} aria-hidden />
              </Boton>
            </>
            )
          : null)}
      />

      {editor({
        destino: aEditar,
        onCerrar: () => { setAEditar(null) },
        onGuardado: () => { setAEditar(null); refrescar() }
      })}

      <DialogoBorrarPlantilla
        plantilla={aBorrar}
        ruta={rutaDeBorrado}
        advertencia={advertenciaDeBorrado}
        onCerrar={() => { setABorrar(null) }}
        onBorrada={() => { setABorrar(null); refrescar() }}
      />
    </div>
  )
}

interface PropsBorrar<T extends PlantillaListable> {
  plantilla: T | null
  ruta: (plantilla: T) => string
  advertencia: (plantilla: T) => string
  onCerrar: () => void
  onBorrada: () => void
}

/**
 * Confirmacion de borrado.
 *
 * Borrar una plantilla arrastra su contenido por clave foranea y no se puede deshacer, asi que va
 * con confirmacion; la advertencia de cada tipo aclara que lo ya creado con ella no se toca.
 */
function DialogoBorrarPlantilla<T extends PlantillaListable> ({
  plantilla,
  ruta,
  advertencia,
  onCerrar,
  onBorrada
}: PropsBorrar<T>) {
  const aviso = useAviso()

  if (plantilla === null) return null

  /** Borra la plantilla. Lanza si falla: `ConfirmarBorrado` muestra el mensaje. */
  async function borrar (): Promise<void> {
    if (plantilla === null) return

    const resultado = await escribirEnBff(ruta(plantilla), 'DELETE')

    if (!resultado.ok) throw new Error(resultado.mensaje)

    aviso.exito(`«${plantilla.name}» se eliminó.`)
    onBorrada()
  }

  return (
    <ConfirmarBorrado
      abierto
      onCerrar={onCerrar}
      tamano="chico"
      titulo="Eliminar la plantilla"
      advertencia={advertencia(plantilla)}
      etiquetaConfirmar="Eliminar"
      onConfirmar={borrar}
    />
  )
}
