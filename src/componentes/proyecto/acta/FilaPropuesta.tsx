'use client'

import { useState, type ReactElement } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { Boton } from '@/componentes/formularios/Boton'
import { CLASES_CASILLA, Entrada } from '@/componentes/formularios/Entrada'
import { Contenido } from '@/componentes/presentadores/Contenido'
import { EnlacePersona } from '@/componentes/presentadores/EnlacePersona'
import { Fecha } from '@/componentes/presentadores/Fecha'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { esHtml, textoPlano } from '@/dominio/texto-rico'
import { cn } from '@/lib/clases'
import { EstadoDeTarea } from '../EstadoDeTarea'
import type { EstadoLookup } from '@/datos/recursos'
import type { PropuestaDeTarea } from '@/definiciones/actas'

/**
 * Una propuesta pendiente: lo que se va a crear y de dónde salió.
 *
 * El título se corrige **en la fila** porque es lo que se corrige siempre —el modelo escribe
 * "Enviar propuesta" donde el equipo diría "Enviar propuesta a Codelco"— y abrir un diálogo para
 * cambiar tres palabras en cada una de ocho filas es el camino largo del caso frecuente. El resto
 * de los campos sí vive en el diálogo: se tocan de a una y necesitan controles que no entran en
 * una línea.
 *
 * Se guarda al salir del campo y no con un botón por fila: un botón "Guardar" por cada título
 * multiplicaría los controles de la lista por dos para confirmar algo que la persona ya decidió al
 * irse del campo.
 *
 * "Crear tarea" sí va en cada fila y a la vista: es la acción para la que existe la lista, y
 * esconderla detrás de marcar casillas hacía que nadie descubriera cómo convertir una propuesta.
 */
