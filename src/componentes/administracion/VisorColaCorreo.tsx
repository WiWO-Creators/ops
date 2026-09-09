import type { ReactElement, ReactNode } from 'react'
import { Insignia, type TonoInsignia } from '@/componentes/presentadores/Insignia'

/** Un estado de la cola con su conteo, tal como se dibuja en la fila de resumen. */
export interface ContadorDeCola {
  /** Nombre del estado en la API. Solo se usa como `key`. */
  clave: string
  /** Rótulo en plural y en minúscula: la insignia dice «12 pendientes». */
  etiqueta: string
  valor: number
  tono: TonoInsignia
}

interface PropsVisorColaCorreo {
  contadores: ContadorDeCola[]
  /** Filas de la cola entera. Va aparte de los contadores: no siempre es su suma. */
  total: number
  /**
   * Lo que hay que saber antes de leer la tabla, arriba de todo.
   *
   * Existe por la cola de correo al cliente: sus filas quedan pendientes para siempre porque no hay
   * ningún proceso que las envíe, y una tabla de pendientes sin esa frase se lee como una falla que
   * alguien debería ir a arreglar.
   */
  aviso?: ReactNode
  /**
   * Botonera del encabezado, a la derecha del resumen.
   *
   * La usa la cola de correo al cliente, que sí se escribe: ahí vive el botón que abre el
   * compositor. La de Perfex no la pasa, y por eso su encabezado se ve igual que antes.
   */
  acciones?: ReactNode
  /** La tabla. La monta quien llama: cada cola tiene sus columnas y su forma de paginar. */
  children: ReactNode
}

/**
 * Marco común de los dos visores de cola de correo: el resumen de la cola entera y su tabla.
 *
 * La de Perfex sigue siendo de solo lectura: su API no expone reintentar, borrar ni despachar. La de
 * correo al cliente sí se escribe —encolar a mano, corregir lo pendiente, reintentar lo que falló,
 * descartar—, y para eso está el hueco `acciones`. Ni aun así se manda nada a nadie: lo que se
 * escribe es la cola, no un correo.
 *
 * El resumen es de la cola entera, sin los filtros que la persona ponga en la tabla — por eso dice
 * «Cola completa» y no cambia al filtrar: mezclar los dos números confundiría más de lo que ayuda.
 */
export function VisorColaCorreo ({ contadores, total, aviso, acciones, children }: PropsVisorColaCorreo): ReactElement {
  return (
    <div className="flex flex-col gap-4">
      {aviso}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-texto-tenue text-xs">Cola completa —</span>
        {contadores.map((contador) => (
          <Insignia key={contador.clave} tono={contador.tono} tamano="chico">
            {contador.valor} {contador.etiqueta}
          </Insignia>
        ))}
        <span className="text-texto-sutil text-xs">· {total} en total</span>
        {acciones !== undefined && <div className="ml-auto">{acciones}</div>}
      </div>

      {children}
    </div>
  )
}
