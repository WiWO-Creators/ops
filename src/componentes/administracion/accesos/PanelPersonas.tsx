'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
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
import {
  CerrarDialogo, ContenidoDialogo, Dialogo, DisparadorDialogo
} from '@/componentes/superposiciones/Dialogo'
import { pedirSobre } from '@/datos/cliente'
import { consultaDePersonas, jefesPosiblesPara } from '@/dominio/accesos'
import { ESCALONES, type Escalon } from '@/dominio/escalon'
import { CabeceraDePanel, MensajeDeError, SIN_VALOR } from './piezas'
import type {
  CambioDePersona, CatalogoDeAccesos, NodoDeArbol, PersonaDeAccesos
} from '@/datos/accesos'
import type { Paginacion } from '@/datos/tipos'

/** Los filtros de la barra. La cadena vacía es "sin filtrar": `consultaDePersonas()` no la emite. */
interface Filtros {
  buscar: string
  escalon: string
  area: string
}

const SIN_FILTROS: Filtros = { buscar: '', escalon: '', area: '' }

/** Cuántos candidatos a jefe se listan de una vez. Lo demás se acota escribiendo en el buscador. */
const MAXIMO_CANDIDATOS = 50

/** Una página ya traída, etiquetada con la consulta que la pidió. */
interface Cargado {
  clave: string
  personas: PersonaDeAccesos[]
  paginacion: Paginacion | undefined
}

interface PropsPanelPersonas {
  catalogo: CatalogoDeAccesos
  /** Vuelve a pedir el catálogo: los contadores por escalón y área cambian con cada cambio. */
  recargar: () => void
  /** `id` de quien administra: la API impide cambiarse el escalón a uno mismo. */
  actorId: number
}

/**
 * Quién es quién: el escalón, el jefe, el área y el cargo de cada persona, en una sola tabla.
 *
 * **Las dos columnas que importan son Escalón y Jefe, y no significan lo mismo.** El escalón nombra
 * el puesto —`staff`, `lead`, `director`, `gerencia`— y no otorga nada por sí solo. El jefe es el que
 * decide el alcance: lo que alguien ve es su descendencia en el árbol, así que mover a una persona de
 * jefe cambia lo que ven todos los que están por encima de ella. Por eso el árbol tiene su propia
 * pestaña: sin verlo, este cambio no se puede razonar.
 *
 * Desengancharse es un cambio legítimo y tiene su propio botón: alguien sin jefe no desaparece, queda
 * viendo solo lo suyo.
 *
 * Cada cambio se escribe al elegirlo y manda **solo el campo que cambió**: la API escribe únicamente
 * las claves presentes, así que reenviar las otras tres dispararía sus guards sin motivo.
 */
