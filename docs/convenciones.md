# Convenciones

Hereda las convenciones de `devoperation/docs/convenciones.md`, con **una excepción explícita**
(Tailwind, más abajo). Lo que sigue son las decisiones transversales de este proyecto, no un manual
de estilo genérico.

## Cómo se escribe el código

- **Nombres en español** para lo propio: `cargarProcesos`, `construirConsulta`, `podarPorPermisos`.
  Los nombres de terceros y los campos de la API quedan como están (`rel_type`, `datecreated`,
  `staleTime`).
- **Excepción obligada**: los segmentos mágicos de Next (`layout.tsx`, `page.tsx`, `route.ts`,
  `[...ruta]`) y los nombres de props de librerías externas.
- **Docblock en toda función no trivial**: qué hace (no cómo), parámetros, retorno, excepciones.
- **Los comentarios explican el porqué**, sobre todo cuando algo parece raro y no lo es. Buena parte
  del valor del código heredado está en comentarios de ese tipo; al portar, se portan.
- **Ningún catch vacío**, ningún `TODO: handle error`.
- **Nada de `any`.** ESLint lo rechaza, igual que las promesas sin `await` y los bloques vacíos.
- **Una función, una responsabilidad.** Máximo 3 niveles de anidamiento.
- Sin URLs, claves, timeouts ni constantes de negocio hardcodeadas: van al entorno o a config.

## Tests

Runner de Node, sin frameworks:

```json
"test": "node --experimental-strip-types --test pruebas/*.test.ts"
```

Bajo *type stripping* Node resuelve los archivos como ESM: los imports relativos **llevan la
extensión `.ts`**, y el paquete activa `allowImportingTsExtensions` y
`rewriteRelativeImportExtensions`. Tampoco acepta propiedades de parámetro en constructores
(`constructor (private readonly x: T)`).

**Toda lógica no trivial deja una prueba runnable que falla si la lógica se rompe.** No hace falta una
suite por función. Las que sí van desde el día uno, porque se rompen en silencio:

- `construirConsulta()` — el estado de la tabla a query string.
- `podarPorPermisos()` — columnas que el usuario no debería ver.
- `esquemaDeCamposPersonalizados()` — validador zod construido en runtime.
- El parseo de `neo.css` que verifica la regla del verde (ver
  [sistema-de-diseno.md](sistema-de-diseno.md)).

## Excepción: sí usamos Tailwind v4

`devoperation/docs/convenciones.md:36` dice "Nada de Tailwind", y su justificación textual es *"para
que M06 pueda portar el SCSS del tema actual casi tal cual"*.

**Acá no se porta SCSS**: el diseño es nuevo y explícitamente no es un clon del panel actual. La
premisa de la regla desapareció, así que la regla no se hereda. Se documenta la excepción en vez de
ignorarla en silencio.

Por qué Tailwind v4 concretamente:

- `@theme` consume variables CSS nativas, así que los tokens ya portados se copian **literales** y se
  mapean. No hay una segunda fuente de verdad en JavaScript, como sí la había en v3.
- Sin `tailwind.config.js` ni PostCSS a mano: `@import "tailwindcss"` y listo.
- Evita el problema real de CSS Modules a escala de 584 pantallas: 300 archivos `.module.scss` casi
  iguales y ninguna presión hacia la consistencia.

**Modelo híbrido, no religión.** Lo verdaderamente complejo —motor de tabla con columnas pegajosas y
virtualización, kanban, editor— usa CSS Modules + Sass al lado del `.tsx`. Tailwind resuelve
composición y espaciado; no resuelve un `position: sticky` con sombras condicionales.

Reglas de uso, que es donde Tailwind se ensucia:

1. **Prohibido el valor arbitrario de color o espacio** (`\[#...\]`). Sólo escalas del `@theme`. Hay
   una regla de lint.
2. Todo componente con más de ~8 utilidades por elemento se resuelve con **CVA**
   (`class-variance-authority`) dentro del componente del sistema, nunca en la página.
3. El `@theme` mapea los **semánticos** de `src/estilos/neo.css` (`--superficie`, `--linea`,
   `--texto`, `--acento`), no los tokens crudos. Cambiar el tema es un archivo.

## Reglas que no se simplifican

- **Accesibilidad**: todas las superposiciones se construyen sobre Radix UI. Foco, `Escape` y `aria`
  no se reimplementan a mano.
- **Validación en el borde**: todo lo que entra del usuario pasa por zod antes de llegar a la API.
- **El token nunca llega al navegador.** Vive en una cookie `httpOnly` firmada, y sólo el BFF lo lee.
- **Nunca duplicar lógica de negocio del backend** (totales de factura, permisos, transiciones de
  estado). Si `ops-v2` los recalcula, el rollback deja de ser seguro.

## Antes de dar una fase por terminada

1. `pnpm lint && pnpm typecheck && pnpm test && pnpm build` en verde.
2. El criterio de aceptación del documento de la fase, **ejecutado de verdad**, no razonado.
3. Renombrar `docs/fases/Fn-...-PNDNG.md` a `-CMPLTD.md` y escribir dentro **lo que se aprendió**: lo
   que el plan decía mal, lo que resultó distinto, la deuda consciente. Esa sección es la que evita
   que la fase siguiente repita el error.
4. Actualizar la tabla de estado en el [README](README.md).
5. Commit en español con el prefijo de la fase: `feat(F1): ...`.

## Licencias de lo copiado

`src/estilos/tokens.css`, `colors.css` y `fonts.css` vienen del fork de Huly
(`frontend/packages/theme/`), que es **EPL-2.0**. Los encabezados de copyright se conservan tal cual
en los archivos copiados. Las fuentes son OFL: el `OFL.txt` viaja con ellas.
