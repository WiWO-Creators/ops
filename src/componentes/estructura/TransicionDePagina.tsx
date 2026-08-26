'use client'

import { ViewTransition } from 'react'

/**
 * Transicion animada entre paginas.
 *
 * Vive en `template.tsx` y no en `layout.tsx` por como Next trata a cada uno: el layout persiste
 * entre navegaciones y el template se remonta. Sin ese remonte React nunca ve un par
 * "pagina que se va / pagina que llega", y `<ViewTransition>` no tendria nada que animar.
 *
 * Es cliente porque `<ViewTransition>` coordina la View Transitions API del navegador. `children`
 * sigue llegando ya renderizado desde el servidor: envolverlo no lo convierte en cliente, asi que
 * las paginas del panel no pierden su condicion de componentes de servidor.
 *
 * `default="pagina"` es lo unico que se declara aca: nombra la clase de la transicion y deja el
 * tiempo, la curva y el desplazamiento en las reglas `::view-transition-old(.pagina)` /
 * `::view-transition-new(.pagina)` de `globals.css`, donde ya vive el resto del vocabulario de
 * movimiento. Repartir la animacion entre props y CSS es lo que despues nadie encuentra.
 *
 * No se agrega ningun envoltorio alrededor de `children`: el unico contenedor de scroll de cada
 * armazon es el `<main>` de su layout, y una caja intermedia aca se meteria en como miden las
 * paginas.
 *
 * Lo usan los `template.tsx` del panel y del portal. Son dos armazones distintos, pero la
 * navegacion se siente igual en los dos porque es la misma navegacion.
 */
export function TransicionDePagina ({ children }: { children: React.ReactNode }) {
  return <ViewTransition default="pagina">{children}</ViewTransition>
}
