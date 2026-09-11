'use client'

import { useCallback, useEffect, useState } from 'react'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import {
  CeldaEncabezado, CeldaTabla, CuerpoTabla, EncabezadoTabla, FilaTabla, Tabla
} from '@/componentes/datos/Tabla'
import { Cargando, ErrorEstado, Vacio } from '@/componentes/estado/Estados'
import { Boton } from '@/componentes/formularios/Boton'
import { Entrada } from '@/componentes/formularios/Entrada'
import {
  ContenidoSelector, DisparadorSelector, Opcion, Selector
} from '@/componentes/formularios/Selector'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { pedirSobre } from '@/datos/cliente'
import { consultaDePersonas, escalonesAsignables, nombreDeEscalon } from '@/dominio/accesos'
import { CabeceraDePanel, MensajeDeError, SIN_VALOR } from './piezas'
import type { CambioDePersona, CatalogoDeAccesos, PersonaDeAccesos } from '@/datos/accesos'
import type { Paginacion } from '@/datos/tipos'

/** Los filtros de la barra. La cadena vacía es "sin filtrar": `consultaDePersonas()` no la emite. */
interface Filtros {
  buscar: string
  escalon: string
  rol: string
  area: string
}

const SIN_FILTROS: Filtros = { buscar: '', escalon: '', rol: '', area: '' }

/** Una página ya traída, etiquetada con la consulta que la pidió. */
interface Cargado {
  clave: string
  personas: PersonaDeAccesos[]
  paginacion: Paginacion | undefined
}

interface PropsPanelPersonas {
  catalogo: CatalogoDeAccesos
  /** Vuelve a pedir el catálogo: los contadores por escalón, rol y área cambian con cada cambio. */
  recargar: () => void
  /** `id` de quien administra: la API impide cambiarse el escalón a uno mismo. */
  actorId: number
}

/**
 * Quién es quién: el rol, el escalón, el área y el cargo de cada persona, en una sola tabla.
 *
 * Es la pantalla que reemplaza al recorrido por las fichas: antes, mover a alguien de área y de
 * escalón eran dos diálogos en dos lugares distintos de `/equipo`, y no había forma de ver de una
 * pasada quién quedó sin área o con un escalón puesto a mano que ya nadie recuerda.
 *
 * **El escalón efectivo y el override se muestran separados a propósito.** El efectivo es el que
 * gobierna hoy —la API lo resuelve con las banderas de Perfex, el override y el rol—; el override es
 * lo único que esta tabla escribe. Mostrar uno solo haría que quitar un override pareciera no haber
 * hecho nada cuando la persona vuelve al mismo escalón por su rol.
 *
 * Cada cambio se escribe al elegirlo y manda **solo el campo que cambió**: la API escribe únicamente
 * las claves presentes, así que reenviar las otras cuatro dispararía sus guards sin motivo.
 */
