# T17: revisar y aplicar información de una tienda

Implementado solo en local, sobre el servidor autorizado de [T16](product-import.md). No se desplegaron funciones ni se consultó la instancia remota. No hay nuevas dependencias, migraciones, cuentas Auth o cambios en los once participantes del usuario.

## Comportamiento

En el editor privado, pega un enlace y pulsa **Importar información**. Escribir o pegar no envía consultas. El botón muestra progreso y permite cancelar; el formulario manual sigue disponible. Una respuesta utilizable abre una vista previa dentro del formulario con los valores encontrados y su fuente: datos estructurados, Open Graph o metadatos estándar. No se renderiza HTML ni se carga la imagen sugerida durante esta revisión. Tras aplicar la URL de imagen puedes usar **Ver imagen** en el selector existente antes de guardar.

Cada campo tiene una casilla. Solo se marcan automáticamente los campos vacíos; título, descripción, detalles, precio/moneda o imagen existentes permanecen desmarcados. Una imagen subida también cuenta como información existente. La vista muestra el valor actual para que el reemplazo sea explícito. **Aplicar campos seleccionados** modifica únicamente el borrador. Los valores siguen editables; solo **Guardar regalo** persiste en el servidor, con los controles de autorización y versión de T08/T13.

Precio y moneda requieren especial cuidado:

- Si la tienda informa USD y el formulario conserva PEN, aplicar el precio exige marcar también USD o tener ya esa misma moneda. No se convierte el importe ni se etiqueta automáticamente como soles.
- Si falta moneda, el precio comienza desmarcado. Para aplicarlo hay que seleccionarlo y confirmar expresamente en qué moneda está, después de comprobarlo en la tienda. Si hay que cambiar la moneda del formulario, hacerlo descarta las sugerencias; vuelve a importar para revisarlas con la nueva moneda.
- Ofertas múltiples/precios ambiguos se señalan sin proponer un importe exacto. Precio cero se conserva. Monedas de tres letras distintas de las opciones habituales siguen siendo editables en el selector existente.

Marca/color/material se aplican solo a los detalles del tipo activo. Modelo pertenece al esquema de objetos: se muestra deshabilitado para ropa, sin cambiar el tipo de regalo. No se importan talla, sistema de tallas, ajuste ni preferencias personales. Los detalles del otro tipo se conservan en memoria.

## Cambios, cancelación y errores

Cualquier cambio del borrador durante la consulta aborta y descarta la respuesta, incluyendo URL, título, detalles, tipo o imagen. Cambiar el formulario después de recibir sugerencias también las invalida; hay que importar de nuevo. La aplicación verifica otra vez la instantánea antes de reemplazar campos. Cancelar, descartar, error de red, timeout, página bloqueada o falta de metadatos conservan el borrador y la alternativa manual.

El transporte del navegador llama únicamente a `product-metadata` de Supabase. Usa la clave pública y `X-Edit-Token`; nunca envía credenciales a tiendas o al proxy Node, ni las pone en el cuerpo, URL, DOM o almacenamiento. Respuesta acotada a 32 KiB y plazo de 20 segundos, incluidos los bytes del cuerpo. El contrato valida campos, longitudes, fuentes y URLs antes de mostrar sugerencias.

La sesión impide consultas sin permiso o para otra persona, evita duplicados por participante, aborta al cerrar/reemplazar la credencial y rechaza respuestas antiguas. Una denegación del servidor retira el acceso. Si la edición está en pausa o se guarda/sube/reconcilia una opción, las sugerencias se descartan para no aplicar sobre otro estado.

Un 429 respeta `Retry-After` hasta una hora y desactiva solo la importación. El texto se conserva, se puede seguir editando/guardando manualmente y no hay reintento automático al vencer la espera.

## Ejecutar y revisar

Para el recorrido completo aislado necesitas Docker Desktop y Supabase local iniciados, las funciones locales cerradas y el puerto **5176** libre:

