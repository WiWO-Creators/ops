/**
 * El aspecto del Meeting Paper según la marca que lo firma.
 *
 * Un acta de WiWO, una de MGC y una de Palta salen del mismo generador y van a clientes distintos,
 * de empresas distintas del holding. Hasta ahora la única diferencia era una firma pegada al pie:
 * el resto del documento —cabecera, colores, tipografía— era idéntico, así que un acta de Palta
 * llegaba al cliente con la cara de ninguna de las tres.
 *
 * === POR QUE EL TEMA ES UN OBJETO Y NO TRES HOJAS DE ESTILO ===
 *
 * Porque el documento se pinta en dos lugares que tienen que verse iguales: el visor, que es un
 * iframe con origen opaco y su propio `<style>` (`presentadores/ContenidoHtml.tsx`), y el editor,
 * que es TipTap dentro del panel (`estilos/acta.css`). Al iframe no llega ni una clase del
 * documento padre, así que lo único que se puede compartir entre los dos es texto: de ahí
 * `cssDeMarcas()`, que ambos inyectan tal cual. Tres hojas sueltas se habrían desincronizado en la
 * primera corrección, que es justo el fallo que el archivo del editor ya documenta.
 *
 * === POR QUE LOS LOGOS SON LOCALES ===
 *
 * La firma venía de `meetwiwo.com/assets/logos/...`, un dominio que no controla este proyecto. Una
 * imagen remota en un documento que se imprime falla de la peor forma: el PDF sale con un hueco y
 * nadie se entera hasta que el cliente lo abre. Los tres logos viven en `public/marca/actas/`.
 */

/** Los códigos que acepta la API en el campo `brand` de un acta. */
export type CodigoDeMarca = 'wiwo' | 'mgc' | 'palta'

export interface TemaDeMarca {
  /** El código tal como lo guarda la API. */
  codigo: CodigoDeMarca
  /** Cómo se escribe el nombre cuando se muestra. */
  nombre: string
  /** Ruta pública del logotipo, servido por este mismo dominio. */
  logo: string
  /** Alto del logo en la cabecera del documento. Cada logotipo tiene su propia proporción. */
  altoLogo: string
  /** Texto corto bajo el logo. Es lo que el documento dice de sí mismo. */
  pie: string
}

/**
 * Las tres marcas del holding.
 *
 * Los colores no se eligieron acá: el verde de WiWO es `--wiwo-green` del sistema Neo, los de Palta
 * son los tokens de su propio sitio (`agenciapalta-web/tailwind.config.ts`) y el rojo de MGC es el
 * del punto de su logotipo. Están escritos en `cssDeMarcas()`, que es donde se usan.
 */
export const TEMAS: Record<CodigoDeMarca, TemaDeMarca> = {
  wiwo: {
    codigo: 'wiwo',
    nombre: 'WiWO',
    logo: '/marca/actas/wiwo.png',
    altoLogo: '2rem',
    pie: 'Acta levantada por WiWO'
  },
  mgc: {
    codigo: 'mgc',
    nombre: 'MGC',
    // El logotipo blanco, porque su banda es casi negra: es el contraste con el que se presenta el
    // propio sitio, donde las secciones alternan #F5F5F5 y #0D0D12.
    logo: '/marca/actas/mgc-blanco.png',
    altoLogo: '2.2rem',
    pie: 'Acta levantada por MGC Global Group'
  },
  palta: {
    codigo: 'palta',
    nombre: 'Palta',
    logo: '/marca/actas/palta.png',
    altoLogo: '1.5rem',
    pie: 'Acta levantada por Agencia Palta'
  }
}

/** La marca que se usa cuando el acta no trae ninguna, o trae una que ya no existe. */
export const MARCA_POR_DEFECTO: CodigoDeMarca = 'wiwo'

/** El tema de un código, con WiWO de reserva: un acta vieja nunca queda sin firmar. */
export function temaDeMarca (codigo: string | null | undefined): TemaDeMarca {
  return TEMAS[(codigo ?? '') as CodigoDeMarca] ?? TEMAS[MARCA_POR_DEFECTO]
}

