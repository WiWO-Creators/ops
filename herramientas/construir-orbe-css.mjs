/**
 * Genera `src/estilos/thinking-orb.css` a partir del CSS extraido de https://neo.wiwo.me.
 *
 * El CSS de neo describe un orbe de 245px de ancho a pantalla completa: todas sus medidas internas
 * —desenfoques, halos, radios de orbita, destellos— estan en pixeles fijos. En el producto el mismo
 * orbe tiene que caber en un boton de 28px, y ahi un halo de 150px no es un halo: es la pantalla
 * entera pintada de verde.
 *
 * Por eso la transformacion central es una sola: **cada longitud del orbe pasa a medirse en unidades
 * de orbe**. `--orbe-u` es un pixel del orbe a tamaño de referencia, asi que `150px` se convierte en
 * `calc(150 * var(--orbe-u))` y vale 150px cuando el orbe mide 245 y 17px cuando mide 28. Los `vw`
 * se convierten con la misma vara (a tamaño de referencia el orbe ocupa 28vw, o sea 1vw = 8.75
 * unidades), porque un ancho de ventana no dice nada sobre el tamaño de un orbe que vive dentro de
 * un boton.
 *
 * Se corre a mano cuando cambia el CSS extraido o cuando termina la poda:
 *
 *   node herramientas/construir-orbe-css.mjs [ruta-al-css-extraido]
 *
 * @see src/componentes/estado/Orbe.tsx  el markup que este CSS espera
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SALIDA = path.join(RAIZ, 'src/estilos/thinking-orb.css')

/** Ancho del orbe de referencia en neo.wiwo.me, en px: la vara con la que se miden las unidades. */
const ANCHO_REFERENCIA = 245
/** Alto del orbe de referencia. El orbe es un blob apaisado, no un circulo. */
const ALTO_REFERENCIA = 205
/** A tamaño de referencia el orbe ocupa 28vw, asi que 1vw equivale a 245/28 unidades de orbe. */
const UNIDADES_POR_VW = ANCHO_REFERENCIA / 28

/*
 * El CSS de origen vive en el repo, no en un scratchpad: es la procedencia del archivo generado y
 * sin el no se puede regenerar nada. Ya viene podado —se le quitaron las reglas de las versiones
 * viejas del orbe (v1 y v3) comprobando, corte por corte, que los estilos computados de los ocho
 * estados no cambiaban en ningun viewport—, asi que las ~1500 lineas que faltan respecto de
 * neo.wiwo.me no se ven en pantalla.
 */
const entrada = process.argv[2] ?? path.join(RAIZ, 'herramientas/orbe-neo-extraido.css')

/**
 * Reescribe las longitudes fijas de una declaracion a unidades de orbe.
 *
 * No toca los preludios de `@media`: ahi los pixeles son el ancho de la ventana, no del orbe.
 *
 * @param linea una linea del CSS de origen
 * @returns la linea con `px` y `vw` expresados en `--orbe-u`
 */
function aUnidadesDeOrbe (linea) {
  if (/^\s*@media/.test(linea)) return linea

  return linea
    .replace(/(-?[\d.]+)px\b/g, (_, n) => `calc(${n} * var(--orbe-u))`)
    .replace(/(-?[\d.]+)vw\b/g, (_, n) => `calc(${(Number(n) * UNIDADES_POR_VW).toFixed(2)} * var(--orbe-u))`)
}

const origen = fs.readFileSync(entrada, 'utf8')
const cuerpo = origen
  // `thinking-orb-demo` era el contenedor de la demo del showcase; aca es el componente de producto.
  .replace(/\.thinking-orb-demo\b/g, '.orbe-wiwo')
  .split('\n')
  // El sistema de diseño prohibe `backdrop-filter` en superficies siempre visibles. Las versiones
  // viejas del orbe lo encendian y la final lo apaga (`backdrop-filter: none`), asi que en la hoja
  // conviven declaraciones muertas que lo prenden. Se borran: el resultado en pantalla es el mismo y
  // la prohibicion pasa a poder verificarse leyendo el archivo, que es como esta escrita la prueba.
  .filter((linea) => !/^\s*(-webkit-)?backdrop-filter:\s*(?!none)/.test(linea))
  .map(aUnidadesDeOrbe)
  .join('\n')

