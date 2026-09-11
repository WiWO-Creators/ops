/**
 * Una fila rotulo/valor de la ficha de un proyecto.
 *
 * Vive suelta y no dentro de `PanelDescripcion` porque la dibujan dos pantallas: la ficha del panel
 * y la del portal del cliente. Son la misma ficha vista por dos personas distintas, y con dos copias
 * la segunda se separa de la primera al primer ajuste de espaciado.
 *
 * No lleva `'use client'` a proposito: es marcado y nada mas, asi que el portal —que la arma en el
 * servidor— no manda JavaScript de mas al navegador por usarla.
 *
 * Se diferencia de `presentadores/Ficha.tsx` en que el valor es un nodo y no un texto: acá adentro
 * van insignias, fechas con tono de vencimiento y enlaces.
 *
 * @param termino el rotulo de la fila
 * @param children el valor, ya formateado
 * @returns la fila, como par `dt`/`dd`
 */
export function DatoDeFicha ({ termino, children }: { termino: string, children: React.ReactNode }) {
  return (
    <div className="border-linea-suave flex flex-wrap items-baseline justify-between gap-2 border-b py-2 last:border-b-0">
      <dt className="text-texto-sutil text-xs">{termino}</dt>
      <dd className="text-texto min-w-0 text-sm">{children}</dd>
    </div>
  )
}
