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
 */
export function ContenidoHtml ({ html, alto = 'h-[32rem]', titulo = 'Contenido del documento' }: { html: string, alto?: string, titulo?: string }) {
  const documento = `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<style>
  html { color-scheme: light }
  body {
    margin: 0; padding: 1rem; background: #fff; color: #1a1a1a;
    font: 14px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif;
    overflow-wrap: anywhere;
  }
  img, table { max-width: 100% }
  table { border-collapse: collapse }
  td, th { border: 1px solid #ddd; padding: 4px 8px }
</style></head>
<body>${html}</body></html>`

  return (
    <iframe
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
