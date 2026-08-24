# Glosario

WiWO renombró varios conceptos del dominio. Los nombres de la interfaz **no son negociables**: son
los que usa el equipo para hablar entre sí, y cambiarlos rompe la conversación antes que el código.

## Renombres de interfaz

| En la interfaz | Origen | Nota |
|---|---|---|
| **Proceso** | `task` de Perfex / `Issue` de Huly | La unidad de trabajo. El término más usado del sistema |
| **Proyecto** | `Component` de Huly | Agrupación dentro de un Espacio |
| **Espacio** | `project` de Perfex / `Project` de Huly | El contenedor grande |
| **Hitos** | `milestones` | |
| **Seguimiento** | actividad / historial de una entidad | |
| **Planificador** | vista de planificación | |
| **Teletrabajo** | módulo de trabajo remoto | |
| **Automatización** | `Process` de Huly | Ojo: *no* es "Proceso" |

Las dos trampas que ya se pisaron:

- `Issue` → **Proceso**, pero `Process` → **Automatización**. Traducir `Process` como "Proceso" es el
  error más fácil de cometer y el más confuso de leer.
- `Project` → **Espacio**, mientras que `Component` → **Proyecto**. El nombre "Proyecto" existe, pero
  no apunta a lo que uno esperaría.

## Dónde vive esto en el código

Un solo archivo: `src/dominio/glosario.ts`. Ningún componente escribe "Proceso" a mano, ni una
`DefinicionTabla` pone el título literal — todos leen de ahí. Así, un renombre futuro es un archivo y
no una búsqueda global.

Los nombres de campo de la **API** conservan los de Perfex (`task`, `project`, `rel_type`,
`datecreated`): renombrarlos en la capa de datos obligaría a mantener dos vocabularios y a traducir en
cada consulta. La traducción ocurre **una sola vez**, al presentar.

## Términos que se dejan en inglés

`staff`, `lead`, `kanban`, `token`, `endpoint`, y todo nombre de librería o API de terceros. No se
traducen porque en el repositorio ya significan algo preciso.