```powershell
npm.cmd run test:import:ui:local
```

Este comando extiende el ensayo T16: prepara Edge con entorno y secreto efímeros, transporte firmado Node, tienda TLS sintética y un Vite con destino público exclusivamente local y caché separada. Inicia Edge headless (puedes indicar `PLAYWRIGHT_CHANNEL` si usas otro canal instalado). Comprueba por SQL que ni consultar ni aplicar crean regalos; después guarda expresamente y comprueba título editado, importe, USD y URL en PostgreSQL real. No intercepta ni simula las API de acceso/importación/guardado. Solo el conector de la tienda usa el fixture TLS local, como en T16.

Retira sus participantes, contadores y archivos de entorno efímeros; cierra navegador, Vite, proxy y runtime que inició. No sustituye un servidor de funciones ya abierto ni modifica `.env.local` del usuario. La pila base de Supabase se conserva. Los certificados de prueba están en `artifacts/`, ignorados por Git y sin instalar confianza global. Requisitos OpenSSL y explicación del fixture: [T16](product-import.md).

Para ejecutar las pruebas de interfaz aisladas, sin Docker ni credenciales:

```powershell
npm.cmd run test:unit
npm.cmd run test:ui -- tests/ui/product-import.spec.ts
npm.cmd run build
```

`preview:local` continúa mostrando el catálogo público con listas vacías y una API temporal de solo lectura; no permite editar ni importar con permisos ficticios. Para usar el editor manualmente con persistencia, configura los dos servidores de T16 según [su guía](product-import.md#ejecutar-y-revisar-en-local), revisa que el cliente público apunte a la pila local y ejecuta `npm.cmd run dev -- --host 127.0.0.1 --port 5173`. Abre tu enlace local original. La configuración de ejemplo sin transporte falla cerrada y ofrece completar a mano.

## Archivos

| Archivo | Cambio |
| --- | --- |
| `src/domain/product-import.ts` | Contrato de respuesta, selección inicial, comprobación de moneda y aplicación pura al borrador. |
| `src/services/product-import.ts` | Llamada acotada a la Edge Function con errores controlados y sin reintentos. |
| `src/services/private-session.ts`, `src/app/PrivateAccessProvider.tsx` | Operación autorizada en sesión, aislamiento, cancelación y descarte de respuestas antiguas. |
| `src/hooks/useProductImport.ts`, `src/components/editor/GiftProductImport.tsx` | Consulta, vista previa, advertencias, selección y cuotas. |
| `GiftEditor.tsx`, `useGiftEditor.ts`, `gift-editor.css`, `catalogue.css` | Integración y aplicación atómica sobre la instantánea; reflujo del panel y cabecera con texto al 200 %. Se corrige también una habilitación transitoria del selector de imágenes tras 429. |
| `tests/unit/product-import-client.test.ts`, `tests/ui/product-import.spec.ts`, `tests/ui/fixtures/product-import.ts`, `tests/ui/media-upload.spec.ts` | Contrato, permisos, moneda, carreras, errores, accesibilidad y tres resoluciones; regresión de la espera de imágenes tras 429. |
| `tests/support/import-browser.mjs`, `scripts/test-product-import-local.mjs`, `package.json`, `vite.config.ts`, `playwright.config.ts` | Ensayo real local reproducible, limpieza robusta, cachés independientes y servidores automatizados sin watcher/HMR. El desarrollo normal conserva sus recargas. |
| README y guías de importación, editor, avance y validación | Estado y comandos actuales. |

Validación final: **92 pruebas unitarias, 207 casos UI completos**, TypeScript y build correctos, además del recorrido real local. Resultados y límites: [validación T17](validation-results.md). La compatibilidad con tiendas en vivo y un despliegue alojado siguen pendientes de sus fases posteriores. Las pruebas automáticas de accesibilidad no sustituyen lector de pantalla real ni otros motores de navegador de T21.
