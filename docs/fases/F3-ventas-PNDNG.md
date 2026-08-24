# F3 — Ventas

Facturas, presupuestos, propuestas, pagos y gastos. La parte más grande (~130 vistas del panel) y la
de mayor riesgo.

## Por qué es la de mayor riesgo

No es el volumen: es que el dinero no admite aproximaciones. Impuestos compuestos, descuentos por
línea y por documento, monedas con distinto redondeo, notas de crédito parciales, facturas
recurrentes, y PDFs que el cliente recibe.

`invoice_template.php` son 51 KB y `invoicehtml.php` del portal otros 25 KB. Esa lógica **no se
reescribe**: se llama.

## Qué se construye

- Facturas: lista, detalle, creación, registro de pagos, envío.
- Presupuestos y propuestas, con sus dos tableros de embudo.
- Gastos.
- Notas de crédito.
- Vista previa y descarga de PDF — **generado por Perfex**, con TCPDF, no por el frontend.

## Qué se reusa

| De dónde | Qué |
|---|---|
| `Invoices_model.php` (70 KB), `Estimates_model.php`, `Proposals_model.php` | Todos los cálculos |
| `application/views/admin/tables/{invoices,estimates,proposals,expenses}.php` | Definiciones de tabla |
| `application/views/admin/{estimates,proposals}/pipeline/` | Anatomía de las tarjetas de embudo |
| TCPDF vía los controladores de Perfex | Generación de PDF. El frontend sólo lo muestra y lo descarga |

## Criterios de aceptación

1. Emitir una factura desde cero en `ops-v2`, registrar un pago, y que el **PDF y todos los totales
   coincidan al centavo** con los que produce Perfex para el mismo documento. Verificado con al menos:
   una factura con impuesto simple, una con impuesto compuesto, una con descuento por línea, una con
   descuento sobre el total, y una en moneda distinta a la predeterminada.
2. Una nota de crédito parcial deja el saldo correcto, comparado contra el panel viejo.
3. Una factura recurrente generada por el cron aparece igual en ambos sistemas.
4. Ningún cálculo monetario ocurre en JavaScript. `grep` de operaciones aritméticas sobre importes en
   `src/` no devuelve nada fuera del formateo de presentación.
5. `pnpm lint && pnpm typecheck && pnpm test && pnpm build` en verde.

## Riesgos

| # | Riesgo | Mitigación |
|---|---|---|
| R1 | Un total calculado en el frontend que difiere en un centavo | **Ningún cálculo en el frontend.** Los totales vienen de la API, ya calculados. El criterio 4 lo verifica por grep |
| R2 | Redondeo de moneda distinto entre PHP y JavaScript | Los importes viajan ya formateados como número, y el frontend sólo elige separadores. Nunca se recalcula un subtotal |
| R3 | El PDF de `ops-v2` difiere del que ya recibieron los clientes | El PDF lo genera Perfex. `ops-v2` no dibuja documentos |
| R4 | Facturación es lo que más se toca en producción durante el desarrollo | Bandera por persona: sólo quien la está probando la ve |

## Deuda consciente

- Pasarelas de pago y sus callbacks: se quedan en Perfex. `ops-v2` no toca `controllers/gateways/`.
- Suscripciones y contratos: fuera de alcance.
- Informes financieros avanzados: enlace al panel viejo.

## Lo que se aprendió

_(Se completa al cerrar la fase.)_
