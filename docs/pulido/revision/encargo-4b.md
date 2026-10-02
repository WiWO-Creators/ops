# Revisión manual — Encargo 4B (partir `DetalleActa` y `TareasPropuestas`)

Rama `feat/pulido-4b` (código en `2ceadc6`), sobre `feat/pulido-4a`. Refactor sin cambio de
comportamiento:

- `DetalleActa.tsx` pasa de 1.091 a ~340 líneas y de 13 `useState` a 4 (las tres confirmaciones
  abiertas y el error). El idioma y la escritura sobre el documento visible (`useIdiomaDelActa`),
  la corrección (`useEdicionDelActa`), la marca, el renombre y el borrado (`useEscriturasDelActa`)
  y la exportación (`useExportacionDelActa`) son hooks; la cabecera con los selectores de estilo e
  idioma, la barra de acciones, los adjuntos, el diálogo de renombre y el diálogo de confirmación
  son subcomponentes en `src/componentes/proyecto/acta/`.
- `acta/TareasPropuestas.tsx` pasa de 1.039 a ~250 líneas y de 13 `useState` a 3 (desplegada, la
  propuesta en edición y la confirmación de «Crear todas»). La carga y las escrituras de propuestas
  (`usePropuestasDelActa`), los catálogos (`useCatalogosDePropuestas`) y el desplazamiento a la
  vista (`useTraerALaVista`) son hooks; las transformaciones de la lista son funciones puras
  (`modeloPropuestas.ts`); `FilaPropuesta`, `DialogoDePropuesta`, `YaCreadas` y `ListaDePropuestas`
  tienen archivo propio.

Se conservan los diálogos del encargo 1, el `Plegable` y el «Ver más» con `interpolate-size` del
2C. Las exportaciones públicas (`DetalleActa`, `TareasPropuestas`) y su importador (`PanelActas`)
no cambian. Nada debería verse ni comportarse distinto: si algo cambia respecto de `main`, es un
fallo.

## Requisitos

- Contra el mock: `PORT=3421 node mock/servidor.js`, `pnpm build && API_BASE=http://localhost:3421/api/v1 PORT=3000 pnpm start`,
  usuario `ana@wiwo.me` / `mock1234`. Si aparece «Abre tu jornada», ábrela antes de seguir.
- El mock no sirve traducciones, la edición ni el descarte de propuestas, `acta-traducir` ni
  `acta-tareas`: esos pasos solo se pueden probar contra la API real (o interceptando las peticiones).
- Un Meeting Paper con adjuntos, al menos una traducción y propuestas pendientes. En el mock se crea
  uno con «Nuevo Meeting Paper» desde la pestaña Meeting Paper de un Proyecto.

## 1. Lectura y cabecera — `/proyectos/<id>?tab=actas&acta=<actaId>`

1. Se ven el título, «Escrito con IA» si corresponde, cliente · fecha · autor y asistentes.
2. «Estilo: …» abre el menú de marcas; elegir otra la cambia (un `PATCH` con `brand`) y el visor
   se repinta.
3. El selector de idioma lista Español, los idiomas ya traducidos y, si puedes traducir, los demás
   con « — traducir». Elegir uno traducido muestra «Traducido · <idioma>» y el documento en ese
   idioma; «Volver a traducir» pide confirmación solo si la traducción se corrigió a mano.
4. Debajo del documento, «Archivos de la reunión» con cada adjunto: miniatura o icono, nombre,
   proyecto, peso y «Descargar» (o «Sin archivo para descargar»).

## 2. Acciones

1. «Exportar» ofrece PDF, Word e Imprimir; los archivos salen en el idioma que se está viendo.
2. `⋯` → «Renombrar»: el diálogo explica si renombras la traducción o el original. Guardar con el
   campo vacío muestra el motivo bajo el campo; guardar sin cambios cierra sin petición.
3. «Corregir» abre el editor con lo que se ve. Con cambios, «← Volver a los Meeting Papers» pide
   «Salir sin guardar»; «Descartar cambios» vuelve a la lectura; «Guardar» manda solo `content`.
   Mientras se corrige desaparecen el estilo, el idioma y «Renombrar».
4. `⋯` → «Eliminar» pide confirmación y, al confirmar, vuelve al listado.

## 3. Tareas propuestas (debajo del documento)

1. La sección se abre sola si hay pendientes o creadas; el encabezado alterna plegar/desplegar.
2. Marcar filas cambia el botón a «Crear 1 seleccionada» / «Crear N seleccionadas»; sin marcas,
   «Crear todas (N)» pide confirmación en línea.
3. Editar el título en la fila y salir del campo lo guarda; el lápiz abre el diálogo y manda solo
   lo que cambió; la papelera descarta la fila.
4. «Crear tarea» en una fila la baja a «Ya creadas» con su enlace y el aviso «Se creó 1 tarea.»;
   las fallidas quedan marcadas con su motivo.
5. «Volver a analizar» con pendientes pide confirmación; sin pendientes analiza directo.
6. Recién generada un acta, la sección se trae a la vista y dice cuántas tareas encontró.

## Casos límite

- Portal del cliente (`puedeEditar` y `puedeBorrar` en falso, sin ruta de tareas): solo documento,
  idiomas ya traducidos, Exportar y adjuntos; sin `⋯`, sin Corregir, sin estilo y sin tareas.
- Sin IA: no aparecen idiomas por traducir ni «Analizar buscando tareas».
- Un acta sin propuestas y sin análisis muestra «todavía no se analizó» y, con IA, el botón primario.

## Comprobado

- `pnpm lint && pnpm typecheck && pnpm test && pnpm build` en verde (2.604 pruebas).
- `pruebas/acta.browser.mjs` pasa antes (build de `feat/pulido-4a`) y después.
- Sonda Playwright temporal de 49 pasos contra el mock (secciones 1, 2 y 3, con traducciones,
  adjuntos y propuestas interceptados): DOM normalizado de la ficha, diálogos y menús, cuerpos de
  cada `PATCH`/`POST`/`DELETE` y nombre del `.docx` descargado. Idéntica a una corrida de la base;
  el único paso que varía (tras cambiar el estilo) también varía entre dos corridas de la base,
  porque depende de cuándo llega el catálogo de prioridades. Sin errores de página.

## Sin verificar

- La vista del portal en navegador (`portal-paridad` y `visibilidad-del-portal` ya fallaban por
  causas ajenas).
- Traducción, edición y descarte de propuestas y análisis con IA contra la API real.
- El desplazamiento automático a las tareas tras generar un acta, fuera de lo que cubre
  `acta.browser.mjs`.
