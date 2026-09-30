# Pulido — Proyecto y tareas

Auditoría de pulido de `src/componentes/proyecto/`, `src/componentes/recurrencia/`,
`src/componentes/mis-tareas/` y de las páginas `(panel)/{proyectos,tareas,mis-tareas}`, `tarea/[token]`
y `taller/tareas`. Solo hallazgos verificados en el código; no se modificó nada.

El frente está en buen estado general: casi todo usa `Cargando`/`Vacio`/`ErrorEstado`, `Dialogo`/`Cajon`
y las confirmaciones propias; no hay `console.log`, TODOs, código comentado, `href="#"` ni colores hex
en JSX (los `style={{ backgroundColor }}` que hay pintan colores de estado que vienen de la API). Lo que
queda son gemelos que se copiaron en vez de generalizarse, utilidades redefinidas, estados de carga
escritos a mano, una violación del guardrail de movimiento y listas que aparecen de golpe frente a la
vara de animación nueva.

Las rutas son relativas a `ops-v2/`.

---

## Inconsistencias

### P1-01 La píldora de estado del Proyecto late sin fin en la cabecera (resuelto en 6072d52)
- **Dónde**: `src/componentes/proyecto/MenuEstadoProyecto.tsx:123` y `src/componentes/proyecto/CabeceraProyecto.tsx:172`
- **Qué pasa**: Para los estados de `ESTADOS_DESTACADOS` (Finalizado, En desarrollo; `estado-proyecto.ts:15`) la `Insignia` lleva `motion-safe:animate-pulse`, que es `infinite`. La cabecera está siempre visible mientras se trabaja en el detalle del Proyecto (panel y portal), así que rompe la regla 2 de los guardrails (`docs/sistema-de-diseno.md` § Guardrails), y el lint no lo atrapa porque es una clase de Tailwind y no CSS.
- **Nota de verificación**: el pulso es intencional (`estado-proyecto.ts:14` dice «pinta con la paleta del sistema y anima»), así que es una decisión de producto que choca con el guardrail, no un descuido. Otro caso fuera del frente: `componentes/teletrabajo/MiniLlamada.tsx:92` usa `animate-pulse` sin `motion-safe:`.
- **Decisión (30-09-2026)**: se mantiene el pulso. Tarea: documentarlo como excepción en `docs/sistema-de-diseno.md` § Guardrails y agregar `motion-safe:` en `MiniLlamada.tsx:92`. La propuesta original queda solo como referencia.
- **Propuesta original**: Quitar el pulso y destacar con la paleta (ya lo hace `pildoraDeEstado`) o, si se quiere movimiento, un `animate-entrar-escala` de una sola vez al montar o al cambiar de estado. Añadir `animate-pulse`/`animate-ping`/`animate-spin` fuera de `componentes/estado/` a la regla de lint.
- **Prioridad**: Alta · **Esfuerzo**: S

### P1-02 `confirm()` nativo en el Meeting Paper y en Tareas propuestas (resuelto en 6072d52)
- **Dónde**: `src/componentes/proyecto/DetalleActa.tsx:520` y `src/componentes/proyecto/acta/TareasPropuestas.tsx:410`
- **Qué pasa**: Salir con cambios sin guardar y "crear todas las propuestas" usan el diálogo del navegador (sin marca, sin foco controlado, texto del sistema). El mismo `DetalleActa` confirma eliminar y retraducir con `Dialogo` (`:771`, `:784`) y `TareasPropuestas` ya importa `ConfirmarBorrado` (`:20`): la misma pantalla pregunta de dos maneras.
- **Propuesta**: `ConfirmacionEnLinea` con `varianteConfirmar="primario"` junto al botón "Crear" y, para salir sin guardar, un `Dialogo` `ancho="chico"` como el de retraducir (o `ConfirmacionEnLinea` bajo el botón "Volver").
- **Prioridad**: Alta · **Esfuerzo**: S

