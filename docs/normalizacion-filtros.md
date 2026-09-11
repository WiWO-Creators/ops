# Filtros y presets compartidos

El panel interno utiliza `ControlesTabla` para búsqueda, filtros, limpieza, presets y selección de columnas. Las tablas, tarjetas, tableros y calendarios configuran ese componente con una `DefinicionRecurso`; no mantienen barras independientes.

Los filtros se aplican en la API antes de contar y paginar. El calendario añade su período a las condiciones elegidas. Los campos personalizados usan sus metadatos y permisos; se incluyen aunque su columna esté oculta. El portal de clientes conserva su contrato y no accede a presets privados del equipo.

## Organización

- `src/definiciones/`: campos, etiquetas, tipos y catálogos por recurso. `filtros.ts` convierte metadatos de campos personalizados.
- `src/datos/consulta.ts`: lectura/escritura de filtros en URL y restricciones del calendario. Los filtros existentes conservan su formato; los campos tipados usan `filter[campo__operador]`.
- `src/componentes/datos/ControlesTabla.tsx`: selector «Agregar filtro», controles según tipo, limpieza y presets. Las vistas configuran esta barra. Los desplegables —el de agregar y los de opciones— traen buscador a partir de ocho opciones: se arman sobre el menú de Radix, la única primitiva que admite un campo de texto dentro del panel.
- `src/datos/asignables.ts` y `src/datos/lookups.ts`: el equipo no viene en `GET /lookups`; se adjunta como catálogo `staff` para los filtros por persona (Asignado, Creado por, Seguidor). En el servidor lo suma `cargarLookups`; en el navegador, `staffParaFiltros`, que solo lo pide si la definición lo declara.
- `Filtro.valorPorNombre`: el filtro viaja con el nombre de la opción y no con su id, porque la columna del backend es de texto. También deduplica el catálogo: `task_types` trae un tipo por Espacio.
- `src/componentes/datos/PresetsFiltro.tsx` y `presets.ts`: guardar, aplicar, borrar, exportar e importar; validación y adaptación al destino. La búsqueda se persiste como `__q`, sin enviarla como filtro a la API.
- API `Nucleo/Consulta.php`: operadores parametrizados sobre campos permitidos; `Recursos/` aporta expresiones de cada entidad y su alcance de permisos.
- API `Recursos/FiltrosDerivados.php`: compara valores que solo existen después de traducir o deserializar, antes del conteo y la paginación.

## Preparación

Usar juntos los worktrees `ops-v2-wt-normalizar-filtros` y `wiwo-board-wt-normalizar-filtros`, ambos en `feat/normalizar-filtros`. Configurar `API_BASE` hacia esa versión de la API y proporcionar las variables de sesión del entorno de pruebas.

Los presets son personales, compartidos entre proyectos y vistas del mismo recurso. Los presets antiguos del tablero de hitos también aparecen entre los de tareas. La importación crea una copia; no sobrescribe presets existentes.

## Recorrido manual

1. Abrir `/procesos`. En «Agregar filtro», comprobar campos como nombre, asignados, etiquetas, tipo, fechas, horas y campos personalizados. Elegir Nombre, Contiene, escribir una parte de un nombre real y pulsar Aplicar. La tabla y el total deben corresponder a la condición, también al cambiar de página.
2. Agregar otro campo. Comprobar que ambas condiciones se combinan. Quitar una y después usar Limpiar filtros: búsqueda y condiciones desaparecen, sin cambiar de vista.
3. Filtrar una fecha con «Está vacío». Deben aparecer solo tareas sin esa fecha; un número cero no debe confundirse con un campo vacío. Probar también una condición que no coincida: lista vacía, no error.
4. Activar un filtro y una búsqueda. Guardar preset con nombre, limpiar y volver a aplicarlo. Ambos valores se recuperan y la paginación vuelve al inicio. Recargar y repetir desde el menú Presets.
5. Cambiar entre Tabla, Tablero y Calendario. La barra ofrece los mismos campos del recurso y conserva las condiciones. El calendario muestra su intersección con el día o semana visible. Un rango válido fuera del período debe producir cero coincidencias, no un error de fechas.
6. Abrir `/espacios`. Probar filtros en tarjetas y tabla, incluido un campo personalizado. Cambiar la presentación y una pastilla de estado: el campo personalizado debe conservarse.
7. Abrir `/espacios/<id>?tab=tareas`. Guardar un preset con un hito de ese proyecto. Abrir las tareas de otro proyecto y aplicar el preset: debe pedir reemplazar el hito o quitar explícitamente esa condición. No debe cambiar el proyecto de destino ni descartar condiciones sin avisar.
8. Desde el menú de un preset, pulsar Exportar. En otra vista compatible, Importar preset y seleccionar el JSON. Revisar condiciones, adaptar las incompatibles y guardar. Debe aparecer una copia en el menú. Un archivo de proyectos no puede importarse como preset de tareas.
9. Repetir búsqueda y guardado de presets en `/clientes`, `/equipo` y los paneles de hitos, tiempos, archivos, notas y discusiones que estén disponibles para el usuario.
10. Entrar con otra persona: no debe ver, leer ni borrar los presets de la primera. Los campos personalizados reservados y los registros fuera de sus permisos tampoco deben poder consultarse mediante filtros.

