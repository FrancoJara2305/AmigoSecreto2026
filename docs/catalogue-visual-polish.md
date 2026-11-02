# Catálogo: centrado y transiciones suaves

Ajuste solicitado el **1 de noviembre de 2026** para las tarjetas y la navegación entre secciones.

En escritorio con mouse, el nombre de cada participante queda centrado horizontal y verticalmente en la tarjeta en reposo. Al pasar el mouse o enfocar con teclado, el nombre baja y la foto/ilustración aparece gradualmente con opacidad y escala durante 460 ms. La tarjeta y sus sombras utilizan una curva más suave. En pantallas táctiles se conserva la imagen visible y la apertura con un solo toque.

Los enlaces de cabecera/pie incorporan un subrayado gradual; el botón de bienvenida y las flechas tienen transiciones de 320 ms. «Ver participantes», la navegación de cabecera y «Volver arriba» usan desplazamiento entre secciones con aceleración/desaceleración de 350–650 ms, según distancia. El movimiento se cancela ante rueda, toque, teclas de desplazamiento o una nueva navegación. Se conserva el foco del título para teclado.

La prueba de navegador mostró que solicitar el scroll nativo `smooth` podía producir un único salto pese a la preferencia configurada. Se implementó la curva con `requestAnimationFrame` y posiciones instantáneas por fotograma, evitando encadenar animaciones nativas. Con `prefers-reduced-motion: reduce`, el desplazamiento es inmediato y las transiciones quedan desactivadas por la regla global existente.

La tarjeta mantiene ancho explícito y altura mínima en rem para adaptarse al texto ampliado. La regresión verificó que no se introduce desbordamiento horizontal a 320 px o con fuente al 200 %.

## Tarjetas con foto

Ajuste del **1 de noviembre de 2026**. Si la persona tiene foto, la tarjeta en reposo muestra solo el nombre centrado. Al revelarse, la foto cubre **toda la tarjeta** (recortada, sin deformarse), el nombre, el número y la estrella se desvanecen, y «x de 3 ideas» queda en marfil sobre un degradado oscuro. Las tarjetas con ilustración conservan el círculo de antes.

- **Con mouse** (escritorio desde 1024 px): al pasar el mouse o enfocar con teclado, igual que antes.
- **Pantallas táctiles** (celular y tableta): no hay hover, así que la foto aparece sola cuando la tarjeta cruza la franja central de la pantalla al desplazarse (`IntersectionObserver`, franja del 10 % central) y vuelve al nombre al salir. No requiere gestos nuevos y un toque sigue abriendo el perfil. En tableta se revelan juntas las tarjetas de la misma fila.
- Si la foto no carga, la tarjeta usa la ilustración elegida. Con movimiento reducido el cambio es inmediato.

## Comprobaciones

- **30/30 casos UI** de catálogo correctos en escritorio, tableta y móvil: centrado, revelado por mouse/teclado, toque, navegación, desplazamiento gradual observado, foco, movimiento reducido, reflujo, errores y accesibilidad automática.
- TypeScript y **seis pruebas de configuración de hosting** correctos.
- Capturas de tarjetas normales/enfocadas revisadas. Los datos de los ensayos fueron locales y sintéticos.
- Cambio limitado al frontend; no se ejecutan migraciones, cambios de datos o despliegues Edge para esta mejora.

Implementación: [estilos de catálogo](../src/styles/catalogue.css), [tokens de movimiento](../src/styles/tokens.css), [navegación entre secciones](../src/services/section-scroll.ts), [integración en rutas](../src/app/App.tsx) y [pie de página](../src/components/layout/AppLayout.tsx). Regresión: [pruebas de catálogo](../tests/ui/catalogue.spec.ts).

**Publicado y verificado en producción:** `dpl_8BfVmghYtz75wRpDYC6pSGh8xUrg`, READY/Node 24.x, con `vercel.json` raíz y `--skip-domain` antes de las comprobaciones. Después de promover se verificaron en navegador real el centrado, hover, varios pasos de scroll, foco y vuelta inmediata con movimiento reducido. El bypass de verificación se revocó. Resultado alojado y huellas en `artifacts/visual-polish-20261101/`. Los cambios del repositorio deben incluirse en el siguiente commit/push para que futuras publicaciones Git conserven esta presentación.