### P1-03 Tres acordeones, tres comportamientos (resuelto en 4fe6376)
- **Dónde**: `src/componentes/proyecto/acta/Paso.tsx:70-92`, `src/componentes/proyecto/acta/TareasPropuestas.tsx:452-462`, `src/componentes/proyecto/HistorialDeAprobaciones.tsx:101-125`
- **Qué pasa**: `Paso` gira un único `ChevronDown` con `rotate-180 ease-neo duration-rapida`; `TareasPropuestas` intercambia `ChevronRight`/`ChevronDown` sin transición y con `duration-150`; `HistorialDeAprobaciones` cambia el texto del botón. Ninguno anima el panel que se abre: el contenido aparece de golpe.
- **Propuesta**: Extraer un `Plegable` (o exportar el patrón de `Paso`) con chevron rotado por `duration-rapida` y el panel con `animate-entrar-abajo` al abrir (o `grid-template-rows: 0fr→1fr` con `--wiwo-motion-fast`), respetando `prefers-reduced-motion`.
- **Prioridad**: Media · **Esfuerzo**: M

### P1-04 "Completados" en masculino para Tareas, y tres textos para el mismo interruptor (resuelto en 750e9f6)
- **Dónde**: `src/componentes/proyecto/BotonCompletados.tsx` (etiqueta "Completados"), `src/componentes/mis-tareas/BotonCompletadas.tsx` ("Ver completadas")
- **Qué pasa**: En `/tareas` y `/tareas/tablero` el botón dice "Completados" sobre una lista de Tareas (femenino, `GLOSARIO.proceso`); en Mis tareas dice "Ver completadas". Mismo control, dos concordancias y dos verbos.
- **Propuesta**: Unificar en "Completadas" (derivado de `GLOSARIO.proceso`) dentro del componente compartido de P1-12.
- **Prioridad**: Media · **Esfuerzo**: S

### P1-05 Feedback de éxito desigual tras guardar (resuelto en 47e25a9 y 2e5b108)
- **Dónde**: con toast: `AccionesFila.tsx:64,83`, `PantallaPlantillas.tsx:132`, `PanelTiempos.tsx:272`, `ImportarTareas.tsx:304`; sin toast: `EdicionTarea.tsx:431`, `recurrencia/VistaRecurrentes.tsx:506,577`, `recurrencia/EditorDeRegla.tsx`, `ListaChecklist.tsx`, `DuplicarTarea.tsx`, `DialogoCopiarProyecto.tsx` (todos en `src/componentes/proyecto/` salvo indicación)
- **Qué pasa**: 44 archivos del frente escriben con `escribirEnBff` y solo 9 de ellos usan `useAviso`. Guardar una Tarea, pausar una regla o duplicar cierra el diálogo en silencio, mientras borrar un archivo o una plantilla sí confirma. Los textos también varían: «nombre» con comillas latinas en unos, "nombre" rectas en `ImportarTareas.tsx:304`, y genéricos "Guardado correctamente." / "Eliminado correctamente." en `AccionesFila.tsx`.
- **Propuesta**: Regla: toda mutación que cierra una superposición confirma con `useAviso().exito()` nombrando la entidad con «». Revisar la lista de archivos sin toast y alinear los genéricos de `AccionesFila`.
- **Prioridad**: Media · **Esfuerzo**: M

### P1-06 "Eliminar" y "Borrar" para la misma acción (resuelto en 2e5b108)
- **Dónde**: "Borrar" en `PantallaPlantillas.tsx:79,141,146`, `PantallaPlantillasHito.tsx:86,148,153`, `ListaIteraciones.tsx:296`, `HiloDeComentarios.tsx:154,167`, `acta/TranscripcionesRecientes.tsx:130`; "Eliminar" en `DetalleActa.tsx:694,773`, `DialogoEliminarProyecto.tsx:47` y el valor por defecto de `ConfirmarBorrado` (`src/componentes/datos/ConfirmarBorrado.tsx:20,27`)
- **Qué pasa**: El verbo de la acción destructiva cambia según la pantalla (11 "Eliminar" frente a 10 "Borrar" en el frente), y los toasts dicen "se eliminó" aunque el botón diga "Borrar".
- **Propuesta**: Adoptar "Eliminar" (el por defecto del componente base) y documentarlo en el sistema de diseño.
- **Prioridad**: Baja · **Esfuerzo**: S

