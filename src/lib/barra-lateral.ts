/**
 * Estado abatido de la barra lateral.
 *
 * Vive en un modulo aparte —y no dentro de `BarraLateral.tsx`— porque lo necesitan los dos lados de
 * la frontera RSC: el componente cliente, para escribirlo, y el layout raiz, que es un Server
 * Component, para el script anti-destello. Un modulo `'use client'` no puede exportarle una constante
 * a un Server Component: el import devuelve una referencia de cliente, no el string.
 */

export const CLAVE_BARRA = 'wiwo-barra-lateral'

/** Atributo en `<html>` que lee el CSS de la barra. Presente = abatida. */
export const ATRIBUTO_ABATIDA = 'data-barra-abatida'

/**
 * Script que corre antes del primer pintado.
 *
 * Sin esto la barra se pinta expandida y salta a riel al hidratar, que es el mismo destello que el
 * selector de tema evita con su propio script. Va en el `<head>` del layout raiz: un `<script>` dentro
 * del cuerpo de un componente no se ejecuta en las navegaciones del cliente, y React lo advierte.
 */
export const SCRIPT_BARRA_INICIAL =
  `try{if(localStorage.getItem('${CLAVE_BARRA}')==='abatida')` +
  `document.documentElement.setAttribute('${ATRIBUTO_ABATIDA}','')}catch(e){}`
