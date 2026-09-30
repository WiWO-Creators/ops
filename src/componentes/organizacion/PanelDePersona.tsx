'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ExternalLink } from 'lucide-react'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { BotonSuplantar } from '@/componentes/equipo/BotonSuplantar'
import { Cargando } from '@/componentes/estado/Estados'
import { useAviso } from '@/componentes/estado/useAviso'
import { Boton } from '@/componentes/formularios/Boton'
import { Campo } from '@/componentes/formularios/Campo'
import { Segmentado } from '@/componentes/formularios/Segmentado'
import {
  ContenidoSelector, DisparadorSelector, Opcion, Selector
} from '@/componentes/formularios/Selector'
import { EnlacePersona } from '@/componentes/presentadores/EnlacePersona'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { Cajon, CerrarCajon, ContenidoCajon } from '@/componentes/superposiciones/Cajon'
import { pedirSobre } from '@/datos/cliente'
import { jefesPosiblesPara } from '@/dominio/accesos'
import { ESCALONES, esEscalon, type Escalon } from '@/dominio/escalon'
import { colorDeArea, jefesElegibles, nombreDeArea } from '@/dominio/organigrama'
import {
  cambiosDePersona, formularioDe, hayCambios, nodosDesdePersonas, type CambiosDePersona
} from '@/dominio/organizacion'
import { ROLES_DE_SISTEMA, type RolDeSistema } from '@/dominio/rol-sistema'
import { Interruptor, MensajeDeError, SIN_VALOR } from './piezas'
import { ListaDeCambios } from './ListaDeCambios'
import { SeccionAlcance } from './SeccionAlcance'
import { SelectorDePersona, type OpcionDePersona } from './SelectorDePersona'
import type {
  CambioDelHistorial, CatalogoDeAccesos, PersonaDeAccesos
} from '@/datos/accesos'
import type { AreaDelOrganigrama, PersonaDelOrganigrama } from '@/datos/organigrama'

/** Cuántos cambios recientes se muestran en el panel. El resto está en la pestaña Historial. */
const CAMBIOS_RECIENTES = 8

/**
 * De dónde salen los datos de la persona.
 *
 * - `organizacion`: la pantalla de superadministración, con el catálogo de accesos. Se edita todo.
 * - `organigrama`: el dibujo tal como lo ve cualquiera (Mi Área, o Jerarquías sin ser superadmin).
 *   Trae lo necesario para el puesto, la jefatura y el área; lo demás vive en Organización.
 */
export type FuenteDePersona =
  | {
    tipo: 'organizacion'
    persona: PersonaDeAccesos
    catalogo: CatalogoDeAccesos
    /** El listado completo: de ahí salen los jefes posibles, sin quien cerraría un ciclo. */
    personas: PersonaDeAccesos[]
    /** Quien administra: no puede cambiarse ni el escalón ni el rol a sí mismo. */
    actorId: number
  }
  | {
    tipo: 'organigrama'
    persona: PersonaDelOrganigrama
    personas: PersonaDelOrganigrama[]
    areas: AreaDelOrganigrama[]
    /** `false` deja el panel de solo lectura: sirve para consultar de quién cuelga alguien. */
    editable: boolean
    actorId: number
  }

interface PropsPanelDePersona {
  fuente: FuenteDePersona
  onCerrar: () => void
  /** Se llama después de guardar algo, para que la pantalla vuelva a pedir lo que cambió. */
  onGuardado: () => void
}

/** Lo que el organigrama dibuja y mueve: común a las dos fuentes. */
interface Puesto {
  escalon: Escalon
  jefe_staffid: number | null
  area_id: number | null
}

/** Lo que solo se edita con el catálogo de accesos. */
interface Permisos {
  cargo_id: number | null
  coordinador_multiarea: boolean
  rol: RolDeSistema
}

/**
 * El puesto tal como está guardado.
 *
 * @param fuente de dónde sale la persona
 * @returns escalón, jefe y área
 */
function puestoDe (fuente: FuenteDePersona): Puesto {
  const { escalon, jefe_staffid: jefe, area_id: area } = fuente.persona

  return { escalon, jefe_staffid: jefe, area_id: area }
}

