import type { ReactElement } from 'react'
import { Boton } from '@/componentes/formularios/Boton'
import { Campo } from '@/componentes/formularios/Campo'
import { AreaTexto } from '@/componentes/formularios/Entrada'
import { VistaPreviaAlta } from '../VistaPreviaAlta'
import type { SugerenciasIa } from './useSugerenciasIa'

/** El texto libre que el modelo convierte en campos, con su vista previa y el "Deshacer". */
export function PanelIa ({ ia }: { ia: SugerenciasIa }): ReactElement {
  return (
    <div className="border-borde flex flex-col gap-2 border-b pb-4">
      <Campo
        etiqueta="Escríbelo como lo dirías"
        ayuda="Se convierte en campos y los corriges antes de crear. Nada se crea solo."
      >
        {(props) => (
          <AreaTexto
            {...props}
            value={ia.textoLibre}
            placeholder="Hay que rehacer la grilla de septiembre de Colbún para el viernes, que la vea Franz, es urgente."
            onChange={(evento) => { ia.cambiarTextoLibre(evento.target.value) }}
          />
        )}
      </Campo>

      <div className="flex flex-wrap items-center gap-2">
        <Boton
          variante="secundario"
          tamano="chico"
          cargando={ia.interpretando}
          onClick={() => { void ia.completar() }}
        >
          Completar campos
        </Boton>

        {ia.puedeDeshacer && (
          <Boton variante="sutil" tamano="chico" onClick={ia.deshacer}>Deshacer</Boton>
        )}
      </div>

      {ia.fusion !== null && (
        <VistaPreviaAlta
          titulo={ia.fusion.name}
          origenTitulo={ia.fusion.deIa.includes('name') ? 'ia' : 'texto'}
          marcas={ia.marcas}
          sinResolver={ia.fusion.noResuelto}
        />
      )}

      {ia.avisoIa !== null && (
        <p role="status" className="text-texto-tenue text-xs">{ia.avisoIa}</p>
      )}
    </div>
  )
}
