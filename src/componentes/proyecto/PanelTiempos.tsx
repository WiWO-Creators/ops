'use client'

import { useCallback, useEffect, useState, type ReactElement } from 'react'
import Link from 'next/link'
import { PaginacionTabla } from '@/componentes/datos/ControlesTabla'
import {
  CeldaEncabezado,
  CeldaTabla,
  CuerpoTabla,
  EncabezadoTabla,
  FilaTabla,
  Tabla
} from '@/componentes/datos/Tabla'
import { Cargando, ErrorEstado, Vacio } from '@/componentes/estado/Estados'
import { Boton } from '@/componentes/formularios/Boton'
import {
  ContenidoSelector,
  DisparadorSelector,
  Opcion,
  Selector
} from '@/componentes/formularios/Selector'
import { Avatar } from '@/componentes/presentadores/Avatar'
import { Etiquetas } from '@/componentes/presentadores/Etiqueta'
import { Fecha } from '@/componentes/presentadores/Fecha'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { pedirSobre } from '@/datos/cliente'
import { leerError } from '@/datos/errores'
import type { PersonaConTiempo, RegistroTiempo } from '@/datos/recursos'
import type { Capacidad, Paginacion } from '@/datos/tipos'
import { FormularioTimesheet } from './FormularioTimesheet'
import { duracionMostrada, hayRegistroCorriendo } from './timesheet'

/**
 * Registro de horas de un proyecto.
 *
 * **Los permisos por fila los decide el backend** y llegan en `puede_editar`, `puede_borrar` y
 * `puede_detener`. El frontend no los recalcula: las reglas del panel mezclan cuatro permisos, el
 * estado de la tarea, si esta facturada y si la persona sigue asignada, y una segunda copia de eso
 * en el navegador se desincroniza el dia que cambie una.
 *
 * Lo mismo con las duraciones: `duration_hm` y `duration_decimal` vienen calculados. Lo unico que se
 * calcula aca es el conteo en vivo de un registro corriendo, porque ese numero envejece en pantalla.
 */

interface PropsPanelTiempos {
  proyectoId: number
  capacidades: Capacidad[]
}

/** Centinela del selector de persona: Radix no acepta `value` vacio en una opcion. */
const SIN_FILTRO = '__todas__'

type Carga =
  | { fase: 'cargando' }
  | { fase: 'error', mensaje: string }
  | { fase: 'listo', registros: RegistroTiempo[], paginacion: Paginacion | undefined }