/**
 * Los permisos tal como están guardados; `null` si la fuente no los trae.
 *
 * @param fuente de dónde sale la persona
 * @returns cargo, coordinación y rol, o `null`
 */
function permisosDe (fuente: FuenteDePersona): Permisos | null {
  if (fuente.tipo !== 'organizacion') return null

  const { cargo_id: cargo, coordinador_multiarea: coordina, rol } = formularioDe(fuente.persona)

  return { cargo_id: cargo, coordinador_multiarea: coordina, rol }
}

/**
 * Qué cambió respecto de lo guardado, partido por el endpoint que lo escribe.
 *
 * Con la fuente del organigrama solo puede cambiar el puesto, y nunca el rol.
 *
 * @param fuente de dónde sale la persona
 * @param puesto lo puesto en escalón, jefe y área
 * @param permisos lo puesto en cargo, coordinación y rol, si la fuente los trae
 * @returns los dos cuerpos, cada uno posiblemente vacío
 */
function cambiosDelPanel (fuente: FuenteDePersona, puesto: Puesto, permisos: Permisos | null): CambiosDePersona {
  if (fuente.tipo === 'organizacion' && permisos !== null) {
    return cambiosDePersona(fuente.persona, { ...puesto, ...permisos })
  }

  const guardado = fuente.persona
  const accesos: CambiosDePersona['accesos'] = {}

  if (puesto.escalon !== guardado.escalon) accesos.escalon = puesto.escalon
  if (puesto.jefe_staffid !== guardado.jefe_staffid) accesos.jefe_staffid = puesto.jefe_staffid
  if (puesto.area_id !== guardado.area_id) accesos.area_id = puesto.area_id

  return { accesos, rol: {} }
}

/**
 * Quiénes pueden quedar a cargo, sin nadie de la propia descendencia: sería el ciclo que la API
 * rechaza con un 422.
 *
 * @param fuente de dónde sale la persona
 * @returns los candidatos con su área como detalle, ordenados por nombre
 */
function jefesDe (fuente: FuenteDePersona): OpcionDePersona[] {
  if (fuente.tipo === 'organigrama') {
    return jefesElegibles(fuente.personas, fuente.persona.staffid).map((una) => ({
      staffid: una.staffid, nombre: una.nombre, detalle: nombreDeArea(fuente.areas, una.area_id)
    }))
  }

  const nombreDelArea = new Map(fuente.catalogo.areas.map((area) => [area.id, area.nombre]))
  const areaDe = new Map(fuente.personas.map((una) => [una.staffid, una.area_id]))

  return jefesPosiblesPara(nodosDesdePersonas(fuente.personas), fuente.persona).map((nodo) => {
    const areaId = areaDe.get(nodo.staffid) ?? null

    return { staffid: nodo.staffid, nombre: nodo.nombre, detalle: areaId === null ? undefined : nombreDelArea.get(areaId) }
  })
}

/**
 * La ficha de una persona en Organización, la misma desde el mapa, la lista o la pestaña Personas.
 *
 * Con la fuente de Organización se edita todo junto y **se guarda con un solo botón**: puesto, de
 * quién cuelga, área, cargo, rol de sistema y coordinación. Con la del organigrama se edita el
 * puesto, la jefatura y el área —si quien mira puede editar— y se enlaza a Organización para el resto.
 *
 * **No es el plan B del arrastre, es la vía principal**: con 184 personas el jefe de destino casi
 * nunca está a la vista, y en un teléfono o con teclado no hay arrastre que valga.
 *
 * Guardar escribe hasta dos endpoints —`PUT /accesos/personas/{id}` y, si cambió el rol,
 * `PATCH /staff/{id}`—, cada uno solo con lo que cambió: mandar lo que no cambió dispararía guards
 * de la API sin motivo. Si el primero entra y el segundo no, se dice así: lo guardado está guardado.
 * Un 422 —el árbol se movió en otra pestaña— muestra el mensaje de la API sin reescribirlo.
 *
 * Debajo del formulario, con la fuente de Organización, va lo que se lee y no se edita: por qué ve
 * lo que ve, y sus últimos cambios.
 *
 * @param props la fuente de la persona y qué hacer al cerrar y al guardar
 */