const cabecera = `/**
 * Thinking Orb de Wiwo — portado de https://neo.wiwo.me
 *
 * ARCHIVO GENERADO. No editarlo a mano: se regenera con
 * \`node herramientas/construir-orbe-css.mjs <css-extraido>\`, que reescribe las medidas fijas de neo
 * a unidades de orbe. Lo que sí se escribe a mano es el bloque "Capa del producto" del final.
 *
 * ## Por que este orbe y no el anterior
 *
 * Una version anterior de este archivo portaba el orbe de ops.wiwo.me y dejaba escrito que se habia
 * elegido POR ENCIMA del de neo.wiwo.me, al que llamaba "campo de luz difuso". **Esa decision quedo
 * revertida por pedido explicito del usuario**: la mascota del producto es el orbe de neo. Queda
 * anotado para que nadie la vuelva a revertir creyendo que corrige un descuido.
 *
 * ## Las dos reglas duras del proyecto
 *
 * 1. **Nada de animacion infinita en elementos siempre visibles** —la regla que existe desde que el
 *    panel viejo se colgaba en pantallas Retina—. En neo el orbe respira siempre, pero alla es una
 *    sola instancia a pantalla completa; aca el \`chico\` va en 31 botones y el \`medio\` se repite por
 *    fila. Por eso: en reposo, \`chico\` y \`medio\` quedan quietos (clase \`.orbe-quieto\`, que pone la
 *    decision en \`Orbe.tsx\`); \`grande\`, \`marca\` y cualquier \`medida\` libre respiran. Con un estado
 *    activo animan todos, porque entonces el orbe dura lo que dura la operacion.
 * 2. **Nada de \`backdrop-filter\` en superficies siempre visibles.** Este orbe no lo necesita: la
 *    version final de neo lo apaga (\`backdrop-filter: none\`) y resuelve el vidrio sumando capas de
 *    luz en \`mix-blend-mode: screen\`, que se suman entre ellas dentro de un grupo aislado. La
 *    excepcion que documentaba el archivo anterior ya no aplica y **no hay que reponerla**.
 * 3. \`prefers-reduced-motion\`: se congela la rotacion y las capas de estado, se conserva una
 *    respiracion minima y el estado se comunica por el texto que acompaña al orbe.
 *
 * ## Tamaños
 *
 * La version final de neo abandono \`--orb-size\`: usa \`--orb-w\` y \`--orb-h\` con \`!important\`, porque
 * el orbe es un blob apaisado (${ANCHO_REFERENCIA}x${ALTO_REFERENCIA}) y no un circulo. Aca el tamaño entra por una sola
 * variable, \`--orbe-ancho\`, y de ahi salen las otras dos y \`--orbe-u\`.
 *
 * Cada estado de neo redefine \`--orb-w\`/\`--orb-h\` con su propio \`clamp()\` —\`idle\` encoge,
 * \`listening\` se estira—. **Esas medidas se anulan a proposito**: en un producto el indicador no
 * puede cambiar de tamaño al cambiar de estado, porque corre el texto del boton que lo contiene. Los
 * estados siguen diferenciandose por color, ritmo y capas; no por tamaño.
 *
 * ## Variables externas
 *
 * \`--wiwo-blue\`, \`--wiwo-green\` y \`--wiwo-beige\` salen de \`tokens.css\`. \`--shape-full\`,
 * \`--ease-expressive\` y \`--motion-medium\` son nombres de neo y se mapean abajo a los tokens que el
 * proyecto ya tiene, para no duplicar valores.
 */

/* -----------------------------------------------------------------------------
   Puente con los tokens del proyecto. Los nombres de la izquierda son los que usa
   el CSS de neo; los valores ya existen en tokens.css y no se repiten aca.
   ----------------------------------------------------------------------------- */
.orbe-wiwo {
  --shape-full: var(--control-BorderRadius);
  --ease-expressive: var(--wiwo-ease-expressive);
  --motion-medium: var(--wiwo-motion-medium);

  /* Sin estado, ninguna regla de neo define la opacidad de particulas y destellos. */
  --spark-opacity: .55;
}

`

