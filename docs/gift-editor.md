# T13: editor manual de regalos

Desde un perfil con acceso privado válido, «Añadir regalo» o «Editar regalo» abre `/participante/:slug/regalo/:position/editar`. La posición debe ser 1, 2 o 3 y pertenecer al participante autorizado; un organizador puede editar la lista seleccionada. Una URL conocida sin credencial no abre el formulario.

## Formulario y borradores

El editor es una página de ancho máximo 760 px. Título y tipo identifican el regalo; los demás campos son opcionales. Se puede guardar una opción con las otras dos vacías. El tipo inicial es Objeto y la moneda PEN. Se admite cero, coma o punto decimal y hasta dos decimales, sin redondear entradas inválidas ni convertir monedas.

Ropa y objetos conservan sus detalles por separado en memoria mientras está abierto el editor. Cambiar de tipo no guarda ni borra datos del servidor; al guardar se envían solo los detalles del tipo activo. Calzado permite numeración y sistema EU/US/UK como texto, sin inferir equivalencias. Los detalles opcionales comienzan plegados y los campos secundarios están en «Más detalles».

La imagen es opcional. Se puede conservar una referencia de archivo ya guardada, usar una URL HTTPS pública o quitar la imagen al guardar. La URL se previsualiza por una acción explícita y con fallback de error, sin enviar la credencial al proveedor de imagen. No se permite escribir una ruta de Storage arbitraria. La subida/procesamiento binario y la eliminación física siguen en T14; la importación desde tiendas, en T16/T17. No se muestran botones que simulen esas operaciones.

Los borradores se conservan ante errores, pérdida temporal de acceso y revalidación al recuperar foco. No se guardan en almacenamiento del navegador ni sobreviven a una recarga confirmada. Salir con cambios pendientes pide confirmación, incluido Atrás/Adelante dentro de la SPA; refrescar/cerrar usa la advertencia nativa del navegador cuando este la admite. Cerrar el acceso también confirma el descarte si hay cambios.

## Guardar, limpiar y conflictos

- **Guardar:** reutiliza las reglas puras de T08. Los errores enlazan sus campos, abren los desplegables necesarios y conservan lo escrito. Mientras se envía se bloquean dobles acciones y cambios de campos. Solo un recibo válido actualiza el UUID/versión local y confirma éxito.
- **Limpiar:** solo aparece si existe un regalo. Identifica la opción/título, enfoca Cancelar y pide confirmación. Envía UUID y versión actuales; confirmar limpia únicamente esa fila. No borra las otras opciones ni elimina bytes de Storage.
- **409 o 404 de mutación:** conserva el borrador y bloquea nuevos envíos hasta revisar el estado actual.
- **Red, timeout, 5xx o respuesta inválida:** no se afirma éxito ni se reenvía automáticamente; la transacción podría haberse confirmado. El mismo flujo de revisión evita duplicar un alta después de perder su respuesta.
- **Revisar versión actual:** hace una consulta pública y muestra la opción guardada, incluidos sus detalles, imagen y enlace, o su estado vacío. «Seguir con mi borrador» adopta la identidad/versión consultada y conserva lo escrito, sin guardar. «Cargar datos guardados» pide confirmar el descarte si corresponde. Guardar después sigue siendo una acción explícita y puede volver a encontrar un conflicto.
- **401/403:** la sesión retira sus permisos; el borrador queda visible en modo sin edición hasta salir o recuperar un acceso válido. El frontend nunca sustituye la autorización transaccional del backend.
- **429:** conserva el borrador y espera el `Retry-After` antes de permitir otro intento explícito.

Al volver al perfil o catálogo se hacen nuevas lecturas, por lo que se muestran el regalo/conteo confirmados. No hay guardado optimista ni polling.

## Transporte y seguridad

`private-session.ts` conserva la credencial en clausura y añade un método `mutate` que solo acepta crear, actualizar o limpiar regalos. No ofrece `getToken` a los componentes. Comprueba el ámbito local, evita operaciones duplicadas de la misma posición y aborta peticiones al cerrar/reemplazar el acceso. Una respuesta tardía no vuelve a habilitar una sesión cerrada.

