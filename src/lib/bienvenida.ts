/**
 * La marca que sobrevive a la recarga cuando alguien acepta actualizar.
 *
 * Vive en un modulo aparte —y no dentro del componente— porque la necesitan los dos lados de la
 * frontera RSC: el componente cliente, para escribirla y leerla, y el layout raiz, que es un Server
 * Component, para el script anti-destello. Un modulo `'use client'` no puede exportarle una constante
 * a un Server Component: el import devuelve una referencia de cliente, no el string.
 */

/**
 * Donde queda anotado que esta carga viene de una actualizacion aceptada.
 *
 * `sessionStorage` y no `localStorage` a proposito: la bienvenida es de ESTA pestaña y de ESTE
 * momento. En `localStorage` la veria tambien la pestaña de al lado, que no actualizo nada, y
 * volveria a salir manaña al abrir el navegador.
 */
export const CLAVE_BIENVENIDA = 'wiwo-version-recien'

/** Atributo en `<html>` mientras la bienvenida tapa la pantalla. Presente = telon puesto. */
export const ATRIBUTO_BIENVENIDA = 'data-bienvenida'

/**
 * Cuanto aguanta el telon sin que nadie lo levante antes de levantarse solo.
 *
 * Es holgado a proposito: tiene que ser mayor que cualquier montaje razonable de React, porque si
 * salta antes se ve el destello que el telon existe para evitar.
 */
const MILISEGUNDOS_DE_RESCATE = 6000

/**
 * Script que corre antes del primer pintado, para que la pagina nueva no se vea antes de la obra.
 *
 * Sin esto queda una ventana de varios cientos de milisegundos —lo que tarda React en montar— en la
 * que se ve el panel entero y despues lo tapa el monito, que es exactamente el orden inverso al
 * pedido. El script solo pone el atributo; el telon es una regla de CSS (`estilos/monito.css`), asi
 * que existe desde el primer pintado y no espera a nadie.
 *
 * Va en el `<head>` del layout raiz con `dangerouslySetInnerHTML`: cualquier otra via corre despues
 * del primer pintado, que es justo el momento a ganarle.
 */
export const SCRIPT_BIENVENIDA_INICIAL =
  `try{if(sessionStorage.getItem('${CLAVE_BIENVENIDA}')){` +
  `document.documentElement.setAttribute('${ATRIBUTO_BIENVENIDA}','');` +
  // La red de seguridad. El telon lo quita React al montar la bienvenida; si React no llega a montar
  // —un error en el bundle, justo el escenario de una actualizacion— la pantalla quedaria en blanco
  // para siempre. Perderse la animacion es un detalle; quedarse sin panel, no.
  `setTimeout(function(){document.documentElement.removeAttribute('${ATRIBUTO_BIENVENIDA}')},${MILISEGUNDOS_DE_RESCATE})` +
  `}}catch(e){}`
