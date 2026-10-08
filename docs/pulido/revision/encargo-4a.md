# Revisión manual — Encargo 4A (partir `AltaRapidaProceso`)

Rama `feat/pulido-4a` (código en `89c2b8e`), sobre `feat/pulido-3c`. Refactor sin cambio de
comportamiento: `AltaRapidaProceso.tsx` pasa de 1.401 a ~435 líneas y de 55 `useState` a uno
(`abierto`). Los campos del formulario viven en un único estado (`alta/useBorradorAlta`); la carga
de catálogos, los tipos e hitos del Espacio, la interpretación con IA y el envío tienen su hook en
`src/componentes/proyecto/alta/`; la validación y los cuerpos de `POST /tasks` son funciones puras
(`alta/modelo.ts`) y la vista se reparte en siete subcomponentes. Las exportaciones públicas y los
cuatro importadores no cambian.

Nada debería verse ni comportarse distinto. Si algo cambia respecto de `main`, es un fallo.

## Requisitos

- Sesión de staff con permiso para crear tareas. Contra el mock: `PORT=3421 node mock/servidor.js`,
  `pnpm build && API_BASE=http://localhost:3421/api/v1 PORT=3000 pnpm start`, usuario
  `ana@wiwo.me` / `mock1234`. En el mock, abre la jornada («Abre tu jornada») antes de seguir.
- Para las pruebas con IA, la capa de IA encendida (`ia_habilitada`). El mock no sirve
  `POST /ia/tareas/interpretar`: contra el mock ese paso termina en el aviso de fallo.

## 1. Alta desde `/tareas` (y `/tareas/tablero`) — botón «Nueva tarea»

1. Abre el diálogo. Arranca en «Por campos», con «Facturable» y «Visible para el cliente» marcadas
   y tu usuario como asignado.
2. Pulsa «Crear» vacío: «La tarea necesita un nombre.». Escribe un nombre y vuelve a pulsar: el
   error aparece bajo «Descripción» y el cursor queda en ese campo. Al escribir, el error desaparece.
3. Pon un inicio posterior al vencimiento: «El vencimiento no puede ser anterior al inicio.».
4. Elige un proyecto: se cargan sus hitos y tipos. Rellena los campos personalizados obligatorios
   y crea. Se cierra el diálogo, aparece «“<Nombre>” se creó.» y la lista se refresca. Un nombre
   todo en mayúsculas se guarda en formato de título.
5. Reabre el diálogo: todo vacío salvo el asignado.
6. Recurrente: con «Repetir cada» y la unidad, la tarea se crea con su recurrencia.

## 2. Alta en varios proyectos

1. Elige tres proyectos: la ayuda dice «La misma tarea se crea 3 veces…» y el hito y el tipo quedan
   deshabilitados.
2. Si alguno falla (se puede forzar interceptando `POST /api/bff/tasks/multi-espacio`), aparece el
   parte «La tarea se creó en X de 3 proyectos», los que fallaron quedan seleccionados y el botón
   dice «Reintentar en N proyectos». Reintentar solo envía los pendientes.
3. Si todos fallan con parte vacío de pendientes, el botón pasa a «Entendido, cerrar».

## 3. Relación con Cliente, modo en una línea y texto libre con IA

1. «Relacionada con» → Cliente: el selector de proyectos desaparece y aparece el de clientes. Crear
   sin elegir cliente muestra «Elige un cliente.».
2. «En una línea»: escribe `Grilla mañana @ana !alta #zzz`. La vista previa muestra la fecha, la
   prioridad, la persona y «Sin reconocer: #zzz». «Completar campos desde la línea» vuelca eso en
   los campos y vuelve a «Por campos».
3. Con IA: un texto de menos de cinco palabras muestra «Cuéntame un poco más…». Con un texto
   completo, «Completar campos» rellena los campos, la vista previa marca qué propuso el modelo y
   aparece «Deshacer», que devuelve los campos como estaban.

## 4. Alta desde un Proyecto — pestaña Tareas y pestaña Hitos (`/proyectos/<id>`)

1. Pestaña Tareas → «Nueva tarea»: el proyecto ya viene elegido. Abierto desde una Licitación o un
   Upsell, «Relacionada con» arranca en su clase.
2. Pestaña Hitos → «Agregar una tarea a <hito>» → nueva: formulario integrado (sin diálogo propio),
   con el hito preelegido y sin el campo de texto libre. Al crear, el `POST /tasks` lleva
   `milestone` y el panel se cierra.

## Comprobado

- `pnpm lint && pnpm typecheck && pnpm test && pnpm build` en verde (2.604 pruebas).
- Dos sondas Playwright contra el mock, corridas sobre la build de `feat/pulido-3c` y sobre la de
  esta rama, con resultado idéntico: 34 pasos de `/tareas` (secciones 1, 2 y 3, incluidos los
  cuerpos exactos de `POST /tasks`, `POST /tasks/multi-espacio` y `PATCH custom-fields/values`, el
  parte a medias y su reintento) y 10 pasos de la ficha de Proyecto y del alta integrada en hito
  (sección 4). Sin errores de página.
- `pruebas/descripcion-ia.browser.mjs` pasa antes y después. `tarea-en-licitacion`,
  `creacion-tarea` y `edicion-tarea` fallan igual en la base (esperan un menú de destinos y
  etiquetas que ya no existen).

## Sin verificar

- La interpretación contra el modelo real (la sonda intercepta `ia/tareas/interpretar`).
- El alta en una Licitación o un Upsell de verdad: el mock no expone esos Espacios en el selector.
- El «Reintentar campos personalizados» tras un fallo del `PATCH` y el reintento de carga de
  catálogos tras un error de red.

## Para decidir (no se tocó: es comportamiento previo)

- Al limpiar el alta (tras crear o al cerrar el diálogo), «Visible para el cliente» queda
  **desmarcada**, aunque la primera apertura la trae marcada a propósito. Se conservó tal cual.
