'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Pencil, Plus } from 'lucide-react'
import { Boton } from '@/componentes/formularios/Boton'
import { Organigrama } from '@/componentes/organigrama/Organigrama'
import { Pestanas, type Panel } from '@/componentes/proyecto/Pestanas'
import { pedirSobre, pedirTodasLasPaginas } from '@/datos/cliente'
import {
  saludDeOrganizacion, type FiltrosDePersonas, type ProblemaDeArea, type ProblemaDePersona
} from '@/dominio/organizacion'
import { DialogoDeArea, PanelAreasCargos } from './PanelAreasCargos'
import { PanelDePersona } from './PanelDePersona'
import { PanelHistorial } from './PanelHistorial'
import { PanelPersonas, SIN_FILTROS } from './PanelPersonas'
import { PanelSistema } from './PanelSistema'
import { MensajeDeError } from './piezas'
import { SaludDeOrganizacion } from './SaludDeOrganizacion'
import type { AreaDeAccesos, CatalogoDeAccesos, PersonaDeAccesos } from '@/datos/accesos'
import type { Organigrama as DatosDeOrganigrama } from '@/datos/organigrama'
import type { CatalogosDeTareas } from '@/datos/recursos'

interface PropsVistaOrganizacion {
  catalogo: CatalogoDeAccesos
  organigrama: DatosDeOrganigrama
  /** Estados y prioridades de Tarea; sin ellos el organigrama no lista trabajo. */
  catalogos?: CatalogosDeTareas
  /** Quien administra: la API le impide cambiarse el escalón y el rol a sí mismo. */
  actorId: number
}

/**
 * Organización, para superadministración: el organigrama y todo lo que lo administra, en una pantalla.
 *
 * Reemplaza a dos pantallas que editaban lo mismo sin verse: Jerarquías —el dibujo— y Accesos —las
 * tablas—. Las dos escribían el mismo `PUT /accesos/personas/{id}`, cada una a su manera. Acá hay un
 * solo dueño de los datos y cinco pestañas que los leen:
 *
 * - **Organigrama**: el mismo dibujo que ven las jefaturas, con el panel completo de cada persona y
 *   el alta y edición de áreas desde su cabecera.
 * - **Personas**: el listado para leer, filtrar, exportar y cambiar a varias de una vez.
 * - **Áreas y cargos**, **Sistema** (roles, escalones, interruptor) e **Historial**.
 *
 * Encima de las pestañas va la salud del organigrama, porque los huecos son lo primero que hay que
 * ver y cada contador lleva a la pestaña que los resuelve.
 *
 * El catálogo, las personas y el organigrama viven acá y se vuelven a pedir juntos después de cada
 * escritura: mover a alguien cambia contadores de las cinco pestañas, y una copia por pestaña dejaría
 * números viejos sin que nada avise. Se pide con `pedirSobre()` y no con `router.refresh()`, que
 * volvería a resolver la ruta entera y cerraría el panel abierto.
 */
