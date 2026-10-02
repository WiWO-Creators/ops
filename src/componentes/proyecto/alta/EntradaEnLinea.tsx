import type { ReactElement } from 'react'
import { Boton } from '@/componentes/formularios/Boton'
import { Campo } from '@/componentes/formularios/Campo'
import { Entrada } from '@/componentes/formularios/Entrada'
import type { AltaRapida } from '@/dominio/alta-rapida'
import { GLOSARIO } from '@/dominio/glosario'
import { VistaPreviaAlta, type MarcaPrevia } from '../VistaPreviaAlta'

interface PropsEntradaEnLinea {
  texto: string
  onTexto: (texto: string) => void
  /** Lo que se entendió de `texto`, recalculado mientras se escribe. */
  leido: AltaRapida
  marcas: MarcaPrevia[]
  /** Pasa lo entendido a los campos y cambia al modo "por campos". */
  onCompletar: () => void
}

/** El modo "en una línea": la sintaxis `@`, `#` y `!` con su vista previa. */
export function EntradaEnLinea ({ texto, onTexto, leido, marcas, onCompletar }: PropsEntradaEnLinea): ReactElement {
  return (
    <>
      <Campo etiqueta="Qué hay que hacer" requerido>
        {(props) => (
          <Entrada
            {...props}
            value={texto}
            autoFocus
            placeholder="Grilla Colbún septiembre mañana @franz #Colbún !alta"
            onChange={(e) => { onTexto(e.target.value) }}
          />
        )}
      </Campo>

      <VistaPreviaAlta titulo={leido.name} marcas={marcas} sinResolver={leido.sinResolver} />
      <Boton variante="secundario" onClick={onCompletar}>Completar campos desde la línea</Boton>

      <p className="text-texto-sutil text-xs">
        <code className="text-texto-tenue">@persona</code> asigna ·{' '}
        <code className="text-texto-tenue">#{GLOSARIO.espacio.singular.toLowerCase()}</code> lo
        vincula · <code className="text-texto-tenue">!prioridad</code> ·{' '}
        <code className="text-texto-tenue">mañana</code>, <code className="text-texto-tenue">viernes</code>{' '}
        o <code className="text-texto-tenue">30/9</code> ponen la entrega. Con espacios, entre comillas.
        {' '}Si un nombre coincide con varias personas queda en el título: ahí conviene «Por campos».
      </p>
    </>
  )
}
