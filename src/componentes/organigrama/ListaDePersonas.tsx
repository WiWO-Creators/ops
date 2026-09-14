'use client'

/**
 * La otra lectura del organigrama: la misma gente, en una tabla.
 *
 * El árbol responde "¿de quién cuelga quién?" de un vistazo, pero es pésimo para "¿dónde está
 * Fulana?": con 184 personas hay que recorrerlo con los ojos. La lista responde eso último —buscar,
 * ordenar, comparar— sobre exactamente **el mismo conjunto de personas que se está mirando**: todas
 * las visibles en el mapa, las del árbol al entrar en un área.
 *
 * **Editar es el mismo camino que en el árbol.** Una fila no trae selectores propios ni un diálogo
 * aparte: hace lo mismo que una caja, abrir `PanelDePersona`. Dos idiomas de edición para el mismo
 * dato es justo lo que esta pantalla vino a evitar — terminan divergiendo y guardando distinto.
 *
 * El filtro corre en memoria y a cada tecla, al revés que el buscador de `ControlesTabla`, que
 * espera al envío: allá cada letra sería una petición al BFF, y acá no hay ninguna. Las personas ya
 * están todas en el navegador desde que la página se resolvió en el servidor.
 */
import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from 'lucide-react'
import { Entrada } from '@/componentes/formularios/Entrada'
import { Avatar } from '@/componentes/presentadores/Avatar'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { Vacio } from '@/componentes/estado/Estados'
import {
  CeldaEncabezado, CeldaTabla, CuerpoTabla, EncabezadoTabla, FilaTabla, Tabla
} from '@/componentes/datos/Tabla'
import { etiquetaDeEscalon } from '@/dominio/escalon'
import { colorDeArea, filtrarFilas, ordenarFilas } from '@/dominio/organigrama'
import { cn } from '@/lib/clases'
import type { ColumnaDeLista, FilaDeLista, SentidoDeOrden } from '@/dominio/organigrama'

/**
 * Las columnas, en orden de lectura.
 *
 * "Depende de" y no "Jefe": es el mismo nombre que le da el panel al campo que se edita, y que la
 * fila y el formulario llamen distinto a lo mismo es media confusión regalada.
 */
const COLUMNAS: readonly { clave: ColumnaDeLista, titulo: string }[] = [
  { clave: 'persona', titulo: 'Persona' },
  { clave: 'escalon', titulo: 'Escalón' },
  { clave: 'jefe', titulo: 'Depende de' },
  { clave: 'area', titulo: 'Área' }
]

interface PropsLista {
  filas: FilaDeLista[]
  /** Quién tiene el panel abierto, para marcar su fila igual que se marca su caja. */
  elegida: number | null
  /** `false` deja la lista de sólo lectura: la fila sigue abriendo el panel, que no ofrece guardar. */
  editable: boolean
  onElegir: (staffid: number) => void
}

/**
 * Dibuja la tabla con su buscador y su orden.
 *
 * El buscador y el orden son estado de la pantalla y no viajan a ningún lado: quien monta esta
 * lista le pasa `key` por vista, así que entrar en un área la remonta limpia en vez de arrastrar un
 * filtro que ahí no encuentra a nadie.
 *
 * @param props las filas ya armadas y lo necesario para abrir el panel
 */