### P1-07 Textos con "proyecto"/"tarea" escritos a mano junto a `GLOSARIO` (resuelto en 2e5b108)
- **Dónde**: `src/componentes/proyecto/AccionesMasivasTareas.tsx:169,228,305,359,393`, `EdicionTarea.tsx:205,235,508`, `MenuProyecto.tsx:353`, `LineaDeActividad.tsx:34`, `Cronometros.tsx:300,303`, `DetalleActa.tsx:892` ("del Proyecto" con mayúscula)
- **Qué pasa**: 45 archivos del frente usan `GLOSARIO.espacio`/`GLOSARIO.proceso` y los de arriba escriben "proyecto(s)"/"tarea(s)" literal. Hoy coinciden, pero si el glosario cambia (ya pasó de "procesos" a "Tareas") estas frases quedan desfasadas, y la mayúscula varía.
- **Propuesta**: Pasar los literales a `GLOSARIO.*.singular/plural.toLowerCase()` como hace `ImportarTareas.tsx:482`.
- **Prioridad**: Baja · **Esfuerzo**: S

---

## Duplicación

### P1-08 Dos formateadores `HH:MM` idénticos y cuatro formatos de duración (resuelto en 6db7735)
- **Dónde**: `src/componentes/proyecto/formatos.ts:19` (`segundosAHoraMinuto`) y `src/componentes/proyecto/timesheet.ts:93` (`formatearHm`); además `cronometro.ts:77` (`formatearDuracion`, `H:MM:SS`) y `src/lib/enlace-publico.ts:172` (`tiempoLegible`, `3 h 5 min`)
- **Qué pasa**: Las dos primeras son la misma función (misma guarda, mismo `padStart`, misma cita a `Format::secondsToTime`). Hay cuatro maneras de mostrar una duración repartidas en cuatro archivos.
- **Propuesta**: Un solo `src/lib/duraciones.ts` con `segundosAHoraMinuto`, `formatearDuracion` y `tiempoLegible`; borrar `formatearHm` y reexportar.
- **Prioridad**: Media · **Esfuerzo**: S

### P1-09 `diasRestantes` copia de `diasHasta`, con una validación menos (resuelto en 6db7735)
- **Dónde**: `src/componentes/proyecto/ResumenProyecto.tsx:55` frente a `src/lib/fechas.ts:183`
- **Qué pasa**: Mismo `split('-')`, mismo `Date.UTC`, mismo redondeo; la copia no valida `esFechaSola`, así que un `datetime` da un resultado distinto al de `diasHasta`.
- **Propuesta**: Borrar `diasRestantes` y usar `diasHasta` de `@/lib/fechas`.
- **Prioridad**: Media · **Esfuerzo**: S

### P1-10 `SIN_DATO` definido seis veces (resuelto en 6db7735)
- **Dónde**: `src/lib/sla.ts:21`, `src/dominio/gestion.ts:32`, `src/componentes/proyecto/actividad.ts:16`, `DetalleTarea.tsx:663`, `ResumenProyecto.tsx:5`, `src/app/tarea/[token]/page.tsx:236`; literales `'—'` en `formatos.ts:38`, `overview.ts:157`, `(panel)/proyectos/solicitudes/page.tsx:245`
- **Qué pasa**: El marcador de "sin dato" se redeclara en cada archivo y convive con literales sueltos.
- **Propuesta**: Dejar una sola constante exportada desde un módulo neutro (p. ej. mover la de `src/lib/sla.ts` a `src/lib/presentacion.ts`) y reemplazar las otras cinco declaraciones y los literales.
- **Prioridad**: Baja · **Esfuerzo**: S

### P1-11 `fechaDeDia` duplicada entre el Gantt en pantalla y el exportado (resuelto en 6db7735)
- **Dónde**: `src/componentes/proyecto/PanelGantt.tsx:840` y `src/componentes/proyecto/exportar-gantt.ts:340`
- **Qué pasa**: Misma función y mismo docblock; una usa `DIA_EN_MS` y la otra el literal `86400000`.
- **Propuesta**: Exportarla desde `gantt.ts`, junto a su inversa `diaDeFecha` (`gantt.ts:49`).
- **Prioridad**: Baja · **Esfuerzo**: S

### P1-12 Tres botones "filtro en la URL" idénticos (resuelto en 750e9f6)
- **Dónde**: `src/componentes/proyecto/BotonCompletados.tsx`, `src/componentes/mis-tareas/BotonCompletadas.tsx`, `src/componentes/mis-tareas/BotonCreadas.tsx`
- **Qué pasa**: Los tres son `Boton` con `aria-pressed`, `variante={activo ? 'marca' : 'secundario'}` y `router.replace` con `{ scroll: false }`; solo cambian el predicado, la función que alterna y la etiqueta.
- **Propuesta**: Un `BotonFiltroEnUrl({ etiqueta, activo, alternar })` en `componentes/datos/` (junto a `useFiltrosEnUrl`), y los tres pasan a ser usos de una línea.
- **Prioridad**: Media · **Esfuerzo**: S

