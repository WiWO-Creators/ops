'use client'

/**
 * El segundo nivel: el organigrama clásico de arriba abajo de un área.
 *
 * **El color del borde de cada caja es su área**, no la del árbol que se está mirando. Es la pieza
 * que hace el trabajo: una caja que cuelga de un jefe de otra área —o un jefe de otra área
 * enganchado arriba de todo— salta a la vista en lugar de quedar escondida detrás de una línea igual
 * a las demás.
 *
 * El arrastre usa la API nativa de HTML (`draggable` + `dragover` + `drop`), sin librería. **No es
 * la única vía y no puede serlo**: arrastrar no funciona con teclado, es incómodo en un teléfono y
 * es imposible cuando el jefe de destino quedó fuera de la pantalla. Cada caja es además un `<button>`
 * real que abre el panel lateral, que es donde se elige jefe, escalón y área de una lista.
 */
import { Link2Off } from 'lucide-react'
import { Avatar } from '@/componentes/presentadores/Avatar'
import { colorDeArea } from '@/dominio/organigrama'
import { etiquetaDeEscalon } from '@/dominio/escalon'
import { cn } from '@/lib/clases'
import estilos from './arbol.module.css'
import type { NodoPersona } from '@/dominio/organigrama'

interface PropsArbol {
  raices: NodoPersona[]
  /** Quién tiene el panel abierto, para marcar su caja. */
  elegida: number | null
  /** `false` deja el árbol de sólo lectura: ni arrastre, ni zona de soltar, ni cursor de mover. */
  editable: boolean
  /** Los ids que no pueden recibir a la persona que se está arrastrando (ella y su descendencia). */
  prohibidos: Set<number>
  onElegir: (staffid: number) => void
  /** Suelta a `staffid` bajo `jefeId`; `null` la desengancha del árbol. */
  onSoltar: (staffid: number, jefeId: number | null) => void
  onArrastrar: (staffid: number | null) => void
}

/**
 * Dibuja el árbol entero, con el fondo como zona para desenganchar.
 *
 * @param props las raíces ya armadas por `arbolDelArea` y los manejadores de la edición
 */
export function ArbolDelArea (props: PropsArbol) {
  const { raices, editable, onSoltar, onArrastrar } = props

  return (
    <div
      className={cn(
        estilos.lienzo,
        'border-linea bg-superficie-hundida rounded-tarjeta border p-3 sm:p-6'
      )}
      onDragOver={editable ? (evento) => evento.preventDefault() : undefined}
      onDrop={editable
        ? (evento) => {
            // Soltar sobre el fondo desengancha. Se comprueba que el destino sea el fondo y no una
            // caja: sin esto, el `drop` de una caja burbujea hasta acá y desengancharía a quien se
            // acaba de asignar.
            if (evento.target !== evento.currentTarget) return

            evento.preventDefault()
            const staffid = Number(evento.dataTransfer.getData('text/plain'))

            onArrastrar(null)
            if (Number.isInteger(staffid) && staffid > 0) onSoltar(staffid, null)
          }
        : undefined}
    >
      <div className={estilos.arbol}>
        {raices.map((nodo) => (
          // `role="list"` no es redundante: `display: flex` le saca a un `<ul>` la semántica de
          // lista, y con ella se van también los `listitem` de sus `<li>`. Sin eso el árbol se
          // anuncia como texto suelto y se pierde la anidación, que es lo único que dice quién
          // depende de quién cuando no se ven las líneas.
          <ul
            key={nodo.persona.staffid}
            role="list"
            aria-label={`Quienes dependen de ${nodo.persona.nombre}`}
            className={cn(estilos.rama, estilos.raiz)}
          >
            <Nodo nodo={nodo} {...props} />
          </ul>
        ))}
      </div>
    </div>
  )
}