export function ListaDePersonas ({ filas, elegida, editable, onElegir }: PropsLista) {
  const [consulta, setConsulta] = useState('')
  const [columna, setColumna] = useState<ColumnaDeLista>('persona')
  const [sentido, setSentido] = useState<SentidoDeOrden>('asc')

  const visibles = useMemo(
    () => ordenarFilas(filtrarFilas(filas, consulta), columna, sentido),
    [filas, consulta, columna, sentido]
  )

  /** Ordena por una columna; repetir la misma da vuelta el sentido. */
  function ordenarPor (clave: ColumnaDeLista): void {
    if (clave === columna) setSentido(sentido === 'asc' ? 'desc' : 'asc')
    else {
      setColumna(clave)
      setSentido('asc')
    }
  }

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

      {visibles.length === 0
        ? (
          <Vacio
            titulo="Nadie coincide con lo que buscas"
            descripcion="Prueba con parte del nombre o con el correo."
          />
          )
        : (
          <Tabla>
            <EncabezadoTabla>
              <tr>
                {COLUMNAS.map((una) => (
                  <CeldaEncabezado
                    key={una.clave}
                    angosta={una.clave !== 'persona'}
                    // `aria-sort` va en la celda y no en el botón: es la columna la que está
                    // ordenada, y es lo que el lector de pantalla lee al entrar en la tabla.
                    aria-sort={una.clave !== columna
                      ? 'none'
                      : sentido === 'asc' ? 'ascending' : 'descending'}
                    className="p-0"
                  >
                    <button
                      type="button"
                      onClick={() => ordenarPor(una.clave)}
                      className={cn(
                        'ease-neo flex w-full items-center gap-1.5 px-4 py-2 text-left',
                        'transition-colors duration-150 hover:text-texto',
                        'focus-visible:outline-foco focus-visible:outline-2 focus-visible:-outline-offset-2',
                        una.clave === columna && 'text-texto font-semibold'
                      )}
                    >
                      {una.titulo}
                      <FlechaDeOrden activa={una.clave === columna} sentido={sentido} />
                    </button>
                  </CeldaEncabezado>
                ))}
              </tr>
            </EncabezadoTabla>

            <CuerpoTabla>
              {visibles.map((fila) => (
                <Fila
                  key={fila.persona.staffid}
                  fila={fila}
                  abierta={elegida === fila.persona.staffid}
                  editable={editable}
                  onElegir={onElegir}
                />
              ))}
            </CuerpoTabla>
          </Tabla>
          )}
    </div>
  )
}

/**
 * Una fila: los mismos datos que la caja del árbol, y el mismo clic.
 *
 * La fila entera es clicable, pero quien la abre de verdad es el `<button>` del nombre: con el
 * teclado no se puede enfocar un `<tr>`, y sin un elemento real adentro la lista sería editable sólo
 * con el mouse. El `onClick` de la fila es la comodidad; el botón es la vía.
 */
function Fila (
  { fila, abierta, editable, onElegir }: {
    fila: FilaDeLista
    abierta: boolean
    editable: boolean
    onElegir: (staffid: number) => void
  }
) {
  const { persona } = fila

  return (
    <FilaTabla
      interactiva
      aria-current={abierta ? 'true' : undefined}
      onClick={() => onElegir(persona.staffid)}
      className={cn(abierta && 'bg-seleccionado', !persona.activo && 'opacity-60')}
    >
      <CeldaTabla>
        <span className="flex items-center gap-2.5">
          <Avatar nombre={persona.nombre} imagen={persona.avatar} tamano="chico" />

          <span className="flex min-w-0 flex-col">
            <button
              type="button"
              aria-label={`${persona.nombre}. ${editable
                ? 'Abrir para cambiarle jefe, escalón y área.'
                : 'Abrir su ficha.'}`}
              // El clic del botón burbujea hasta la fila, que hace lo mismo. Se corta acá para que
              // el panel se abra por un solo camino y no dos veces.
              onClick={(evento) => { evento.stopPropagation(); onElegir(persona.staffid) }}
              className={cn(
                'text-texto truncate text-left text-[13px] leading-tight font-semibold',
                'focus-visible:outline-foco focus-visible:outline-2 focus-visible:outline-offset-2'
              )}
            >
              {persona.nombre}
            </button>
            <span className="text-texto-sutil truncate text-xs">{persona.correo}</span>
          </span>

          {!persona.activo && <Insignia tono="contorno" tamano="chico">Dada de baja</Insignia>}
        </span>
      </CeldaTabla>

      <CeldaTabla angosta>{etiquetaDeEscalon(persona.escalon)}</CeldaTabla>

      <CeldaTabla angosta className="text-texto-tenue">{fila.jefe}</CeldaTabla>

      <CeldaTabla angosta>
        {/* El mismo punto de color que lleva el borde de su caja en el árbol: es lo que hace que las
            dos vistas se lean como la misma pantalla y no como dos pantallas distintas. */}
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: colorDeArea(persona.area_id) }}
          />
          {fila.area}
        </span>
      </CeldaTabla>
    </FilaTabla>
  )
}

/**
 * La flecha del encabezado.
 *
 * La columna inactiva también la lleva, apagada: sin ninguna señal, que los títulos se puedan pulsar
 * no se descubre hasta que alguien pasa el mouse por casualidad.
 */
function FlechaDeOrden ({ activa, sentido }: { activa: boolean, sentido: SentidoDeOrden }) {
  if (!activa) return <ArrowUpDown aria-hidden="true" className="size-3 shrink-0 opacity-40" />

  const Flecha = sentido === 'asc' ? ArrowUp : ArrowDown

  return <Flecha aria-hidden="true" className="size-3 shrink-0" />
}