export function VistaOrganizacion ({ catalogo: catalogoInicial, organigrama: organigramaInicial, catalogos, actorId }: PropsVistaOrganizacion) {
  const [catalogo, setCatalogo] = useState(catalogoInicial)
  const [organigrama, setOrganigrama] = useState(organigramaInicial)
  const [personas, setPersonas] = useState<PersonaDeAccesos[] | null>(null)
  const [errorPersonas, setErrorPersonas] = useState<string | null>(null)
  const [errorRecarga, setErrorRecarga] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const [elegida, setElegida] = useState<number | null>(null)
  const [filtros, setFiltros] = useState<FiltrosDePersonas>(SIN_FILTROS)
  const [problemaDeArea, setProblemaDeArea] = useState<ProblemaDeArea | null>(null)
  const [editandoArea, setEditandoArea] = useState<{ area: AreaDeAccesos | null } | null>(null)

  useEffect(() => {
    const control = new AbortController()

    pedirTodasLasPaginas<PersonaDeAccesos>('accesos/personas', control.signal)
      .then((filas) => { setPersonas(filas); setErrorPersonas(null) })
      .catch((problema: unknown) => {
        if (control.signal.aborted) return
        setErrorPersonas(problema instanceof Error ? problema.message : 'No se pudo leer el listado de personas.')
      })

    return () => { control.abort() }
  }, [version])

  /**
   * Vuelve a pedir el catálogo y el organigrama, y dispara el repedido de las personas.
   *
   * Un fallo no borra lo que está en pantalla: la escritura sí ocurrió, y vaciar la vista haría pensar
   * lo contrario. Se avisa arriba y los datos quedan como estaban hasta el próximo intento.
   */
  const recargar = useCallback((): void => {
    setErrorRecarga(null)
    setVersion((previa) => previa + 1)

    const senal = AbortSignal.timeout(15000)

    Promise.all([
      pedirSobre<CatalogoDeAccesos>('accesos/catalogo', senal),
      pedirSobre<DatosDeOrganigrama>('organigrama', senal)
    ])
      .then(([sobreCatalogo, sobreOrganigrama]) => {
        setCatalogo(sobreCatalogo.data)
        setOrganigrama(sobreOrganigrama.data)
      })
      .catch((fallo: unknown) => {
        setErrorRecarga(fallo instanceof Error
          ? `El cambio se guardó, pero la pantalla no se pudo actualizar: ${fallo.message}`
          : 'El cambio se guardó, pero la pantalla no se pudo actualizar. Recárgala.')
      })
  }, [])

  const salud = useMemo(() => saludDeOrganizacion(personas ?? [], catalogo.areas), [personas, catalogo.areas])
  const persona = elegida === null ? undefined : personas?.find((una) => una.staffid === elegida)
  const jefaturasPosibles = useMemo(
    () => (personas ?? []).filter((una) => una.activo).map((una) => ({ id: una.staffid, full_name: una.nombre })),
    [personas]
  )

  /** Filtra el listado de personas por un hueco y lleva a esa pestaña. */
  function verPersonasCon (problema: ProblemaDePersona): void {
    setFiltros({ ...SIN_FILTROS, problema })
    irAPestana('personas')
  }

  /** Filtra la tabla de áreas por un hueco y lleva a esa pestaña. */
  function verAreasCon (problema: ProblemaDeArea): void {
    setProblemaDeArea(problema)
    irAPestana('areas')
  }

  const indicadorDeArea = problemaDeArea === null ? undefined : salud.areas.find((uno) => uno.clave === problemaDeArea)

  const paneles: Panel[] = [
    {
      clave: 'organigrama',
      etiqueta: 'Organigrama',
      contenido: (
        <Organigrama
          inicial={organigrama}
          catalogos={catalogos}
          extensiones={{
            alCambiar: recargar,
            panelDePersona: (staffid, cerrar) => {
              const una = personas?.find((candidata) => candidata.staffid === staffid)

              return una === undefined
                ? null
                : <PanelDePersona persona={una} catalogo={catalogo} personas={personas ?? []} actorId={actorId} onCerrar={cerrar} onGuardado={recargar} />
            },
            accionDelMapa: (
              <Boton variante="secundario" tamano="chico" onClick={() => { setEditandoArea({ area: null }) }}>
                <Plus aria-hidden="true" className="size-4" />
                Nueva área
              </Boton>
            ),
            accionDeArea: (areaId) => {
              const area = catalogo.areas.find((una) => una.id === areaId)

              return area === undefined
                ? null
                : (
                  <Boton variante="sutil" tamano="chico" onClick={() => { setEditandoArea({ area }) }}>
                    <Pencil aria-hidden="true" className="size-4" />
                    Editar área
                  </Boton>
                  )
            }
          }}
        />
      )
    },
    {
      clave: 'personas',
      etiqueta: 'Personas',
      contenido: (
        <PanelPersonas
          catalogo={catalogo}
          personas={personas}
          error={errorPersonas}
          salud={salud}
          filtros={filtros}
          onFiltros={setFiltros}
          actorId={actorId}
          onElegir={(una) => { setElegida(una.staffid) }}
          onCambio={recargar}
          onReintentar={recargar}
        />
      )
    },
    {
      clave: 'areas',
      etiqueta: 'Áreas y cargos',
      contenido: (
        <PanelAreasCargos
          catalogo={catalogo}
          recargar={recargar}
          filtro={indicadorDeArea === undefined ? null : { etiqueta: indicadorDeArea.etiqueta, ids: indicadorDeArea.ids }}
          onQuitarFiltro={() => { setProblemaDeArea(null) }}
        />
      )
    },
    {
      clave: 'sistema',
      etiqueta: 'Sistema',
      contenido: (
        <PanelSistema
          catalogo={catalogo}
          personas={personas}
          onElegir={(una) => { setElegida(una.staffid) }}
          recargar={recargar}
        />
      )
    },
    {
      clave: 'historial',
      etiqueta: 'Historial',
      contenido: <PanelHistorial personas={personas} version={version} />
    }
  ]

  return (
    <div className="flex flex-col gap-4">
      {errorRecarga !== null && <MensajeDeError>{errorRecarga}</MensajeDeError>}

      {personas !== null && (
        <SaludDeOrganizacion
          salud={salud}
          activo={filtros.problema !== '' ? filtros.problema : problemaDeArea}
          onPersonas={verPersonasCon}
          onAreas={verAreasCon}
        />
      )}

      <Pestanas paneles={paneles} etiqueta="Secciones de organización" />

      {persona !== undefined && (
        <PanelDePersona
          persona={persona}
          catalogo={catalogo}
          personas={personas ?? []}
          actorId={actorId}
          onCerrar={() => { setElegida(null) }}
          onGuardado={recargar}
        />
      )}

      {editandoArea !== null && (
        <DialogoDeArea
          area={editandoArea.area}
          areas={catalogo.areas}
          personas={jefaturasPosibles}
          cerrar={() => { setEditandoArea(null) }}
          alGuardar={() => { setEditandoArea(null); recargar() }}
        />
      )}
    </div>
  )
}

/**
 * Cambia de pestaña desde fuera de la barra, igual que lo hace `Pestanas`: `replaceState` sobre `tab`,
 * sin pasar por el router. El router volvería a resolver la página en el servidor.
 */
function irAPestana (clave: string): void {
  const parametros = new URLSearchParams(window.location.search)

  parametros.set('tab', clave)
  window.history.replaceState(null, '', `?${parametros.toString()}${window.location.hash}`)
}
