/**
 * Piezas tipograficas de una ficha: un rotulo en versalita, una linea fina y filas rotulo/valor.
 *
 * Nacieron dentro de `FichaCliente` y viven aca desde que la ficha de una persona necesito las
 * mismas: son dos pantallas que muestran "todo lo que la API sabe de X", y con dos copias la segunda
 * empieza a verse distinta a la primera al primer ajuste de espaciado.
 *
 * La estructura es tipografica y no de tarjetas a proposito: seis recuadros iguales convierten una
 * ficha en un tablero de nada.
 */

/** Una fila rotulo/valor. El valor ya viene formateado: la ficha no calcula, muestra. */
export interface Dato {
  etiqueta: string
  valor: string
}

/** Un grupo de la ficha: rotulo en versalita, linea fina y contenido. */
export function Seccion ({ titulo, children }: { titulo: string, children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="border-linea-suave text-texto-sutil border-b pb-1.5 text-xs font-medium tracking-[0.08em] uppercase">
        {titulo}
      </h2>
      {children}
    </section>
  )
}

/** Filas rotulo/valor. El rotulo queda tenue y el valor lleva el peso: se lee el dato, no la etiqueta. */
export function Filas ({ datos }: { datos: Dato[] }) {
  return (
    <dl className="flex flex-col gap-1.5 text-sm">
      {datos.map((dato) => (
        <div key={dato.etiqueta} className="flex flex-wrap items-baseline gap-x-2">
          <dt className="text-texto-tenue min-w-28 text-xs">{dato.etiqueta}</dt>
          <dd className="text-texto font-medium break-words whitespace-pre-line">{dato.valor}</dd>
        </div>
      ))}
    </dl>
  )
}
