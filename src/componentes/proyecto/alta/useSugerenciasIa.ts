import { useState } from 'react'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { interpretarAltaRapida, type CatalogosAlta } from '@/dominio/alta-rapida'
import { errorDeDetalle } from '@/dominio/descripcion-tarea'
import {
  fusionarEspacio,
  fusionarInterpretacion,
  leerCamposTarea,
  type CatalogosTarea,
  type TareaFusionada
} from '@/dominio/ia-tarea'
import type { MarcaPrevia } from '../VistaPreviaAlta'
import { marcasDeFusion, NINGUNO, type CamposManuales } from './modelo'

interface OpcionesSugerencias {
  catalogos: CatalogosAlta
  /** Los catalogos con los que se valida todo lo que devuelve el modelo. */
  catalogosConEtiquetas: CatalogosTarea
  /** El primer Espacio elegido: acota la interpretación. Sin selección se resuelve desde el texto. */
  espacio: string
  /** Copia los campos que la interpretación va a pisar. */
  capturar: () => CamposManuales
  /** Vuelca en el formulario lo que resolvió la fusión. */
  volcar: (resultado: TareaFusionada, espacioElegido: number | null) => void
  /** Devuelve los campos copiados por `capturar`. */
  restaurar: (previo: CamposManuales) => void
  onOcupado?: (ocupado: boolean) => void
}

/** El texto libre, lo que se entendió de él y cómo deshacerlo. */
export interface SugerenciasIa {
  textoLibre: string
  cambiarTextoLibre: (texto: string) => void
  interpretando: boolean
  avisoIa: string | null
  fusion: TareaFusionada | null
  marcas: MarcaPrevia[]
  puedeDeshacer: boolean
  completar: () => Promise<void>
  deshacer: () => void
  /** Olvida el texto libre y la última interpretación. */
  reiniciar: () => void
}

/**
 * El texto libre que rellena los campos con el parser y el modelo.
 *
 * @param opciones catálogos, el Espacio elegido y cómo leer, volcar y restaurar el formulario
 * @returns el estado de la interpretación y sus acciones
 */
export function useSugerenciasIa (opciones: OpcionesSugerencias): SugerenciasIa {
  const { catalogos, catalogosConEtiquetas, espacio, onOcupado } = opciones
  const [textoLibre, setTextoLibre] = useState('')
  const [interpretando, setInterpretando] = useState(false)
  const [avisoIa, setAvisoIa] = useState<string | null>(null)
  const [fusion, setFusion] = useState<TareaFusionada | null>(null)
  const [previo, setPrevio] = useState<CamposManuales | null>(null)
  // Aparte de `fusion.deIa` porque el Espacio no es uno de los campos que fusiona
  // `fusionarInterpretacion()`: lo resuelve `fusionarEspacio()`, que es otra decision.
  const [espacioDeIa, setEspacioDeIa] = useState(false)

  /**
   * Interpreta el texto libre y rellena los campos. **No crea nada.**
   *
   * Corren las dos lecturas en el mismo clic: `interpretarAltaRapida()`, que es instantanea y
   * gratis, y el modelo. No hay heuristica que decida si vale la pena llamar. Si el modelo no
   * responde queda lo del parser con el aviso al lado, porque dejar el formulario vacio por un 503
   * es peor que llenarlo a medias.
   */
  async function completar (): Promise<void> {
    const limpio = textoLibre.trim()

    // Requisito previo: sin un pedido con detalle el modelo no interpreta, supone. El aviso dice
    // que le falta —cuantas palabras, cuantos caracteres— y no solo que no alcanza.
    const flojo = errorDeDetalle(limpio)

    if (flojo !== null) {
      setAvisoIa(flojo)
      return
    }

    setInterpretando(true)
    onOcupado?.(true)
    setAvisoIa(null)

    const localLeido = interpretarAltaRapida(limpio, catalogos)
    const respuesta = await escribirEnBff<unknown>('ia/tareas/interpretar', 'POST', { texto: limpio, ...(espacio === NINGUNO ? {} : { project_id: Number(espacio) }) })
    const delModelo = respuesta.ok ? leerCamposTarea(respuesta.datos) : null
    const resultado = fusionarInterpretacion(localLeido, delModelo, catalogosConEtiquetas)
    const elegido = fusionarEspacio(localLeido, delModelo, catalogosConEtiquetas)

    if (elegido.descartado !== null) resultado.noResuelto.push(elegido.descartado)

    setPrevio(opciones.capturar())
    opciones.volcar(resultado, elegido.id)
    setFusion(resultado)
    setEspacioDeIa(elegido.deIa)
    setInterpretando(false)
    onOcupado?.(false)

    if (!respuesta.ok) setAvisoIa(`${respuesta.mensaje} Quedó sólo lo que se entendió del texto.`)
    else if (delModelo === null) setAvisoIa('El modelo respondió algo que no se entendió. Quedó sólo lo que se entendió del texto.')
  }

  /** Devuelve los campos tal como estaban justo antes de la ultima interpretacion. */
  function deshacer (): void {
    if (previo === null) return

    opciones.restaurar(previo)
    setPrevio(null)
    setFusion(null)
    setAvisoIa(null)
    setEspacioDeIa(false)
  }

  return {
    textoLibre,
    cambiarTextoLibre: setTextoLibre,
    interpretando,
    avisoIa,
    fusion,
    marcas: marcasDeFusion(fusion, espacio, espacioDeIa, catalogos),
    puedeDeshacer: previo !== null,
    completar,
    deshacer,
    reiniciar: () => {
      setTextoLibre('')
      setAvisoIa(null)
      setFusion(null)
      setPrevio(null)
      setEspacioDeIa(false)
    }
  }
}