export function PanelPersonas ({ catalogo, recargar, actorId }: PropsPanelPersonas) {
  const [filtros, setFiltros] = useState<Filtros>(SIN_FILTROS)
  const [escrito, setEscrito] = useState('')
  const [pagina, setPagina] = useState(1)
  const [cargado, setCargado] = useState<Cargado | null>(null)
  const [fallo, setFallo] = useState<{ clave: string, mensaje: string } | null>(null)
  const [errorEscritura, setErrorEscritura] = useState<string | null>(null)
  const [escribiendo, setEscribiendo] = useState<number | null>(null)
  const [arbol, setArbol] = useState<NodoDeArbol[]>([])
  /** Cambia para forzar un repedido de la misma consulta después de escribir. */
  const [version, setVersion] = useState(0)

  const consulta = consultaDePersonas(filtros, pagina)
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

  // El árbol se pide entero y aparte del listado: el buscador de jefe necesita a TODA la gente, no
  // solo a la página que se está viendo, y con el árbol completo se puede descartar de antemano al
  // candidato que cerraría un ciclo. Se repide cuando algo se escribe, porque un jefe nuevo cambia
  // quién puede ser jefe de quién.
  useEffect(() => {
    const control = new AbortController()

    pedirSobre<NodoDeArbol[]>('accesos/arbol', control.signal)
      .then((sobre) => { setArbol(sobre.data) })
      .catch(() => { if (!control.signal.aborted) setArbol([]) })

    return () => { control.abort() }
  }, [version])

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

  /** Deja la barra como estaba al entrar. */
  function limpiar (): void {
    setEscrito('')
    setFiltros(SIN_FILTROS)
    setPagina(1)
  }

  return (
    <div className="flex flex-col gap-4">
      <CabeceraDePanel
        titulo="Personas"
        descripcion="El escalón, el jefe, el área y el cargo de cada persona. El jefe es lo que decide el alcance; el escalón solo nombra el puesto. Cada cambio se guarda al elegirlo."
      />

      <BarraDeFiltros
        catalogo={catalogo}
        filtros={filtros}
        escrito={escrito}
        onEscribir={setEscrito}
        onFiltrar={filtrar}
        onLimpiar={limpiar}
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
          accion={<Boton onClick={limpiar}>Quitar los filtros</Boton>}
        />
      )}

      {error === null && personas !== null && personas.length > 0 && (
        <>
          <div className="overflow-x-auto">
            <Tabla>
              <EncabezadoTabla>
                <tr>
                  <CeldaEncabezado>Persona</CeldaEncabezado>
                  <CeldaEncabezado>Escalón</CeldaEncabezado>
                  <CeldaEncabezado>Jefe</CeldaEncabezado>
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
                    arbol={arbol}
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

/** La barra de búsqueda y los dos filtros del catálogo. */
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
  const hayFiltros = filtros.buscar !== '' || filtros.escalon !== '' || filtros.area !== ''

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
        opciones={ESCALONES.map((escalon) => ({ valor: escalon.clave, etiqueta: escalon.nombre }))}
        onCambiar={(valor) => { onFiltrar({ escalon: valor }) }}
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

/** Una fila del listado, con su escalón, su jefe, su área y su cargo. */
function FilaDePersona ({
  persona, catalogo, arbol, esUnoMismo, ocupada, onCambiar
}: {
  persona: PersonaDeAccesos
  catalogo: CatalogoDeAccesos
  arbol: NodoDeArbol[]
  esUnoMismo: boolean
  ocupada: boolean
  onCambiar: (cambio: CambioDePersona) => void
}) {
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
        {esUnoMismo
          // La API lo frena con 409; acá se adelanta para que el motivo se lea antes de intentarlo.
          ? (
            <span className="text-texto-tenue text-xs">
              {ESCALONES.find((escalon) => escalon.clave === persona.escalon)?.nombre ?? persona.escalon}
              {' '}· no puedes cambiarte el escalón a ti mismo
            </span>
            )
          : (
            <Selector
              value={persona.escalon}
              disabled={ocupada}
              onValueChange={(elegido) => { onCambiar({ escalon: elegido as Escalon }) }}
            >
              <DisparadorSelector
                marcador="Sin escalón"
                aria-label={`Escalón de ${persona.nombre}`}
                className="min-w-36"
              />
              <ContenidoSelector>
                {ESCALONES.map((escalon) => (
                  <Opcion key={escalon.clave} value={escalon.clave}>{escalon.nombre}</Opcion>
                ))}
              </ContenidoSelector>
            </Selector>
            )}
      </CeldaTabla>

      <CeldaTabla>
        <SelectorDeJefe
          persona={persona}
          arbol={arbol}
          ocupada={ocupada}
          onCambiar={onCambiar}
        />
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
 * De quién cuelga esta persona: un buscador y no un desplegable.
 *
 * Un desplegable con las ciento ochenta y pico cuentas de la casa no es elegible: hay que leerlo
 * entero para encontrar a alguien. El buscador filtra por nombre y correo y muestra los primeros
 * resultados, que es como se busca a una persona.
 *
 * **La lista ya viene sin los imposibles.** `jefesPosiblesPara()` saca a la persona y a toda su
 * descendencia: elegir a alguien que cuelga de ella cerraría un ciclo, y la API lo rechaza con 422.
 * Descubrirlo después de guardar no le explica nada a nadie.
 */
function SelectorDeJefe ({
  persona, arbol, ocupada, onCambiar
}: {
  persona: PersonaDeAccesos
  arbol: NodoDeArbol[]
  ocupada: boolean
  onCambiar: (cambio: CambioDePersona) => void
}) {
  const [abierto, setAbierto] = useState(false)
  const [buscado, setBuscado] = useState('')

  const posibles = useMemo(() => jefesPosiblesPara(arbol, persona), [arbol, persona])
  const texto = buscado.trim().toLowerCase()
  const encontrados = (texto === '' ? posibles : posibles.filter((uno) => uno.nombre.toLowerCase().includes(texto)))
    .slice(0, MAXIMO_CANDIDATOS)

  /** Escribe el jefe elegido —o `null` para desenganchar— y cierra el diálogo. */
  function elegir (jefeStaffid: number | null): void {
    setAbierto(false)
    setBuscado('')
    onCambiar({ jefe_staffid: jefeStaffid })
  }

  return (
    <Dialogo open={abierto} onOpenChange={setAbierto}>
      <div className="flex flex-col items-start gap-1">
        <span className="text-texto text-sm">{persona.jefe_nombre ?? 'Sin jefe'}</span>
        <DisparadorDialogo asChild>
          <Boton variante="sutil" tamano="chico" disabled={ocupada}>
            {persona.jefe_staffid === null ? 'Poner jefe' : 'Cambiar jefe'}
          </Boton>
        </DisparadorDialogo>
      </div>

      <ContenidoDialogo
        titulo={`Jefe de ${persona.nombre}`}
        descripcion="De quién cuelga en el árbol. Es lo que decide qué ve quien está por encima: su jefe pasa a ver todo lo de esta persona y lo de quienes cuelgan de ella."
        ancho="chico"
      >
        <div className="flex flex-col gap-3">
          <Entrada
            type="search"
            value={buscado}
            placeholder="Buscar por nombre"
            aria-label="Buscar a quién ponerle de jefe"
            onChange={(evento) => { setBuscado(evento.target.value) }}
          />

          {encontrados.length === 0
            ? (
              <p className="text-texto-tenue text-sm">
                Nadie coincide. Quien cuelga de {persona.nombre} no aparece: sería un círculo.
              </p>
              )
            : (
              <ul className="border-linea rounded-tarjeta max-h-64 divide-y overflow-y-auto border">
                {encontrados.map((candidato) => (
                  <li key={candidato.staffid}>
                    <button
                      type="button"
                      className="hover:bg-superficie-hundida text-texto w-full px-3 py-2 text-left text-sm"
                      onClick={() => { elegir(candidato.staffid) }}
                    >
                      {candidato.nombre}
                    </button>
                  </li>
                ))}
              </ul>
              )}

          <div className="flex flex-wrap justify-end gap-2">
            {persona.jefe_staffid !== null && (
              <Boton variante="peligro" type="button" onClick={() => { elegir(null) }}>
                Desenganchar
              </Boton>
            )}
            <CerrarDialogo asChild>
              <Boton variante="sutil" type="button">Cancelar</Boton>
            </CerrarDialogo>
          </div>
        </div>
      </ContenidoDialogo>
    </Dialogo>
  )
}

/**
 * Desplegable de una celda, con la opción de vaciar el campo arriba.
 *
 * "Sin nada" siempre es una opción legítima: quitarle el área o el cargo a alguien es un cambio que
 * la pantalla tiene que poder hacer, y sin esta fila solo se podría poner.
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
