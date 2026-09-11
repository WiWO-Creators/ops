'use client'

import { useEffect, useState } from 'react'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import {
  CeldaEncabezado, CeldaTabla, CuerpoTabla, EncabezadoTabla, FilaTabla, Tabla
} from '@/componentes/datos/Tabla'
import { Vacio } from '@/componentes/estado/Estados'
import { Boton } from '@/componentes/formularios/Boton'
import { Campo } from '@/componentes/formularios/Campo'
import { Entrada } from '@/componentes/formularios/Entrada'
import {
  ContenidoSelector, DisparadorSelector, Opcion, Selector
} from '@/componentes/formularios/Selector'
import { CerrarDialogo, ContenidoDialogo, Dialogo } from '@/componentes/superposiciones/Dialogo'
import { cargarAsignables } from '@/datos/asignables'
import { areasProhibidasComoSuperior } from '@/datos/jerarquia'
import { motivoParaRechazarNombre } from '@/dominio/accesos'
import { CabeceraDePanel, DialogoConfirmar, MensajeDeError, SIN_VALOR } from './piezas'
import type { AreaDeAccesos, CargoDeAccesos, CatalogoDeAccesos } from '@/datos/accesos'
import type { PersonaAsignable } from '@/datos/recursos'

interface PropsPanelAreasCargos {
  catalogo: CatalogoDeAccesos
  recargar: () => void
}

/**
 * Las áreas del organigrama y los cargos, en un solo panel.
 *
 * Van juntos porque son las dos mitades de "dónde está alguien en la casa": el área dice de quién
 * depende —es la que resuelve la jerarquía, que no tiene tabla de jefe por persona— y el cargo dice
 * qué hace. Separarlos en dos pestañas obligaría a saltar entre ellas para completar a una persona.
 *
 * El árbol completo se sigue moviendo en `/equipo/jerarquia`: acá se crean, se renombran y se
 * reubican, que es lo que hace falta al armar la estructura, no al reacomodarla todos los días.
 */
export function PanelAreasCargos ({ catalogo, recargar }: PropsPanelAreasCargos) {
  const [personas, setPersonas] = useState<PersonaAsignable[] | null>(null)
  const [errorPersonas, setErrorPersonas] = useState<string | null>(null)

  useEffect(() => {
    let vigente = true

    // Sin señal de aborto: `cargarAsignables()` comparte una promesa por pestaña, y abortarla le
    // rompería la carga a los demás consumidores. Se descarta la respuesta al desmontar.
    cargarAsignables()
      .then((lista) => { if (vigente) setPersonas(lista) })
      .catch((fallo: unknown) => {
        if (!vigente) return

        setErrorPersonas(fallo instanceof Error ? fallo.message : 'No se pudo leer el equipo.')
      })

    return () => { vigente = false }
  }, [])

  return (
    <div className="flex flex-col gap-10">
      <SeccionAreas
        catalogo={catalogo}
        personas={personas ?? []}
        errorPersonas={errorPersonas}
        recargar={recargar}
      />
      <SeccionCargos catalogo={catalogo} recargar={recargar} />
    </div>
  )
}

