'use client'

import { useState } from 'react'
import { PresetsFiltro } from './PresetsFiltro'
import { tableroDePresets } from './presets'
import { claveDeCatalogo } from '@/datos/catalogos'
import { operadoresCampo } from '@/definiciones/filtros'
import type { TableroDePreset } from '@/datos/recursos'
import { POR_PAGINA_MAXIMO } from '@/datos/consulta'
import type { DefinicionRecurso, EstadoConsulta, Filtro, OpcionFiltro } from '@/definiciones/tipos'
import type { Paginacion } from '@/datos/tipos'
import { Boton } from '@/componentes/formularios/Boton'
import { Entrada } from '@/componentes/formularios/Entrada'
import {
  ChevronSelector,
  CLASES_DISPARADOR,
  ContenidoSelector,
  DisparadorSelector,
  Opcion,
  Selector
} from '@/componentes/formularios/Selector'
import {
  BuscadorMenu,
  ContenidoMenu,
  DisparadorMenu,
  GrupoRadioMenu,
  ItemMenuMarcable,
  ItemMenuRadio,
  MenuContextual,
  SinResultadosMenu
} from '@/componentes/superposiciones/MenuContextual'
import { cn } from '@/lib/clases'
import { dependenciaPendiente, filtrosTrasCambiar, opcionesPorPagina, resumenDeFiltro } from './tabla'

/**
 * Controles de una vista de lista: busqueda, filtros, columnas y paginacion.
 *
 * No tienen estado propio: reciben el estado de la consulta y avisan de los cambios. El unico dueño
 * del estado es la URL, y eso vive en `TablaRecurso`.
 */

/**
 * Radix Select no acepta un item con valor vacio, y "sin filtrar" necesita ser una opcion elegible.
 * El centinela viaja solo por la UI: se traduce a lista vacia antes de tocar el estado.
 */
const SIN_FILTRO = '__todos__'

/**
 * Ancho de todos los disparadores de filtro.
 *
 * Uno solo para los dos tipos de filtro, y fijo: los desplegables quedan alineados entre si, y el
 * resumen que cambia de largo al elegir no reacomoda la barra debajo del puntero.
 */
const ANCHO_FILTRO = 'w-44'

interface PropsControles<T> {
  definicion: DefinicionRecurso<T>
  estado: EstadoConsulta
  /** Claves de las columnas visibles. */
  visibles: string[]
  /**
   * Opciones de los filtros que las sacan de `/lookups`, indexadas por `Filtro.desdeLookup`.
   *
   * Las resuelve el servidor y bajan ya hechas: si el motor pidiera `/lookups` por su cuenta, cada
   * tabla de la pantalla lo pediria otra vez, y ademas lo haria despues de pintar — con los filtros
   * apareciendo tarde delante de quien ya empezo a usarlos.
   */
  opcionesDeFiltro?: Record<string, OpcionFiltro[]>
  onCambiar: (parcial: Partial<EstadoConsulta>) => void
  onVisibles: (claves: string[]) => void
  /**
   * Oculta el menu de columnas.
   *
   * Lo usan las presentaciones que no son una tabla: elegir columnas ahi no cambia nada de lo que se
   * ve, y un control que no hace nada es peor que uno ausente.
   */
  sinColumnas?: boolean
  board?: TableroDePreset
}

/**
 * Barra de controles sobre la tabla.
 *
 * @param onCambiar recibe el pedazo de estado que cambio; quien llama decide como aplicarlo
 * @param onVisibles recibe la lista completa de columnas visibles
 */
