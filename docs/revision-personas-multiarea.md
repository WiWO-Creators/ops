# Revisión: personas en varias áreas

Una persona puede pertenecer a varias áreas. Agregar una pertenencia conserva las anteriores; quitarla afecta solo al área elegida. El listado y la ficha muestran todas las áreas y los totales del árbol cuentan personas únicas.

El cambio está aislado en `feat/personas-multiarea`, en estos directorios:

- Frontend: `/home/wiwo/ops.wiwo/ops-v2-wt-personas-multiarea`.
- Backend: `/home/wiwo/ops.wiwo/wiwo-board-wt-personas-multiarea`.

## Rutas y pasos

1. Abre `/equipo/jerarquia` como administrador. Elige un área con personas y anota una de ellas.
2. Elige otra área. En **Sumar desde otras áreas**, busca a esa persona y pulsa **Sumar**. Debe aparecer en esta área y seguir en la primera, incluso después de recargar.
3. En esa segunda área, pulsa **Quitar de esta área** junto a la persona. Debe desaparecer solo de esta área y conservar la primera.
4. Abre `/equipo`, edita la persona y marca dos o más casillas en **Áreas**. Guarda y recarga: el listado y `/equipo/{id}` deben mostrar todas las seleccionadas. Vuelve a editar y comprueba que siguen marcadas.
5. Desmarca todas las áreas y guarda. La persona debe quedar en **Sin área**. Asígnala otra vez desde el organigrama: debe dejar de aparecer en ese grupo.
6. Crea una persona desde `/equipo` seleccionando varias áreas. Comprueba que conserva todas al abrir su ficha.

## Casos límite

- Una persona con dos áreas aparece una sola vez entre las candidatas para sumar a una tercera; alguien que ya pertenece al destino no aparece como candidata.
- Si las áreas están dentro de una misma rama, el alcance de esa rama cuenta a la persona una sola vez.
- No se puede borrar un área que todavía tenga personas, aunque sea su segunda área.
- Una jefatura solo puede cambiar las pertenencias que autoriza su parte del organigrama. Las áreas ajenas de una persona compartida deben conservarse.
- Enviar `PUT /api/v1/jerarquia/personas/{id}` con `{"accion":"agregar","area_id":null}` o un área inexistente debe rechazarse sin modificar pertenencias.
- Repetir una asignación existente no crea duplicados. `PATCH /api/v1/staff/{id}` con `{"area_ids":[]}` deja a la persona sin áreas; `area_ids:null` o identificadores inválidos se rechazan.
- El panel clásico **Mi Área** agrega integrantes conservando sus otras áreas. Su selector tradicional sigue representando el área principal.

La vista local con API mock sirve para comprobar la interfaz. La persistencia y los permisos reales se revisan con el backend del worktree; la vista mock no modifica producción.

## Verificación realizada

- 1.189 pruebas frontend/mock y comprobación completa de tipos: correctas.
- 37 checks PHP de la API y prueba del panel clásico: correctos.
- Navegador: agregar y quitar una pertenencia conserva las otras; edición desde la ficha guarda varias áreas. Revisado también a 390 px, sin desbordamiento horizontal.
- SQL de pertenencias probado con SQLite. La concurrencia y el bloqueo transaccional requieren todavía una comprobación integrada sobre MySQL; no se ejecutaron contra producción.
- Backend incluye la actualización `wiwo_core` 1.3.8. Los datos principales existentes se conservan y las pertenencias adicionales usan una tabla propia.

Los cambios siguen en sus worktrees, pendientes de revisión y aprobación antes de integrar en `main` y publicar.