export function PanelDePersona ({ fuente, onCerrar, onGuardado }: PropsPanelDePersona) {
  const aviso = useAviso()
  const [puesto, setPuesto] = useState<Puesto>(() => puestoDe(fuente))
  const [permisos, setPermisos] = useState<Permisos | null>(() => permisosDe(fuente))
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const [base, setBase] = useState(fuente.persona)

  const { persona } = fuente

  // La persona llega de nuevo después de guardar: el formulario vuelve a partir de lo guardado.
  if (base !== persona) {
    setBase(persona)
    setPuesto(puestoDe(fuente))
    setPermisos(permisosDe(fuente))
  }

  const completa = fuente.tipo === 'organizacion'
  const editable = completa || fuente.editable
  const esUnoMismo = persona.staffid === fuente.actorId
  const cambios = cambiosDelPanel(fuente, puesto, permisos)
  const areas = completa ? fuente.catalogo.areas : fuente.areas
  const avatar = completa ? null : fuente.persona.avatar
  const candidatos = jefesDe(fuente)
  const bloqueado = guardando || !editable

  /** Cambia un campo del puesto. */
  function ponerPuesto<K extends keyof Puesto> (campo: K, valor: Puesto[K]): void {
    setPuesto((previo) => ({ ...previo, [campo]: valor }))
    setError(null)
  }

  /** Cambia un campo de los permisos. */
  function ponerPermiso<K extends keyof Permisos> (campo: K, valor: Permisos[K]): void {
    setPermisos((previo) => previo === null ? previo : { ...previo, [campo]: valor })
    setError(null)
  }

  /** Escribe lo que cambió, en el orden en que se lee el panel. */
  async function guardar (): Promise<void> {
    setGuardando(true)
    setError(null)

    const escribioAccesos = Object.keys(cambios.accesos).length > 0

    if (escribioAccesos) {
      const resultado = await escribirEnBff(`accesos/personas/${persona.staffid}`, 'PUT', cambios.accesos)

      if (!resultado.ok) {
        setGuardando(false)
        setError(resultado.mensaje)

        return
      }
    }

    if (Object.keys(cambios.rol).length > 0) {
      const resultado = await escribirEnBff(`staff/${persona.staffid}`, 'PATCH', cambios.rol)

      if (!resultado.ok) {
        setGuardando(false)
        setError(escribioAccesos
          ? `Lo demás se guardó, pero el rol de sistema no: ${resultado.mensaje}`
          : resultado.mensaje)
        if (escribioAccesos) onGuardado()

        return
      }
    }

    setGuardando(false)
    setVersion((previa) => previa + 1)
    aviso.exito(`Cambios de «${persona.nombre}» guardados.`)
    onGuardado()
  }

  return (
    <Cajon open onOpenChange={(abierto) => { if (!abierto && !guardando) onCerrar() }}>
      <ContenidoCajon titulo={persona.nombre} descripcion={persona.correo}>
        <div className="flex flex-col gap-6">
          <header className="flex items-center gap-3">
            <EnlacePersona id={persona.staffid} nombre={persona.nombre} imagen={avatar} tamano="grande" mostrarNombre={false} />
            <div className="flex min-w-0 flex-col gap-1">
              <p className="text-texto-sutil flex items-center gap-1.5 text-xs">
                <span aria-hidden="true" className="size-2 rounded-full" style={{ backgroundColor: colorDeArea(persona.area_id) }} />
                {nombreDeArea(areas, persona.area_id)}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {!persona.activo && <Insignia tono="contorno" tamano="chico">De baja</Insignia>}
                <Link
                  href={`/equipo/${persona.staffid}`}
                  className="text-acento inline-flex items-center gap-1 text-sm hover:underline"
                >
                  Ver ficha <ExternalLink aria-hidden="true" className="size-3.5" />
                </Link>
                {completa && !esUnoMismo && <BotonSuplantar personaId={persona.staffid} nombre={persona.nombre} activa={persona.activo} />}
              </div>
            </div>
          </header>

          <form
            className="flex flex-col gap-6"
            onSubmit={(evento) => { evento.preventDefault(); void guardar() }}
          >
            <Grupo titulo="Puesto">
              <Campo
                etiqueta="Escalón"
                ayuda={esUnoMismo && editable ? 'No puedes cambiarte el escalón a ti mismo.' : 'Nombra el puesto. No reparte permisos: eso lo da el árbol.'}
              >
                {(props) => (
                  <Selector
                    value={puesto.escalon}
                    disabled={bloqueado || esUnoMismo}
                    onValueChange={(valor) => { if (esEscalon(valor)) ponerPuesto('escalon', valor) }}
                  >
                    <DisparadorSelector marcador="Elige un escalón" {...props} />
                    <ContenidoSelector>
                      {ESCALONES.map((uno) => <Opcion key={uno.clave} value={uno.clave}>{uno.nombre}</Opcion>)}
                    </ContenidoSelector>
                  </Selector>
                )}
              </Campo>

              {permisos !== null && completa && (
                <CampoDeCatalogo
                  etiqueta="Cargo"
                  marcador="Sin cargo"
                  valor={permisos.cargo_id}
                  opciones={fuente.catalogo.cargos}
                  deshabilitado={guardando}
                  onCambiar={(valor) => { ponerPermiso('cargo_id', valor) }}
                />
              )}
            </Grupo>

            <Grupo titulo="Jerarquía">
              <Campo
                etiqueta="Depende de"
                ayuda="Quien queda a cargo pasa a ver lo de esta persona y lo de quienes cuelgan de ella."
              >
                {(props) => (
                  <SelectorDePersona
                    id={props.id}
                    etiqueta={`Quién está a cargo de ${persona.nombre}`}
                    opciones={candidatos}
                    valor={puesto.jefe_staffid}
                    marcador="Sin jefe directo"
                    ayudaVacia={`Nadie coincide. Quien cuelga de ${persona.nombre} no aparece: sería un ciclo.`}
                    deshabilitado={bloqueado}
                    onCambiar={(valor) => { ponerPuesto('jefe_staffid', valor) }}
                  />
                )}
              </Campo>

              <CampoDeCatalogo
                etiqueta="Área principal"
                ayuda="Decide en qué tarjeta del mapa se cuenta y el color de su caja."
                marcador="Sin área"
                valor={puesto.area_id}
                opciones={areas}
                deshabilitado={bloqueado}
                onCambiar={(valor) => { ponerPuesto('area_id', valor) }}
              />
            </Grupo>

            {permisos !== null && (
              <Grupo titulo="Permisos">
                <CampoDeRol
                  rol={permisos.rol}
                  esUnoMismo={esUnoMismo}
                  deshabilitado={guardando}
                  onCambiar={(valor) => { ponerPermiso('rol', valor) }}
                />

                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-texto text-sm font-medium">Coordina varias áreas</p>
                    <p className="text-texto-tenue text-xs">Lee todas las filas de la casa; edita solo lo suyo y lo de su gente.</p>
                  </div>
                  <Interruptor
                    encendido={permisos.coordinador_multiarea}
                    etiqueta={`Coordinación multiárea de ${persona.nombre}`}
                    deshabilitado={guardando}
                    onPulsar={() => { ponerPermiso('coordinador_multiarea', !permisos.coordinador_multiarea) }}
                  />
                </div>
              </Grupo>
            )}

            {!completa && editable && (
              <p className="text-texto-tenue text-xs">
                El cargo, el rol de sistema y la coordinación se editan en{' '}
                <Link href="/equipo/jerarquia?tab=personas" className="text-acento hover:underline">Organización</Link>.
              </p>
            )}

            {error !== null && <MensajeDeError>{error}</MensajeDeError>}

            {editable && (
              <footer className="flex items-center justify-end gap-2">
                <CerrarCajon asChild>
                  <Boton variante="sutil" type="button" disabled={guardando}>Cerrar</Boton>
                </CerrarCajon>
                <Boton variante="primario" type="submit" cargando={guardando} disabled={!hayCambios(cambios)}>
                  Guardar
                </Boton>
              </footer>
            )}
          </form>

          {completa && (
            <>
              <Grupo titulo="¿Por qué ve esto?">
                <SeccionAlcance staffid={persona.staffid} version={version} />
              </Grupo>

              <Grupo titulo="Últimos cambios">
                <CambiosRecientes staffid={persona.staffid} version={version} />
              </Grupo>
            </>
          )}
        </div>
      </ContenidoCajon>
    </Cajon>
  )
}