export function PanelTiempos ({ proyectoId, capacidades }: PropsPanelTiempos): ReactElement {
  const [carga, setCarga] = useState<Carga>({ fase: 'cargando' })
  const [personas, setPersonas] = useState<PersonaConTiempo[]>([])
  const [filtroPersona, setFiltroPersona] = useState(SIN_FILTRO)
  const [pagina, setPagina] = useState(1)
  const [porPagina, setPorPagina] = useState(25)
  const [intento, setIntento] = useState(0)
  const [ahora, setAhora] = useState(() => new Date())
  const [formulario, setFormulario] = useState<{ abierto: boolean, registro: RegistroTiempo | null }>(
    { abierto: false, registro: null }
  )
  const [aviso, setAviso] = useState<string | null>(null)

  const recargar = useCallback(() => { setIntento((n) => n + 1) }, [])

  useEffect(() => {
    const control = new AbortController()

    const params = new URLSearchParams({ page: String(pagina), per_page: String(porPagina) })
    if (filtroPersona !== SIN_FILTRO) params.set('filter[staff_id]', filtroPersona)

    // Sin volver a 'cargando' al refrescar: la tabla se queda con las filas anteriores hasta que
    // llegan las nuevas, en vez de parpadear a un bloque de carga cada vez que se cambia de pagina.
    void pedirSobre<RegistroTiempo[]>(`projects/${proyectoId}/timesheets?${params.toString()}`, control.signal)
      .then((sobre) => {
        if (control.signal.aborted) return

        setCarga({ fase: 'listo', registros: sobre.data, paginacion: sobre.meta?.pagination })
      })
      .catch((fallo: unknown) => {
        if (control.signal.aborted) return

        setCarga({
          fase: 'error',
          mensaje: fallo instanceof Error ? fallo.message : 'No se pudo cargar el registro de horas.'
        })
      })

    return () => { control.abort() }
  }, [proyectoId, pagina, porPagina, filtroPersona, intento])

  useEffect(() => {
    const control = new AbortController()

    void pedirSobre<PersonaConTiempo[]>(`projects/${proyectoId}/timesheets/staff`, control.signal)
      .then((sobre) => setPersonas(sobre.data))
      .catch(() => {
        // El filtro por persona es accesorio: sin el, la tabla se ve igual. No se convierte en error.
      })

    return () => { control.abort() }
  }, [proyectoId, intento])

  const registros = carga.fase === 'listo' ? carga.registros : []
  const corriendo = hayRegistroCorriendo(registros)

  // El intervalo solo existe mientras haya algo corriendo: un `setInterval` permanente redibuja la
  // tabla entera una vez por segundo aunque no cambie nada.
  useEffect(() => {
    if (!corriendo) return

    const id = setInterval(() => setAhora(new Date()), 1000)

    return () => { clearInterval(id) }
  }, [corriendo])

  /** Detiene el cronometro abierto de una fila. Es el cronometro de la tarea, no un recurso aparte. */
  async function detener (registro: RegistroTiempo): Promise<void> {
    setAviso(null)

    try {
      const respuesta = await fetch(`/api/bff/tasks/${registro.task.id}/timer`, { method: 'DELETE' })

      if (!respuesta.ok) {
        setAviso((await leerError(respuesta)).message)
        return
      }

      recargar()
    } catch {
      setAviso('No se pudo detener: revisá la conexión.')
    }
  }

  /** Borra un registro. Pregunta antes: no hay deshacer del otro lado. */
  async function borrar (registro: RegistroTiempo): Promise<void> {
    if (!window.confirm(`¿Eliminar el registro de ${registro.staff.full_name} (${registro.duration_hm})?`)) return

    setAviso(null)

    try {
      const respuesta = await fetch(`/api/bff/projects/${proyectoId}/timesheets/${registro.id}`, {
        method: 'DELETE'
      })

      if (!respuesta.ok) {
        setAviso((await leerError(respuesta)).message)
        return
      }

      recargar()
    } catch {
      setAviso('No se pudo eliminar: revisá la conexión.')
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {personas.length > 0 && (
          <Selector value={filtroPersona} onValueChange={(valor) => { setFiltroPersona(valor); setPagina(1) }}>
            <DisparadorSelector aria-label="Filtrar por persona" className="w-56" />
            <ContenidoSelector>
              <Opcion value={SIN_FILTRO}>Todas las personas</Opcion>
              {personas.map((persona) => (
                <Opcion key={persona.id} value={String(persona.id)}>{persona.full_name}</Opcion>
              ))}
            </ContenidoSelector>
          </Selector>
        )}

        {capacidades.includes('create') && (
          <Boton
            variante="primario"
            tamano="chico"
            className="ml-auto"
            onClick={() => setFormulario({ abierto: true, registro: null })}
          >
            Registro de horas
          </Boton>
        )}
      </div>

      {aviso !== null && (
        <p
          role="alert"
          className="border-linea bg-superficie-peligro text-texto-peligro rounded-tarjeta border px-3 py-2 text-sm"
        >
          {aviso}
        </p>
      )}

      {carga.fase === 'cargando' && <Cargando filas={5} />}

      {carga.fase === 'error' && (
        <ErrorEstado detalle={carga.mensaje} onReintentar={recargar} />
      )}

      {carga.fase === 'listo' && registros.length === 0 && (
        <Vacio
          titulo="No hay horas registradas"
          descripcion="Cuando alguien anote tiempo en una tarea de este proyecto, aparece acá."
        />
      )}

      {carga.fase === 'listo' && registros.length > 0 && (
        <Tabla>
          <EncabezadoTabla>
            <tr>
              <CeldaEncabezado>Miembro</CeldaEncabezado>
              <CeldaEncabezado>Tarea</CeldaEncabezado>
              <CeldaEncabezado>Etiquetas</CeldaEncabezado>
              <CeldaEncabezado>Hora de inicio</CeldaEncabezado>
              <CeldaEncabezado>Hora de finalización</CeldaEncabezado>
              <CeldaEncabezado>Nota</CeldaEncabezado>
              <CeldaEncabezado numerica>Hora (h)</CeldaEncabezado>
              <CeldaEncabezado numerica>Hora (decimal)</CeldaEncabezado>
              <CeldaEncabezado>
                <span className="sr-only">Opciones</span>
              </CeldaEncabezado>
            </tr>
          </EncabezadoTabla>

          <CuerpoTabla>
            {registros.map((registro) => {
              const duracion = duracionMostrada(registro, ahora)

              return (
                <FilaTabla key={registro.id}>
                  <CeldaTabla>
                    <span className="flex items-center gap-2">
                      <Avatar
                        nombre={registro.staff.full_name}
                        imagen={registro.staff.profile_image_url}
                        tamano="chico"
                      />
                      <span className="text-texto">{registro.staff.full_name}</span>
                      {!registro.staff.sigue_asignado && (
                        <span
                          className="text-texto-aviso"
                          title="Ya no está asignado a esta tarea"
                          aria-label="Ya no está asignado a esta tarea"
                        >
                          !
                        </span>
                      )}
                    </span>
                  </CeldaTabla>

                  <CeldaTabla>
                    <span className="flex flex-wrap items-center gap-1.5">
                      <Link
                        href={`?tarea=${registro.task.id}`}
                        scroll={false}
                        className="text-texto hover:text-acento font-medium underline-offset-4 hover:underline"
                      >
                        {registro.task.name}
                      </Link>
                      {registro.task.billed
                        ? <Insignia tono="exito" tamano="chico">Facturada</Insignia>
                        : registro.task.billable && <Insignia tono="aviso" tamano="chico">No facturada</Insignia>}
                    </span>
                  </CeldaTabla>

                  <CeldaTabla><Etiquetas etiquetas={registro.tags} /></CeldaTabla>
                  <CeldaTabla><Fecha valor={registro.start_time} conHora /></CeldaTabla>
                  <CeldaTabla>
                    {registro.end_time === null
                      ? <Insignia tono="acento" tamano="chico">En curso</Insignia>
                      : <Fecha valor={registro.end_time} conHora />}
                  </CeldaTabla>
                  <CeldaTabla className="max-w-64 truncate">{registro.note ?? ''}</CeldaTabla>
                  <CeldaTabla numerica>{duracion.hm}</CeldaTabla>
                  <CeldaTabla numerica>{duracion.decimal.toFixed(2)}</CeldaTabla>

                  <CeldaTabla>
                    <span className="flex items-center gap-1">
                      {registro.puede_editar && (
                        <Boton
                          variante="sutil"
                          tamano="chico"
                          onClick={() => setFormulario({ abierto: true, registro })}
                        >
                          Editar
                        </Boton>
                      )}
                      {registro.puede_detener && (
                        <Boton variante="secundario" tamano="chico" onClick={() => { void detener(registro) }}>
                          Detener
                        </Boton>
                      )}
                      {registro.puede_borrar && (
                        <Boton variante="peligro" tamano="chico" onClick={() => { void borrar(registro) }}>
                          Eliminar
                        </Boton>
                      )}
                    </span>
                  </CeldaTabla>
                </FilaTabla>
              )
            })}
          </CuerpoTabla>
        </Tabla>
      )}

      <PaginacionTabla
        paginacion={carga.fase === 'listo' ? carga.paginacion : undefined}
        onCambiar={(parcial) => {
          if (parcial.porPagina !== undefined) setPorPagina(parcial.porPagina)
          if (parcial.pagina !== undefined) setPagina(parcial.pagina)
        }}
      />

      <FormularioTimesheet
        key={`${formulario.registro?.id ?? 'nuevo'}-${String(formulario.abierto)}`}
        proyectoId={proyectoId}
        abierto={formulario.abierto}
        registro={formulario.registro}
        onOpenChange={(abierto) => setFormulario((actual) => ({ ...actual, abierto }))}
        onGuardado={recargar}
      />
    </div>
  )
}