/** La clase que lleva el documento para que le apliquen las variables de su marca. */
export function claseDeMarca (codigo: string | null | undefined): string {
  return `marca-${temaDeMarca(codigo).codigo}`
}

/**
 * Las variables de cada marca, como CSS plano.
 *
 * Devuelve texto y no un objeto de estilos porque sus dos destinos no pueden compartir otra cosa:
 * el visor lo mete en el `<style>` del iframe y el editor lo monta en la página. Las tres marcas
 * juntas son menos de 3 KB, así que se manda el bloque entero y la clase del documento elige.
 *
 * Cada valor tiene procedencia, y por eso no se "afinan" a ojo:
 *
 * - **WiWO**: el verde es `--wiwo-green` (#3BFF00) y la tinta `--wiwo-ink-900`, los mismos tokens
 *   del sistema Neo que usa el panel (`estilos/tokens.css`). El verde neón no se usa nunca como
 *   texto: sobre blanco da 1.3:1 de contraste. Va en filetes, marcadores y sobre la banda oscura,
 *   que es como se usa en la página.
 * - **Palta**: los tokens de su propio sitio (`agenciapalta-web/tailwind.config.ts`): fondo #EFEFEF,
 *   tinta #141414, verde #20BB4E y lima #64F545. Helvetica Neue y titulares apretados son su marca;
 *   la familia no se empaqueta —la traen macOS y Windows— y si faltara, Arial mantiene el ancho.
 * - **MGC**: los valores de mgcglobalgroup.com, leídos de su `tailwind.config`: rojo #F9063B —el
 *   mismo del punto del logotipo—, tinta #12121A, texto medio #4A4A5A y banda #0D0D12. Su
 *   tipografía es DM Sans, servida desde este dominio y no desde Google: un documento que se
 *   imprime no puede depender de una petición a otro servidor. El rótulo va en rojo y en versalita
 *   ancha porque así marca sus secciones el sitio (13px, `tracking-[0.15em]`, mayúsculas).
 *
 * Lo que NO se copió del sitio de MGC: la Playfair Display itálica que destaca una palabra dentro
 * de cada titular. El acta la escribe un modelo y nadie decide qué palabra merece el acento, así
 * que aplicarla a titulares enteros habría convertido un recurso editorial en un tic.
 */