`gift-mutations.ts` normaliza el contrato antes de enviar un único POST a `wishlist-api`, con clave pública y `X-Edit-Token`. Usa `credentials: omit`, `no-store`, `no-referrer`, sin redirecciones ni reintentos automáticos, respuesta acotada y límite de 12 segundos. UUID, propietario, posición y versión del recibo se comprueban antes de aceptarlo; campos desconocidos de la respuesta se descartan. Los errores del proveedor no se muestran como trazas o SQL.

La validación de acceso puede ocurrir mientras una escritura está pendiente sin convertir su respuesta en obsoleta: se distingue la comprobación del acceso de un cambio real de credencial. El servidor T08 sigue comprobando credencial, pertenencia y versión dentro de la transacción de cada escritura. No cambian sus RPC, permisos, RLS ni configuración de Storage.

## Archivos

| Archivos | Responsabilidad |
| --- | --- |
| `src/pages/GiftEditorPage.tsx` | Entrada protegida y conservación del formulario durante revalidaciones. |
| `src/components/editor/GiftEditor.tsx` | Formulario, confirmaciones, revisión de versión y navegación. |
| `GiftDetailFields.tsx`, `GiftImageField.tsx` | Detalles contextuales y fuente de imagen. |
| `src/hooks/useGiftEditor.ts` | Borrador, recibo actual, solicitudes y reconciliación. |
| `src/domain/gift-editor.ts` | Tipos, conversión de datos y payload por tipo activo. |
| `src/services/gift-mutations.ts` | Transporte cerrado y errores de mutación. |
| `src/services/private-session.ts`, `PrivateAccessProvider.tsx` | Mutación sin exponer la credencial al componente. |
| `src/app/App.tsx` | Router de datos y ruta de edición diferida. |
| `src/components/ui/focus-field.ts`, `Feedback.tsx`, `ConfirmationDialog.tsx` | Foco en campos ocultos y confirmaciones reutilizadas. |
| `src/styles/gift-editor.css` | Composición y adaptación móvil del editor. |
| `tests/unit/gift-editor.test.ts`, `tests/ui/gift-editor.spec.ts`, `tests/ui/fixtures/gift-editor.ts` | Lógica, transporte, permisos y recorridos aislados. |

React Router usa ahora su modo de datos (`createBrowserRouter`/`RouterProvider`) para disponer del bloqueo oficial de navegación `useBlocker`. El router se crea después de limpiar la credencial, manteniendo la garantía de T12. No se añadieron dependencias ni se creó un router artesanal.

## Ejecutar y validar

```powershell
npm test
npm run test:ui
npm run build
```

`npm run preview:local` sigue siendo una previsualización pública con las once listas vacías y una API de solo lectura. No acepta enlaces privados ni habilita escrituras simulando autorización.

Para probar el editor con persistencia real, sigue [navegación privada](private-navigation.md): Docker/Supabase local, `.env.local` revisado con URL/clave pública de esa pila, `npm run functions:local` y `npm run dev`. Abre tu enlace local original del organizador; desde «Ver participantes», selecciona una persona y una opción. Los enlaces personales existentes también sirven para su propia lista. La emisión visual de nuevos enlaces sigue en T20.

Comprueba guardar con título/tipo, editar conservando las otras opciones, cancelar y confirmar limpieza, volver al perfil y recargar. Para conflictos, dos pestañas autorizadas pueden editar la misma versión: la segunda conserva el borrador y exige comparar. No hace falta desplegar ni usar una base remota.

Docker no tenía un daemon accesible durante T13. Los recorridos del editor usan un transporte estatal de prueba aislado, con casos de confirmación, conflicto y respuesta perdida; SQL se comprueba en PostgreSQL embebido. **No se verificó este nuevo recorrido completo contra Edge/Docker real.** No se insertaron deseos en el roster ni se modificaron la configuración, las credenciales o los datos reales del usuario.

Referencias: [bloqueo de navegación de React Router](https://reactrouter.com/api/hooks/useBlocker), [router de datos](https://reactrouter.com/start/data/installation) y [errores de Edge Functions](https://supabase.com/docs/guides/functions/error-handling).

## Actualización T17

El enlace de producto ya permite consultar sugerencias de T16, revisar sus fuentes y aplicar únicamente los campos elegidos al borrador. Se conservan valores existentes, moneda y detalles personales; solo Guardar persiste. El recorrido completo con navegador, Edge, transporte Node, TLS sintético y PostgreSQL locales se verificó en T17, con participantes efímeros separados del roster. Ver [uso, límites, archivos y comandos](product-import-ui.md).
