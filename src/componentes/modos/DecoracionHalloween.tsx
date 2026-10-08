import { Arana } from './Arana'
import { Brasas } from './Brasas'
import { Fantasma } from './Fantasma'
import { Faroles } from './Faroles'
import { Murcielagos } from './Murcielagos'
import { Niebla } from './Niebla'
import { Telas } from './Telas'

/**
 * La decoracion de Halloween: telarañas que se tejen, una araña colgando, murcielagos que cruzan y
 * cuelgan, un fantasma que pasa de vez en cuando, brasas, niebla y dos calabazas con vela.
 *
 * Capa fija, sin eventos de puntero (salvo la araña), debajo de los dialogos. Cada pieza es una hoja
 * cliente con su propia animacion de anime.js y su limpieza; con `prefers-reduced-motion` todas
 * quedan quietas y las que solo existen para moverse (vuelo, brasas) no se muestran.
 */
export function DecoracionHalloween () {
  return (
    <div aria-hidden className="decoracion-modo pointer-events-none fixed inset-0 z-30 overflow-hidden">
      <Niebla />
      <Brasas />
      <Telas />
      <Arana />
      <Murcielagos />
      <Fantasma />
      <Faroles />
    </div>
  )
}