/** Un nodo y, si tiene, la rama de sus hijos. */
function Nodo ({ nodo, ...props }: { nodo: NodoPersona } & PropsArbol) {
  return (
    <li className={estilos.nodo}>
      <CajaDePersona nodo={nodo} {...props} />

      {nodo.hijos.length > 0 && (
        <ul role="list" aria-label={`Quienes dependen de ${nodo.persona.nombre}`} className={estilos.rama}>
          {nodo.hijos.map((hijo) => <Nodo key={hijo.persona.staffid} nodo={hijo} {...props} />)}
        </ul>
      )}
    </li>
  )
}

/**
 * La caja de una persona: se arrastra, recibe a otra y abre el panel.
 *
 * El botón lleva `aria-label` completo porque el color del borde no se anuncia: quien navega con
 * lector de pantalla tiene que oír el área, el escalón y que el clic abre la edición.
 */
function CajaDePersona (
  { nodo, elegida, editable, prohibidos, onElegir, onSoltar, onArrastrar }:
  { nodo: NodoPersona } & PropsArbol
) {
  const { persona, ajeno } = nodo
  const aqui = prohibidos.has(persona.staffid)

  return (
    <button
      type="button"
      draggable={editable}
      aria-current={elegida === persona.staffid ? 'true' : undefined}
      aria-label={
        `${persona.nombre}, ${etiquetaDeEscalon(persona.escalon)}` +
        `${ajeno ? ', de otra área' : ''}${persona.activo ? '' : ', dada de baja'}` +
        `${editable ? '. Abrir para cambiarle jefe, escalón y área.' : ''}`
      }
      onClick={() => onElegir(persona.staffid)}
      onDragStart={(evento) => {
        evento.dataTransfer.setData('text/plain', String(persona.staffid))
        evento.dataTransfer.effectAllowed = 'move'
        onArrastrar(persona.staffid)
      }}
      onDragEnd={() => onArrastrar(null)}
      onDragOver={(evento) => {
        // Sin `preventDefault` el navegador no deja soltar. No se ofrece como destino a quien
        // cerraría un ciclo: la API lo rechaza con un 422 y ofrecerlo es hacer perder un viaje.
        if (!editable || aqui) return

        evento.preventDefault()
        evento.dataTransfer.dropEffect = 'move'
      }}
      onDrop={(evento) => {
        if (!editable || aqui) return

        evento.preventDefault()
        evento.stopPropagation()
        const staffid = Number(evento.dataTransfer.getData('text/plain'))

        onArrastrar(null)
        if (Number.isInteger(staffid) && staffid > 0) onSoltar(staffid, persona.staffid)
      }}
      style={{ borderColor: colorDeArea(persona.area_id) }}
      className={cn(
        estilos.caja,
        'rounded-medio bg-superficie-elevada flex w-full items-center gap-2.5 border-2 px-2.5 py-2',
        'text-left transition-colors duration-rapida ease-neo shadow-1 hover:bg-hover',
        'focus-visible:outline-foco focus-visible:outline-2 focus-visible:outline-offset-2',
        'sm:w-52',
        editable && 'cursor-grab active:cursor-grabbing',
        elegida === persona.staffid && 'bg-seleccionado',
        // Quien no puede recibir a la arrastrada se apaga: es la señal de que soltar ahí no va.
        editable && aqui && 'opacity-45',
        !persona.activo && 'opacity-60'
      )}
    >
      <Avatar nombre={persona.nombre} imagen={persona.avatar} tamano="chico" />

      <span className="min-w-0 flex-1">
        <span className="text-texto block truncate text-[13px] leading-tight font-semibold">
          {persona.nombre}
        </span>
        <span className="text-texto-sutil block truncate text-xs">
          {etiquetaDeEscalon(persona.escalon)}
          {!persona.activo && ' · dada de baja'}
        </span>
      </span>

      {/* Sólo en los enganches: la caja ya se distingue por el color, y el ícono lo dice sin color. */}
      {ajeno && <Link2Off aria-hidden="true" className="text-texto-sutil size-3.5 shrink-0" />}
    </button>
  )
}