/** Un bloque del panel con su título. */
function Grupo ({ titulo, children }: { titulo: string, children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-texto-sutil text-xs font-semibold uppercase tracking-wide">{titulo}</h3>
      {children}
    </section>
  )
}

/** Un desplegable sobre un catálogo con id y nombre, con "sin nada" arriba. */
function CampoDeCatalogo ({
  etiqueta, ayuda, marcador, valor, opciones, deshabilitado, onCambiar
}: {
  etiqueta: string
  ayuda?: string
  marcador: string
  valor: number | null
  opciones: Array<{ id: number, nombre: string }>
  deshabilitado: boolean
  onCambiar: (valor: number | null) => void
}) {
  return (
    <Campo etiqueta={etiqueta} ayuda={ayuda}>
      {(props) => (
        <Selector
          value={valor === null ? SIN_VALOR : String(valor)}
          disabled={deshabilitado}
          onValueChange={(elegido) => { onCambiar(elegido === SIN_VALOR ? null : Number(elegido)) }}
        >
          <DisparadorSelector marcador={marcador} {...props} />
          <ContenidoSelector>
            <Opcion value={SIN_VALOR}>{marcador}</Opcion>
            {opciones.map((opcion) => <Opcion key={opcion.id} value={String(opcion.id)}>{opcion.nombre}</Opcion>)}
          </ContenidoSelector>
        </Selector>
      )}
    </Campo>
  )
}