/** El CRUD de áreas, con su superior y su jefe. */
function SeccionAreas ({
  catalogo, personas, errorPersonas, recargar
}: {
  catalogo: CatalogoDeAccesos
  personas: PersonaAsignable[]
  errorPersonas: string | null
  recargar: () => void
}) {
  const [editando, setEditando] = useState<{ area: AreaDeAccesos | null } | null>(null)
  const [borrando, setBorrando] = useState<AreaDeAccesos | null>(null)
  const [enCurso, setEnCurso] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /** Borra el área elegida. La API responde 409 si tiene personas dentro. */
  async function borrar (): Promise<void> {
    if (borrando === null) return

    setEnCurso(true)
    setError(null)

    const resultado = await escribirEnBff(`accesos/areas/${borrando.id}`, 'DELETE')

    setEnCurso(false)

    if (!resultado.ok) {
      setError(resultado.mensaje)

      return
    }

    setBorrando(null)
    recargar()
  }

  /** Nombre del área superior, o el guion de una raíz del organigrama. */
  function nombreDeSuperior (area: AreaDeAccesos): string {
    if (area.area_superior_id === null) return '—'

    return catalogo.areas.find((otra) => otra.id === area.area_superior_id)?.nombre
      ?? `Área ${area.area_superior_id}`
  }

  /** Nombre de quien dirige el área. Cae al id cuando el equipo no se pudo leer. */
  function nombreDeJefe (area: AreaDeAccesos): string {
    if (area.jefe_staffid === null) return 'Sin jefatura'

    return personas.find((persona) => persona.id === area.jefe_staffid)?.full_name
      ?? `Persona ${area.jefe_staffid}`
  }

  return (
    <div className="flex flex-col gap-4">
      <CabeceraDePanel
        titulo="Áreas"
        descripcion="El organigrama. De quién depende alguien se deriva de su área: el jefe es quien dirige el área que lleva puesta."
        accion={
          <Boton variante="primario" onClick={() => { setEditando({ area: null }) }}>
            Nueva área
          </Boton>
        }
      />

      {errorPersonas !== null && (
        <MensajeDeError>
          No se pudo leer el equipo ({errorPersonas}), así que las jefaturas se muestran por su id y no
          se pueden cambiar.
        </MensajeDeError>
      )}

      {error !== null && <MensajeDeError>{error}</MensajeDeError>}

      {catalogo.areas.length === 0
        ? (
          <Vacio
            titulo="No hay áreas"
            descripcion="Sin áreas, nadie depende de nadie y el alcance «su área» no recorta nada. Crea la primera para empezar el organigrama."
          />
          )
        : (
          <div className="overflow-x-auto">
            <Tabla>
              <EncabezadoTabla>
                <tr>
                  <CeldaEncabezado>Área</CeldaEncabezado>
                  <CeldaEncabezado>Depende de</CeldaEncabezado>
                  <CeldaEncabezado>Jefatura</CeldaEncabezado>
                  <CeldaEncabezado numerica angosta>Personas</CeldaEncabezado>
                  <CeldaEncabezado angosta>Acciones</CeldaEncabezado>
                </tr>
              </EncabezadoTabla>
              <CuerpoTabla>
                {catalogo.areas.map((area) => (
                  <FilaTabla key={area.id}>
                    <CeldaTabla>{area.nombre}</CeldaTabla>
                    <CeldaTabla>{nombreDeSuperior(area)}</CeldaTabla>
                    <CeldaTabla>{nombreDeJefe(area)}</CeldaTabla>
                    <CeldaTabla numerica>{area.personas}</CeldaTabla>
                    <CeldaTabla angosta>
                      <span className="flex gap-1">
                        <Boton variante="sutil" tamano="chico" onClick={() => { setEditando({ area }) }}>
                          Editar
                        </Boton>
                        <Boton
                          variante="sutil"
                          tamano="chico"
                          onClick={() => { setError(null); setBorrando(area) }}
                        >
                          Borrar
                        </Boton>
                      </span>
                    </CeldaTabla>
                  </FilaTabla>
                ))}
              </CuerpoTabla>
            </Tabla>
          </div>
          )}

      {editando !== null && (
        <DialogoDeArea
          area={editando.area}
          areas={catalogo.areas}
          personas={personas}
          cerrar={() => { setEditando(null) }}
          alGuardar={() => { setEditando(null); recargar() }}
        />
      )}

      <DialogoConfirmar
        abierto={borrando !== null}
        titulo={`Borrar el área «${borrando?.nombre ?? ''}»`}
        descripcion="Solo se puede borrar un área vacía. Si tiene personas dentro, la API lo rechaza y hay que moverlas primero."
        etiquetaConfirmar="Borrar el área"
        peligroso
        enCurso={enCurso}
        error={error}
        onConfirmar={() => { void borrar() }}
        onCerrar={() => { setBorrando(null) }}
      />
    </div>
  )
}

/**
 * Alta y edición de un área.
 *
 * El selector de área superior esconde a la propia área y a toda su descendencia: elegir una de esas
 * haría un ciclo, que la API rechaza con 422. Es la misma regla que usa la pantalla de jerarquía, y
 * está compartida para que no haya dos opiniones sobre qué es un ciclo.
 */