### P1-13 `FiltrosDeVencimiento` reimplementa `Segmentado` (resuelto en 750e9f6)
- **Dónde**: `src/app/(panel)/mis-tareas/FiltrosDeVencimiento.tsx:23-71`
- **Qué pasa**: Grupo de botones `aria-pressed` con pastilla deslizante medida en `useLayoutEffect`, `duration-200` y estilos propios. `src/componentes/formularios/Segmentado.tsx` resuelve lo mismo (grupo con `aria-pressed`, flechas que mueven el foco) y lo usan nueve componentes del frente. Mis tareas es la única con su propio segmentado y la única sin navegación por flechas.
- **Propuesta**: Usar `Segmentado` con `activo={vigente}` y `onElegir` → `router.replace`; si la pastilla deslizante es valiosa, moverla a `Segmentado` para todos.
- **Prioridad**: Media · **Esfuerzo**: S

### P1-14 Pantallas y editores de plantillas gemelos (resuelto en 750e9f6)
- **Dónde**: `src/componentes/proyecto/PantallaPlantillas.tsx` (150 l.) / `PantallaPlantillasHito.tsx` (157 l.); `EditorPlantilla.tsx` (635 l.) / `EditorPlantillaHito.tsx` (505 l.)
- **Qué pasa**: Las pantallas difieren en unas 40 líneas (tipo, definición de tabla, permiso `create` vs `create_milestones`). Los editores tienen la misma anatomía (`CargaDe…`, `filaNueva`, `Formulario`, `ListaDe…`, `FilaDe…`) y el mismo bloque de Subir/Bajar/Quitar copiado (`EditorPlantilla.tsx:496-526` ≈ `EditorPlantillaHito.tsx:383-411`).
- **Propuesta**: Una `PantallaPlantillasGenerica<T>` parametrizada por definición, permiso y editor; extraer `ControlesDeOrden` (subir/bajar/quitar) y el esqueleto de lista editable a un componente compartido.
- **Prioridad**: Media · **Esfuerzo**: M

### P1-15 La ficha pública de Tarea copia las secciones de `DetalleTarea` (resuelto en 750e9f6)
- **Dónde**: `src/app/tarea/[token]/page.tsx:103-230,236-262` frente a `src/componentes/proyecto/DetalleTarea.tsx:532-678,854`
- **Qué pasa**: Lista de control (mismo `✓` en `w-3`, mismo `sr-only`), adjuntos (`rounded-chico border p-3`), comentarios y `Dato` están escritos dos veces. El comentario de `page.tsx:252` lo justifica porque `DetalleTarea` es `'use client'`, pero la solución es separar lo presentacional, no copiarlo.
- **Propuesta**: Mover `Dato`, `ChecklistDeLectura`, `AdjuntosDeLectura` y `Comentarios` a un módulo sin `'use client'` (p. ej. `proyecto/ficha-de-lectura.tsx`) y consumirlo desde los dos.
- **Prioridad**: Media · **Esfuerzo**: M

### P1-16 Diez máquinas de carga escritas a mano pese a `useRecurso`
- **Dónde**: `src/componentes/proyecto/carga.ts:17-20,91` (`EstadoCarga<T>`, `useRecurso`) frente a tipos propios en `MenuHitoTarea.tsx:50`, `ImportarTareas.tsx:71`, `acta/TareasPropuestas.tsx:90`, `PanelArchivos.tsx:97`, y `fase: 'cargando'` sin `useRecurso` en `PanelTareas.tsx`, `PanelRecurso.tsx`, `AgregarAlHito.tsx`, `CompartirTarea.tsx`, `DetalleTarea.tsx`, `mis-tareas/TareasAsignadas.tsx`, `recurrencia/HistorialDeCopias.tsx`
- **Qué pasa**: `carga.ts` existe para "hacer el baile una sola vez" (pedir, error legible, reintentar, sesión cerrada) pero diez archivos lo repiten con variantes (`datos` / `archivos` / `opciones`) y sin el mensaje `MENSAJE_SESION_CERRADA`.
- **Propuesta**: Migrar los que piden un único recurso a `useRecurso`; los que no encajen, al menos reusar `EstadoCarga<T>`.
- **Prioridad**: Media · **Esfuerzo**: M

