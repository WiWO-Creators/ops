'use client'

import { Component, type ErrorInfo, type ReactNode } from 'react'
import { ErrorEstado } from '@/componentes/estado/Estados'
import { BloqueCopiable } from '@/componentes/presentadores/BloqueCopiable'

/** Cuantas lineas de la pila se muestran. Las primeras son las que nombran el componente que reventó. */
const LINEAS_DE_PILA = 5

interface Props {
  children: ReactNode
  /** Nombra la parte de la pantalla que se está aislando; sale en el detalle copiado. */
  zona: string
  titulo?: string
}

interface Estado {
  error: Error | null
  /** La pila de componentes de React, que dice qué se estaba montando. La del `Error` no lo dice. */
  pilaDeComponentes: string | null
}

/**
 * Límite de error de React alrededor de una parte de la pantalla.
 *
 * Sin esto, un error al renderizar un hijo desmonta el árbol entero y deja el panel **en blanco**:
 * ni cartel, ni pista, ni forma de reportarlo. Es exactamente el síntoma que no se puede depurar a
 * distancia, porque la persona que lo sufre ve lo mismo que vería si la pantalla no existiera.
 *
 * === POR QUE ACA SI SE MUESTRA LA PILA ===
 *
 * `ErrorEstado` documenta que nunca muestra un stack, y tiene razón: a quien usa la aplicación el
 * stack no le dice nada y puede filtrar rutas del servidor. Ese criterio se respeta —el cartel de
 * arriba sigue siendo el `message` y nada más—. La pila va aparte, en un bloque que hay que ir a
 * buscar, y existe para una sola cosa: que la persona la copie y la pegue en el reporte. Es código
 * de cliente ya enviado al navegador, así que no filtra nada que no esté en el bundle.
 *
 * Es un componente de clase porque `getDerivedStateFromError` y `componentDidCatch` no tienen
 * equivalente en hooks. No hay versión con hooks que capturar errores de render.
 *
 * No reemplaza al manejo de errores de cada pedido: un `fetch` que falla se muestra con
 * `ErrorEstado` donde ocurre. Esto es la red debajo, para lo que nadie previó.
 */
export class LimiteDeError extends Component<Props, Estado> {
  state: Estado = { error: null, pilaDeComponentes: null }

  static getDerivedStateFromError (error: Error): Partial<Estado> {
    return { error }
  }

  componentDidCatch (error: Error, info: ErrorInfo): void {
    this.setState({ pilaDeComponentes: info.componentStack ?? null })
  }

  /** Vuelve a intentar el render. Si el error era transitorio —una carga a medias—, alcanza. */
  private readonly reintentar = (): void => {
    this.setState({ error: null, pilaDeComponentes: null })
  }

  render (): ReactNode {
    const { error, pilaDeComponentes } = this.state

    if (error === null) return this.props.children

    return (
      <div className="flex flex-col gap-3">
        <ErrorEstado
          titulo={this.props.titulo ?? 'Esta parte no se pudo mostrar'}
          detalle={error.message}
          onReintentar={this.reintentar}
        />
        <BloqueCopiable
          titulo="Detalle para reportarlo"
          texto={detalleDelError(this.props.zona, error, pilaDeComponentes)}
        />
      </div>
    )
  }
}

/**
 * Arma el texto que la persona copia y pega en el reporte.
 *
 * Lleva la zona porque el mismo error dicho desde dos partes de la pantalla son dos problemas
 * distintos, y la URL porque el estado de esta pantalla vive en la barra de direcciones.
 *
 * @param zona parte de la pantalla que quedó aislada
 * @param error el error que cortó el render
 * @param pilaDeComponentes la pila de componentes de React, si `componentDidCatch` alcanzó a correr
 * @returns el detalle en texto plano, listo para pegar
 */
function detalleDelError (zona: string, error: Error, pilaDeComponentes: string | null): string {
  const pila = (error.stack ?? '').split('\n').slice(0, LINEAS_DE_PILA).join('\n')
  const componentes = (pilaDeComponentes ?? '').split('\n').filter((l) => l.trim() !== '').slice(0, LINEAS_DE_PILA).join('\n')

  return [
    `Zona: ${zona}`,
    `URL: ${typeof window === 'undefined' ? '(servidor)' : window.location.href}`,
    `Error: ${error.name}: ${error.message}`,
    pila === '' ? '' : `Pila:\n${pila}`,
    componentes === '' ? '' : `Componentes:\n${componentes}`
  ].filter((linea) => linea !== '').join('\n')
}