export function ControlesTabla<T> ({
  definicion,
  estado,
  visibles,
  opcionesDeFiltro = {},
  onCambiar,
  onVisibles,
  sinColumnas = false,
  board
}: PropsControles<T>) {
  const [agregados, setAgregados] = useState<string[]>([])
  const activos = definicion.filtros.filter((filtro) => agregados.includes(filtro.clave) || (estado.filtros[filtro.clave]?.length ?? 0) > 0)
  const disponibles = definicion.filtros.filter((filtro) => !activos.includes(filtro))
  const tablero = board ?? tableroDePresets(definicion.ruta)

  /**
   * Cambia un filtro y vuelve a la primera pagina: la 7 de un listado nuevo casi nunca existe.
   *
   * Los filtros que colgaban del que cambio se van con el: ver `filtrosTrasCambiar`.
   */
  function cambiarFiltro (clave: string, valores: string[]) {
    onCambiar({
      filtros: filtrosTrasCambiar(estado.filtros, definicion.filtros, clave, valores),
      pagina: 1
    })
  }

  function alternarColumna (clave: string) {
    const activa = visibles.includes(clave)
    const siguiente = definicion.columnas
      .map((columna) => columna.clave)
      .filter((c) => (c === clave ? !activa : visibles.includes(c)))

    // Una tabla sin ninguna columna no es una vista, es un error: la ultima no se puede apagar.
    if (siguiente.length > 0) onVisibles(siguiente)
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {definicion.busqueda && (
        <form
          role="search"
          className="flex items-center gap-2"
          onSubmit={(evento) => {
            evento.preventDefault()
            const campo = new FormData(evento.currentTarget).get('q')
            onCambiar({ busqueda: typeof campo === 'string' ? campo : '', pagina: 1 })
          }}
        >
          <Entrada
            type="search"
            name="q"
            // Sin debounce: se busca al enviar. Una peticion por tecla es la forma mas facil de
            // convertir una lista grande en una tormenta de 422 y de scroll saltando solo.
            aria-label={`Buscar ${definicion.titulo.plural.toLowerCase()}`}
            placeholder={`Buscar ${definicion.titulo.plural.toLowerCase()}…`}
            defaultValue={estado.busqueda}
            key={estado.busqueda}
            className="w-56"
          />
          <Boton type="submit" tamano="chico">Buscar</Boton>
        </form>
      )}

      {disponibles.length > 0 && (
        // El mismo menu que los filtros y no un `<select>` nativo: con todos los campos de la Tarea
        // declarados, la lista pasa de treinta y elegir a ojo tarda mas que escribir dos letras.
        <MenuBuscable
          etiqueta="Agregar filtro"
          texto="Agregar filtro…"
          sinFiltrar
          opciones={disponibles.map((filtro) => ({
            valor: filtro.clave,
            etiqueta: filtro.noDisponible === undefined ? filtro.etiqueta : `${filtro.etiqueta} — ${filtro.noDisponible}`,
            ...(filtro.noDisponible === undefined ? {} : { deshabilitada: true })
          }))}
          seleccionadas={[]}
          multiple={false}
          onElegir={(clave) => { setAgregados([...agregados, clave]) }}
        />
      )}
      {activos.map((filtro) => (
        <div key={filtro.clave} className="flex max-w-full items-center gap-1">
        <ControlFiltro
          filtro={filtro}
          valores={estado.filtros[filtro.clave] ?? []}
          opcionesDeFiltro={opcionesDeFiltro}
          esperaA={dependenciaPendiente(filtro, definicion.filtros, estado.filtros)}
          onCambiar={(valores) => cambiarFiltro(filtro.clave, valores)}
        />
          <Boton tamano="chico" variante="sutil" aria-label={`Quitar filtro ${filtro.etiqueta}`} onClick={() => {
            setAgregados(agregados.filter((clave) => clave !== filtro.clave))
            cambiarFiltro(filtro.clave, [])
          }}>Quitar</Boton>
        </div>
      ))}

      {(activos.length > 0 || estado.busqueda !== '') && (
        <Boton tamano="chico" variante="sutil" onClick={() => {
          setAgregados([])
          onCambiar({ filtros: {}, busqueda: '', pagina: 1 })
        }}>Limpiar filtros</Boton>
      )}
      {tablero !== null && (
        <PresetsFiltro
          key={tablero}
          board={tablero}
          filtrosActuales={estado.filtros}
          busqueda={estado.busqueda}
          definicion={definicion}
          opcionesDeFiltro={opcionesDeFiltro}
          onAplicar={(filtros, busqueda) => { setAgregados([]); onCambiar({ filtros, busqueda, pagina: 1 }) }}
        />
      )}
      {!sinColumnas && (
      <MenuContextual>
        <DisparadorMenu asChild>
          <Boton tamano="chico" variante="sutil">Columnas</Boton>
        </DisparadorMenu>
        <ContenidoMenu align="end">
          {definicion.columnas.map((columna) => (
            <ItemMenuMarcable
              key={columna.clave}
              checked={visibles.includes(columna.clave)}
              onCheckedChange={() => alternarColumna(columna.clave)}
            >
              {columna.encabezado}
            </ItemMenuMarcable>
          ))}
        </ContenidoMenu>
      </MenuContextual>
      )}
    </div>
  )
}

