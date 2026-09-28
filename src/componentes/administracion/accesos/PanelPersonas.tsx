'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { TablaRecurso } from '@/componentes/datos/TablaRecurso'
import { useParametroEnUrl } from '@/componentes/datos/useFiltrosEnUrl'
import { Cargando, ErrorEstado } from '@/componentes/estado/Estados'
import { Boton } from '@/componentes/formularios/Boton'
import { Entrada } from '@/componentes/formularios/Entrada'
import {
  ContenidoSelector, DisparadorSelector, Opcion, Selector
} from '@/componentes/formularios/Selector'
import { Insignia } from '@/componentes/presentadores/Insignia'
import {
  CerrarDialogo, ContenidoDialogo, Dialogo, DisparadorDialogo
} from '@/componentes/superposiciones/Dialogo'
import { pedirTodasLasPaginas } from '@/datos/cliente'
import { jefesPosiblesPara } from '@/dominio/accesos'
import { ESCALONES, ordenDeEscalon, type Escalon } from '@/dominio/escalon'
import { CabeceraDePanel, Interruptor, MensajeDeError, SIN_VALOR } from './piezas'
import type {
  CambioDePersona, CatalogoDeAccesos, NodoDeArbol, PersonaDeAccesos
} from '@/datos/accesos'
import type { Columna, DefinicionRecurso, ResultadoLista } from '@/definiciones/tipos'

/** Cuántos candidatos a jefe se listan de una vez. Lo demás se acota escribiendo en el buscador. */
const MAXIMO_CANDIDATOS = 50

/** Sin filas que ordenar ni paginar: `ResultadoLista` vacío, ignorado por el modo memoria de `TablaRecurso`. */
const SIN_RESULTADO: ResultadoLista<PersonaDeAccesos> = { filas: [], paginacion: undefined }

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
 *
 * Es `TablaRecurso` en modo memoria (`datos`): `GET /accesos/personas` no habla el contrato generico
 * de listado (pagina con `buscar`/`escalon`/`area`/`page`, sin `filter[...]` ni `sort`), asi que en vez
 * de forzar el motor a un contrato que no es el suyo se trae el catalogo entero que haga falta
 * (`pedirTodasLasPaginas`, la misma utilidad que usan los combos) y se deja que la tabla ordene y
 * pagine eso en el navegador. Buscar, escalón y área siguen siendo filtros de servidor —achican lo
 * que se trae— y viven en la URL.
 */
export function PanelPersonas (props: PropsPanelPersonas) {
  // `useParametroEnUrl` y `TablaRecurso` leen `useSearchParams`: sin este limite de Suspense falla
  // el build de cualquier pagina que monte este panel.
  return (
    <Suspense fallback={<Cargando alto="min-h-56" mensaje="Cargando las personas…" />}>
      <CuerpoDePanelPersonas {...props} />
    </Suspense>
  )
}