### P1-17 Errores en línea escritos a mano (58) pese a `AvisoEnLinea`
- **Dónde**: `<p role="alert" className="text-texto-peligro …">` en 58 lugares del frente (más en `MenuProyecto.tsx`, `EditorScope.tsx`, `recurrencia/LimpiezaDeCopias.tsx`, `recurrencia/VistaRecurrentes.tsx`, `recurrencia/EditorDeRegla.tsx`, `PanelConfiguracionEspacio.tsx`, `FormularioRecurso.tsx`, `EditorPlantilla.tsx`); `AvisoEnLinea` (`src/componentes/estado/Estados.tsx:180`) solo se usa en `AccionesMasivasTareas.tsx` y `HiloDeComentarios.tsx`
- **Qué pasa**: Hay nueve combinaciones de clases (`text-sm`/`text-xs`, con y sin `animate-entrar-abajo`, márgenes sueltos) para el mismo mensaje. Solo cuatro entran animados.
- **Propuesta**: Reemplazar por `AvisoEnLinea variante="error"`, y añadir `animate-entrar-abajo` dentro de `AvisoEnLinea` para que todos entren igual.
- **Prioridad**: Media · **Esfuerzo**: M

### P1-18 Antetítulo en versalita repetido con variantes (resuelto en 6db7735)
- **Dónde**: `text-xs font-medium tracking-[0.08em] uppercase` 10 veces en el frente (p. ej. `DetalleTarea.tsx:854`, `tarea/[token]/page.tsx:258`, `LineaDeActividad.tsx:52` con `text-[0.6875rem]`), más variantes `font-semibold tracking-wide uppercase` en otras tres
- **Qué pasa**: El mismo rótulo se escribe en tres pesos y dos espaciados. `presentadores/Ficha.tsx:22` ya tiene la versión canónica.
- **Propuesta**: Extraer `Antetitulo` (o una utilidad `@utility antetitulo` en `globals.css`) y usarla en todos.
- **Prioridad**: Baja · **Esfuerzo**: S

---

## Sin terminar

### P1-19 Mis tareas no tiene `loading.tsx` (resuelto en 6072d52)
- **Dónde**: `src/app/(panel)/mis-tareas/` (no hay `loading.tsx`; tampoco en `(panel)/`)
- **Qué pasa**: `proyectos`, `tareas` y `tareas/recurrentes` muestran encabezado + `Cargando` al navegar; Mis tareas, que es la hoja diaria, deja la pantalla anterior congelada hasta que el servidor responde. Además `tareas/tablero` y `tareas/calendario` heredan el `loading.tsx` de `/tareas` ("Cargando tareas…" con el título de la lista), el mismo problema que `tareas/recurrentes/loading.tsx` ya corrigió para sí.
- **Propuesta**: `loading.tsx` en `mis-tareas` (`TituloModulo` + `Cargando`) y en `tareas/tablero` y `tareas/calendario` con su título.
- **Prioridad**: Alta · **Esfuerzo**: S

### P1-20 Carga en texto plano en el historial de aprobaciones
- **Dónde**: `src/componentes/proyecto/HistorialDeAprobaciones.tsx:112`
- **Qué pasa**: `<p>Cargando…</p>` suelto, contra la regla "un solo lenguaje de carga" (`docs/sistema-de-diseno.md` § El orbe). Es el único caso del frente.
- **Propuesta**: `<Cargando alto="min-h-24" mensaje="Cargando las rondas…" />`.
- **Prioridad**: Baja · **Esfuerzo**: S

### P1-21 Errores sin "Reintentar"
- **Dónde**: `src/componentes/proyecto/PanelCalendario.tsx:303`, `src/componentes/proyecto/TableroHitos.tsx:242`, `src/app/(panel)/proyectos/[id]/page.tsx:172`, `src/app/(panel)/proyectos/solicitudes/page.tsx:125`
- **Qué pasa**: Casi todos los `ErrorEstado` del frente ofrecen `onReintentar`; estos cuatro dejan a la persona sin salida salvo recargar la página.
- **Propuesta**: Pasar `onReintentar` (recarga del recurso en los paneles cliente; `router.refresh()` desde un envoltorio cliente en las páginas de servidor).
- **Prioridad**: Media · **Esfuerzo**: S

