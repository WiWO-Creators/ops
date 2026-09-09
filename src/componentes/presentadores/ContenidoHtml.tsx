/**
 * Cuerpo HTML que no se controla: un contrato o una propuesta del panel, o un Meeting Paper que
 * dicto un modelo.
 *
 * Va dentro de un iframe con `sandbox` vacio y no con `dangerouslySetInnerHTML`. La diferencia
 * importa: ese HTML lo escribe alguien del equipo en el CRM —pero puede haber llegado ahi pegado
 * desde cualquier lado— o lo escribe un modelo a partir de lo que se dijo en una reunion. En los
 * dos casos se lo muestra despues a otra persona, y un `<script>` inyectado ahi correria con la
 * sesion de quien lo esta leyendo.
 *
 * `sandbox=""` sin ningun permiso apaga el JavaScript y le da al documento un origen opaco, asi que
 * no puede leer cookies, ni navegar la pagina que lo contiene, ni enviar formularios. Es la unica
 * forma de mostrar HTML ajeno sin escribir un saneador propio, y un saneador propio a base de
 * expresiones regulares da mas confianza de la que merece.
 *
 * El documento se pinta con sus propios colores —fondo claro, letra oscura— porque es un documento,
 * no una parte de la interfaz: el iframe no hereda los tokens del tema y forzarlos adentro seria
 * pelear con el CSS que el propio contrato traiga.
 *
 * === POR QUE EL ESTILO ESTA ESCRITO A MANO Y NO ES `prose` DE TAILWIND ===
 *
 * Adentro del iframe no llega ni una clase del documento padre: es otro documento, con su propio
 * arbol de estilos. Tailwind no puede alcanzarlo, asi que la tipografia va como CSS plano. Las
 * medidas de abajo replican `prose` en tamaño base —que es lo que usa el previsualizador de
 * MeetingMatico, de donde viene el Meeting Paper— para que el acta se lea igual acá que allá.
 *
 * Lo mismo vale para la impresion: como imprimir es `print()` sobre este iframe, el PDF sale con
 * exactamente este estilo. Es la diferencia con MeetingMatico, donde ver y exportar son dos caminos
 * distintos: el suyo aplana el documento con `textContent` y lo escribe en Helvetica, asi que lo
 * exportado no se parece a lo que se vio en pantalla.
 */

/**
 * Hoja del documento.
 *
 * Las medidas son las de `prose` en tamaño base (16px, interlineado 1.75) y los colores los de sus
 * modificadores: parrafos en gris oscuro, titulos y negritas en negro, enlaces en azul.
 *
 * `Plus Jakarta Sans` es la fuente de la interfaz y se sirve desde el propio dominio. Que llegue
 * hasta acá depende de la cabecera CORS que `next.config.ts` pone sobre `/fonts/`: el iframe tiene
 * origen opaco, asi que pedir la fuente es una peticion entre origenes y sin esa cabecera el
 * navegador la descarta **en silencio**. Si algun dia falla, el documento cae a la pila del sistema
 * y se sigue leyendo bien; el `font-display: swap` y la pila de reserva estan para eso.
 */