export function PanelPersonas ({ catalogo, recargar, actorId }: PropsPanelPersonas) {
  const [filtros, setFiltros] = useState<Filtros>(SIN_FILTROS)
  const [escrito, setEscrito] = useState('')
  const [pagina, setPagina] = useState(1)
  const [cargado, setCargado] = useState<Cargado | null>(null)
  const [fallo, setFallo] = useState<{ clave: string, mensaje: string } | null>(null)
  const [errorEscritura, setErrorEscritura] = useState<string | null>(null)
  const [escribiendo, setEscribiendo] = useState<number | null>(null)
  /** Cambia para forzar un repedido de la misma consulta después de escribir. */
  const [version, setVersion] = useState(0)

  const consulta = consultaDePersonas(filtros, pagina)
  const asignables = escalonesAsignables(catalogo.escalones)
  /** Qué está pidiendo la pantalla ahora mismo. Lo que no coincida es de una consulta anterior. */
  const clave = `${consulta}#${version}`

  // Lo cargado y el fallo se etiquetan con su consulta en vez de vaciarse al empezar la siguiente:
  // un `setState` sincrónico dentro del efecto dispara renders en cascada, y el lint lo rechaza.
  // Con la etiqueta, "cargando" es simplemente que todavía no llegó lo de ESTA consulta.
  const personas = cargado?.clave === clave ? cargado.personas : null
  const error = fallo?.clave === clave ? fallo.mensaje : null

  useEffect(() => {
    const control = new AbortController()

    pedirSobre<PersonaDeAccesos[]>(`accesos/personas${consulta}`, control.signal)
      .then((sobre) => {
        setCargado({ clave, personas: sobre.data, paginacion: sobre.meta?.pagination })
      })
      .catch((problema: unknown) => {
        if (control.signal.aborted) return

        setFallo({
          clave,
          mensaje: problema instanceof Error ? problema.message : 'No se pudo leer el listado de personas.'
        })
      })

    return () => { control.abort() }
  }, [consulta, clave])

  /**
   * Escribe un campo de una persona y vuelve a pedir la página.
   *
   * @param persona La fila que se está cambiando.
   * @param cambio El único campo que cambió.
   */
  const cambiar = useCallback(async (persona: PersonaDeAccesos, cambio: CambioDePersona): Promise<void> => {
    setEscribiendo(persona.staffid)
    setErrorEscritura(null)

    const resultado = await escribirEnBff(`accesos/personas/${persona.staffid}`, 'PUT', cambio)

    setEscribiendo(null)

    if (!resultado.ok) {
      setErrorEscritura(`${persona.nombre}: ${resultado.mensaje}`)

      return
    }

    setVersion((previa) => previa + 1)
    recargar()
  }, [recargar])

  /** Aplica un filtro y vuelve a la primera página: la que se estaba viendo ya no significa lo mismo. */
  function filtrar (cambio: Partial<Filtros>): void {
    setFiltros((previos) => ({ ...previos, ...cambio }))
    setPagina(1)
  }

  return (
    <div className="flex flex-col gap-4">
      <CabeceraDePanel
        titulo="Personas"
        descripcion="El rol, el escalón, el área y el cargo de cada persona. Cada cambio se guarda al elegirlo."
      />

      <BarraDeFiltros
        catalogo={catalogo}
        filtros={filtros}
        escrito={escrito}
        onEscribir={setEscrito}
        onFiltrar={filtrar}
        onLimpiar={() => { setEscrito(''); setFiltros(SIN_FILTROS); setPagina(1) }}
      />

      {errorEscritura !== null && <MensajeDeError>{errorEscritura}</MensajeDeError>}

      {error !== null && <ErrorEstado detalle={error} />}

      {error === null && personas === null && (
        <Cargando alto="min-h-56" mensaje="Cargando las personas…" />
      )}

      {error === null && personas !== null && personas.length === 0 && (
        <Vacio
          titulo="Ninguna persona coincide"
          descripcion="Prueba con otro texto o quita los filtros. El buscador mira el nombre y el correo."
          accion={<Boton onClick={() => { setEscrito(''); setFiltros(SIN_FILTROS); setPagina(1) }}>Quitar los filtros</Boton>}
        />
      )}

      {error === null && personas !== null && personas.length > 0 && (
        <>
          <div className="overflow-x-auto">
            <Tabla>
              <EncabezadoTabla>
                <tr>
                  <CeldaEncabezado>Persona</CeldaEncabezado>
                  <CeldaEncabezado>Rol</CeldaEncabezado>
                  <CeldaEncabezado>Escalón</CeldaEncabezado>
                  <CeldaEncabezado>Área</CeldaEncabezado>
                  <CeldaEncabezado>Cargo</CeldaEncabezado>
                </tr>
              </EncabezadoTabla>
              <CuerpoTabla>
                {personas.map((persona) => (
                  <FilaDePersona
                    key={persona.staffid}
                    persona={persona}
                    catalogo={catalogo}
                    asignables={asignables}
                    esUnoMismo={persona.staffid === actorId}
                    ocupada={escribiendo === persona.staffid}
                    onCambiar={(cambio) => { void cambiar(persona, cambio) }}
                  />
                ))}
              </CuerpoTabla>
            </Tabla>
          </div>

          <Paginador paginacion={cargado?.paginacion} pagina={pagina} onIr={setPagina} />
        </>
      )}
    </div>
  )
}

