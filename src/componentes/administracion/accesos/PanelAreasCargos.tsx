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
import { AgregarAlArea } from '@/componentes/organigrama/AgregarAlArea'
import { cargarAsignables } from '@/datos/asignables'
import { pedirSobre } from '@/datos/cliente'
import { descendenciaDe } from '@/dominio/jerarquia'
import { motivoParaRechazarNombre } from '@/dominio/accesos'
import { CabeceraDePanel, DialogoConfirmar, MensajeDeError, SIN_VALOR } from './piezas'
import type { AreaDeAccesos, CargoDeAccesos, CatalogoDeAccesos, UsoDeArea } from '@/datos/accesos'
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
  const [poblando, setPoblando] = useState<AreaDeAccesos | null>(null)
  const [moviendo, setMoviendo] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * Mueve varias personas al área que se está poblando.
   *
   * En serie y no en paralelo: la API escribe una persona por petición, y varias llamadas a la vez
   * sobre la misma tabla es la forma de que dos se pisen. Se corta en el primer fallo y se dice
   * cuántas alcanzaron a entrar, porque esas ya están guardadas.
   *
   * @param staffids la gente elegida en el diálogo
   * @returns cuántas entraron y el motivo del primer fallo, si lo hubo
   */
  async function moverAlArea (staffids: number[]): Promise<{ guardadas: number, error: string | null }> {
    if (poblando === null) return { guardadas: 0, error: 'No hay ningún área elegida.' }

    setMoviendo(true)
    setError(null)

    let guardadas = 0
    let fallo: string | null = null

    for (const staffid of staffids) {
      const resultado = await escribirEnBff(
        `accesos/personas/${staffid}`, 'PUT', { area_id: poblando.id }
      )

      if (!resultado.ok) {
        fallo = resultado.mensaje
        break
      }

      guardadas += 1
    }

    setMoviendo(false)
    if (fallo !== null) setError(fallo)
    // El catálogo cuenta las personas de cada área: sin recargar, la columna seguiría diciendo el
    // número viejo al lado de gente que ya se movió.
    if (guardadas > 0) recargar()

    return { guardadas, error: fallo }
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
        descripcion="La segunda fuente del alcance. Quien figura como jefatura de un área alcanza a toda su gente y a la de las áreas que cuelgan de ella; pertenecer a un área, en cambio, no alcanza a nadie. Por eso dos leads de la misma área no se ven entre sí."
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
                        <Boton
                          variante="sutil"
                          tamano="chico"
                          disabled={personas === null}
                          onClick={() => { setError(null); setPoblando(area) }}
                        >
                          Agregar gente
                        </Boton>
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

      {poblando !== null && personas !== null && (
        <AgregarAlArea
          areaId={poblando.id}
          areas={catalogo.areas.map((una) => ({ ...una, leads: 0 }))}
          personas={personas.map((una) => ({
            staffid: una.id,
            nombre: una.full_name,
            area_id: una.area_id,
            avatar: una.profile_image_url
          }))}
          abierto
          guardando={moviendo}
          onCerrar={() => { setPoblando(null) }}
          onAgregar={moverAlArea}
        />
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

      {borrando !== null && (
        <DialogoDeBorradoDeArea
          area={borrando}
          areas={catalogo.areas}
          cerrar={() => { setBorrando(null) }}
          alBorrar={() => { setBorrando(null); recargar() }}
        />
      )}
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
  const prohibidas = area === null ? new Set<number>() : descendenciaDe(areas, area.id)
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

/**
 * Borrado de un área, con destino para lo que tenía dentro.
 *
 * Ya no hace falta vaciarla a mano: la API se lleva la gente, las áreas que colgaban y la etiqueta de
 * los Procesos al destino elegido. El diálogo pregunta primero qué hay dentro porque sin ese número
 * «dejar sin área» parece inofensivo cuando en realidad desetiqueta cientos de Procesos, y por eso
 * mismo exige elegir destino salvo que el área esté vacía.
 */
function DialogoDeBorradoDeArea ({
  area, areas, cerrar, alBorrar
}: {
  area: AreaDeAccesos
  areas: AreaDeAccesos[]
  cerrar: () => void
  alBorrar: () => void
}) {
  const [uso, setUso] = useState<UsoDeArea | null>(null)
  const [destino, setDestino] = useState<string | null>(null)
  const [enCurso, setEnCurso] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const control = new AbortController()

    pedirSobre<UsoDeArea>(`accesos/areas/${area.id}/uso`, control.signal)
      .then((sobre) => {
        setUso(sobre.data)
        // Un área vacía no tiene nada que mudar: se preelige la opción sin consecuencias para que el
        // borrado sea un solo clic. Con gente adentro no se preelige nada, a propósito.
        if (estaVacia(sobre.data)) setDestino(SIN_VALOR)
      })
      .catch((fallo: unknown) => {
        if (control.signal.aborted) return

        setError(fallo instanceof Error ? fallo.message : 'No se pudo leer qué hay dentro del área.')
      })

    return () => { control.abort() }
  }, [area.id])

  const prohibidas = descendenciaDe(areas, area.id)
  const posiblesDestinos = areas.filter((otra) => !prohibidas.has(otra.id))
  const superior = areas.find((otra) => otra.id === area.area_superior_id) ?? null
  const elegida = destino === null || destino === SIN_VALOR
    ? null
    : (posiblesDestinos.find((otra) => String(otra.id) === destino) ?? null)

  /**
   * Manda el borrado con el destino elegido.
   *
   * El destino viaja siempre, incluso cuando es `null`: para la API «dejar sin área» es una decisión
   * tomada y no un campo que se olvidó mandar.
   */
  async function borrar (): Promise<void> {
    if (destino === null) return

    setEnCurso(true)
    setError(null)

    const resultado = await escribirEnBff(`accesos/areas/${area.id}`, 'DELETE', {
      destino_area_id: destino === SIN_VALOR ? null : Number(destino)
    })

    setEnCurso(false)

    if (!resultado.ok) {
      setError(resultado.mensaje)

      return
    }

    alBorrar()
  }

  return (
    <Dialogo open onOpenChange={(abierto) => { if (!abierto) cerrar() }}>
      <ContenidoDialogo
        titulo={`Borrar el área «${area.nombre}»`}
        descripcion="El área desaparece, pero lo que tenía dentro no: se muda a donde elijas. Ninguna Tarea se borra."
        ancho="chico"
      >
        <div className="flex flex-col gap-5">
          <p className="text-texto-tenue text-sm">
            {uso === null
              ? 'Revisando qué hay dentro del área…'
              : `Dentro hay ${resumenDeUso(uso)}`}
          </p>

          <Campo etiqueta="Mover todo a" requerido={uso !== null && !estaVacia(uso)}>
            {(props) => (
              <Selector
                value={destino ?? ''}
                disabled={uso === null || enCurso}
                onValueChange={(valor) => { setDestino(valor); setError(null) }}
              >
                <DisparadorSelector marcador="Elige un destino" id={props.id} />
                <ContenidoSelector>
                  <Opcion value={SIN_VALOR}>Dejar sin área</Opcion>
                  {posiblesDestinos.map((otra) => (
                    <Opcion key={otra.id} value={String(otra.id)}>{otra.nombre}</Opcion>
                  ))}
                </ContenidoSelector>
              </Selector>
            )}
          </Campo>

          {destino !== null && (
            <p className="text-texto-tenue text-sm">
              {consecuenciaDeBorrar(area, elegida, superior)}
            </p>
          )}

          {error !== null && <MensajeDeError>{error}</MensajeDeError>}

          <div className="flex justify-end gap-2">
            <CerrarDialogo asChild>
              <Boton variante="sutil" type="button">Cancelar</Boton>
            </CerrarDialogo>
            <Boton
              variante="peligro"
              cargando={enCurso}
              disabled={uso === null || destino === null || enCurso}
              onClick={() => { void borrar() }}
            >
              Borrar el área
            </Boton>
          </div>
        </div>
      </ContenidoDialogo>
    </Dialogo>
  )
}

/** `true` si no hay nada que mudar, que es cuando el borrado no necesita que se elija destino. */
function estaVacia (uso: UsoDeArea): boolean {
  return uso.personas === 0 && uso.hijas === 0 && uso.procesos === 0
}

/** Las tres cuentas del área en una frase: tres números sueltos no dicen si borrar duele. */
function resumenDeUso (uso: UsoDeArea): string {
  const personas = contar(uso.personas, 'persona', 'personas')
  const hijas = contar(uso.hijas, 'área que depende de ella', 'áreas que dependen de ella')
  const procesos = contar(uso.procesos, 'Tarea etiquetada', 'Tareas etiquetadas')

  return `${personas}, ${hijas} y ${procesos}.`
}

/** Un número con separador de miles y su sustantivo en singular o plural. */
function contar (cantidad: number, singular: string, plural: string): string {
  return `${cantidad.toLocaleString('es-CL')} ${cantidad === 1 ? singular : plural}`
}

/**
 * Qué se lleva el borrado según el destino elegido, dicho con los nombres propios de cada lugar.
 *
 * «Las personas se mueven» no responde la única pregunta que importa antes de apretar, que es adónde
 * van a parar la gente y las etiquetas de los Procesos.
 */
function consecuenciaDeBorrar (
  area: AreaDeAccesos, elegida: AreaDeAccesos | null, superior: AreaDeAccesos | null
): string {
  if (elegida !== null) {
    return `Las personas y las áreas que dependen de «${area.nombre}» pasan a «${elegida.nombre}», y sus Tareas quedan etiquetadas como «${elegida.nombre}».`
  }

  const hijas = superior === null
    ? 'las áreas que dependían de ella quedan como raíces del organigrama'
    : `las áreas que dependían de ella pasan a colgar de «${superior.nombre}»`

  return `Las personas quedan sin área, ${hijas}, y las Tareas pierden la etiqueta «${area.nombre}» sin que se borre ninguna.`
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
