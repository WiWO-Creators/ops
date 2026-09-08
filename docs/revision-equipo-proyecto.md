# Equipo del proyecto

Rama: `feat/equipo-proyecto`.
Worktree: `/home/wiwo/ops.wiwo/ops-v2-wt-equipo-proyecto`.

La cabecera incorpora **Editar equipo** para personas con permiso de edición de proyectos.
Permite buscar integrantes, agregarlos, quitarlos y guardar. Cancelar descarta la selección.
Los cambios se envían al endpoint existente `PUT /api/v1/projects/{id}/members`.

## Prueba manual

1. Ejecutar este worktree con la API de prueba configurada y abrir `/espacios/{id}` con una cuenta que pueda editar proyectos.
2. En **Equipo**, pulsar **Editar equipo**. Deben aparecer los miembros actuales, incluidos los inactivos que ya pertenecían al proyecto.
3. Abrir el selector, buscar una persona y marcarla. Pulsar **Guardar equipo**. Debe aparecer **Equipo actualizado**; al volver a abrir, la persona debe seguir seleccionada.
4. Quitar una persona mediante su chip y guardar. Al recargar, ya no debe pertenecer al equipo.
5. Cambiar la selección y pulsar **Cancelar**. Al abrir de nuevo, debe mantenerse el equipo guardado anteriormente.
6. En un proyecto de prueba, quitar a todas las personas. Debe aparecer **El proyecto quedará sin miembros** y permitir guardar la lista vacía.
7. Repetir con una cuenta sin permiso de edición: debe ver el equipo, sin el botón de editar.
8. Simular un error al cargar miembros: debe mostrarse el error y quedar deshabilitado **Guardar equipo**. Un error al guardar debe conservar la selección para reintentar.
9. Repetir en pantalla estrecha y con teclado: el selector y los botones deben seguir accesibles.

## Comprobación automatizada

Con Ops apuntando al mock local (`npm run mock`), entrar como `ana@wiwo.me` / `mock1234` y abrir `/espacios/1` en `playwright-cli`. Una vez cargada la página:

```bash
playwright-cli run-code --filename herramientas/verificar-equipo-proyecto.js
```

La comprobación usa la cuenta ficticia del mock e intercepta las lecturas y escrituras del equipo.
No prueba persistencia en una base de datos real. La prueba manual sobre una API de pruebas cubre esa parte.

Verificado: TypeScript, ESLint, 37 pruebas existentes de acceso/rutas/catálogo y la comprobación de navegador completa. El servidor de desarrollo presentó errores de hidratación durante el arranque; la prueba funcional pasó con la página ya cargada.

## Visibilidad de Sofía

La captura nueva muestra **Gestión Paid Media | Anker Chile** en la segunda fila, centro.
En la base local, Sofía (`160`) pertenece al proyecto (`274`), y tanto la comprobación de acceso como el listado real de la API lo devuelven.
No se modificaron permisos ni datos reales. No se reprodujo la ausencia reportada; queda por confirmar si se trata de otro proyecto o de una situación anterior.