export function cssDeMarcas (origen: string): string {
  return `
  /* DM Sans es de MGC y solo se usa ahí, así que se declara acá y no en la hoja del documento.
     La URL es absoluta porque el visor es un iframe con origen opaco: una ruta relativa no resuelve
     adentro. Que la fuente llegue depende de la cabecera CORS que \`next.config.ts\` pone sobre
     \`/fonts/\`; sin ella el navegador la descarta en silencio y cae a la pila del sistema. */
  @font-face {
    font-family: 'DM Sans';
    font-style: normal;
    font-weight: 300 700;
    font-display: swap;
    src: url('${origen}/fonts/marca/DMSans-300-700-latin.woff2') format('woff2');
  }

  .marca-wiwo {
    --marca-tinta: #161715;
    --marca-texto: #3B3C38;
    --marca-acento: #3BFF00;
    --marca-filete: #3BFF00;
    --marca-banda: #161715;
    --marca-banda-tinta: #F4F5F2;
    --marca-rotulo: #3BFF00;
    --marca-fuente: 'Plus Jakarta Sans', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
    --marca-titulo-peso: 800;
    --marca-titulo-tracking: -0.02em;
    --marca-cita-fondo: #F4F7F2;
  }

  .marca-palta {
    --marca-tinta: #141414;
    --marca-texto: #2B2B2B;
    --marca-acento: #20BB4E;
    --marca-filete: #64F545;
    --marca-banda: #EFEFEF;
    --marca-banda-tinta: #141414;
    --marca-fuente: 'Helvetica Neue', Helvetica, Arial, ui-sans-serif, system-ui, sans-serif;
    --marca-titulo-peso: 700;
    --marca-titulo-tracking: -0.03em;
    --marca-cita-fondo: #F3F7F3;
  }

  .marca-mgc {
    --marca-tinta: #12121A;
    --marca-texto: #4A4A5A;
    --marca-acento: #F9063B;
    --marca-filete: #F9063B;
    --marca-banda: #0D0D12;
    --marca-banda-tinta: #FAFAFA;
    --marca-rotulo: #F9063B;
    --marca-fuente: 'DM Sans', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
    --marca-titulo-peso: 700;
    --marca-titulo-tracking: -0.02em;
    --marca-cita-fondo: #F5F5F5;
  }

  /* --- Lo que las variables pintan, igual en el visor y en el editor ------------------------ */

  .acta-marca {
    color: var(--marca-texto);
    font-family: var(--marca-fuente);
  }

  .acta-marca h1,
  .acta-marca h2,
  .acta-marca h3,
  .acta-marca h4 {
    color: var(--marca-tinta);
    font-weight: var(--marca-titulo-peso);
    letter-spacing: var(--marca-titulo-tracking);
  }

  /* El filete bajo el título de sección es lo que hace reconocible al documento de un vistazo: es
     el único lugar donde el color de marca aparece a lo largo de todo el acta. */
  .acta-marca h2 {
    padding-bottom: 0.3rem;
    border-bottom: 2px solid var(--marca-filete);
  }

  .acta-marca strong,
  .acta-marca b { color: var(--marca-tinta) }

  .acta-marca ul li::marker { color: var(--marca-acento) }
  .acta-marca ol li::marker { color: var(--marca-tinta) }

  .acta-marca blockquote {
    border-left: 3px solid var(--marca-acento);
    background: var(--marca-cita-fondo);
    padding: 0.75rem 1rem;
    color: var(--marca-texto);
  }

  .acta-marca hr { border-top: 1px solid var(--marca-filete) }

  .acta-marca th { background: var(--marca-cita-fondo); color: var(--marca-tinta) }

  /* --- Cabecera y pie: lo que dice de quién es el documento --------------------------------- */

  .marca-cabecera {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1.5rem;
    margin: 0 0 2rem;
    padding: 1.1rem 1.4rem;
    background: var(--marca-banda);
    border-bottom: 3px solid var(--marca-filete);
  }

  .marca-cabecera img { width: auto; display: block }

  .marca-cabecera .marca-rotulo {
    margin: 0;
    color: var(--marca-rotulo, var(--marca-banda-tinta));
    font-size: 0.68rem;
    font-weight: 600;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    opacity: 0.75;
  }

  .marca-pie {
    margin: 3rem 0 0;
    padding-top: 0.9rem;
    border-top: 1px solid var(--marca-filete);
    color: var(--marca-tinta);
    font-size: 0.8rem;
    font-weight: 600;
    letter-spacing: 0.02em;
  }

  @media print {
    /* Sin esto la banda de la cabecera sale blanca: Chromium no imprime fondos salvo que se le
       pida, y un acta de WiWO sin su banda oscura es un documento sin firmar. */
    .marca-cabecera, .acta-marca th, .acta-marca blockquote {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .marca-cabecera, .marca-pie { break-inside: avoid-page; page-break-inside: avoid }
  }
`
}

/**
 * La cabecera y el pie que envuelven al acta en el visor.
 *
 * Van fuera del HTML guardado a propósito, por el mismo motivo que ya valía para la firma: el
 * cuerpo del acta es lo que escribió el modelo y lo que alguien corrigió, y meterle la marca
 * adentro congelaría el logo de hoy en cada acta vieja. Cambiar de logotipo tiene que ser cambiar
 * un archivo, no reescribir la base.
 *
 * @param origen origen absoluto del sitio; el iframe tiene origen opaco y una ruta relativa no
 *        resuelve ahí adentro
 */
export function cabeceraDeMarca (tema: TemaDeMarca, origen: string): string {
  return `<header class="marca-cabecera">`
    + `<img src="${origen}${tema.logo}" alt="${tema.nombre}" style="height:${tema.altoLogo}">`
    + `<p class="marca-rotulo">Meeting Paper</p>`
    + `</header>`
}

/** El pie firmado que cierra el documento. */
export function pieDeMarca (tema: TemaDeMarca): string {
  return `<p class="marca-pie">${tema.pie}</p>`
}