/** La barra de búsqueda y los tres filtros del catálogo. */
function BarraDeFiltros ({
  catalogo, filtros, escrito, onEscribir, onFiltrar, onLimpiar
}: {
  catalogo: CatalogoDeAccesos
  filtros: Filtros
  escrito: string
  onEscribir: (texto: string) => void
  onFiltrar: (cambio: Partial<Filtros>) => void
  onLimpiar: () => void
}) {
  const hayFiltros = filtros.buscar !== '' || filtros.escalon !== '' || filtros.rol !== '' || filtros.area !== ''

  return (
    <div className="flex flex-wrap items-end gap-3">
      {/* Un formulario y no una búsqueda por tecla: cada pulsación sería una consulta paginada
          contra la API, y el listado entero cabe en pocas páginas. */}
      <form
        className="flex items-center gap-2"
        onSubmit={(evento) => { evento.preventDefault(); onFiltrar({ buscar: escrito }) }}
      >
        <Entrada
          type="search"
          value={escrito}
          placeholder="Nombre o correo"
          aria-label="Buscar una persona"
          className="w-56"
          onChange={(evento) => { onEscribir(evento.target.value) }}
        />
        <Boton type="submit">Buscar</Boton>
      </form>

      <FiltroDeLista
        etiqueta="Todos los escalones"
        valor={filtros.escalon}
        opciones={catalogo.escalones.map((escalon) => ({ valor: escalon.clave, etiqueta: escalon.nombre }))}
        onCambiar={(valor) => { onFiltrar({ escalon: valor }) }}
      />

      <FiltroDeLista
        etiqueta="Todos los roles"
        valor={filtros.rol}
        opciones={catalogo.roles.map((rol) => ({ valor: String(rol.id), etiqueta: rol.nombre }))}
        onCambiar={(valor) => { onFiltrar({ rol: valor }) }}
      />

      <FiltroDeLista
        etiqueta="Todas las áreas"
        valor={filtros.area}
        opciones={catalogo.areas.map((area) => ({ valor: String(area.id), etiqueta: area.nombre }))}
        onCambiar={(valor) => { onFiltrar({ area: valor }) }}
      />

      {hayFiltros && <Boton variante="sutil" onClick={onLimpiar}>Quitar los filtros</Boton>}
    </div>
  )
}

/** Un desplegable de filtro, con "todos" arriba. */
function FiltroDeLista ({
  etiqueta, valor, opciones, onCambiar
}: {
  etiqueta: string
  valor: string
  opciones: Array<{ valor: string, etiqueta: string }>
  onCambiar: (valor: string) => void
}) {
  return (
    <Selector
      value={valor === '' ? SIN_VALOR : valor}
      onValueChange={(elegido) => { onCambiar(elegido === SIN_VALOR ? '' : elegido) }}
    >
      <DisparadorSelector marcador={etiqueta} aria-label={etiqueta} className="w-48" />
      <ContenidoSelector>
        <Opcion value={SIN_VALOR}>{etiqueta}</Opcion>
        {opciones.map((opcion) => (
          <Opcion key={opcion.valor} value={opcion.valor}>{opcion.etiqueta}</Opcion>
        ))}
      </ContenidoSelector>
    </Selector>
  )
}

