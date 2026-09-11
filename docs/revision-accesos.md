# Revisión del módulo de accesos

El panel centraliza escalones, roles, asignaciones de personas, áreas, cargos e interruptores.
Los escalones nuevos se aplican a los permisos efectivos y las asignaciones inválidas se rechazan
sin guardar cambios parciales.

## Entorno de revisión

- Pantalla: http://localhost:3108/administracion/accesos
- API: http://localhost:8098/api/v1/accesos/catalogo
- Frontend: `/home/wiwo/ops.wiwo/ops-v2-wt-accesos`, rama `feat/accesos`.
- Backend: `/home/wiwo/ops.wiwo/wiwo-board-wt-accesos`, rama `feat/accesos`.
- Base desechable: `prueba_accesos`. Este entorno no modifica la base compartida.

## Recorrido en el navegador

1. Entrar como superadministrador y abrir la pantalla. Deben aparecer las cinco pestañas sin
   errores: Escalones, Roles, Personas, Áreas y cargos, Interruptores.
2. En Escalones, pulsar **Nuevo escalón**. Usar clave `revision_accesos`, nombre `Revisión accesos`,
   un orden libre, alcance propio y asignable activado. Guardar y recargar: debe seguir listado.
   Los escalones de sistema solo permiten cambiar el nombre.
3. En Roles, crear **Revisión accesos** y mapearlo al escalón recién creado. Renombrarlo y recargar:
   tanto el nombre como el mapeo deben persistir. El escalón usado no debe poder borrarse.
4. En Áreas y cargos, crear un área raíz **Revisión accesos** y un cargo con ese nombre.
5. En Personas, elegir una persona de prueba distinta de la sesión actual. Anotar su rol, nivel,
   área y cargo originales. Asignarle el rol, área y cargo nuevos. El escalón efectivo debe ser
   `Revisión accesos` sin necesitar una asignación individual. Cambiar el nivel individual y volver
   a la herencia del rol: el nivel efectivo y el selector deben quedar de acuerdo.
6. Filtrar por ese escalón y por el área nueva: debe aparecer la persona. Buscar
   `zz_prueba_sin_resultados_zz`: debe aparecer el estado vacío. Limpiar los filtros y pulsar
   **Siguiente**: deben cambiar las filas y avanzar el número de página.
7. Intentar borrar el rol, área o cargo que usa la persona. Debe bloquearse el borrado y explicar
   el uso. Restaurar después las asignaciones originales de la persona y borrar los catálogos
   de prueba; borrar el escalón al final, una vez retirado el rol.
8. En Interruptores, anotar el valor de **Reglas de permiso por escalón**, cambiarlo y cancelar
   la confirmación: debe conservar el valor. Repetir, confirmar y recargar: debe persistir.
   Restaurar el valor original.
9. Con una sesión que no sea superadministradora, abrir la misma URL: debe denegar el acceso.

## Casos límite por API

Usar una sesión de superadministrador sobre la API de prueba y el envelope de
[`contrato-accesos.md`](contrato-accesos.md).

- `GET /accesos/personas?page=0` y `?rol=invalido`: 422.
- `POST /accesos/escalones` con cuerpo vacío: 422.
- `DELETE /accesos/escalones/usuario`: 409; no borra el escalón del sistema.
- `PUT /accesos/personas/{id}` con `{"area_id":null,"escalon":"no_existe"}`: 422 y el área
  original debe seguir intacta. Repetir con `escalon` vacío, booleano o array: también 422.
- `PUT /accesos/personas/{id}` con `{"escalon":null}`: elimina solo el override y vuelve al rol.
- `PUT /accesos/roles/{id}` con nombre válido y escalón inexistente: 422; conserva el nombre anterior.
- `PUT /accesos/interruptores` con una clave ajena al catálogo: 422.
- Cualquier ruta de accesos con sesión no superadministradora: 403.

La prueba ejecutable `modules/api/pruebas/accesos_endpoints.php` cubre este ciclo contra la API real.
Su invocación y las variables necesarias están en el README del módulo backend.
