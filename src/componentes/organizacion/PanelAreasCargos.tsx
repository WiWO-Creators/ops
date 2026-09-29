'use client'

import { useEffect, useState } from 'react'
import { UserPlus } from 'lucide-react'
import { ConfirmarBorrado } from '@/componentes/datos/ConfirmarBorrado'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import {
  CeldaEncabezado, CeldaTabla, CuerpoTabla, EncabezadoTabla, FilaTabla, Tabla
} from '@/componentes/datos/Tabla'
import { MenuAccionesFila } from '@/componentes/datos/MenuAccionesFila'
import { Vacio } from '@/componentes/estado/Estados'
import { useAviso } from '@/componentes/estado/useAviso'
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
import { LOCALE } from '@/lib/fechas'
import { CabeceraDePanel, MensajeDeError, SIN_VALOR } from './piezas'
import { SelectorDePersona } from './SelectorDePersona'
import type { AreaDeAccesos, CargoDeAccesos, CatalogoDeAccesos, UsoDeArea } from '@/datos/accesos'
import type { PersonaAsignable } from '@/datos/recursos'

/** Un recorte de la tabla de áreas puesto desde la salud del organigrama. */
export interface FiltroDeAreas {
  etiqueta: string
  ids: number[]
}

interface PropsPanelAreasCargos {
  catalogo: CatalogoDeAccesos
  recargar: () => void
  /** Solo estas áreas, con el motivo; `null` las muestra todas. */
  filtro?: FiltroDeAreas | null
  onQuitarFiltro?: () => void
}

/**
 * Las áreas del organigrama y los cargos, en un solo panel.
 *
 * Van juntos porque son las dos mitades de "dónde está alguien en la casa": el área dice de quién
 * depende —es la que resuelve la jerarquía, que no tiene tabla de jefe por persona— y el cargo dice
 * qué hace. Separarlos en dos pestañas obligaría a saltar entre ellas para completar a una persona.
 *
 * La gente se reacomoda en el organigrama y en Personas: acá se crean, se renombran y se reubican las
 * áreas, que es lo que hace falta al armar la estructura, no al reacomodarla todos los días.
 */
export function PanelAreasCargos ({ catalogo, recargar, filtro = null, onQuitarFiltro }: PropsPanelAreasCargos) {
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
        filtro={filtro}
        onQuitarFiltro={onQuitarFiltro}
      />
      <SeccionCargos catalogo={catalogo} recargar={recargar} />
    </div>
  )
}