interface PropsControlFiltro {
  filtro: Filtro
  valores: string[]
  /** Opciones ya resueltas para los filtros que las sacan de `/lookups`. */
  opcionesDeFiltro?: Record<string, OpcionFiltro[]>
  /** El filtro que hay que elegir antes de poder usar este. Ver `dependenciaPendiente`. */
  esperaA?: Filtro | null
  onCambiar: (valores: string[]) => void
}

/** Un filtro, con el control que corresponde a su `tipo`. */
function ControlFiltro ({
  filtro,
  valores,
  opcionesDeFiltro = {},
  esperaA = null,
  onCambiar
}: PropsControlFiltro) {
  if (filtro.tipo === 'campo') return <FiltroCampo key={JSON.stringify(valores)} filtro={filtro} valores={valores} onCambiar={onCambiar} />

  if (filtro.tipo === 'rangoFechas') {
    return <FiltroRangoFechas filtro={filtro} valores={valores} onCambiar={onCambiar} />
  }

  const opciones = opcionesDe(filtro, opcionesDeFiltro)

  // Un filtro que cuelga de otro nunca se esconde: se dibuja deshabilitado con la pista de que hacer.
  // Esconderlo mientras no tenia catalogo era lo que hacia creer que el filtro no existia, y ademas
  // lo hacia aparecer y desaparecer de la barra segun lo que se eligiera al lado.
  if (filtro.dependeDe !== undefined && (esperaA !== null || opciones.length === 0)) {
    return <FiltroEnEspera filtro={filtro} esperaA={esperaA} />
  }

  // Sin catálogo conserva su lugar y explica por qué no se puede usar todavía.
  if (opciones.length === 0) return <FiltroEnEspera filtro={filtro} esperaA={null} />

  if (filtro.tipo === 'multiple') {
    return <FiltroMultiple filtro={filtro} opciones={opciones} valores={valores} onCambiar={onCambiar} />
  }

  return <FiltroSimple filtro={filtro} opciones={opciones} valores={valores} onCambiar={onCambiar} />
}

/**
 * Opciones de un filtro segun su tipo y su origen.
 *
 * El booleano las trae puestas: el backend espera `1`/`0` y no tiene sentido declararlas en cada
 * definicion. Las de `desdeLookup` llegan resueltas desde el servidor, porque los catalogos de Perfex
 * son configurables y codificarlos aca garantiza que se rompan cuando alguien agregue una etapa.
 */
function opcionesDe (filtro: Filtro, desdeServidor: Record<string, OpcionFiltro[]>): OpcionFiltro[] {
  if (filtro.tipo === 'booleano') {
    return filtro.opciones ?? [
      { valor: '1', etiqueta: 'Sí' },
      { valor: '0', etiqueta: 'No' }
    ]
  }

  if (filtro.opciones !== undefined) return filtro.opciones

  const clave = claveDeCatalogo(filtro)

  return clave === '' ? [] : desdeServidor[clave] ?? []
}

/**
 * Un filtro dependiente todavia sin catalogo: se ve, no se usa, y dice por que.
 *
 * Es un boton y no un `Selector` porque no hay nada que desplegar; conserva las clases del
 * disparador para que ocupe el mismo lugar que ocupara cuando se habilite y la barra no salte.
 *
 * `aria-disabled` en vez de `disabled`: el atributo nativo lo saca del recorrido con Tab, y quien
 * navega con teclado nunca llegaria al texto que explica por que no puede usarlo. Asi se anuncia
 * como no disponible y ademas se puede leer. Sin `onClick`, no hace nada al pulsarlo.
 */
function FiltroEnEspera ({ filtro, esperaA }: { filtro: Filtro, esperaA: Filtro | null }) {
  // Dos motivos distintos y dos textos distintos: falta elegir aquel del que cuelga, o ya se eligio
  // y no tiene nada que ofrecer. Decir "elegí X" cuando X ya esta elegido seria mentir. Cortos a
  // proposito: el disparador tiene ancho fijo y lo que no entra se recorta —de ahi el `title`—.
  const pista = esperaA === null
    ? `${filtro.etiqueta}: sin opciones`
    : `${filtro.etiqueta}: elegí ${esperaA.etiqueta}`

  return (
    <button
      type="button"
      aria-disabled="true"
      // El ancho es fijo y la pista puede no entrar: el titulo la deja leer completa.
      title={pista}
      className={cn(CLASES_DISPARADOR, ANCHO_FILTRO, 'text-texto-sutil cursor-not-allowed')}
    >
      <span className="truncate">{pista}</span>
      <ChevronSelector />
    </button>
  )
}