## Casos límite

- Guardar un preset sin condiciones: permite restaurar la vista sin filtros y puede exportarse e importarse.
- Importar JSON inválido, valores que no sean texto o archivos mayores de 16 KiB: mensaje visible, sin guardar ni aplicar parcialmente.
- Importar un campo desconocido o una referencia inexistente: requiere resolver o quitar la condición antes de continuar.
- Fecha imposible, número inválido u operador desconocido enviado directamente a la API: HTTP 422. Valores del usuario nunca se incorporan como SQL.
- Error al cargar o borrar presets: mensaje visible; cargar permite reintentar. No se presenta como una lista vacía.
- Móvil y teclado: agregar, quitar, guardar e importar deben seguir accesibles, sin desbordar horizontalmente la página.

## Verificación técnica

Frontend: `npm test`, `npm run typecheck`, ESLint de archivos modificados y `npm run build -- --webpack`.

API, desde el worktree backend:

```bash
php modules/api/pruebas/filtros_normalizados.php
php modules/api/pruebas/filtros_recursos.php
php modules/api/pruebas/presets_filtro.php
```

Las pruebas PHP verifican consultas, parámetros, permisos y casos inválidos con una base simulada; no sustituyen la ejecución SQL en una instalación real. La comprobación de navegador usa datos simulados y persistencia de presets interceptada. Debe completarse el recorrido con la API real antes de integrar.

El filtro de campos derivados de actividad y correo escanea candidatos autorizados en PHP. No limita el filtrado a la página visible; si el volumen crece, conviene materializar esos campos para indexarlos. La comparación de texto derivado distingue acentos y no garantiza todas las equivalencias de la collation de la base.

## Resultado de esta revisión

822 pruebas frontend, TypeScript, ESLint de 35 archivos y build de producción con Webpack correctos. Las tres pruebas PHP y el lint de 24 archivos pasan. Navegador: agregar campos, guardar/aplicar, exportar/importar, remapear un hito ajeno sin cambiar de proyecto, barra del calendario de proyecto y vista móvil verificados con mock.

Capturas locales: `output/normalizar-filtros/desktop.png` y `output/normalizar-filtros/mobile.png`. Los artefactos de prueba y el enlace local de dependencias no forman parte del commit.

## Todos los campos de la Tarea, y selectores que se buscan

La barra de Tareas ofrece filtrar por todo lo que la Tarea tiene —treinta y nueve campos, mas los
personalizados—, con dos ausencias deliberadas: la descripcion, que es lo que contesta la busqueda
`?q=`, y lo que es orden interno y no un dato (`kanban_order`, `milestone_order`, el detalle de la
recurrencia).

Los que preguntan por una persona (Asignado, Creado por, Seguidor), por una Etiqueta o por el Tipo
dejaron de escribirse a mano: son selectores contra su catalogo. Asignado y Creado por viajan por id
y admiten varias personas; Seguidor, Etiqueta y Tipo se comparan contra texto en el backend, asi que
van de a uno. El equipo no viene en `GET /lookups`: lo adjunta `cargarLookups` en el servidor y
`staffParaFiltros` en el navegador.

Todo desplegable con seis o mas opciones trae buscador, incluido el de «Agregar filtro». Estan
armados sobre el menu de Radix —su `Select` no admite un campo de texto dentro del panel— y
conservan la semantica: `menuitemradio` cuando se elige uno, `menuitemcheckbox` cuando se eligen
varios. Desde el campo, la flecha abajo lleva a la primera fila y `Enter` la elige.

El mock aprendio los mismos filtros y los mismos operadores (`filter[campo__op]`, con las mismas
incompatibilidades que `Nucleo/Consulta.php`): antes conocia nueve claves y ninguna con operador, asi
que la mitad de la barra fallaba en local y funcionaba en produccion.

Verificacion: `FILTROS_TEST_TIROS=output node pruebas/filtros.browser.mjs` con el mock y Next locales
—comprueba el buscador de «Agregar filtro», el catalogo de personas y que cada filtro viaje como el
backend lo espera—, ademas de `pnpm test`, `pnpm typecheck` y ESLint.
