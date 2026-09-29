'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ExternalLink } from 'lucide-react'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { BotonSuplantar } from '@/componentes/equipo/BotonSuplantar'
import { Cargando } from '@/componentes/estado/Estados'
import { Boton } from '@/componentes/formularios/Boton'
import { Campo } from '@/componentes/formularios/Campo'
import { Segmentado } from '@/componentes/formularios/Segmentado'
import {
  ContenidoSelector, DisparadorSelector, Opcion, Selector
} from '@/componentes/formularios/Selector'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { Cajon, CerrarCajon, ContenidoCajon } from '@/componentes/superposiciones/Cajon'
import { pedirSobre } from '@/datos/cliente'
import { jefesPosiblesPara } from '@/dominio/accesos'
import { ESCALONES, esEscalon } from '@/dominio/escalon'
import {
  cambiosDePersona, formularioDe, hayCambios, nodosDesdePersonas, type FormularioDePersona
} from '@/dominio/organizacion'
import { ROLES_DE_SISTEMA, type RolDeSistema } from '@/dominio/rol-sistema'
import { Interruptor, MensajeDeError, SIN_VALOR } from './piezas'
import { ListaDeCambios } from './ListaDeCambios'
import { SeccionAlcance } from './SeccionAlcance'
import { SelectorDePersona } from './SelectorDePersona'
import type {
  CambioDelHistorial, CatalogoDeAccesos, PersonaDeAccesos
} from '@/datos/accesos'

/** Cuántos cambios recientes se muestran en el panel. El resto está en la pestaña Historial. */
const CAMBIOS_RECIENTES = 8

interface PropsPanelDePersona {
  persona: PersonaDeAccesos
  catalogo: CatalogoDeAccesos
  /** El listado completo: de ahí salen los jefes posibles, sin quien cerraría un ciclo. */
  personas: PersonaDeAccesos[]
  /** Quien administra: no puede cambiarse ni el escalón ni el rol a sí mismo. */
  actorId: number
  onCerrar: () => void
  /** Se llama después de guardar algo, para que la pantalla vuelva a pedir lo que cambió. */
  onGuardado: () => void
}

/**
 * Todo lo de una persona en un solo lugar: puesto, de quién cuelga, área, cargo y permisos.
 *
 * Antes esto estaba en tres pantallas —el escalón y el jefe en Jerarquías y en Accesos, el cargo y la
 * coordinación solo en Accesos, el rol de sistema en la ficha— y cada una guardaba distinto. Acá se
 * edita todo junto y **se guarda con un solo botón**: cambiar cinco cosas no son cinco escrituras
 * sueltas sin vuelta atrás.
 *
 * Guardar escribe hasta dos endpoints —`PUT /accesos/personas/{id}` y, si cambió el rol,
 * `PATCH /staff/{id}`—, cada uno solo con lo que cambió. Si el primero entra y el segundo no, se dice
 * así: lo guardado está guardado.
 *
 * Debajo del formulario va lo que se lee y no se edita: por qué ve lo que ve, y sus últimos cambios.
 */