interface PropsFiltroConOpciones extends PropsControlFiltro {
  opciones: OpcionFiltro[]
}

/**
 * Cantidad de opciones a partir de la cual el desplegable trae buscador.
 *
 * Seis deja fuera a los catalogos cortos y fijos —los cinco estados, las cuatro prioridades, los
 * tres estados de SLA—, donde un campo de texto seria un control mas entre el clic y la unica opcion
 * que hay. De ahi para arriba empieza a haber que recorrer: el equipo pasa de ciento ochenta
 * personas y el catalogo de Espacios de doscientos.
 */
const UMBRAL_BUSCADOR = 6

interface PropsMenuBuscable {
  /** Nombre del control, para el lector de pantalla y para el texto del buscador. */
  etiqueta: string
  /** Lo que muestra el disparador: la opcion elegida, o "Estado: todos". */
  texto: string
  /** Cuantas mas hay elegidas ademas de la que se muestra (`+2`). */
  extra?: string | null
  /** Pinta el disparador tenue: es la señal de que el filtro no esta puesto. */
  sinFiltrar?: boolean
  opciones: OpcionFiltro[]
  seleccionadas: string[]
  /** Varias opciones a la vez: el menu no se cierra al elegir y las filas se marcan. */
  multiple: boolean
  /** Etiqueta de la fila que quita el filtro. Solo en los de un valor. */
  opcionVacia?: string | null
  /** Recibe el valor elegido; en el modo de varios, el que se marco o desmarco. */
  onElegir: (valor: string) => void
}

/**
 * Desplegable de opciones con busqueda, para un valor o para varios.
 *
 * Un solo componente para los dos modos porque en la barra conviven, y lo unico que los distingue es
 * si el menu se cierra al elegir: que uno se viera como un selector y el otro como un boton solo
 * hacia parecer que el de al lado estaba roto.
 *
 * Sobre el menu de Radix y no sobre su `Select`: el `Select` no admite nada que no sea una opcion
 * dentro del panel, y sin un campo de texto adentro un catalogo de doscientos Espacios se recorre a
 * ojo. La semantica no se pierde —`menuitemradio` para el de un valor, `menuitemcheckbox` para el de
 * varios—, que es lo que un lector de pantalla necesita para decir cual esta elegida.
 */
function MenuBuscable ({
  etiqueta,
  texto,
  extra = null,
  sinFiltrar = false,
  opciones,
  seleccionadas,
  multiple,
  opcionVacia = null,
  onElegir
}: PropsMenuBuscable) {
  const [consulta, setConsulta] = useState('')
  const conBuscador = opciones.length >= UMBRAL_BUSCADOR
  const buscado = consulta.trim().toLowerCase()
  const visibles = buscado === '' ? opciones : opciones.filter((opcion) => opcion.etiqueta.toLowerCase().includes(buscado))

  return (
    <MenuContextual onOpenChange={(abierto) => { if (!abierto) setConsulta('') }}>
      <DisparadorMenu
        aria-label={etiqueta}
        // El ancho es fijo: el resumen cambia de largo al elegir, y un disparador que se ensancha
        // empuja a los filtros de al lado debajo del puntero.
        className={cn(CLASES_DISPARADOR, ANCHO_FILTRO, sinFiltrar && 'text-texto-sutil')}
      >
        <span className="flex min-w-0 items-baseline gap-1">
          <span className="truncate">{texto}</span>
          {/* El conteo no se recorta: es lo unico que dice que hay mas de un valor puesto. */}
          {extra !== null && <span className="text-texto-tenue shrink-0">{extra}</span>}
        </span>
        <ChevronSelector />
      </DisparadorMenu>
      <ContenidoMenu
        align="start"
        // Mas ancho que el disparador y con tope: los nombres largos —un Espacio, un cliente— se leen
        // enteros sin que el panel se salga de la pantalla en un telefono.
        className="w-64 max-w-[calc(100vw-2rem)]"
      >
        {conBuscador && (
          <BuscadorMenu valor={consulta} onCambiar={setConsulta} placeholder={`Buscar ${etiqueta.toLowerCase()}…`} />
        )}
        {multiple
          ? visibles.map((opcion) => (
            <ItemMenuMarcable
              key={opcion.valor}
              checked={seleccionadas.includes(opcion.valor)}
              disabled={opcion.deshabilitada}
              onCheckedChange={() => { onElegir(opcion.valor) }}
            >
              <span className="truncate">{opcion.etiqueta}</span>
            </ItemMenuMarcable>
            ))
          : (
            <GrupoRadioMenu value={seleccionadas[0] ?? SIN_FILTRO} onValueChange={onElegir}>
              {/* La fila que quita el filtro no se busca: se esconde mientras hay texto escrito para
                  que no aparezca como una coincidencia mas. */}
              {opcionVacia !== null && buscado === '' && <ItemMenuRadio value={SIN_FILTRO}>{opcionVacia}</ItemMenuRadio>}
              {visibles.map((opcion) => (
                <ItemMenuRadio key={opcion.valor} value={opcion.valor} disabled={opcion.deshabilitada}>
                  <span className="truncate">{opcion.etiqueta}</span>
                </ItemMenuRadio>
              ))}
            </GrupoRadioMenu>
            )}
        {visibles.length === 0 && <SinResultadosMenu />}
      </ContenidoMenu>
    </MenuContextual>
  )
}