### P1-22 Controles del encabezado que aparecen de golpe
- **Dónde**: `src/app/(panel)/tareas/page.tsx:80`, `src/app/(panel)/tareas/tablero/page.tsx:73` (`<Suspense>` sin fallback), `src/app/(panel)/mis-tareas/page.tsx:73,83` (`fallback={null}`)
- **Qué pasa**: Los interruptores del encabezado y la barra de vencimiento se pintan después del resto y empujan el contenido (salto de layout), justo durante la entrada de página.
- **Propuesta**: Un fallback con la misma forma: el `Boton` deshabilitado con su etiqueta, y un contenedor de `h-9` para los filtros.
- **Prioridad**: Baja · **Esfuerzo**: S

---

## Refinamiento

### P1-23 La ficha pública de Tarea no tiene carga ni entrada (resuelto en 4fe6376)
- **Dónde**: `src/app/tarea/[token]/page.tsx:68` (sin `loading.tsx` en `src/app/tarea/[token]/`)
- **Qué pasa**: Es lo que ve un cliente desde un enlace compartido y queda fuera de `(panel)/template.tsx`, así que no recibe `.entrada-pagina` ni tiene espera: pantalla en blanco y luego todo de golpe.
- **Propuesta**: `loading.tsx` con `Cargando` y envolver el `<main>` en `TransicionDePagina` (o un `template.tsx` en `src/app/tarea/`), igual que `portal/(dentro)/template.tsx`.
- **Prioridad**: Media · **Esfuerzo**: S

### P1-24 Tamaños tipográficos arbitrarios que equivalen a un token (resuelto en 5438715)
- **Dónde**: `text-[0.6875rem]` en `RejillaEntregas.tsx:101,176,198,256,439,447`, `PanelActividad.tsx:169`, `LineaDeActividad.tsx:52`; `text-[0.625rem]` en `GraficoHoras.tsx:92`
- **Qué pasa**: 11 px fijos a mano, cuando `--text-xs` (`globals.css:150`) ya es 11 px y fluido; los arbitrarios no siguen la escala.
- **Propuesta**: `text-xs` (o `text-menor`) en todos; si 10 px hace falta de verdad, un token nuevo en la escala.
- **Prioridad**: Baja · **Esfuerzo**: S

### P1-25 Mismo vacío, dos redacciones (resuelto en 2e5b108)
- **Dónde**: `src/componentes/proyecto/PanelArchivos.tsx:172` ("Todavía no tiene adjuntos.", `text-texto-tenue`) frente a `DetalleTarea.tsx:590` y `tarea/[token]/page.tsx:186` ("Sin archivos adjuntos.", `text-texto-sutil`)
- **Qué pasa**: El mismo estado vacío cambia de texto y de color de una pestaña a otra. Pasa algo parecido con "No hay …" / "Sin … todavía" / "Todavía no hay …" en listas pequeñas.
- **Propuesta**: Fijar la fórmula "Todavía no hay X." para vacíos en línea y `text-texto-sutil`; los vacíos de bloque ya usan `Vacio`.
- **Prioridad**: Baja · **Esfuerzo**: S

---

## Animaciones faltantes

### P1-26 Tres sistemas de escalonado distintos, y la mayoría de listas sin ninguno (resuelto en fe61c2c y ce52e6d)
- **Dónde**: `retrasoDeAparicion` + `animate-entrar-abajo` (`src/componentes/datos/TablaRecurso.tsx:227`, 20 ms por paso, lo usa `TarjetasProyectos.tsx:399`); `.rec-escalonada` (`src/componentes/recurrencia/recurrencia.css:18-20`, keyframes propios, 40 ms); `EntradaEscalonada` (anime.js, solo en Novedades e Inicio)
- **Qué pasa**: Recurrencia inventó su propio `rec-entrar` en vez de usar los tokens, con otro paso, y el resto de listas hechas a mano del frente (`PanelDiscusiones.tsx:174`, `Cronometros.tsx:187`, `ListaIteraciones.tsx:158`, `RejillaEntregas.tsx`) aparece de golpe.
- **Decisión (30-09-2026)**: el único mecanismo es **`EntradaEscalonada`**. Migrar a él `retrasoDeAparicion` y `.rec-escalonada`, borrar ambos, y aplicarlo a las listas citadas. Ojo: hoy anima solo al montar (`useLayoutEffect` con `[]`); para tablas que paginan, filtran u ordenan sin remontar hará falta extenderlo (p. ej. una prop de clave que repita la entrada al cambiar la página o el filtro), sin reanimar en cada refresco de datos.
- **Propuesta original** (descartada por la decisión): usar el mecanismo CSS y reservar `EntradaEscalonada` para portadas.
- **Prioridad**: Media · **Esfuerzo**: M