/** El CRUD de áreas, con su superior y su jefe. */
function SeccionAreas ({
  catalogo, personas, errorPersonas, recargar, filtro, onQuitarFiltro
}: {
  catalogo: CatalogoDeAccesos
  personas: PersonaAsignable[]
  errorPersonas: string | null
  recargar: () => void
  filtro: FiltroDeAreas | null
  onQuitarFiltro?: () => void
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

  const visibles = filtro === null ? catalogo.areas : catalogo.areas.filter((area) => filtro.ids.includes(area.id))

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

      {filtro !== null && (
        <p className="text-texto flex flex-wrap items-center gap-2 text-sm">
          Mostrando {visibles.length} {visibles.length === 1 ? 'área' : 'áreas'}: {filtro.etiqueta.toLowerCase()}.
          {onQuitarFiltro !== undefined && (
            <Boton variante="sutil" tamano="chico" onClick={onQuitarFiltro}>Ver todas</Boton>
          )}
        </p>
      )}

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
                  <CeldaEncabezado angosta><span className="sr-only">Acciones</span></CeldaEncabezado>
                </tr>
              </EncabezadoTabla>
              <CuerpoTabla>
                {visibles.map((area) => (
                  <FilaTabla key={area.id}>
                    <CeldaTabla>{area.nombre}</CeldaTabla>
                    <CeldaTabla>{nombreDeSuperior(area)}</CeldaTabla>
                    <CeldaTabla>{nombreDeJefe(area)}</CeldaTabla>
                    <CeldaTabla numerica>{area.personas}</CeldaTabla>
                    <CeldaTabla angosta>
                      {/* «Borrar» no entra como `borrado` de `MenuAccionesFila`: la API exige elegir un
                          destino para lo que hay dentro del area, y eso es un dialogo propio, no una
                          confirmacion generica. Ver `DialogoDeBorradoDeArea`. */}
                      <MenuAccionesFila
                        onEditar={() => { setEditando({ area }) }}
                        acciones={[
                          {
                            clave: 'agregar-gente',
                            etiqueta: 'Agregar gente',
                            icono: UserPlus,
                            deshabilitado: personas === null,
                            onSeleccionar: () => { setError(null); setPoblando(area) }
                          },
                          {
                            clave: 'borrar',
                            etiqueta: 'Borrar',
                            peligroso: true,
                            onSeleccionar: () => { setError(null); setBorrando(area) }
                          }
                        ]}
                      />
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
export function DialogoDeArea ({
  area, areas, personas, cerrar, alGuardar
}: {
  area: AreaDeAccesos | null
  areas: AreaDeAccesos[]
  /** Quienes pueden dirigirla: basta con el id y el nombre. */
  personas: Array<Pick<PersonaAsignable, 'id' | 'full_name'>>
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
              <SelectorDePersona
                id={props.id}
                etiqueta="Jefatura del área"
                marcador="Sin jefatura"
                opciones={personas.map((persona) => ({ staffid: persona.id, nombre: persona.full_name }))}
                valor={jefe}
                deshabilitado={guardando || personas.length === 0}
                onCambiar={setJefe}
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
  const [error, setError] = useState<string | null>(null)
  const aviso = useAviso()

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
   * Manda el borrado con el destino elegido. Lanza si falla: `ConfirmarBorrado` muestra el mensaje.
   *
   * El destino viaja siempre, incluso cuando es `null`: para la API «dejar sin área» es una decisión
   * tomada y no un campo que se olvidó mandar.
   */
  async function borrar (): Promise<void> {
    if (destino === null) return

    const resultado = await escribirEnBff(`accesos/areas/${area.id}`, 'DELETE', {
      destino_area_id: destino === SIN_VALOR ? null : Number(destino)
    })

    if (!resultado.ok) throw new Error(resultado.mensaje)

    aviso.exito(`«${area.nombre}» se eliminó.`)
    alBorrar()
  }

  return (
    <ConfirmarBorrado
      abierto
      onCerrar={cerrar}
      titulo={`Borrar el área «${area.nombre}»`}
      advertencia="El área desaparece, pero lo que tenía dentro no: se muda a donde elijas. Ninguna Tarea se borra."
      etiquetaConfirmar="Borrar el área"
      deshabilitadoExtra={uso === null || destino === null}
      contenidoExtra={
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
                disabled={uso === null}
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
        </div>
      }
      onConfirmar={borrar}
    />
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
  return `${cantidad.toLocaleString(LOCALE)} ${cantidad === 1 ? singular : plural}`
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

  /**
   * Borra un cargo.
   *
   * La API responde 409 en los cargos por defecto de la instalación; el mensaje llega tal cual al
   * `ConfirmarBorrado`, que es quien lo muestra.
   */
  async function borrar (cargo: CargoDeAccesos): Promise<void> {
    const resultado = await escribirEnBff(`accesos/cargos/${cargo.id}`, 'DELETE')

    if (!resultado.ok) throw new Error(resultado.mensaje)

    recargar()
  }

  return (
    <div className="flex flex-col gap-4">
      <CabeceraDePanel
        titulo="Cargos"
        descripcion="Qué hace cada persona. No reparte permisos. Los dos cargos por defecto de la instalación no se pueden borrar."
        accion={
          <Boton variante="primario" onClick={() => { setEditando({ cargo: null }) }}>
            Nuevo cargo
          </Boton>
        }
      />

      {catalogo.cargos.length === 0
        ? (
          <Vacio
            titulo="No hay cargos"
            descripcion="Crea el primero para poder decir qué hace cada persona."
          />
          )
        : (
          <div className="overflow-x-auto">
            <Tabla>
              <EncabezadoTabla>
                <tr>
                  <CeldaEncabezado>Cargo</CeldaEncabezado>
                  <CeldaEncabezado numerica angosta>Personas</CeldaEncabezado>
                  <CeldaEncabezado angosta><span className="sr-only">Acciones</span></CeldaEncabezado>
                </tr>
              </EncabezadoTabla>
              <CuerpoTabla>
                {catalogo.cargos.map((cargo) => (
                  <FilaTabla key={cargo.id}>
                    <CeldaTabla>{cargo.nombre}</CeldaTabla>
                    <CeldaTabla numerica>{cargo.personas}</CeldaTabla>
                    <CeldaTabla angosta>
                      <MenuAccionesFila
                        onEditar={() => { setEditando({ cargo }) }}
                        borrado={{
                          titulo: 'Borrar el cargo',
                          advertencia: `Quien tenga puesto «${cargo.nombre}» queda sin cargo. Los cargos por defecto de la instalación no se pueden borrar: la API los rechaza.`,
                          onConfirmar: () => borrar(cargo)
                        }}
                      />
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
        descripcion="El cargo nombra lo que hace la persona y no reparte permisos."
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