function CuerpoDePanelPersonas ({ catalogo, recargar, actorId }: PropsPanelPersonas) {
  const parametroBuscar = useParametroEnUrl('buscar')
  const parametroEscalon = useParametroEnUrl('escalon')
  const parametroArea = useParametroEnUrl('area')
  // Sin prefijo, es el mismo `page` que pagina `TablaRecurso` (ver su `prefijoUrl`): si un filtro no
  // lo borra, la tabla se queda en una pagina que quizas ya no exista con el resultado nuevo.
  const parametroPage = useParametroEnUrl('page')

  const buscar = parametroBuscar.valor ?? ''
  const escalon = parametroEscalon.valor ?? ''
  const area = parametroArea.valor ?? ''

  const [escrito, setEscrito] = useState(buscar)
  const [personas, setPersonas] = useState<PersonaDeAccesos[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [errorEscritura, setErrorEscritura] = useState<string | null>(null)
  const [escribiendo, setEscribiendo] = useState<number | null>(null)
  const [arbol, setArbol] = useState<NodoDeArbol[]>([])
  /** Cambia para forzar un repedido tras escribir. */
  const [version, setVersion] = useState(0)

  const consulta = consultaDePersonas({ buscar, escalon, area })

  useEffect(() => {
    const control = new AbortController()

    pedirTodasLasPaginas<PersonaDeAccesos>(`accesos/personas${consulta}`, control.signal)
      .then((filas) => {
        if (control.signal.aborted) return
        setPersonas(filas)
        setError(null)
      })
      .catch((problema: unknown) => {
        if (control.signal.aborted) return
        setPersonas(null)
        setError(problema instanceof Error ? problema.message : 'No se pudo leer el listado de personas.')
      })

    return () => { control.abort() }
  }, [consulta, version])

  // El árbol se pide entero y aparte del listado: el buscador de jefe necesita a TODA la gente, no
  // solo a la que quedó tras el filtro, y con el árbol completo se puede descartar de antemano al
  // candidato que cerraría un ciclo. Se repide cuando algo se escribe, porque un jefe nuevo cambia
  // quién puede ser jefe de quién.
  useEffect(() => {
    const control = new AbortController()

    pedirTodasLasPaginas<NodoDeArbol>('accesos/arbol', control.signal)
      .then((filas) => { setArbol(filas) })
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

  const definicion = useMemo(
    () => definicionDePersonas({ catalogo, arbol, actorId, escribiendo, onCambiar: (persona, cambio) => { void cambiar(persona, cambio) } }),
    [catalogo, arbol, actorId, escribiendo, cambiar]
  )

  /** Aplica un filtro: vuelve a la primera página porque la que se estaba viendo ya no significa lo mismo. */
  function filtrar (cambio: { buscar?: string, escalon?: string, area?: string }): void {
    if (cambio.buscar !== undefined) escribirOQuitar(parametroBuscar, cambio.buscar)
    if (cambio.escalon !== undefined) escribirOQuitar(parametroEscalon, cambio.escalon)
    if (cambio.area !== undefined) escribirOQuitar(parametroArea, cambio.area)
    parametroPage.quitar()
  }

  /** Deja la barra como estaba al entrar. */
  function limpiar (): void {
    setEscrito('')
    parametroBuscar.quitar()
    parametroEscalon.quitar()
    parametroArea.quitar()
    parametroPage.quitar()
  }

  return (
    <div className="flex flex-col gap-4">
      <CabeceraDePanel
        titulo="Personas"
        descripcion="El escalón, quién está a cargo, el área y el cargo de cada persona. Quien está a cargo es lo que decide el alcance; el escalón solo nombra el puesto. Coordinar varias áreas abre la lectura de toda la casa sin entregar ni una edición. Cada cambio se guarda al elegirlo."
      />

      <BarraDeFiltros
        catalogo={catalogo}
        filtros={{ buscar, escalon, area }}
        escrito={escrito}
        onEscribir={setEscrito}
        onFiltrar={filtrar}
        onLimpiar={limpiar}
      />

      {errorEscritura !== null && <MensajeDeError>{errorEscritura}</MensajeDeError>}

      {error !== null && <ErrorEstado detalle={error} onReintentar={() => { setVersion((n) => n + 1) }} />}

      {error === null && personas === null && (
        <Cargando alto="min-h-56" mensaje="Cargando las personas…" />
      )}

      {error === null && personas !== null && (
        <TablaRecurso<PersonaDeAccesos>
          definicion={definicion}
          inicial={SIN_RESULTADO}
          datos={personas}
          claveFila={(persona) => persona.staffid}
        />
      )}
    </div>
  )
}

/** Escribe el valor en la URL, o lo quita si quedó vacío. */
function escribirOQuitar (parametro: { escribir: (valor: string) => void, quitar: () => void }, valor: string): void {
  if (valor === '') parametro.quitar()
  else parametro.escribir(valor)
}

/**
 * Query string de `GET /accesos/personas`, tal como lo acepta el contrato (`docs/contrato-accesos.md`).
 *
 * @param filtros Los tres filtros del panel, ya leidos de la URL.
 * @returns La query, con `?` inicial, o cadena vacia si no hay ningun filtro puesto.
 */
function consultaDePersonas (filtros: { buscar: string, escalon: string, area: string }): string {
  const parametros = new URLSearchParams()

  if (filtros.buscar.trim() !== '') parametros.set('buscar', filtros.buscar.trim())
  if (filtros.escalon !== '') parametros.set('escalon', filtros.escalon)
  if (filtros.area !== '') parametros.set('area', filtros.area)

  const texto = parametros.toString()

  return texto === '' ? '' : `?${texto}`
}

/**
 * Definicion de la tabla, en modo memoria: sin `filtros` (buscar/escalón/área ya acotaron lo que
 * llegó del servidor) y con las cinco columnas editables armadas por closure sobre el catálogo, el
 * árbol y quién está escribiendo.
 */
function definicionDePersonas ({
  catalogo, arbol, actorId, escribiendo, onCambiar
}: {
  catalogo: CatalogoDeAccesos
  arbol: NodoDeArbol[]
  actorId: number
  escribiendo: number | null
  onCambiar: (persona: PersonaDeAccesos, cambio: CambioDePersona) => void
}): DefinicionRecurso<PersonaDeAccesos> {
  const columnas: Array<Columna<PersonaDeAccesos>> = [
    {
      clave: 'persona',
      encabezado: 'Persona',
      ordenPor: 'nombre',
      presentar: (persona) => (
        <span className="flex flex-col">
          <span className="text-texto flex items-center gap-2">
            {persona.nombre}
            {!persona.activo && <Insignia tono="contorno" tamano="chico">De baja</Insignia>}
          </span>
          <span className="text-texto-tenue block text-xs">{persona.correo}</span>
        </span>
      )
    },
    {
      clave: 'escalon',
      encabezado: 'Escalón',
      ordenPor: 'escalon',
      // Por la escalera y no por el alfabeto: alfabéticamente "director" iría antes que "lead" y
      // "staff", y una columna de jerarquía ordenada al azar no informa nada.
      ordenarCon: (a, b) => ordenDeEscalon(a.escalon) - ordenDeEscalon(b.escalon),
      presentar: (persona) => (
        <CeldaEscalon
          persona={persona}
          esUnoMismo={persona.staffid === actorId}
          ocupada={escribiendo === persona.staffid}
          onCambiar={(cambio) => { onCambiar(persona, cambio) }}
        />
      )
    },
    {
      clave: 'jefe',
      encabezado: 'A cargo de',
      ordenPor: 'jefe_nombre',
      presentar: (persona) => (
        <SelectorDeJefe
          persona={persona}
          arbol={arbol}
          ocupada={escribiendo === persona.staffid}
          onCambiar={(cambio) => { onCambiar(persona, cambio) }}
        />
      )
    },
    {
      clave: 'area',
      encabezado: 'Área',
      presentar: (persona) => (
        <DesplegableDeFila
          etiqueta={`Área de ${persona.nombre}`}
          marcador="Sin área"
          valor={persona.area_id === null ? null : String(persona.area_id)}
          deshabilitado={escribiendo === persona.staffid}
          opciones={catalogo.areas.map((area) => ({ valor: String(area.id), etiqueta: area.nombre }))}
          onCambiar={(valor) => { onCambiar(persona, { area_id: valor === null ? null : Number(valor) }) }}
        />
      )
    },
    {
      clave: 'cargo',
      encabezado: 'Cargo',
      presentar: (persona) => (
        <DesplegableDeFila
          etiqueta={`Cargo de ${persona.nombre}`}
          marcador="Sin cargo"
          valor={persona.cargo_id === null ? null : String(persona.cargo_id)}
          deshabilitado={escribiendo === persona.staffid}
          opciones={catalogo.cargos.map((cargo) => ({ valor: String(cargo.id), etiqueta: cargo.nombre }))}
          onCambiar={(valor) => { onCambiar(persona, { cargo_id: valor === null ? null : Number(valor) }) }}
        />
      )
    },
    {
      clave: 'coordinador_multiarea',
      encabezado: 'Coordina varias áreas',
      presentar: (persona) => (
        // Sin confirmación: darlo y quitarlo cuesta un clic y no destruye nada. Lo que sí se dice
        // es qué hace, porque "ve todo" y "puede todo" se confunden y acá son cosas distintas.
        <div className="flex items-center gap-2">
          <Interruptor
            encendido={persona.coordinador_multiarea}
            etiqueta={`Coordinación multiárea de ${persona.nombre}`}
            deshabilitado={escribiendo === persona.staffid}
            onPulsar={() => { onCambiar(persona, { coordinador_multiarea: !persona.coordinador_multiarea }) }}
          />
          <span className="text-texto-tenue text-xs">
            {persona.coordinador_multiarea ? 'Lee toda la casa; edita solo lo suyo' : 'Solo lo suyo y lo de su gente'}
          </span>
        </div>
      )
    }
  ]

  return {
    ruta: 'accesos/personas',
    titulo: { singular: 'Persona', plural: 'Personas' },
    columnas,
    filtros: [],
    ordenables: ['nombre', 'escalon', 'jefe_nombre'],
    ordenPorDefecto: 'nombre',
    busqueda: false,
    includes: []
  }
}

/** La barra de búsqueda y los dos filtros del catálogo. */
function BarraDeFiltros ({
  catalogo, filtros, escrito, onEscribir, onFiltrar, onLimpiar
}: {
  catalogo: CatalogoDeAccesos
  filtros: { buscar: string, escalon: string, area: string }
  escrito: string
  onEscribir: (texto: string) => void
  onFiltrar: (cambio: { buscar?: string, escalon?: string, area?: string }) => void
  onLimpiar: () => void
}) {
  const hayFiltros = filtros.buscar !== '' || filtros.escalon !== '' || filtros.area !== ''

  return (
    <div className="flex flex-wrap items-end gap-3">
      {/* Un formulario y no una búsqueda por tecla: cada pulsación sería una consulta contra la API,
          y el listado entero cabe en pocas páginas. */}
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

/** La celda de Escalón: un desplegable, salvo para uno mismo, que la API frena con 409. */
function CeldaEscalon ({
  persona, esUnoMismo, ocupada, onCambiar
}: {
  persona: PersonaDeAccesos
  esUnoMismo: boolean
  ocupada: boolean
  onCambiar: (cambio: CambioDePersona) => void
}) {
  if (esUnoMismo) {
    // La API lo frena con 409; acá se adelanta para que el motivo se lea antes de intentarlo.
    return (
      <span className="text-texto-tenue text-xs">
        {ESCALONES.find((escalon) => escalon.clave === persona.escalon)?.nombre ?? persona.escalon}
        {' '}· no puedes cambiarte el escalón a ti mismo
      </span>
    )
  }

  return (
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
        <span className="text-texto text-sm">{persona.jefe_nombre ?? 'Sin asignar'}</span>
        <DisparadorDialogo asChild>
          <Boton variante="sutil" tamano="chico" disabled={ocupada}>
            {persona.jefe_staffid === null ? 'Poner a cargo' : 'Cambiar'}
          </Boton>
        </DisparadorDialogo>
      </div>

      <ContenidoDialogo
        titulo={`Quién está a cargo de ${persona.nombre}`}
        descripcion="De quién cuelga en el árbol. Es lo que decide qué ve quien está por encima: quien queda a cargo pasa a ver todo lo de esta persona y lo de quienes cuelgan de ella."
        ancho="chico"
      >
        <div className="flex flex-col gap-3">
          <Entrada
            type="search"
            value={buscado}
            placeholder="Buscar por nombre"
            aria-label="Buscar a quién poner a cargo"
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
