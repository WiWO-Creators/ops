import { EsqueletoFicha } from '@/componentes/estado/EsqueletoFicha'

/**
 * Espera de la ficha de una persona del equipo, para no heredar el título y la ventana del listado.
 *
 * @returns el esqueleto de la cabecera de ficha
 */
export default function CargandoFichaPersona () {
  return <EsqueletoFicha etiqueta="la ficha de la persona" />
}