export function FilaPropuesta ({
  propuesta,
  prioridades,
  puedeCrear,
  seleccionada,
  descartando,
  creando,
  bloqueada,
  onAlternar,
  onCrear,
  onEditar,
  onRenombrar,
  onDescartar
}: {
  propuesta: PropuestaDeTarea
  prioridades: EstadoLookup[]
  puedeCrear: boolean
  seleccionada: boolean
  descartando: boolean
  creando: boolean
  bloqueada: boolean
  onAlternar: () => void
  onCrear: () => void
  onEditar: () => void
  onRenombrar: (titulo: string) => Promise<boolean>
  onDescartar: () => void
}): ReactElement {
  /**
   * Lo que se está escribiendo, junto al título con el que se empezó.
   *
   * Comparar contra `visto` durante el render —y no reponerlo desde un efecto— es lo que deja que el
   * diálogo de edición cambie el título sin pelearse con lo que hay tipeado: si el título de la
   * propuesta ya no es el que esta fila vio, manda el de la propuesta.
   */
  const [borrador, setBorrador] = useState({ visto: propuesta.titulo, titulo: propuesta.titulo })
  const [guardando, setGuardando] = useState(false)
  const [descripcionAbierta, setDescripcionAbierta] = useState(false)
  const titulo = borrador.visto === propuesta.titulo ? borrador.titulo : propuesta.titulo

  /** Manda el título solo si de verdad cambió: salir del campo sin tocarlo no es una escritura. */
  async function alSalir (): Promise<void> {
    const limpio = titulo.trim()

    if (limpio === '' || limpio === propuesta.titulo) {
      setBorrador({ visto: propuesta.titulo, titulo: propuesta.titulo })

      return
    }

    setGuardando(true)
    const guardado = await onRenombrar(limpio)
    setGuardando(false)

    // Si la API lo rechazó, lo escrito se queda en pantalla: es lo único que quedaría de ese texto.
    if (guardado) setBorrador({ visto: limpio, titulo: limpio })
  }

  return (
    <div className="border-linea bg-superficie-elevada rounded-tarjeta flex gap-3 border p-3">
      {puedeCrear && (
        <input
          type="checkbox"
          className={cn(CLASES_CASILLA, 'mt-2')}
          checked={seleccionada}
          disabled={bloqueada}
          aria-label={`Elegir "${propuesta.titulo}" para crearla`}
          onChange={onAlternar}
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-start gap-2">
          {puedeCrear
            ? (
              <Entrada
                value={titulo}
                maxLength={600}
                disabled={guardando}
                aria-label="Título de la tarea propuesta"
                className="h-8"
                onChange={(evento) => { setBorrador({ visto: propuesta.titulo, titulo: evento.target.value }) }}
                onBlur={() => { void alSalir() }}
              />
              )
            : <p className="text-texto min-w-0 flex-1 text-sm font-medium">{propuesta.titulo}</p>}

          {puedeCrear && (
            <div className="flex shrink-0 items-center gap-1">
              <Boton
                variante="primario"
                tamano="chico"
                cargando={creando}
                disabled={bloqueada}
                onClick={onCrear}
              >
                Crear tarea
              </Boton>
              <Boton
                variante="sutil"
                tamano="chico"
                soloIcono
                disabled={bloqueada}
                aria-label={`Editar "${propuesta.titulo}"`}
                onClick={onEditar}
              >
                <Pencil size={14} aria-hidden="true" />
              </Boton>
              <Boton
                variante="sutil"
                tamano="chico"
                soloIcono
                cargando={descartando}
                disabled={bloqueada}
                aria-label={`Descartar "${propuesta.titulo}"`}
                onClick={onDescartar}
              >
                <Trash2 size={14} aria-hidden="true" />
              </Boton>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          {propuesta.asignados.length === 0
            ? <span className="text-texto-sutil">Sin responsable</span>
            : propuesta.asignados.map((persona) => (
              <span
                key={persona.id}
                className="bg-relleno-neutro text-relleno-neutro-contenido rounded-control flex items-center gap-1.5 py-0.5 pl-0.5 pr-2"
              >
                <EnlacePersona id={persona.id} nombre={persona.nombre} tamano="chico" className="max-w-40" />
              </span>
              ))}

          <Fecha valor={propuesta.vence} comoVencimiento className="text-xs" />
          <EstadoDeTarea status={propuesta.prioridad} catalogo={prioridades} />

          {propuesta.etiquetas.map((etiqueta) => (
            <Insignia key={etiqueta.id} tono="contorno" tamano="chico">{etiqueta.nombre}</Insignia>
          ))}
        </div>

        {propuesta.descripcion !== null && (
          <div className="flex flex-col items-start gap-1">
            <Contenido
              html={esHtml(propuesta.descripcion) ? propuesta.descripcion : null}
              texto={propuesta.descripcion}
              className="text-texto-tenue text-sm"
              recortar={descripcionAbierta ? undefined : 4}
            />
            {esDescripcionLarga(propuesta.descripcion) && (
              <button
                type="button"
                aria-expanded={descripcionAbierta}
                className="text-texto-sutil hover:text-texto cursor-pointer text-xs underline-offset-2 hover:underline"
                onClick={() => { setDescripcionAbierta(!descripcionAbierta) }}
              >
                {descripcionAbierta ? 'Ver menos' : 'Ver más'}
              </button>
            )}
          </div>
        )}

        {propuesta.no_resuelto.length > 0 && (
          <p className="text-texto-aviso text-xs">
            No se resolvió: {propuesta.no_resuelto.join(' · ')}. Queda vacío hasta que lo completes.
          </p>
        )}

        {/* Entre comillas y recortado: es lo que se dijo en la reunión, no una descripción escrita
            para esta pantalla. Dos líneas alcanzan para reconocer el pasaje; el resto está en el
            acta, que se está viendo justo arriba. */}
        <p className="text-texto-sutil line-clamp-2 text-xs italic" title={propuesta.texto_origen}>
          «{propuesta.texto_origen}»
        </p>
      </div>
    </div>
  )
}

/**
 * Si la descripción no entra en las cuatro líneas del recorte y merece "Ver más".
 *
 * Es una estimación por texto y no una medición del DOM: medir exigiría un efecto y un observador de
 * tamaño por fila para decidir si se ofrece un botón. Más de cuatro renglones escritos, o un párrafo
 * que a ancho de fila ocupa más de cuatro, es lo que el recorte corta.
 */
function esDescripcionLarga (descripcion: string): boolean {
  const plano = textoPlano(descripcion)

  return plano.split('\n').length > 4 || plano.length > 320
}
