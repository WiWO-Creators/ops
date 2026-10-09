import { EsqueletoFicha } from '@/componentes/estado/EsqueletoFicha'

/**
 * Espera de la ficha de un prospecto, para no heredar el título y la ventana del listado.
 *
 * @returns el esqueleto de la cabecera de ficha
 */
export default function CargandoFichaProspecto () {
  return <EsqueletoFicha etiqueta="la ficha del prospecto" />
}