### P1-27 Tablas a mano sin la entrada de filas de `TablaRecurso` (resuelto en ce52e6d)
- **Dónde**: `src/componentes/proyecto/PanelTiempos.tsx:362`, `PanelArchivos.tsx:217`, `PanelConfiguracionEspacio.tsx:565`, `src/app/(panel)/proyectos/solicitudes/page.tsx:202`
- **Qué pasa**: Usan las primitivas de `datos/Tabla` sin el `animate-entrar-abajo` + `retrasoDeAparicion` de `TablaRecurso.tsx:535-537`, así que junto a tablas que entran escalonadas estas aparecen enteras de una vez.
- **Propuesta**: Añadir una prop `escalonada` a `FilaTabla` (recibe `indice`) para que cualquier tabla tenga la misma entrada sin copiar el `style`.
- **Prioridad**: Baja · **Esfuerzo**: S

### P1-28 Reordenar ítems de plantilla salta sin transición (resuelto en 4fe6376)
- **Dónde**: `src/componentes/proyecto/EditorPlantilla.tsx:496-516`, `EditorPlantillaHito.tsx:383-404` (Subir/Bajar); agregar y quitar filas en los mismos editores y en `ListaChecklist.tsx`
- **Qué pasa**: Al subir o bajar un ítem las filas cambian de lugar al instante y es fácil perder de vista cuál se movió; agregar y quitar tampoco animan.
- **Propuesta**: Envolver cada fila en `<ViewTransition name={…id} update="auto">` como ya hace `recurrencia/VistaRecurrentes.tsx:331`, y usar `animate-entrar-abajo` al agregar.
- **Prioridad**: Baja · **Esfuerzo**: S

### P1-29 Paneles que se revelan sin `animate-*` (resuelto en 4fe6376)
- **Dónde**: `acta/Paso.tsx:92` (atributo `hidden`), `acta/TareasPropuestas.tsx:452`, `HistorialDeAprobaciones.tsx:114-125`, "Ver más" de `TareasPropuestas.tsx:786-797` (`line-clamp` que salta)
- **Qué pasa**: Todo lo que se despliega en el asistente del acta aparece de golpe, mientras `FinDeRecurrencia.tsx:58,75` e `ImportarTareas.tsx:599,623` ya revelan sus campos con `animate-entrar-abajo`.
- **Propuesta**: `animate-entrar-abajo` en el contenido desplegado (se resuelve junto con el `Plegable` de P1-03).
- **Prioridad**: Baja · **Esfuerzo**: S

---

## Deuda técnica

### P1-30 `AltaRapidaProceso` es un único componente de 1.200 líneas con 55 `useState` (resuelto en 89c2b8e)
- **Dónde**: `src/componentes/proyecto/AltaRapidaProceso.tsx:184-1393`
- **Qué pasa**: Es el archivo más grande del frente (1.393 l.) y todo vive en una sola función: dictado, sugerencias del modelo, vista previa, validación y envío. Es el que más cuesta tocar sin romper algo.
- **Propuesta**: Pasar el estado a un `useReducer` o a hooks (`useSugerenciasIa`, `useBorradorAlta`) y separar la vista en subcomponentes (entrada, sugerencias, `VistaPreviaAlta` ya existe).
- **Prioridad**: Media · **Esfuerzo**: L

### P1-31 `DetalleActa` y `TareasPropuestas` pasan de 1.000 líneas (resuelto en 2ceadc6)
- **Dónde**: `src/componentes/proyecto/DetalleActa.tsx` (1.071 l.; el componente principal ocupa `:152-829` con 16 `useState`), `src/componentes/proyecto/acta/TareasPropuestas.tsx` (1.008 l.; principal `:106-642` con 22 `useState`)
- **Qué pasa**: Mezclan carga, traducción, exportación, renombre, adjuntos y confirmaciones en una sola función principal.
- **Propuesta**: En `DetalleActa`, extraer la barra de acciones/exportación, `AdjuntosDelActa` (`:952-1071`) y `DialogoDeRenombre` (`:829`) a archivos propios en `proyecto/acta/`; en `TareasPropuestas`, sacar `DialogoDePropuesta` (`:876`) y `FilaPropuesta` (`:642`).
- **Prioridad**: Baja · **Esfuerzo**: M

