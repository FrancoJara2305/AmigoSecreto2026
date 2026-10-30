# T21: accesibilidad y presentación responsiva

Revisión local del 30 de octubre de 2026. Las comprobaciones automáticas y de navegador están separadas de la prueba con lector de pantalla real. **El cierre de T21 requiere esa última revisión**: el primer intento de abrir Narrador agotó la espera de aprobación; después, Computer Use detuvo el turno al no poder identificar con confianza la URL de la ventana local y aplicar su política. No se eludió ese control. Un árbol ARIA o un resultado de axe no se presenta como prueba de lectura hablada.

## Correcciones

- Los errores de foto, avatar y archivo de regalo tienen IDs y `aria-describedby` en sus controles. La selección de ilustración también describe el error en su grupo y radios. Se conservan los anuncios existentes y el foco al primer error.
- Los títulos y etiquetas de nombres largos pueden partir palabras sin ensanchar el formulario o el panel. Las columnas de campos usan `minmax(0,1fr)`; los diálogos conservan desplazamiento vertical y acciones a 320 × 256 px con texto ampliado.
- Los enlaces internos Participantes/Evento tienen un área táctil de al menos 44 px. El campo del enlace privado nuevo usa un borde con contraste suficiente.
- `AppLink` conserva React Router y declara `tabIndex={0}`. Los enlaces nativos hacen lo mismo, sin índices positivos. La tabulación mantiene el orden del DOM. En el WebKit de prueba para Windows, un ejemplo mínimo con enlaces/botón/input reproducía la omisión de enlaces tanto con Tab como con Alt+Tab; declarar cero solucionó el problema sin cambiar preferencias del sistema o del navegador del usuario.

No cambia el modelo de permisos, las rutas, el tratamiento de credenciales ni los contratos de Supabase. No se añadieron dependencias de npm, migraciones o endpoints. Se conservó el trabajo previo de T18–T20.