/** Filtro de un solo valor: menu excluyente, con una fila para no filtrar. */
function FiltroSimple ({ filtro, opciones, valores, onCambiar }: PropsFiltroConOpciones) {
  const { texto, extra } = resumenDeFiltro(filtro.etiqueta, opciones, valores)

  return (
    <MenuBuscable
      etiqueta={filtro.etiqueta}
      texto={texto}
      extra={extra}
      sinFiltrar={valores.length === 0}
      opciones={opciones}
      seleccionadas={valores}
      multiple={false}
      opcionVacia={filtro.etiquetaSinFiltro ?? `${filtro.etiqueta}: todos`}
      onElegir={(valor) => { onCambiar(valor === SIN_FILTRO ? [] : [valor]) }}
    />
  )
}

/**
 * Filtro de varios valores: menu con marcas, que el backend traduce a `IN`.
 *
 * Elegir varios estados a la vez es lo que la API acepta (`filter[status]=1,4`) y lo que la gente
 * usa; el menu no se cierra al marcar para que no haya que reabrirlo en cada uno.
 */
function FiltroMultiple ({ filtro, opciones, valores, onCambiar }: PropsFiltroConOpciones) {
  const { texto, extra } = resumenDeFiltro(filtro.etiqueta, opciones, valores)

  return (
    <MenuBuscable
      etiqueta={filtro.etiqueta}
      texto={texto}
      extra={extra}
      sinFiltrar={valores.length === 0}
      opciones={opciones}
      seleccionadas={valores}
      multiple
      onElegir={(valor) => {
        onCambiar(valores.includes(valor) ? valores.filter((v) => v !== valor) : [...valores, valor])
      }}
    />
  )
}

/**
 * Filtro de rango de fechas: dos `<input type="date">` nativos.
 *
 * Nativos y no un calendario propio porque el nativo ya trae teclado, formato local y el calendario
 * del sistema operativo. Viajan como `desde,hasta`, que es lo que el backend espera del rango.
 */
function FiltroRangoFechas ({ filtro, valores, onCambiar }: PropsControlFiltro) {
  const desde = valores[0] ?? ''
  const hasta = valores[1] ?? ''

  /**
   * Un extremo suelto se envia igual.
   *
   * `date_from` y `date_to` son dos filtros independientes de la whitelist, cada uno un `>=` o un
   * `<=`: verificado contra la API, los tres casos responden 200. Descartar el rango hasta tener las
   * dos fechas obligaba a elegir una fecha final que nadie queria poner.
   */
  function cambiar (nuevoDesde: string, nuevoHasta: string) {
    onCambiar(nuevoDesde === '' && nuevoHasta === '' ? [] : [nuevoDesde, nuevoHasta])
  }

  return (
    <div className="flex items-center gap-1.5">
      {/* Dos campos de fecha sin nombre no dicen que fecha filtran. El `aria-label` de cada extremo
          resuelve el lector de pantalla; esto resuelve el resto de la gente. */}
      <span className="text-texto-tenue text-xs">{filtro.etiqueta}</span>
      <Entrada
        type="date"
        aria-label={`${filtro.etiqueta}: desde`}
        value={desde}
        max={hasta === '' ? undefined : hasta}
        onChange={(evento) => cambiar(evento.target.value, hasta)}
        className="w-36"
      />
      <span className="text-texto-sutil text-xs">a</span>
      <Entrada
        type="date"
        aria-label={`${filtro.etiqueta}: hasta`}
        value={hasta}
        min={desde === '' ? undefined : desde}
        onChange={(evento) => cambiar(desde, evento.target.value)}
        className="w-36"
      />
    </div>
  )
}

