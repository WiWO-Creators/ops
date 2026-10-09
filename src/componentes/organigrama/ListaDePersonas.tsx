'use client'

/**
 * La otra lectura del organigrama: la misma gente, en una tabla.
 *
 * El árbol responde "¿de quién cuelga quién?" de un vistazo, pero es pésimo para "¿dónde está
 * Fulana?": con 184 personas hay que recorrerlo con los ojos. La lista responde eso último —buscar,
 * ordenar, comparar— sobre exactamente **el mismo conjunto de personas que se está mirando**: todas
 * las visibles en el mapa, las del árbol al entrar en un área.
 *
 * Es `TablaRecurso` en modo memoria (`datos`): las personas ya están todas en el navegador desde que
 * la página se resolvió en el servidor, así que no hay nada que pedirle al BFF. El buscador es
 * propio y no el de `ControlesTabla` —filtra a cada tecla y no al envío, que es como se espera de un
 * filtro que no viaja a ningún lado—; lo que entrega a la tabla ya viene filtrado, y el orden y la
 * página los resuelve el motor sobre eso.
 *
 * **Editar es el mismo camino que en el árbol.** Una fila no trae selectores propios ni un diálogo
 * aparte: hace lo mismo que una caja, abrir `PanelDePersona`. Dos idiomas de edición para el mismo
 * dato es justo lo que esta pantalla vino a evitar — terminan divergiendo y guardando distinto. Por
 * eso la fila no usa `abrirEn` (no hay URL que escribir) sino `alCliquearFila` para el clic con mouse,
 * más un botón real dentro de la celda del nombre para que el teclado tenga la misma vía.
 */
import { useMemo, useState, Suspense } from 'react'
import { Search } from 'lucide-react'
import { Entrada } from '@/componentes/formularios/Entrada'
import { Avatar } from '@/componentes/presentadores/Avatar'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { Cargando } from '@/componentes/estado/Estados'
import { TablaRecurso } from '@/componentes/datos/TablaRecurso'
import { etiquetaDeEscalon, ordenDeEscalon } from '@/dominio/escalon'
import { colorDeArea, filtrarFilas } from '@/dominio/organigrama'
import { cn } from '@/lib/clases'
import type { Columna, DefinicionRecurso, ResultadoLista } from '@/definiciones/tipos'
import type { FilaDeLista } from '@/dominio/organigrama'

/** Una fila con los campos de orden aplanados: el motor de tabla solo ordena por propiedades de
 * primer nivel, y `FilaDeLista.persona.nombre` no lo es. */
interface FilaTabla extends FilaDeLista {
  nombre: string
  escalonEtiqueta: string
}

/** Sin filas que ordenar ni paginar: `ResultadoLista` vacío, ignorado por el modo memoria. */
const SIN_RESULTADO: ResultadoLista<FilaTabla> = { filas: [], paginacion: undefined }

interface PropsLista {
  filas: FilaDeLista[]
  /** Quién tiene el panel abierto, para marcar su fila igual que se marca su caja. */
  elegida: number | null
  /** `false` deja la lista de sólo lectura: la fila sigue abriendo el panel, que no ofrece guardar. */
  editable: boolean
  onElegir: (staffid: number) => void
}

/**
 * Dibuja la tabla con su buscador.
 *
 * El buscador es estado de la pantalla y no viaja a ningún lado: quien monta esta lista le pasa
 * `key` por vista, así que entrar en un área la remonta limpia en vez de arrastrar un filtro que ahí
 * no encuentra a nadie.
 *
 * `TablaRecurso` lee `useSearchParams` para el orden y la página: sin este límite de `Suspense`
 * fallaría el build de cualquier pantalla que monte esta lista.
 *
 * @param props las filas ya armadas y lo necesario para abrir el panel
 */
export function ListaDePersonas (props: PropsLista) {
  return (
    <Suspense fallback={<Cargando alto="min-h-56" mensaje="Cargando la lista…" />}>
      <CuerpoDeListaDePersonas {...props} />
    </Suspense>
  )
}