## Comprobaciones reproducibles

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = "$PWD\artifacts\playwright-browsers"
node node_modules/@playwright/test/cli.js install firefox webkit --no-remove
npm.cmd run test:a11y -- --workers=2
```

Los ejecutables de prueba se descargan de Playwright y quedan en `artifacts/`, excluido de Git. No reemplazan navegadores del usuario. La configuración utiliza ese directorio si no hay otro `PLAYWRIGHT_BROWSERS_PATH` explícito. Edge instalado sigue siendo el canal predeterminado; `PLAYWRIGHT_CHANNEL` permite seleccionar otro canal Chromium ya instalado y compatible.

La matriz tiene cuatro proyectos: Edge escritorio, Edge táctil a 390 px, Firefox y WebKit con viewport táctil de 390 px. **No equivale a un iPhone físico ni a Safari instalado en macOS/iOS.** Firefox/WebKit son los binarios ligados a la versión de Playwright del lockfile. Los tests no reutilizan servidores existentes, bloquean salidas ajenas a loopback y usan datos/capabilities sintéticos con transporte interceptado. No requieren Docker, enlaces reales ni acceso remoto.

| Comprobación | Evidencia |
| --- | --- |
| Reflujo | Anchos 320, 390, 640, 768, 1024 y 1280; paisaje corto y texto al 200 %. Revisa cajas y contenido desbordado, no solo que el botón siga existiendo. |
| Zoom nativo | Edge con perfil nuevo bajo `artifacts/a11y/zoom-profile-*`, preferencia de zoom 2× y sin transformar CSS ni emular dispositivo. Medición: `devicePixelRatio=2`, `innerWidth=628`, `outerWidth=1280`, fuente raíz todavía 16 px. Catálogo, perfil y formulario de muestra conservan acciones. |
| Teclado | Recorridos completos de regalo y administración mediante Tab/Shift+Tab/Enter, confirmaciones, Escape, foco inicial en Cancelar y retorno al disparador. El helper elige la dirección de tabulación según el orden del DOM; no hace clic ni enfoca programáticamente el destino del recorrido. |
| Errores | Foto, ilustración y archivo de regalo describen el mensaje concreto; validación, resumen y estructura ARIA en formularios. |
| Contraste medido | Texto de botón y campo 11,41:1; foco sobre superficie 11,41:1; borde del enlace privado 3,66:1. Además del contrato de paleta existente y contraste automático de axe. |
| Movimiento e imágenes | Reduce motion elimina transiciones/animación; foto rota conserva ilustración y significado; foco visible y controles principales de al menos 44 px. |
| Estructura | Idioma español, un `main` y un `h1`, nombres de controles, estados y regiones vivas. Se guarda el árbol ARIA de una muestra sin credenciales. |
| Axe | Reglas seleccionadas de WCAG 2/2.1/2.2 A/AA en formularios, importación, errores, diálogo y enlace nuevo. No constituye una certificación completa. |

El zoom nativo se configura únicamente en un perfil de prueba y se verifica por sus métricas. Su formato sigue la [implementación actual de preferencias de Chromium](https://github.com/chromium/chromium/blob/main/chrome/browser/ui/zoom/chrome_zoom_level_prefs.cc); no se modifica el perfil normal de Edge.

Referencias: [ampliación de texto](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html), [reflujo](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html), [navegadores de Playwright](https://playwright.dev/docs/browsers). El reporte distingue zoom del navegador, ampliación solo de texto y emulación del viewport.

Para la regresión general y compilación:

```powershell
npm.cmd run test:ui -- --workers=2
npm.cmd test
npm.cmd run build
```

Las capturas, métricas de zoom/contraste, árboles ARIA y perfiles temporales quedan bajo `artifacts/a11y/`; son datos sintéticos locales, no un export del proyecto real. El puerto 4173 y la API temporal 4174 deben estar libres. No ejecutes en paralelo dos comandos que usen la misma previsualización.

## Revisión con lector real: pendiente

Al iniciar T25, el usuario aclaró que «funciona» significaba **«Solo se abrió la ventana»**. Se confirma el arranque de la superficie de prueba, sin dar por aprobado el recorrido con lector. El criterio manual permanece pendiente.

Se preparó una superficie interactiva aislada para completar esta revisión sin abrir enlaces reales ni modificar participantes:

```powershell
npm.cmd run review:a11y:local
```

Abre un Edge propio con los fixtures de catálogo, perfil, regalo, importación y organizador. Las escrituras son simuladas en el transporte de la prueba. No es un modo del producto ni está incluido en su bundle. Cierra esa ventana para terminar y retirar sus servidores. La salida de este lanzador **no cuenta como prueba aprobada de lector**: hay que registrar el recorrido y sus observaciones.

Con Narrador o un lector real equivalente, comprobar y anotar:

1. Catálogo y perfil: idioma, encabezados, salto al contenido, nombre/conteo de tarjetas y tres posiciones sin lecturas decorativas repetidas.
2. Formulario: nombre/obligatoriedad/ayuda, error asociado al campo, navegación por grupo/radios y controles de foto, sin perder el borrador.
3. Guardado e importación: anuncios de progreso, error y éxito comprensibles; selección de sugerencias con fuente y revisión antes de aplicar; sin anuncios repetidos que impidan continuar.
4. Confirmación: título y descripción identificables, Cancelar inicial, tabulación contenida, Escape y devolución del foco. No es necesario confirmar una baja para evaluar este diálogo.
5. Organizador: navegación de secciones, edición y nombre de acciones por persona; orden de lectura de la gestión de enlace. El enlace mostrado es sintético y no debe confundirse con una credencial real.
6. Cerrar el lector y el navegador de prueba, conservando las preferencias previas del usuario. Registrar lector/versión, navegador, fecha, pasos y fallos observados.

[Guía oficial de Narrador](https://support.microsoft.com/en-us/accessibility/windows/narrator/complete-guide-to-narrator). No se instalaron lectores, no se cambiaron ajustes de accesibilidad del sistema y no se atribuyó audio leído a partir del DOM. El primer intento devolvió `Computer Use app approval timed out`. La ventana sintética llegó a abrirse y Computer Use la identificó como Edge, pero detuvo la revisión antes de obtener su estado por no poder confirmar su URL con suficiente confianza para aplicar la política. Se detuvo el lanzador y no se continuó automatizando esa ventana. Hace falta realizar y registrar el recorrido manual anterior para cerrar el criterio de lector.

## Archivos

| Archivos | Cambio |
| --- | --- |
| `src/components/ui/AppLink.tsx` y sus importaciones en páginas, navegación, tarjetas y editores | Enlaces con tabulación natural explícita y comportamiento de React Router conservado. |
| Enlaces nativos de `AppLayout`, `WishlistGrid`, `Button` y `DesignPreview` | Mismo acceso con teclado para anclas y enlaces externos. |
| `ProfilePhotoField.tsx`, `GiftImageField.tsx` | Errores y ayuda asociados a controles de imagen/ilustración. |
| `src/styles/components.css`, `src/styles/organizer.css` | Reflujo, diálogos, áreas táctiles y borde contrastado. |
| `tests/ui/accessibility.spec.ts`, `tests/a11y/native-zoom.spec.ts` | Matriz automática, teclado, contraste y zoom nativo. |
| `tests/a11y/reader-review.spec.ts`, `playwright.reader.config.ts` | Superficie de revisión manual aislada. |
| `playwright.a11y.config.ts`, `package.json`, `tsconfig.json` | Motores, comandos y comprobación de tipos de las nuevas pruebas. |
| README y guías de avance/validación | Resultados y distinción del criterio manual pendiente. |