const ESTILO_DOCUMENTO = `
  @font-face {
    font-family: 'Plus Jakarta Sans';
    font-style: normal;
    font-weight: 200 800;
    font-display: swap;
    src: url('/fonts/neo/PlusJakartaSans-200-800-latin.woff2') format('woff2');
  }

  html { color-scheme: light }

  body {
    margin: 0 auto;
    padding: 2.5rem 2rem;
    max-width: 46rem;
    background: #fff;
    color: #374151;
    font-family: 'Plus Jakarta Sans', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
    font-size: 16px;
    line-height: 1.75;
    overflow-wrap: anywhere;
    -webkit-text-size-adjust: 100%;
  }

  h1, h2, h3, h4 { color: #111827; font-weight: 700; }
  h1 { font-size: 2rem; line-height: 1.2; margin: 0 0 1.25rem; font-weight: 800; letter-spacing: -0.02em }
  h2 { font-size: 1.4rem; line-height: 1.35; margin: 2.25rem 0 0.9rem; letter-spacing: -0.01em }
  h3 { font-size: 1.1rem; line-height: 1.5; margin: 1.75rem 0 0.5rem }
  h4 { font-size: 1rem; margin: 1.5rem 0 0.5rem }

  p { margin: 0 0 1.1rem }
  strong, b { color: #111827; font-weight: 600 }
  em, i { font-style: italic }
  u { text-underline-offset: 2px }

  ul, ol { margin: 0 0 1.25rem; padding-left: 1.5rem }
  li { margin: 0.35rem 0; padding-left: 0.25rem }
  ul li::marker { color: #9ca3af }
  ol li::marker { color: #6b7280; font-weight: 600 }

  hr { margin: 2rem 0; border: 0; border-top: 1px solid #e5e7eb }

  blockquote {
    margin: 1.5rem 0;
    padding-left: 1rem;
    border-left: 3px solid #e5e7eb;
    color: #4b5563;
    font-style: italic;
  }

  a { color: #1d4ed8; text-decoration: underline; text-underline-offset: 2px }

  img { max-width: 100%; height: auto }
  table { border-collapse: collapse; max-width: 100%; margin: 0 0 1.25rem }
  td, th { border: 1px solid #e5e7eb; padding: 0.4rem 0.6rem; text-align: left }
  th { background: #f9fafb; font-weight: 600; color: #111827 }

  /* La firma de marca cierra el documento; no es parte del cuerpo del acta. */
  .firma-marca { margin-top: 2.5rem; }
  .firma-marca img { max-width: 18rem }

  /* Impresion: el PDF sale de acá, asi que lo que se ve es lo que se guarda. */
  @page { margin: 2cm }

  @media print {
    body { padding: 0; max-width: none; font-size: 11pt }
    /* Un titulo solo al pie de una hoja, con su contenido en la siguiente, se lee como un error. */
    h1, h2, h3, h4 { break-after: avoid-page; page-break-after: avoid }
    li, blockquote, .firma-marca { break-inside: avoid-page; page-break-inside: avoid }
    a { color: #111827; text-decoration: none }
  }
`

export function ContenidoHtml ({
  html,
  alto = 'h-[32rem]',
  titulo = 'Contenido del documento',
  firma = null,
  ref
}: {
  html: string
  alto?: string
  titulo?: string
  /**
   * Firma de marca que se agrega al final del documento.
   *
   * Va acá y no dentro del HTML guardado a proposito. MeetingMatico congela la URL de la firma
   * dentro del cuerpo de cada minuta, asi que el dia que esa ruta cambie todas las actas viejas
   * muestran una imagen rota. Guardando solo el codigo de marca y pintando la firma al mostrar, ese
   * dia se arregla en un lugar.
   */
  firma?: string | null
  /** Para poder llamar a `print()` del propio documento: sale con su formato, no como texto plano. */
  ref?: React.Ref<HTMLIFrameElement>
}) {
  const pieDeFirma = firma === null || firma === ''
    ? ''
    : `<p class="firma-marca"><img src="${firma}" alt=""></p>`

  const documento = `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${titulo}</title>
<style>${ESTILO_DOCUMENTO}</style></head>
<body>${html}${pieDeFirma}</body></html>`

  return (
    <iframe
      ref={ref}
      title={titulo}
      sandbox=""
      srcDoc={documento}
      // Alto fijo con desplazamiento propio: sin JavaScript adentro no hay forma de que el iframe
      // informe su altura, y dejarlo crecer solo no es posible. Un alto generoso cubre la mayoria
      // de los documentos sin que haya que desplazar.
      className={`rounded-chico border-linea w-full border bg-white ${alto}`}
    />
  )
}
