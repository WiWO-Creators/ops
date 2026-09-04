'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Trash2 } from 'lucide-react'
import { TablaRecurso } from '@/componentes/datos/TablaRecurso'
import { Boton } from '@/componentes/formularios/Boton'
import { CerrarDialogo, ContenidoDialogo, Dialogo } from '@/componentes/superposiciones/Dialogo'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import type { PlantillaEspacio } from '@/datos/recursos'
import type { Capacidad } from '@/datos/tipos'
import type { OpcionFiltro, ResultadoLista } from '@/definiciones/tipos'
import { PLANTILLAS } from '@/definiciones/plantillas'
import { GLOSARIO } from '@/dominio/glosario'
import { EditorPlantilla } from './EditorPlantilla'

/**
 * Listado de plantillas de {espacio}, con su alta, su edicion y su borrado.
 *
 * La tabla es el motor de siempre (`TablaRecurso` sobre `PLANTILLAS`), no una tabla escrita a mano.
 * Lo unico propio son los dos controles de fila, que solo aparecen cuando el servidor dice
 * `can_edit` — una plantilla publica de otra persona se ve y se usa, pero no se toca, y ofrecer el
 * boton para que la API conteste `403` es mentir.
 *
 * Los dialogos viven aca y no dentro de la tabla: el motor vuelve a pedir la pagina al refrescar, y
 * un formulario a medio completar no puede depender de eso.
 */

interface PropsPantalla {
  /** Primera pagina, ya resuelta en el servidor. El endpoint no pagina: es la lista entera. */
  inicial: ResultadoLista<PlantillaEspacio>
  /** Capacidades sobre `projects`: crear una plantilla exige `create`, igual que crear un {espacio}. */
  capacidades: Capacidad[]
  /** Tipos de {proceso} ya deduplicados por nombre. */
  tiposDeProceso: OpcionFiltro[]
  equipo: OpcionFiltro[]
}

export function PantallaPlantillas ({ inicial, capacidades, tiposDeProceso, equipo }: PropsPantalla) {
  const router = useRouter()
  const [aEditar, setAEditar] = useState<PlantillaEspacio | 'nueva' | null>(null)
  const [aBorrar, setABorrar] = useState<PlantillaEspacio | null>(null)

  const refrescar = useCallback(() => { router.refresh() }, [router])

  const puedeCrear = capacidades.includes('create')

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
        definicion={PLANTILLAS}
        inicial={inicial}
        claveFila={(plantilla) => plantilla.id}
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
                aria-label={`Borrar ${plantilla.name}`}
                onClick={() => { setABorrar(plantilla) }}
              >
                <Trash2 size={14} aria-hidden />
              </Boton>
            </>
            )
          : null)}
      />

      <EditorPlantilla
        destino={aEditar}
        tiposDeProceso={tiposDeProceso}
        equipo={equipo}
        onCerrar={() => { setAEditar(null) }}
        onGuardado={() => { setAEditar(null); refrescar() }}
      />

      <DialogoBorrarPlantilla
        plantilla={aBorrar}
        onCerrar={() => { setABorrar(null) }}
        onBorrada={() => { setABorrar(null); refrescar() }}
      />
    </div>
  )
}

interface PropsBorrar {
  plantilla: PlantillaEspacio | null
  onCerrar: () => void
  onBorrada: () => void
}

/**
 * Confirmacion de borrado.
 *
 * Borrar una plantilla arrastra sus items por clave foranea y no se puede deshacer, asi que va con
 * confirmacion. No arrastra ningun {espacio} ya creado: las fechas se copiaron al instanciar y desde
 * ahi cada {espacio} vive solo. Decirlo evita el miedo de que borrar la plantilla borre el trabajo.
 */
function DialogoBorrarPlantilla ({ plantilla, onCerrar, onBorrada }: PropsBorrar) {
  const [borrando, setBorrando] = useState(false)
  const [fallo, setFallo] = useState<string | null>(null)

  if (plantilla === null) return null

  async function borrar () {
    if (plantilla === null) return

    setBorrando(true)
    setFallo(null)

    const resultado = await escribirEnBff(`project-templates/${plantilla.id}`, 'DELETE')

    setBorrando(false)

    if (resultado.ok) {
      onBorrada()
      return
    }

    setFallo(resultado.mensaje)
  }

  return (
    <Dialogo
      open
      onOpenChange={(abierto) => { if (!abierto) { setFallo(null); onCerrar() } }}
    >
      <ContenidoDialogo titulo="Borrar la plantilla" descripcion={plantilla.name} ancho="chico">
        <p className="text-texto-tenue text-sm">
          Se borra la plantilla y sus ítems. Los {GLOSARIO.espacio.plural.toLowerCase()} que ya se
          crearon con ella no se tocan.
        </p>

        {fallo !== null && <p role="alert" className="text-texto-peligro mt-3 text-sm">{fallo}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <CerrarDialogo asChild>
            <Boton variante="sutil">Cancelar</Boton>
          </CerrarDialogo>
          <Boton variante="peligro" cargando={borrando} onClick={() => { void borrar() }}>
            Borrar
          </Boton>
        </div>
      </ContenidoDialogo>
    </Dialogo>
  )
}
