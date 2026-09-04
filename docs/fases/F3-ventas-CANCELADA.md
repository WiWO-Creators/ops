# F3 — Ventas (cancelada)

Facturas, presupuestos, propuestas, pagos y gastos. Era la fase más grande del plan (~130 vistas del
panel) y la de mayor riesgo. **No se construye.**

## Por qué se canceló

Dos hechos, y ninguno es una opinión de diseño:

1. **Producción no tiene una sola fila.** `tblinvoices`, `tblestimates`, `tblproposals`,
   `tblitemable`, `tblexpenses` y `tblinvoicepaymentrecords` están vacías en los dos dumps de
   producción. El módulo de ventas de Perfex nunca se usó acá. El censo está en
   [`referencia/censo-del-board.md`](../referencia/censo-del-board.md).
2. **El backend se borró.** El commit `b854567` de `wiwo-board` sacó `RecursoCotizaciones.php`,
   `RecursoPropuestas.php`, `RecursoContratos.php`, `Escritura/Cotizacion.php`,
   `Escritura/Propuesta.php`, `Escritura/ParcheContrato.php`, `Escritura/DocumentoDeVenta.php`, sus
   rutas en `controllers/V1.php` y sus dos comparadores: 5.185 líneas menos. `GET /estimates`,
   `GET /proposals` y `GET /contracts` responden **404**.

Mantener 2.000 líneas de PHP verificadas contra un fixture, para pantallas que nadie iba a abrir, era
el peor retorno del proyecto. El front ya había sacado esas secciones antes (`be6dd27`); el back se
emparejó.

## Qué sobrevive

| Qué | Dónde | Estado |
|---|---|---|
| `invoices` | `Recursos/RecursoFacturas.php`, `Escritura/Factura.php` | API construida y verificada. **Sin pantalla** en `ops-v2`, y no se planea |
| `payments` | `Recursos/RecursoPagos.php`, `Escritura/Pago.php` | Ídem. `PATCH /payments/{id}` nunca existió, deliberado |
| `expenses` | `Recursos/RecursoGastos.php`, `Escritura/Gasto.php` | Ídem. Falta la subida del comprobante y el borrado |
| `estimates`, `proposals`, `contracts` | `Recursos/RecursoPortal.php` | **Vivos en modo lectura**, sólo bajo `/portal/*`: el portal los consulta contra las tablas, con las reglas de visibilidad del contacto. El panel no tiene por dónde pedirlos |

Los tres recursos del portal no son un resto olvidado: `VisibilidadContacto` sigue mandando sus
claves en `secciones_habilitadas` y en el `tabs` de un proyecto, y el frontend del portal las ignora
en silencio a propósito (ver [`modulos/40-portal-cliente.md`](../modulos/40-portal-cliente.md)).

Con la fase se cancelaron también sus tres fichas de módulo —Propuestas, Contratos y Cotizaciones—,
que describían pantallas y endpoints que ya no existen.

## Si algún día se retoma

Lo que habría que rehacer, en orden:

1. **Recuperar el backend borrado.** Está en la historia de `wiwo-board`: `git show b854567^:<ruta>`
   devuelve cada archivo entero. Recuperarlo es más barato que reescribirlo, pero **no es un
   `revert`**: el módulo `api` cambió alrededor y hay que reencajar rutas y firmas.
2. **Volver a verificar.** Los comparadores `comparar-ventas.php` y `comparar-contratos.php` se
   borraron con el resto. Sin ellos no hay forma de probar que los totales coinciden con Perfex, y
   ese era el único criterio que importaba de esta fase.
3. **Decidir el PDF.** Nunca se construyó: `GET /{id}/pdf` y `POST /{id}/enviar` son 404 a propósito.
   Portar el generador arrastra TCPDF, sus fuentes y las plantillas del panel. Es el ítem más caro de
   toda la fase.
4. **Ningún cálculo monetario en el frontend.** Era la regla dura del plan original y sigue siendo
   correcta: los importes viajan calculados desde la API, el frontend sólo elige separadores.

Lo que **no** hay que rehacer: pasarelas de pago y sus callbacks, que se quedan en Perfex.