/**
 * El rol de sistema: tres opciones, porque dos casillas sueltas admitían "superadministrador sin ser
 * administrador", que en el panel viejo deja a la persona sin permisos. En uno mismo se lee y no se
 * ofrece: nadie se degrada por accidente.
 */
function CampoDeRol ({
  rol, esUnoMismo, deshabilitado, onCambiar
}: {
  rol: RolDeSistema
  esUnoMismo: boolean
  deshabilitado: boolean
  onCambiar: (rol: RolDeSistema) => void
}) {
  const descripcion = ROLES_DE_SISTEMA.find((opcion) => opcion.valor === rol)

  return (
    <div className="flex flex-col gap-2">
      <p className="text-texto text-sm font-medium">Rol de sistema</p>
      {esUnoMismo
        ? <p className="text-texto text-sm">{descripcion?.etiqueta}</p>
        : (
          <Segmentado
            etiqueta="Rol de sistema"
            activo={rol}
            opciones={ROLES_DE_SISTEMA.map((opcion) => ({ valor: opcion.valor, etiqueta: opcion.etiqueta }))}
            onElegir={(valor) => { if (!deshabilitado) onCambiar(valor as RolDeSistema) }}
          />
          )}
      <p className="text-texto-tenue text-xs">
        {esUnoMismo ? 'No puedes cambiarte el rol a ti mismo: pídeselo a otro superadministrador.' : descripcion?.ayuda}
      </p>
    </div>
  )
}

/**
 * Los últimos cambios de esta persona.
 *
 * Una instalación sin la migración del historial responde 409: se dice eso y no un error genérico,
 * porque no es un fallo de la pantalla sino algo que falta desplegar.
 */
function CambiosRecientes ({ staffid, version }: { staffid: number, version: number }) {
  const [cambios, setCambios] = useState<CambioDelHistorial[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const control = new AbortController()

    pedirSobre<CambioDelHistorial[]>(`accesos/historial?persona=${staffid}&per_page=${CAMBIOS_RECIENTES}`, control.signal)
      .then((sobre) => { setCambios(sobre.data); setError(null) })
      .catch((problema: unknown) => {
        if (control.signal.aborted) return
        setError(problema instanceof Error ? problema.message : 'No se pudo leer el historial.')
      })

    return () => { control.abort() }
  }, [staffid, version])

  if (error !== null) return <p className="text-texto-tenue text-sm">{error}</p>
  if (cambios === null) return <Cargando alto="min-h-16" mensaje="Leyendo el historial…" />
  if (cambios.length === 0) return <p className="text-texto-tenue text-sm">Sin cambios registrados todavía.</p>

  return <ListaDeCambios cambios={cambios} sinEntidad />
}