### P1-32 Comentario desactualizado en el taller de tareas (resuelto en 21ebfd3)
- **Dónde**: `src/app/taller/tareas/page.tsx:9-10`
- **Qué pasa**: Dice que "la página del detalle de un espacio la escribe otro frente" y que el taller existe "mientras tanto", pero `(panel)/proyectos/[id]/page.tsx` ya está hecha. Además fija `PROYECTO_DE_PRUEBA = 93`, un id de datos reales.
- **Propuesta**: Actualizar el comentario (o retirar el taller si ya no se usa) y leer el id de prueba de configuración.
- **Prioridad**: Baja · **Esfuerzo**: S

---

## Resumen

| ID | Título | Categoría | Prioridad | Esfuerzo |
|---|---|---|---|---|
| P1-01 | Píldora de estado con `animate-pulse` infinito | Inconsistencias | Alta | S |
| P1-02 | `confirm()` nativo en acta y propuestas | Inconsistencias | Alta | S |
| P1-03 | Tres acordeones, tres comportamientos | Inconsistencias | Media | M |
| P1-04 | "Completados" en masculino / textos del interruptor | Inconsistencias | Media | S |
| P1-05 | Feedback de éxito desigual | Inconsistencias | Media | M |
| P1-06 | "Eliminar" frente a "Borrar" | Inconsistencias | Baja | S |
| P1-07 | Literales frente a `GLOSARIO` | Inconsistencias | Baja | S |
| P1-08 | Formateadores de duración duplicados | Duplicación | Media | S |
| P1-09 | `diasRestantes` copia de `diasHasta` | Duplicación | Media | S |
| P1-10 | `SIN_DATO` definido seis veces | Duplicación | Baja | S |
| P1-11 | `fechaDeDia` duplicada | Duplicación | Baja | S |
| P1-12 | Tres botones de filtro en URL idénticos | Duplicación | Media | S |
| P1-13 | `FiltrosDeVencimiento` reimplementa `Segmentado` | Duplicación | Media | S |
| P1-14 | Plantillas de Proyecto y de Hito gemelas | Duplicación | Media | M |
| P1-15 | Ficha pública copia `DetalleTarea` | Duplicación | Media | M |
| P1-16 | Máquinas de carga a mano pese a `useRecurso` | Duplicación | Media | M |
| P1-17 | 58 errores en línea a mano | Duplicación | Media | M |
| P1-18 | Antetítulo en versalita repetido | Duplicación | Baja | S |
| P1-19 | Mis tareas sin `loading.tsx` | Sin terminar | Alta | S |
| P1-20 | "Cargando…" en texto plano | Sin terminar | Baja | S |
| P1-21 | Errores sin "Reintentar" | Sin terminar | Media | S |
| P1-22 | Controles del encabezado aparecen de golpe | Sin terminar | Baja | S |
| P1-23 | Ficha pública sin carga ni entrada | Refinamiento | Media | S |
| P1-24 | Tamaños tipográficos arbitrarios | Refinamiento | Baja | S |
| P1-25 | Mismo vacío, dos redacciones | Refinamiento | Baja | S |
| P1-26 | Tres sistemas de escalonado | Animaciones faltantes | Media | M |
| P1-27 | Tablas a mano sin entrada de filas | Animaciones faltantes | Baja | S |
| P1-28 | Reordenar ítems salta sin transición | Animaciones faltantes | Baja | S |
| P1-29 | Paneles que se revelan sin `animate-*` | Animaciones faltantes | Baja | S |
| P1-30 | `AltaRapidaProceso` monolítico | Deuda técnica | Media | L |
| P1-31 | `DetalleActa` y `TareasPropuestas` > 1.000 líneas | Deuda técnica | Baja | M |
| P1-32 | Comentario desactualizado en el taller | Deuda técnica | Baja | S |

**Conteo**: 3 Alta · 16 Media · 13 Baja (32 hallazgos).
