'use client'

import Link from 'next/link'
import { useMemo, useState, type ReactElement } from 'react'
import { useRouter } from 'next/navigation'
import { Boton } from '@/componentes/formularios/Boton'
import { PanelRecurso } from '@/componentes/proyecto/PanelRecurso'
import { FormularioRecurso } from '@/componentes/proyecto/FormularioRecurso'
import type { CampoFormulario, OpcionCampo } from '@/componentes/proyecto/formulario'
import type { ContactoProspecto, Licitacion, Prospecto } from '@/datos/recursos'
import type { Capacidad } from '@/datos/tipos'
import { LICITACIONES } from '@/definiciones/licitaciones'
import { CONTACTOS_DE_PROSPECTO } from '@/definiciones/prospectos'
import type { DefinicionRecurso } from '@/definiciones/tipos'
import { GLOSARIO } from '@/dominio/glosario'
import { CAMPOS_DE_CONTACTO } from './campos'
import { FlujoLicitacion } from './FlujoLicitacion'

/**
 * Las dos pestañas de listado del detalle de Prospecto.
 *
 * Ninguna escribe una tabla: las dos montan `PanelRecurso`, el mismo motor del detalle de Proyecto y
 * del de Cliente. Viven en un archivo porque cada una son diez lineas.
 */

/**
 * Pestaña Contactos: las personas de la empresa candidata.
 *
 * Se acota por RUTA (`prospectos/{id}/contactos`) y no por filtro, para que el prospecto no aparezca
 * en la URL, donde seria editable por quien mira y bastaria cambiar el numero para administrar los
 * contactos de otra empresa bajo este encabezado.
 *
 * "Quitar" es una accion de fila y la API responde **409 si ese contacto ya existe como contacto real
 * del cliente**: desde ese momento se da de baja en el cliente, no acá. La columna "En el cliente" es
 * lo que hace previsible ese 409 en vez de sorpresivo.
 *
 * @param prospectoId el prospecto que se esta mirando
 * @param capacidades capacidades sobre `projects`, de `permissions` de `/me`
 */
export function PanelContactosProspecto ({
  prospectoId,
  capacidades
}: { prospectoId: number, capacidades: Capacidad[] }): ReactElement {
  const router = useRouter()
  const [creando, setCreando] = useState(false)
  const [revision, setRevision] = useState(0)

  const definicion = useMemo<DefinicionRecurso<ContactoProspecto>>(() => ({
    ...CONTACTOS_DE_PROSPECTO,
    ruta: `prospectos/${encodeURIComponent(String(prospectoId))}/contactos`,
    acciones: [
      {
        clave: 'quitar',
        etiqueta: 'Quitar',
        ruta: `prospectos/${encodeURIComponent(String(prospectoId))}/contactos/:id`,
        metodo: 'DELETE',
        requiere: 'edit'
      }
    ]
  }), [prospectoId])

  const campos = useMemo<CampoFormulario[]>(
    () => CAMPOS_DE_CONTACTO.map((campo, indice) => (
      indice === 0 ? { ...campo, seccion: 'Persona de contacto' } : campo
    )),
    []
  )

  return (
    <>
      <PanelRecurso
        definicion={definicion}
        claveFila={(contacto) => contacto.id}
        capacidades={capacidades}
        revision={revision}
        barra={capacidades.includes('edit')
          ? (
            <div className="flex justify-end">
              <Boton tamano="chico" variante="primario" onClick={() => { setCreando(true) }}>
                Nuevo contacto
              </Boton>
            </div>
            )
          : undefined}
      />

      {capacidades.includes('edit') && (
        <FormularioRecurso
          abierto={creando}
          onAbiertoCambia={setCreando}
          titulo="Nuevo contacto"
          descripcion="Si el prospecto ya ganó una licitación, el contacto se da de alta en el cliente ahora mismo. Si no, al ganar la primera."
          campos={campos}
          ruta={`prospectos/${prospectoId}/contactos`}
          metodo="POST"
          onGuardado={() => {
            setRevision((n) => n + 1)
            router.refresh()
          }}
          columnas={2}
        />
      )}
    </>
  )
}

/**
 * Pestaña Licitaciones: **los "proyectos que se están licitando"** de este prospecto.
 *
 * Es el listado de siempre acotado con `consultaFija`, no una tabla nueva: `GET /licitaciones` acepta
 * `filter[prospecto_id]`, y asi la pestaña hereda gratis la paginacion, el orden, la busqueda y —lo
 * importante— la visibilidad de Espacio que ya aplica ese endpoint.
 *
 * Va como `consultaFija` y no como filtro de la vista para que no aparezca en la URL: ahi seria
 * editable, y cambiar el numero mostraria las licitaciones de otra empresa bajo este nombre.
 *
 * @param prospecto la empresa que se está mirando, usada en el asistente de alta
 * @param paises catalogo `countries` de `GET /lookups`, para el paso de la empresa
 * @param areas catalogo `areas` de `GET /lookups`, para el campo Área del asistente
 * @param staff catalogo `staff` de `GET /lookups`, para los campos Owner y Focal del asistente
 * @param capacidades capacidades sobre `projects`, de `permissions` de `/me`
 */
export function PanelLicitacionesProspecto ({
  prospecto,
  contactos,
  usuarioId,
  paises,
  areas,
  staff,
  capacidades
}: { prospecto: Pick<Prospecto, 'id' | 'empresa' | 'cliente'>, contactos: ContactoProspecto[], usuarioId: number, paises: OpcionCampo[], areas: OpcionCampo[], staff: OpcionCampo[], capacidades: Capacidad[] }): ReactElement {
  const prospectoId = prospecto.id
  const router = useRouter()
  const [creando, setCreando] = useState(false)
  const [revision, setRevision] = useState(0)
  const definicion = useMemo<DefinicionRecurso<Licitacion>>(() => ({
    ...LICITACIONES,
    consultaFija: `filter[prospecto_id]=${encodeURIComponent(String(prospectoId))}`,
    // La columna Empresa es este prospecto en todas las filas: repetirla es gastar ancho.
    columnas: LICITACIONES.columnas
      .filter((columna) => columna.clave !== 'company')
      .map((columna) => (
        columna.clave === 'espacio'
          ? {
              ...columna,
              presentar: (licitacion: Licitacion) => (
                <Link
                  href={`/licitaciones/${licitacion.id}`}
                  className="text-texto hover:text-acento font-medium underline-offset-4 hover:underline"
                >
                  {licitacion.espacio.name}
                </Link>
              )
            }
          : columna
      ))
  }), [prospectoId])

  return (
    <>
      <PanelRecurso
        definicion={definicion}
        claveFila={(licitacion) => licitacion.id}
        capacidades={capacidades}
        revision={revision}
        barra={capacidades.includes('create')
          ? (
            <div className="flex justify-end">
              <Boton tamano="chico" variante="primario" onClick={() => { setCreando(true) }}>
                Nueva licitación
              </Boton>
            </div>
            )
          : undefined}
      />
      {creando && capacidades.includes('create') && (
        <FlujoLicitacion
          usuarioId={usuarioId}
          capacidades={capacidades}
          paises={paises}
          areas={areas}
          staff={staff}
          prospecto={prospecto}
          contactos={contactos}
          onCerrar={() => { setCreando(false) }}
          onGuardado={() => {
            setRevision((n) => n + 1)
            router.refresh()
          }}
        />
      )}
    </>
  )
}

/** Nombre visible de la pestaña de licitaciones, para que la pagina no lo escriba a mano. */
export const ETIQUETA_LICITACIONES = GLOSARIO.licitacion.plural