function CuerpoDeListaDePersonas ({ filas, elegida, editable, onElegir }: PropsLista) {
  const [consulta, setConsulta] = useState('')

  const planas = useMemo<FilaTabla[]>(() => filas.map((fila) => ({
    ...fila,
    nombre: fila.persona.nombre,
    escalonEtiqueta: etiquetaDeEscalon(fila.persona.escalon)
  })), [filas])

  // `filtrarFilas` solo filtra (no arma filas nuevas): el resultado sigue siendo `FilaTabla[]`, y el
  // tipo declarado de la funcion es el de su parametro generico (`FilaDeLista[]`).
  const visibles = useMemo(
    () => filtrarFilas(planas, consulta) as FilaTabla[],
    [planas, consulta]
  )

  const definicion = useMemo(() => definicionDeListaDePersonas(editable, onElegir), [editable, onElegir])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="relative w-full sm:w-72">
          <Search
            aria-hidden="true"
            className="text-texto-sutil pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2"
          />
          <Entrada
            type="search"
            value={consulta}
            aria-label="Buscar una persona por nombre o correo"
            placeholder="Busca por nombre o correo…"
            className="ps-9"
            onChange={(evento) => setConsulta(evento.target.value)}
          />
        </div>

        {/* La cuenta se anuncia: quien filtra sin ver la tabla necesita saber cuánto quedó, y es la
            única señal de que escribir una letra más dejó la lista en cero. */}
        <p role="status" aria-live="polite" className="text-texto-sutil text-xs tabular-nums">
          {visibles.length === filas.length
            ? `${filas.length} ${filas.length === 1 ? 'persona' : 'personas'}`
            : `${visibles.length} de ${filas.length} personas`}
        </p>
      </div>

      <TablaRecurso<FilaTabla>
        definicion={definicion}
        inicial={SIN_RESULTADO}
        datos={visibles}
        claveFila={(fila) => fila.persona.staffid}
        claseFila={(fila) => cn(!fila.persona.activo && 'opacity-60', elegida === fila.persona.staffid && 'bg-seleccionado')}
        alCliquearFila={(fila) => { onElegir(fila.persona.staffid) }}
      />
    </div>
  )
}

/**
 * Definicion de la lista, en modo memoria: sin `filtros` (el buscador de esta pantalla filtra antes,
 * no la tabla) y sin `ruta` real —el modo memoria nunca la pide—.
 *
 * @param editable si el botón del nombre debe anunciar que abre para cambiar jefe/escalón/área.
 */
function definicionDeListaDePersonas (
  editable: boolean,
  onElegir: (staffid: number) => void
): DefinicionRecurso<FilaTabla> {
  const columnas: Array<Columna<FilaTabla>> = [
    {
      clave: 'persona',
      encabezado: 'Persona',
      ordenPor: 'nombre',
      presentar: (fila) => <CeldaPersona fila={fila} editable={editable} onElegir={onElegir} />
    },
    {
      clave: 'escalon',
      encabezado: 'Escalón',
      ordenPor: 'escalonEtiqueta',
      // Por la escalera y no por el alfabeto: alfabéticamente "Director" iría antes que "Lead" y
      // "Staff", y una columna de jerarquía ordenada al azar no informa nada.
      ordenarCon: (a, b) => ordenDeEscalon(a.persona.escalon) - ordenDeEscalon(b.persona.escalon),
      sinCortar: true,
      presentar: (fila) => fila.escalonEtiqueta
    },
    { clave: 'jefe', encabezado: 'Depende de', ordenPor: 'jefe', sinCortar: true, presentar: (fila) => fila.jefe },
    {
      clave: 'area',
      encabezado: 'Área',
      ordenPor: 'area',
      sinCortar: true,
      presentar: (fila) => (
        // El mismo punto de color que lleva el borde de su caja en el árbol: es lo que hace que las
        // dos vistas se lean como la misma pantalla y no como dos pantallas distintas.
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: colorDeArea(fila.persona.area_id) }}
          />
          {fila.area}
        </span>
      )
    }
  ]

  return {
    ruta: 'organigrama/personas',
    titulo: { singular: 'Persona', plural: 'Personas' },
    columnas,
    filtros: [],
    ordenables: ['nombre', 'escalonEtiqueta', 'jefe', 'area'],
    ordenPorDefecto: 'nombre',
    busqueda: false,
    includes: []
  }
}

/**
 * Celda del nombre: avatar, botón accesible que abre el panel y el distintivo de baja.
 *
 * El clic de la fila entera (`alCliquearFila`) es la comodidad del mouse; este botón es la vía real
 * para el teclado, que no puede enfocar un `<tr>`. `esControlDeFila` reconoce el `<button>` y deja
 * que la fila se abstenga, así que el clic no dispara las dos reacciones a la vez.
 */
function CeldaPersona ({ fila, editable, onElegir }: {
  fila: FilaTabla
  editable: boolean
  onElegir: (staffid: number) => void
}) {
  const { persona } = fila

  return (
    <span className="flex items-center gap-2.5">
      <Avatar nombre={persona.nombre} imagen={persona.avatar} tamano="chico" />

      <span className="flex min-w-0 flex-col">
        <button
          type="button"
          aria-label={`${persona.nombre}. ${editable
            ? 'Abrir para cambiarle jefe, escalón y área.'
            : 'Abrir su ficha.'}`}
          onClick={() => { onElegir(persona.staffid) }}
          className={cn(
            'text-texto truncate text-left text-sm leading-tight font-semibold',
            'focus-visible:outline-foco focus-visible:outline-2 focus-visible:outline-offset-2'
          )}
        >
          {persona.nombre}
        </button>
        <span className="text-texto-sutil truncate text-xs">{persona.correo}</span>
      </span>

      {!persona.activo && <Insignia tono="contorno" tamano="chico">Dada de baja</Insignia>}
    </span>
  )
}
