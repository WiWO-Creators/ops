@AGENTS.md

## Reglas del proyecto

- **Novedades obligatorias.** Todo cambio visible para el equipo (en ops-v2 o en el board) suma su entrada en `src/dominio/novedades.ts` en el mismo commit/push que lo publica, sin que nadie lo pida. Criterios y formato: `docs/flujo-de-trabajo.md` § «Novedades para el equipo». Antes de cerrar un merge o push, corre `node scripts/novedades-borrador.mjs`. No se anuncia lo desplegado pero apagado ni lo interno.