function DialogoDeArea ({
  area, areas, personas, cerrar, alGuardar
}: {
  area: AreaDeAccesos | null
  areas: AreaDeAccesos[]
  personas: PersonaAsignable[]
  cerrar: () => void
  alGuardar: () => void
}) {
  const [nombre, setNombre] = useState(area?.nombre ?? '')
  const [superior, setSuperior] = useState<number | null>(area?.area_superior_id ?? null)
  const [jefe, setJefe] = useState<number | null>(area?.jefe_staffid ?? null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const otros = areas.filter((otra) => otra.id !== area?.id).map((otra) => otra.nombre)
  const motivo = motivoParaRechazarNombre(nombre, otros)
  const prohibidas = area === null ? new Set<number>() : areasProhibidasComoSuperior(areas, area.id)
  const posiblesSuperiores = areas.filter((otra) => !prohibidas.has(otra.id))

  /** Manda el alta o la edición del área. */
  async function guardar (): Promise<void> {
    if (motivo !== null) {
      setError(motivo)

      return
    }

    setGuardando(true)
    setError(null)

    const cuerpo = { nombre: nombre.trim(), area_superior_id: superior, jefe_staffid: jefe }
    const resultado = area === null
      ? await escribirEnBff('accesos/areas', 'POST', cuerpo)
      : await escribirEnBff(`accesos/areas/${area.id}`, 'PUT', cuerpo)

    setGuardando(false)

    if (!resultado.ok) {
      setError(resultado.mensaje)

      return
    }

    alGuardar()
  }

  return (
    <Dialogo open onOpenChange={(abierto) => { if (!abierto) cerrar() }}>
      <ContenidoDialogo
        titulo={area === null ? 'Nueva área' : `Área «${area.nombre}»`}
        descripcion="Un área sin superior es una raíz del organigrama. Un área sin jefatura deja a su gente sin reportar a nadie."
      >
        <form
          onSubmit={(evento) => { evento.preventDefault(); void guardar() }}
          className="flex flex-col gap-5"
        >
          <Campo etiqueta="Nombre" requerido>
            {(props) => (
              <Entrada
                {...props}
                value={nombre}
                maxLength={80}
                disabled={guardando}
                onChange={(evento) => { setNombre(evento.target.value); setError(null) }}
              />
            )}
          </Campo>

          <Campo etiqueta="Depende de" ayuda="Su propia descendencia no se ofrece: haría un ciclo.">
            {(props) => (
              <Selector
                value={superior === null ? SIN_VALOR : String(superior)}
                disabled={guardando}
                onValueChange={(valor) => { setSuperior(valor === SIN_VALOR ? null : Number(valor)) }}
              >
                <DisparadorSelector marcador="Es una raíz" id={props.id} />
                <ContenidoSelector>
                  <Opcion value={SIN_VALOR}>Es una raíz</Opcion>
                  {posiblesSuperiores.map((otra) => (
                    <Opcion key={otra.id} value={String(otra.id)}>{otra.nombre}</Opcion>
                  ))}
                </ContenidoSelector>
              </Selector>
            )}
          </Campo>

          <Campo
            etiqueta="Jefatura"
            ayuda={personas.length === 0 ? 'El equipo no se pudo leer, así que no hay a quién elegir.' : undefined}
          >
            {(props) => (
              <Selector
                value={jefe === null ? SIN_VALOR : String(jefe)}
                disabled={guardando || personas.length === 0}
                onValueChange={(valor) => { setJefe(valor === SIN_VALOR ? null : Number(valor)) }}
              >
                <DisparadorSelector marcador="Sin jefatura" id={props.id} />
                <ContenidoSelector>
                  <Opcion value={SIN_VALOR}>Sin jefatura</Opcion>
                  {personas.map((persona) => (
                    <Opcion key={persona.id} value={String(persona.id)}>{persona.full_name}</Opcion>
                  ))}
                </ContenidoSelector>
              </Selector>
            )}
          </Campo>

          {error !== null && <MensajeDeError>{error}</MensajeDeError>}

          <div className="flex justify-end gap-2">
            <CerrarDialogo asChild>
              <Boton variante="sutil" type="button">Cancelar</Boton>
            </CerrarDialogo>
            <Boton variante="primario" type="submit" cargando={guardando} disabled={motivo !== null}>
              Guardar
            </Boton>
          </div>
        </form>
      </ContenidoDialogo>
    </Dialogo>
  )
}

/** El CRUD de cargos: nombre y nada más. */
function SeccionCargos ({ catalogo, recargar }: { catalogo: CatalogoDeAccesos, recargar: () => void }) {
  const [editando, setEditando] = useState<{ cargo: CargoDeAccesos | null } | null>(null)
  const [borrando, setBorrando] = useState<CargoDeAccesos | null>(null)
  const [enCurso, setEnCurso] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /** Borra el cargo elegido. La API responde 409 en los cargos por defecto de la instalación. */
  async function borrar (): Promise<void> {
    if (borrando === null) return

    setEnCurso(true)
    setError(null)

    const resultado = await escribirEnBff(`accesos/cargos/${borrando.id}`, 'DELETE')

    setEnCurso(false)

    if (!resultado.ok) {
      setError(resultado.mensaje)

      return
    }

    setBorrando(null)
    recargar()
  }

  return (
    <div className="flex flex-col gap-4">
      <CabeceraDePanel
        titulo="Cargos"
        descripcion="Qué hace cada persona. El cargo Director abre «Mi Área», así que los dos cargos por defecto de la instalación no se pueden borrar."
        accion={
          <Boton variante="primario" onClick={() => { setEditando({ cargo: null }) }}>
            Nuevo cargo
          </Boton>
        }
      />

      {error !== null && <MensajeDeError>{error}</MensajeDeError>}

      {catalogo.cargos.length === 0
        ? (
          <Vacio
            titulo="No hay cargos"
            descripcion="Sin cargos no se puede marcar quién es Director, que es lo que abre la sección «Mi Área»."
          />
          )
        : (
          <div className="overflow-x-auto">
            <Tabla>
              <EncabezadoTabla>
                <tr>
                  <CeldaEncabezado>Cargo</CeldaEncabezado>
                  <CeldaEncabezado numerica angosta>Personas</CeldaEncabezado>
                  <CeldaEncabezado angosta>Acciones</CeldaEncabezado>
                </tr>
              </EncabezadoTabla>
              <CuerpoTabla>
                {catalogo.cargos.map((cargo) => (
                  <FilaTabla key={cargo.id}>
                    <CeldaTabla>{cargo.nombre}</CeldaTabla>
                    <CeldaTabla numerica>{cargo.personas}</CeldaTabla>
                    <CeldaTabla angosta>
                      <span className="flex gap-1">
                        <Boton variante="sutil" tamano="chico" onClick={() => { setEditando({ cargo }) }}>
                          Renombrar
                        </Boton>
                        <Boton
                          variante="sutil"
                          tamano="chico"
                          onClick={() => { setError(null); setBorrando(cargo) }}
                        >
                          Borrar
                        </Boton>
                      </span>
                    </CeldaTabla>
                  </FilaTabla>
                ))}
              </CuerpoTabla>
            </Tabla>
          </div>
          )}

      {editando !== null && (
        <DialogoDeCargo
          cargo={editando.cargo}
          cargos={catalogo.cargos}
          cerrar={() => { setEditando(null) }}
          alGuardar={() => { setEditando(null); recargar() }}
        />
      )}

      <DialogoConfirmar
        abierto={borrando !== null}
        titulo={`Borrar el cargo «${borrando?.nombre ?? ''}»`}
        descripcion="Quien lo tenga puesto queda sin cargo. Los cargos por defecto de la instalación no se pueden borrar: la API los rechaza."
        etiquetaConfirmar="Borrar el cargo"
        peligroso
        enCurso={enCurso}
        error={error}
        onConfirmar={() => { void borrar() }}
        onCerrar={() => { setBorrando(null) }}
      />
    </div>
  )
}

/** Alta y renombre de un cargo. */
function DialogoDeCargo ({
  cargo, cargos, cerrar, alGuardar
}: {
  cargo: CargoDeAccesos | null
  cargos: CargoDeAccesos[]
  cerrar: () => void
  alGuardar: () => void
}) {
  const [nombre, setNombre] = useState(cargo?.nombre ?? '')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const otros = cargos.filter((otro) => otro.id !== cargo?.id).map((otro) => otro.nombre)
  const motivo = motivoParaRechazarNombre(nombre, otros)

  /** Manda el alta o el renombre del cargo. */
  async function guardar (): Promise<void> {
    if (motivo !== null) {
      setError(motivo)

      return
    }

    setGuardando(true)
    setError(null)

    const resultado = cargo === null
      ? await escribirEnBff('accesos/cargos', 'POST', { nombre: nombre.trim() })
      : await escribirEnBff(`accesos/cargos/${cargo.id}`, 'PUT', { nombre: nombre.trim() })

    setGuardando(false)

    if (!resultado.ok) {
      setError(resultado.mensaje)

      return
    }

    alGuardar()
  }

  return (
    <Dialogo open onOpenChange={(abierto) => { if (!abierto) cerrar() }}>
      <ContenidoDialogo
        titulo={cargo === null ? 'Nuevo cargo' : `Renombrar «${cargo.nombre}»`}
        descripcion="El cargo no reparte permisos por sí solo, salvo Director, que abre «Mi Área»."
        ancho="chico"
      >
        <form
          onSubmit={(evento) => { evento.preventDefault(); void guardar() }}
          className="flex flex-col gap-5"
        >
          <Campo etiqueta="Nombre" requerido>
            {(props) => (
              <Entrada
                {...props}
                value={nombre}
                maxLength={80}
                disabled={guardando}
                onChange={(evento) => { setNombre(evento.target.value); setError(null) }}
              />
            )}
          </Campo>

          {error !== null && <MensajeDeError>{error}</MensajeDeError>}

          <div className="flex justify-end gap-2">
            <CerrarDialogo asChild>
              <Boton variante="sutil" type="button">Cancelar</Boton>
            </CerrarDialogo>
            <Boton variante="primario" type="submit" cargando={guardando} disabled={motivo !== null}>
              Guardar
            </Boton>
          </div>
        </form>
      </ContenidoDialogo>
    </Dialogo>
  )
}
