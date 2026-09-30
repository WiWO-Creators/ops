# Revisión manual — Encargo 5A (textos y avisos)

Rama `feat/pulido-5a`, código en `2e5b108`. Toda acción destructiva dice «Eliminar»; los textos de
tarea/proyecto/Meeting Paper salen de `GLOSARIO`; los formularios dicen «Crear X» al dar de alta y
«Guardar cambios» al editar; los vacíos en línea siguen «Todavía no hay X.»; el acta y sus propuestas
confirman con aviso; «Ver como» deshabilitado explica por qué. Las convenciones quedan en la sección
«Textos» de `docs/sistema-de-diseno.md`.

## Entorno

```bash
PORT=3421 ORIGENES=http://localhost:3000 node mock/servidor.js &
pnpm build && API_BASE=http://localhost:3421/api/v1 PORT=3000 pnpm start &
```

Equipo `ana@wiwo.me` / `mock1234` (superadministradora). En el mock aparece «Abre tu jornada» en el
panel: ábrela o ciérrala con `Escape` para seguir.

## Flujos

### 1. «Eliminar» en lugar de «Borrar» (P1-06, P3-17)

- `/prospectos/3`: el botón rojo dice «Eliminar»; al pulsarlo, el diálogo se titula «Eliminar
  SERNATUR», la advertencia dice «Se elimina el prospecto…» y el botón de confirmar dice «Eliminar».
- `/papelera`: cada fila ofrece «Eliminar definitivamente»; el diálogo se titula igual y confirma con
  «Eliminar para siempre».
- En un Proyecto: plantillas (icono de papelera con `aria-label` «Eliminar …»), comentarios de una
  tarea («Eliminar comentario», confirmación «¿Eliminar?»), iteraciones («Eliminar»), transcripciones
  recientes del Meeting Paper, y el orbe del proyecto («Eliminar chat» → «Eliminar»).
- `/equipo/jerarquia` (Organización): menú de un área → «Eliminar» → diálogo «Eliminar el área «…»»;
  menú de un cargo → «Eliminar el cargo».
- Ficha de persona (`/equipo/<id>`), bloque Permisos: la capacidad se lee «eliminar», no «borrar».
- Esperado en todos: ningún «Borrar» visible como acción.

### 2. Botón de envío (P3-16)

- `/clientes` → «Nuevo cliente»: el botón dice «Crear cliente». En contratos, «Nuevo contrato» →
  «Crear contrato»; en un Proyecto, «Nuevo hito» → «Crear hito» y «Nueva nota» → «Crear nota».
- Editar un cliente, un prospecto o un contrato: «Guardar cambios». Editar una tarea: «Guardar
  cambios». Registro de horas: «Crear registro» al dar de alta, «Guardar cambios» al editar.
- Excepciones esperadas: «Copiar proyecto» (menú del Proyecto → Copiar), «Sumar iteración»,
  «Reservar» en `/salas` y «Guardar foto/datos/firma» en `/perfil` no cambian.

### 3. Avisos en el Meeting Paper (P1-05)

En un Proyecto → pestaña Meeting Paper, con un acta abierta:

- Cambiar la marca que firma → aviso ««Título» ahora lo firma MGC.».
- Renombrar → «Se renombró a «…».». Corregir y guardar → «Correcciones del Meeting Paper guardadas.».
- Eliminar el acta → «“Título” se eliminó.».
- Propuestas de tareas: editar una y guardar → «Cambios de «…» guardados.»; descartar una →
  «“…” se descartó.». Crear sigue mostrando su confirmación en línea («Se creó 1 tarea.»), que
  convive con el error de las que fallaron.
- Transcripciones recientes: eliminar una → «Transcripción eliminada.».
- Si la API falla, no hay aviso de éxito y el error aparece como antes.

### 4. Glosario en los textos (P1-07)

- Tabla de tareas, seleccionar filas → «Agregar a proyecto»: «Elige uno o más proyectos para…»,
  «Proyectos destino», «Cargando proyectos…»; sin proyectos: «Todavía no hay proyectos disponibles.».
- Editar tarea: ayudas y errores dicen «tarea»/«proyecto»/«hitos» en minúscula, como antes. El texto
  visible no debería cambiar respecto de `main` salvo el vacío de arriba; lo que cambia es que sale de
  `GLOSARIO`.

### 5. Vacíos (P1-25, P3-14)

- Pestaña Archivos de una tarea sin adjuntos y la lectura de la tarea (también `/tarea/<token>`):
  «Todavía no hay archivos adjuntos.» en gris sutil, igual en los dos lugares.
- Organización → panel de una persona sin historial: «Todavía no hay cambios registrados.».
- `/novedades` vacío usa `Vacio` («Todavía no hay novedades publicadas»). **No verificable** en
  navegador: la lista viene del repositorio y nunca está vacía.

### 6. «Ver como» en cuenta inactiva (P3-13)

- `/equipo/<id de Hugo Márquez>` (cuenta dada de baja en el mock): «Ver como» deshabilitado y a su
  lado «Cuenta inactiva: no se puede ver como esta persona.». Con lector de pantalla, al enfocar la
  zona se anuncia el motivo (`aria-describedby`). En una cuenta activa, el botón abre el diálogo como
  siempre.

### 7. Cabeceras y acceso (P3-19, P4-02)

- `/clientes/<id>` y `/prospectos/<id>`: «Editar» lleva el icono de lápiz, como en contratos.
- `/`, `/colab` y `/clave/<token>`: el título de la tarjeta tiene la misma escala (2xl, negrita) y el
  mismo margen inferior en las tres.

## Comprobado

- `pnpm lint && pnpm typecheck && pnpm test && pnpm build` en verde (2609 pruebas).
- `acta`, `apodo-link` y `organizacion` (`pruebas/*.browser.mjs`) en verde. `edicion-tarea`,
  `orbe-proyecto` y `proyecto-masivo` siguen fallando antes de llegar a lo tocado, por las causas
  ajenas ya conocidas.
- Sonda Playwright: títulos de las tres pantallas de acceso, «Eliminar» y «Guardar cambios» en el
  prospecto, lápiz en cliente y prospecto, «Crear cliente», «Ver como» con motivo, papelera sin
  «Borrar»; sin errores de página.

## Pendiente de revisar a mano

- Los avisos del Meeting Paper (flujo 3) y los textos de acciones masivas (flujo 4) no se
  recorrieron en navegador.
- P3-11 se descartó: «← Licitaciones» en la cabecera y «Volver a Licitaciones» en el estado de
  inexistente es el mismo par que usan las demás fichas.