interface PropsPaginacion {
  paginacion: Paginacion | undefined
  onCambiar: (parcial: Partial<EstadoConsulta>) => void
}

/**
 * Paginacion de la tabla, leida de `meta.pagination`.
 *
 * Sin `meta` no se dibuja nada: inventar "pagina 1 de 1" cuando el backend no dijo cuantas hay es
 * afirmar algo que no se sabe.
 */
export function PaginacionTabla ({ paginacion, onCambiar }: PropsPaginacion) {
  if (paginacion === undefined) return null

  const { page, per_page: porPagina, total, total_pages: totalPaginas } = paginacion

  return (
    <div className="text-texto-tenue flex flex-wrap items-center justify-between gap-2 text-xs">
      <p aria-live="polite">
        Página {page} de {Math.max(1, totalPaginas)} · {total} en total
      </p>

      <div className="flex items-center gap-2">
        <Selector
          value={String(porPagina)}
          onValueChange={(valor) => onCambiar({ porPagina: Number(valor), pagina: 1 })}
        >
          <DisparadorSelector aria-label="Filas por página" className="w-24" />
          <ContenidoSelector>
            {opcionesPorPagina(POR_PAGINA_MAXIMO, porPagina).map((cantidad) => (
              <Opcion key={cantidad} value={String(cantidad)}>{cantidad}</Opcion>
            ))}
          </ContenidoSelector>
        </Selector>

        <Boton tamano="chico" disabled={page <= 1} onClick={() => onCambiar({ pagina: page - 1 })}>
          Anterior
        </Boton>
        <Boton tamano="chico" disabled={page >= totalPaginas} onClick={() => onCambiar({ pagina: page + 1 })}>
          Siguiente
        </Boton>
      </div>
    </div>
  )
}

/**
 * Edita una condición tipada y solo la aplica al enviar un valor válido.
 * @param props Configuración, valores actuales y callback de aplicación.
 * @returns Formulario accesible de una condición.
 */
function FiltroCampo ({ filtro, valores, onCambiar }: PropsControlFiltro) {
  const operadores = operadoresCampo(filtro)
  const [operador, setOperador] = useState(valores[0] ?? operadores[0] ?? 'eq')
  const [valor, setValor] = useState(valores[1] ?? '')
  const sinValor = operador === 'empty' || operador === 'not_empty'
  const etiquetas: Record<string, string> = { eq: 'Es igual a', ne: 'Es distinto de', contains: 'Contiene', gt: 'Mayor que', gte: 'Mayor o igual', lt: 'Menor que', lte: 'Menor o igual', empty: 'Está vacío', not_empty: 'No está vacío' }

  return (
    <form className="border-linea flex max-w-full flex-wrap items-center gap-2 rounded-chico border p-2" onSubmit={(evento) => {
      evento.preventDefault()
      onCambiar([operador, sinValor ? '1' : valor])
    }}>
      <span className="text-sm">{filtro.etiqueta}</span>
      <select aria-label={`Operador de ${filtro.etiqueta}`} className="border-control-borde bg-control text-texto rounded-control h-9 border px-2 text-sm" value={operador} onChange={(evento) => { setOperador(evento.target.value) }}>
        {operadores.map((op) => <option key={op} value={op}>{etiquetas[op]}</option>)}
      </select>
      {!sinValor && (filtro.tipoDato === 'booleano'
        ? <select required aria-label={`Valor de ${filtro.etiqueta}`} className="border-control-borde bg-control text-texto rounded-control h-9 border px-2 text-sm" value={valor} onChange={(evento) => { setValor(evento.target.value) }}><option value="">Elegir…</option><option value="1">Sí</option><option value="0">No</option></select>
        : <Entrada required aria-label={`Valor de ${filtro.etiqueta}`} className="w-40" type={filtro.tipoDato === 'numero' ? 'number' : filtro.tipoDato === 'fecha' ? 'date' : 'text'} step={filtro.tipoDato === 'numero' ? 'any' : undefined} value={valor} onChange={(evento) => { setValor(evento.target.value) }} />)}
      <Boton type="submit" tamano="chico" disabled={!sinValor && valor.trim() === ''}>Aplicar</Boton>
    </form>
  )
}