/** Una fila del listado, con sus cuatro desplegables. */
function FilaDePersona ({
  persona, catalogo, asignables, esUnoMismo, ocupada, onCambiar
}: {
  persona: PersonaDeAccesos
  catalogo: CatalogoDeAccesos
  asignables: ReturnType<typeof escalonesAsignables>
  esUnoMismo: boolean
  ocupada: boolean
  onCambiar: (cambio: CambioDePersona) => void
}) {
  const efectivo = nombreDeEscalon(catalogo.escalones, persona.escalon_efectivo)

  return (
    <FilaTabla>
      <CeldaTabla>
        <span className="text-texto flex items-center gap-2">
          {persona.nombre}
          {!persona.activo && <Insignia tono="contorno" tamano="chico">De baja</Insignia>}
        </span>
        <span className="text-texto-tenue block text-xs">{persona.correo}</span>
      </CeldaTabla>

      <CeldaTabla>
        <DesplegableDeFila
          etiqueta={`Rol de ${persona.nombre}`}
          marcador="Sin rol"
          valor={persona.rol_id === null ? null : String(persona.rol_id)}
          deshabilitado={ocupada}
          opciones={catalogo.roles.map((rol) => ({ valor: String(rol.id), etiqueta: rol.nombre }))}
          onCambiar={(valor) => { onCambiar({ rol_id: valor === null ? null : Number(valor) }) }}
        />
      </CeldaTabla>

      <CeldaTabla>
        {esUnoMismo
          // La API lo frena con 409; acá se adelanta para que el motivo se lea antes de intentarlo.
          ? (
            <span className="text-texto-tenue text-xs">
              {efectivo} · no puedes cambiarte el escalón a ti mismo
            </span>
            )
          : (
            <div className="flex flex-col gap-1">
              <DesplegableDeFila
                etiqueta={`Escalón de ${persona.nombre}`}
                marcador="El que dé su rol"
                valor={persona.escalon_override}
                deshabilitado={ocupada}
                opciones={asignables.map((escalon) => ({ valor: escalon.clave, etiqueta: escalon.nombre }))}
                onCambiar={(valor) => { onCambiar({ escalon: valor }) }}
              />
              <span className="text-texto-tenue text-xs">
                Hoy manda <strong className="font-medium">{efectivo}</strong>
                {persona.escalon_override === null ? ', heredado de su rol.' : ', puesto a mano.'}
              </span>
            </div>
            )}
      </CeldaTabla>

      <CeldaTabla>
        <DesplegableDeFila
          etiqueta={`Área de ${persona.nombre}`}
          marcador="Sin área"
          valor={persona.area_id === null ? null : String(persona.area_id)}
          deshabilitado={ocupada}
          opciones={catalogo.areas.map((area) => ({ valor: String(area.id), etiqueta: area.nombre }))}
          onCambiar={(valor) => { onCambiar({ area_id: valor === null ? null : Number(valor) }) }}
        />
      </CeldaTabla>

      <CeldaTabla>
        <DesplegableDeFila
          etiqueta={`Cargo de ${persona.nombre}`}
          marcador="Sin cargo"
          valor={persona.cargo_id === null ? null : String(persona.cargo_id)}
          deshabilitado={ocupada}
          opciones={catalogo.cargos.map((cargo) => ({ valor: String(cargo.id), etiqueta: cargo.nombre }))}
          onCambiar={(valor) => { onCambiar({ cargo_id: valor === null ? null : Number(valor) }) }}
        />
      </CeldaTabla>
    </FilaTabla>
  )
}

/**
 * Desplegable de una celda, con la opción de vaciar el campo arriba.
 *
 * "Sin nada" siempre es una opción legítima: quitarle el área a alguien o devolverlo al escalón de su
 * rol son cambios que la pantalla tiene que poder hacer, y sin esta fila solo se podría subir.
 */
function DesplegableDeFila ({
  etiqueta, marcador, valor, deshabilitado, opciones, onCambiar
}: {
  etiqueta: string
  marcador: string
  valor: string | null
  deshabilitado: boolean
  opciones: Array<{ valor: string, etiqueta: string }>
  onCambiar: (valor: string | null) => void
}) {
  return (
    <Selector
      value={valor ?? SIN_VALOR}
      disabled={deshabilitado}
      onValueChange={(elegido) => { onCambiar(elegido === SIN_VALOR ? null : elegido) }}
    >
      <DisparadorSelector marcador={marcador} aria-label={etiqueta} className="min-w-40" />
      <ContenidoSelector>
        <Opcion value={SIN_VALOR}>{marcador}</Opcion>
        {opciones.map((opcion) => (
          <Opcion key={opcion.valor} value={opcion.valor}>{opcion.etiqueta}</Opcion>
        ))}
      </ContenidoSelector>
    </Selector>
  )
}

/**
 * Anterior y siguiente.
 *
 * Sin `meta.pagination` no se dibuja nada: inventar "página 1 de 1" cuando el backend no dijo
 * cuántas hay es afirmar algo que no se sabe.
 */
function Paginador ({
  paginacion, pagina, onIr
}: {
  paginacion: Paginacion | undefined
  pagina: number
  onIr: (pagina: number) => void
}) {
  if (paginacion === undefined || paginacion.total_pages <= 1) return null

  return (
    <nav
      aria-label="Paginación de personas"
      className="text-texto-tenue flex flex-wrap items-center justify-between gap-2 text-xs"
    >
      <p aria-live="polite">
        Página {paginacion.page} de {paginacion.total_pages} · {paginacion.total} en total
      </p>

      <div className="flex items-center gap-2">
        <Boton
          variante="sutil"
          tamano="chico"
          disabled={pagina <= 1}
          onClick={() => { onIr(pagina - 1) }}
        >
          Anterior
        </Boton>
        <Boton
          variante="sutil"
          tamano="chico"
          disabled={pagina >= paginacion.total_pages}
          onClick={() => { onIr(pagina + 1) }}
        >
          Siguiente
        </Boton>
      </div>
    </nav>
  )
}