export function PanelDePersona ({ persona, catalogo, personas, actorId, onCerrar, onGuardado }: PropsPanelDePersona) {
  const [formulario, setFormulario] = useState<FormularioDePersona>(() => formularioDe(persona))
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const [base, setBase] = useState(persona)

  // La persona llega de nuevo después de guardar: el formulario vuelve a partir de lo guardado.
  if (base !== persona) {
    setBase(persona)
    setFormulario(formularioDe(persona))
  }

  const esUnoMismo = persona.staffid === actorId
  const cambios = cambiosDePersona(persona, formulario)
  const candidatos = useMemo(() => {
    const nombreDeArea = new Map(catalogo.areas.map((area) => [area.id, area.nombre]))
    const areaDe = new Map(personas.map((una) => [una.staffid, una.area_id]))

    return jefesPosiblesPara(nodosDesdePersonas(personas), persona).map((nodo) => {
      const areaId = areaDe.get(nodo.staffid) ?? null

      return { staffid: nodo.staffid, nombre: nodo.nombre, detalle: areaId === null ? undefined : nombreDeArea.get(areaId) }
    })
  }, [catalogo.areas, personas, persona])

  /** Cambia un campo del formulario. */
  function poner<K extends keyof FormularioDePersona> (campo: K, valor: FormularioDePersona[K]): void {
    setFormulario((previo) => ({ ...previo, [campo]: valor }))
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
    onGuardado()
  }

  return (
    <Cajon open onOpenChange={(abierto) => { if (!abierto && !guardando) onCerrar() }}>
      <ContenidoCajon titulo={persona.nombre} descripcion={persona.correo}>
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center gap-2">
            {!persona.activo && <Insignia tono="contorno" tamano="chico">De baja</Insignia>}
            <Link
              href={`/equipo/${persona.staffid}`}
              className="text-acento inline-flex items-center gap-1 text-sm hover:underline"
            >
              Ver ficha <ExternalLink aria-hidden="true" className="size-3.5" />
            </Link>
            {!esUnoMismo && <BotonSuplantar personaId={persona.staffid} nombre={persona.nombre} activa={persona.activo} />}
          </div>

          <form
            className="flex flex-col gap-6"
            onSubmit={(evento) => { evento.preventDefault(); void guardar() }}
          >
            <Grupo titulo="Puesto">
              <Campo
                etiqueta="Escalón"
                ayuda={esUnoMismo ? 'No puedes cambiarte el escalón a ti mismo.' : 'Nombra el puesto. No reparte permisos: eso lo da el árbol.'}
              >
                {(props) => (
                  <Selector
                    value={formulario.escalon}
                    disabled={guardando || esUnoMismo}
                    onValueChange={(valor) => { if (esEscalon(valor)) poner('escalon', valor) }}
                  >
                    <DisparadorSelector marcador="Elige un escalón" {...props} />
                    <ContenidoSelector>
                      {ESCALONES.map((uno) => <Opcion key={uno.clave} value={uno.clave}>{uno.nombre}</Opcion>)}
                    </ContenidoSelector>
                  </Selector>
                )}
              </Campo>

              <CampoDeCatalogo
                etiqueta="Cargo"
                marcador="Sin cargo"
                valor={formulario.cargo_id}
                opciones={catalogo.cargos}
                deshabilitado={guardando}
                onCambiar={(valor) => { poner('cargo_id', valor) }}
              />
            </Grupo>

            <Grupo titulo="Jerarquía">
              <Campo
                etiqueta="A cargo de"
                ayuda="Quien queda a cargo pasa a ver lo de esta persona y lo de quienes cuelgan de ella."
              >
                {(props) => (
                  <SelectorDePersona
                    id={props.id}
                    etiqueta={`Quién está a cargo de ${persona.nombre}`}
                    opciones={candidatos}
                    valor={formulario.jefe_staffid}
                    marcador="Sin jefe directo"
                    ayudaVacia={`Nadie coincide. Quien cuelga de ${persona.nombre} no aparece: sería un ciclo.`}
                    deshabilitado={guardando}
                    onCambiar={(valor) => { poner('jefe_staffid', valor) }}
                  />
                )}
              </Campo>

              <CampoDeCatalogo
                etiqueta="Área principal"
                ayuda="Decide en qué tarjeta del mapa se cuenta y el color de su caja."
                marcador="Sin área"
                valor={formulario.area_id}
                opciones={catalogo.areas}
                deshabilitado={guardando}
                onCambiar={(valor) => { poner('area_id', valor) }}
              />
            </Grupo>

            <Grupo titulo="Permisos">
              <CampoDeRol
                rol={formulario.rol}
                esUnoMismo={esUnoMismo}
                deshabilitado={guardando}
                onCambiar={(valor) => { poner('rol', valor) }}
              />

              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-texto text-sm font-medium">Coordina varias áreas</p>
                  <p className="text-texto-tenue text-xs">Lee todas las filas de la casa; edita solo lo suyo y lo de su gente.</p>
                </div>
                <Interruptor
                  encendido={formulario.coordinador_multiarea}
                  etiqueta={`Coordinación multiárea de ${persona.nombre}`}
                  deshabilitado={guardando}
                  onPulsar={() => { poner('coordinador_multiarea', !formulario.coordinador_multiarea) }}
                />
              </div>
            </Grupo>

            {error !== null && <MensajeDeError>{error}</MensajeDeError>}

            <footer className="flex items-center justify-end gap-2">
              <CerrarCajon asChild>
                <Boton variante="sutil" type="button" disabled={guardando}>Cerrar</Boton>
              </CerrarCajon>
              <Boton variante="primario" type="submit" cargando={guardando} disabled={!hayCambios(cambios)}>
                Guardar
              </Boton>
            </footer>
          </form>

          <Grupo titulo="¿Por qué ve esto?">
            <SeccionAlcance staffid={persona.staffid} version={version} />
          </Grupo>

          <Grupo titulo="Últimos cambios">
            <CambiosRecientes staffid={persona.staffid} version={version} />
          </Grupo>
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