const capaProducto = `
/* =============================================================================
   Capa del producto — escrita a mano, se conserva al regenerar
   =============================================================================
   Todo lo de arriba es neo tal cual. Lo de aca abajo es lo que lo convierte en un
   componente: una sola variable de tamaño, el reposo quieto y la respiracion
   minima. Va al final a proposito: varias reglas ganan por orden de aparicion.
   ============================================================================= */

/* -----------------------------------------------------------------------------
   Por que el orbe se compone consigo mismo y no con la pagina
   -----------------------------------------------------------------------------
   El orbe son capas de luz que se suman entre si (\`mix-blend-mode: screen\`). En
   neo eso se mezcla ademas con el fondo del showcase, que es oscuro y fijo. En el
   producto no hay un fondo fijo: el mismo orbe cae sobre un boton claro, sobre el
   degradado del acceso o sobre una tarjeta de vidrio.

   Dejar que se mezcle con lo que tenga detras rompe de las dos formas: sobre una
   superficie clara sumar luz da blanco y el orbe desaparece; sobre el azul del
   acceso —con la pagina en esquema claro— la correccion contraria lo oscurecia
   hasta dejarlo como una nube de humo.

   \`isolation: isolate\` corta eso: las capas se suman entre ellas dentro del
   escenario y el resultado se dibuja despues, normal, sobre lo que haya. El orbe
   se ve igual en los dos temas y sobre cualquier superficie, que es justo lo que
   se le pide a un indicador de carga que vive en todo el producto.
   ----------------------------------------------------------------------------- */

/* El contenedor ocupa exactamente la caja del orbe: el escenario de neo era un panel de 420px de
   alto con su propia aurora, que es cromo de la pagina showcase y no del componente. */
.orbe-wiwo {
  /* \`--orbe-ancho\` es el espacio que el orbe OCUPA, no el ancho de la elipse. El orbe es un campo
     de luz: alrededor del cuerpo hay un halo que en neo llega a casi el doble de ancho, y alla no
     molesta porque el escenario del showcase lo recorta. Aca no hay escenario, asi que el cuerpo se
     dibuja a \`--orbe-nucleo\` del hueco reservado y el resto queda para el halo. Sin esto, el orbe de
     un boton de 28px pinta 80px y se come la etiqueta que tiene al lado. */
  --orbe-nucleo: .58;
  --orbe-u: calc(var(--orbe-ancho) * var(--orbe-nucleo) / ${ANCHO_REFERENCIA});

  position: relative;
  display: inline-grid;
  place-items: center;
  width: var(--orbe-ancho);
  height: calc(var(--orbe-ancho) * ${(ALTO_REFERENCIA / ANCHO_REFERENCIA).toFixed(6)});
  /* El orbe desborda su caja (halos, orbitas, estelas) y no debe empujar el layout que lo rodea. */
  overflow: visible;
  vertical-align: middle;
}

/* Los tamaños de la escala del sistema de diseño. */
.orbe-wiwo.orbe-chico  { --orbe-ancho: 28px; }
.orbe-wiwo.orbe-medio  { --orbe-ancho: 56px; }
.orbe-wiwo.orbe-grande { --orbe-ancho: 180px; }
.orbe-wiwo.orbe-marca  { --orbe-ancho: clamp(245px, 28vw, 410px); }
/* \`medida\` llega como \`--orbe-ancho\` en el atributo style, asi que gana sin regla extra. */

.orbe-escenario {
  isolation: isolate;
  position: relative;
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
}

/* El tamaño le gana a los clamp() de cada estado: mismo peso de selector, mas abajo en el archivo.
   Ver "Tamaños" en la cabecera para el por que. */
.orbe-wiwo[data-thinking-state] .wiwo-thinking-orb,
.orbe-wiwo .wiwo-thinking-orb {
  --orb-w: calc(${ANCHO_REFERENCIA} * var(--orbe-u));
  --orb-h: calc(${ALTO_REFERENCIA} * var(--orbe-u));
}

/* Las particulas orbitan alrededor del orbe: el radio tiene que ser suyo, no un valor fijo. Los tres
   radios son los de neo (142, 120 y 158 px sobre un orbe de ${ANCHO_REFERENCIA}) llevados a unidades de orbe. En neo
   se seleccionaban con \`:nth-of-type\`, que aca no sirve: el markup del componente tiene mas hermanos. */
.orbe-wiwo .orb-particle-uno  { --orbit: calc(142 * var(--orbe-u)); --speed: 5200ms; }
.orbe-wiwo .orb-particle-dos  { --orbit: calc(120 * var(--orbe-u)); --speed: 6400ms; animation-delay: -1900ms; }
.orbe-wiwo .orb-particle-tres { --orbit: calc(158 * var(--orbe-u)); --speed: 7800ms; animation-delay: -3600ms; }

/* Reposo quieto: lo decide \`Orbe.tsx\` y es la regla 1 de la cabecera. Un orbe congelado sigue siendo
   el orbe —color, halo y forma quedan—, solo que no consume una animacion por cada fila de la tabla. */
.orbe-quieto,
.orbe-quieto *,
.orbe-quieto *::before,
.orbe-quieto *::after {
  animation: none !important;
}

@keyframes orbe-respiracion-minima {
  0%, 100% { transform: scale(.99); }
  50% { transform: scale(1.01); }
}

@media (prefers-reduced-motion: reduce) {
  /* neo apaga todo. El sistema de marca pide conservar una respiracion minima: sin ella el orbe deja
     de leerse como "esta pasando algo" y el unico indicador queda siendo el texto. */
  .orbe-wiwo .wiwo-thinking-orb {
    animation: orbe-respiracion-minima 5200ms ease-in-out infinite !important;
  }

  .orbe-quieto .wiwo-thinking-orb {
    animation: none !important;
  }
}
`

fs.writeFileSync(SALIDA, cabecera + cuerpo + capaProducto)
console.error('escrito', path.relative(RAIZ, SALIDA), '—',
  (cabecera + cuerpo + capaProducto).split('\n').length, 'lineas desde', path.basename(entrada))
