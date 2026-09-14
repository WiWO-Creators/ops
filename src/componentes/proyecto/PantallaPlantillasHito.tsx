'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Trash2 } from 'lucide-react'
import { TablaRecurso } from '@/componentes/datos/TablaRecurso'
import { Boton } from '@/componentes/formularios/Boton'
import { CerrarDialogo, ContenidoDialogo, Dialogo } from '@/componentes/superposiciones/Dialogo'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import type { PlantillaHito } from '@/datos/recursos'
import type { Capacidad } from '@/datos/tipos'
import type { OpcionFiltro, ResultadoLista } from '@/definiciones/tipos'
import { CATALOGO_AUTORES, PLANTILLAS_HITO } from '@/definiciones/plantillas-hito'
import { GLOSARIO } from '@/dominio/glosario'
import { EditorPlantillaHito } from './EditorPlantillaHito'

/**
 * Listado de plantillas de Hito, con su alta, su edicion y su borrado.
 *
 * La tabla es el motor de siempre (`TablaRecurso` sobre `PLANTILLAS_HITO`), no una tabla escrita a
 * mano. Lo unico propio son los dos controles de fila, que solo aparecen cuando el servidor dice
 * `can_edit` — aca **todo el staff ve todas las plantillas**, asi que ofrecer el boton de editar
 * para que la API conteste `403` seria mentir sobre algo que el listado ya mostro.
 *
 * Los dialogos viven aca y no dentro de la tabla: el motor vuelve a pedir la pagina al refrescar, y
 * un formulario a medio completar no puede depender de eso.
 */

interface PropsPantalla {
  /** Primera pagina, ya resuelta en el servidor. El endpoint no pagina: es la lista entera. */
  inicial: ResultadoLista<PlantillaHito>
  /**
   * Capacidades sobre `projects`.
   *
   * Crear una plantilla exige `create_milestones` —el permiso de la cosa que la plantilla
   * construye—, no `create`: quien no puede crear hitos no tiene para que armar su esqueleto.
   */
  capacidades: Capacidad[]
  /** Tipos de {proceso} ya deduplicados por nombre. */
  tiposDeProceso: OpcionFiltro[]
  /** Personas del equipo, para el filtro "Creada por". */
  autores: OpcionFiltro[]
}

export function PantallaPlantillasHito ({ inicial, capacidades, tiposDeProceso, autores }: PropsPantalla) {
  const router = useRouter()
  const [aEditar, setAEditar] = useState<PlantillaHito | 'nueva' | null>(null)
  const [aBorrar, setABorrar] = useState<PlantillaHito | null>(null)

  const refrescar = useCallback(() => { router.refresh() }, [router])

  const puedeCrear = capacidades.includes('create_milestones')

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
        definicion={PLANTILLAS_HITO}
        inicial={inicial}
        claveFila={(plantilla) => plantilla.id}
        opcionesDeFiltro={{ [CATALOGO_AUTORES]: autores }}
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

      <EditorPlantillaHito
        destino={aEditar}
        tiposDeProceso={tiposDeProceso}
        onCerrar={() => { setAEditar(null) }}
        onGuardado={() => { setAEditar(null); refrescar() }}
      />

      <DialogoBorrarPlantillaHito
        plantilla={aBorrar}
        onCerrar={() => { setABorrar(null) }}
        onBorrada={() => { setABorrar(null); refrescar() }}
      />
    </div>
  )
}

interface PropsBorrar {
  plantilla: PlantillaHito | null
  onCerrar: () => void
  onBorrada: () => void
}

/**
 * Confirmacion de borrado.
 *
 * Borrar una plantilla arrastra sus {procesos} por clave foranea y no se puede deshacer, asi que va
 * con confirmacion. No arrastra ningun {hito} ya creado: al aplicar la plantilla las {procesos}
 * nacieron como {procesos} de verdad y desde ahi viven solas. Decirlo evita el miedo de que borrar
 * la plantilla borre el trabajo.
 */
function DialogoBorrarPlantillaHito ({ plantilla, onCerrar, onBorrada }: PropsBorrar) {
  const [borrando, setBorrando] = useState(false)
  const [fallo, setFallo] = useState<string | null>(null)

  if (plantilla === null) return null

  async function borrar () {
    if (plantilla === null) return

    setBorrando(true)
    setFallo(null)

    const resultado = await escribirEnBff(`hito-plantillas/${plantilla.id}`, 'DELETE')

    setBorrando(false)

    if (resultado.ok) {
      onBorrada()
      return
    }

    setFallo(resultado.mensaje)
  }

  return (
    <Dialogo open onOpenChange={(abierto) => { if (!abierto) { setFallo(null); onCerrar() } }}>
      <ContenidoDialogo titulo="Borrar la plantilla" descripcion={plantilla.name} ancho="chico">
        <p className="text-texto-tenue text-sm">
          Se borra la plantilla y su lista de {GLOSARIO.proceso.plural.toLowerCase()}. Los{' '}
          {GLOSARIO.hito.plural.toLowerCase()} que ya se crearon con ella no se tocan.
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
