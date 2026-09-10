# Revisión del arrastre de hitos

Rama: `feat/revision-hitos`. Worktree: `/home/wiwo/ops.wiwo/ops-v2-wt-revision-hitos`.
Incluye el cambio original `1463960` de `feat/reordenar-hitos` y la corrección de permisos.

## Hallazgos

La versión revisada en producción (`9d6e8b1`) no contiene el arrastre de columnas de hitos:
`TableroHitos.tsx` no pasa la ruta de orden al tablero. El commit original está publicado en su
rama, pero no integrado en producción.

El cambio original habilitaba el arrastre con `projects/edit`. La API exige
`projects/edit_milestones`: una persona podía ver el control y recibir 403 al guardar, o tener
permiso de editar hitos y no ver el control. Se corrigió la capacidad usada por la interfaz, su
tipo y el contrato del mock. Una prueba diferencia ambos permisos.

## Cómo comprobar

1. En el entorno de revisión, abrir `/espacios/1?tab=hitos` con un proyecto de prueba que tenga
   al menos dos hitos. Elegir vista Tablero.
2. Arrastrar desde el asa junto al nombre del hito hasta otro hito. La columna «Sin categorizar»
   no se mueve. Arrastrar tarjetas mueve tareas; las filas de la vista Tabla no se reordenan.
3. Recargar: las columnas conservan el nuevo orden.
4. Con permiso de editar hitos, pero sin editar el proyecto, el asa debe aparecer. Con solo
   editar el proyecto, no aparece. No basta con permiso de lectura.
5. Si el guardado recibe 403, debe verse el error y recuperarse el orden anterior.

## Verificado

- 59 pruebas acotadas de tablero, mock, sesión y permisos correctas.
- TypeScript y ESLint de los archivos modificados correctos; `git diff --check` correcto.
- Playwright con navegador real y API mock aislada: arrastre de «Cierre» sobre «Entrega inicial»,
  PATCH 200 con orden `[2, 1]`, persistencia tras recargar y reversión ante 403 simulado.
- Permisos en navegador: solo editar proyecto oculta las asas; editar hitos las habilita.
- No se modificaron proyectos ni permisos de producción. La verificación del contrato PHP fue
  por lectura de sus guardas y de la ruta; no se hicieron escrituras reales en esa API.

Pendiente integrar y desplegar para que el arrastre esté disponible en producción.
