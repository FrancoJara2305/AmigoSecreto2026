# Catálogo: centrado y transiciones suaves

Ajuste solicitado el **1 de noviembre de 2026** para las tarjetas y la navegación entre secciones.

En escritorio con mouse, el nombre de cada participante queda centrado horizontal y verticalmente en la tarjeta en reposo. Al pasar el mouse o enfocar con teclado, el nombre baja y la foto/ilustración aparece gradualmente con opacidad y escala durante 460 ms. La tarjeta y sus sombras utilizan una curva más suave. En pantallas táctiles se conserva la imagen visible y la apertura con un solo toque.

Los enlaces de cabecera/pie incorporan un subrayado gradual; el botón de bienvenida y las flechas tienen transiciones de 320 ms. «Ver participantes», la navegación de cabecera y «Volver arriba» usan desplazamiento entre secciones con aceleración/desaceleración de 350–650 ms, según distancia. El movimiento se cancela ante rueda, toque, teclas de desplazamiento o una nueva navegación. Se conserva el foco del título para teclado.

La prueba de navegador mostró que solicitar el scroll nativo `smooth` podía producir un único salto pese a la preferencia configurada. Se implementó la curva con `requestAnimationFrame` y posiciones instantáneas por fotograma, evitando encadenar animaciones nativas. Con `prefers-reduced-motion: reduce`, el desplazamiento es inmediato y las transiciones quedan desactivadas por la regla global existente.

La tarjeta mantiene ancho explícito y altura mínima en rem para adaptarse al texto ampliado. La regresión verificó que no se introduce desbordamiento horizontal a 320 px o con fuente al 200 %.

## Comprobaciones

- **30/30 casos UI** de catálogo correctos en escritorio, tableta y móvil: centrado, revelado por mouse/teclado, toque, navegación, desplazamiento gradual observado, foco, movimiento reducido, reflujo, errores y accesibilidad automática.
- TypeScript y **seis pruebas de configuración de hosting** correctos.
- Capturas de tarjetas normales/enfocadas revisadas. Los datos de los ensayos fueron locales y sintéticos.
- Cambio limitado al frontend; no se ejecutan migraciones, cambios de datos o despliegues Edge para esta mejora.

Implementación: [estilos de catálogo](../src/styles/catalogue.css), [tokens de movimiento](../src/styles/tokens.css), [navegación entre secciones](../src/services/section-scroll.ts), [integración en rutas](../src/app/App.tsx) y [pie de página](../src/components/layout/AppLayout.tsx). Regresión: [pruebas de catálogo](../tests/ui/catalogue.spec.ts).

**Publicado y verificado en producción:** `dpl_8BfVmghYtz75wRpDYC6pSGh8xUrg`, READY/Node 24.x, con `vercel.json` raíz y `--skip-domain` antes de las comprobaciones. Después de promover se verificaron en navegador real el centrado, hover, varios pasos de scroll, foco y vuelta inmediata con movimiento reducido. El bypass de verificación se revocó. Resultado alojado y huellas en `artifacts/visual-polish-20261101/`. Los cambios del repositorio deben incluirse en el siguiente commit/push para que futuras publicaciones Git conserven esta presentación.
