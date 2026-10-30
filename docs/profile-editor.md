# T18: foto, mensaje y preferencias del perfil

Implementado y probado **solo en local**. No se vinculó ni consultó la instancia alojada, no se desplegaron funciones ni se modificaron `.env.local`, los once participantes o sus enlaces permanentes. T18 reutiliza las operaciones autorizadas de T08 y el propósito `avatar` de T14; no añade dependencias, migraciones, políticas RLS, buckets o endpoints.

## Usar el formulario

Abre tu enlace privado local original y pulsa **Editar mi perfil**. El organizador puede seleccionar una persona y pulsar **Editar perfil**. La ruta es `/participante/:slug/editar`, protegida por rol y propietario; abrirla sin credencial no concede permiso. El nombre se muestra como contexto. Su corrección, slug, orden y mantenimiento pertenecen a T19/T20.

El formulario permite:

- Subir una foto JPEG, PNG o WebP estática, de hasta 3 MiB y 16 megapíxeles. El servidor valida y normaliza a WebP de máximo 512 px para avatar. La vista previa local no guarda el perfil.
- Usar una URL HTTPS de foto, revisarla con **Ver foto**, conservar la foto guardada o elegir una de las seis ilustraciones existentes. La foto es opcional. Una URL rota muestra la ilustración de respaldo.
- Escribir un mensaje personal de hasta 500 caracteres y gustos/consideraciones generales de hasta 2000. Ambos son opcionales; vaciarlos los elimina al guardar. El texto es plano y será público. Las pistas específicas de un regalo siguen en su propia opción.

Solo **Guardar perfil** persiste. La foto nueva queda pendiente hasta ese momento; el perfil público mantiene la anterior durante la preparación y un fallo de carga. Al reemplazarla o elegir una ilustración, T14 desvincula la anterior en la transacción de guardado y mantiene su período de gracia para limpieza. Cancelar una subida o salir no borra objetos de forma precipitada; los pendientes sin uso se retiran mediante el mantenimiento existente.

Guardar muestra progreso y confirmación inline. Se bloquean envíos duplicados y el guardado durante la subida. Un error conserva lo escrito. La espera de imágenes por 429 no impide guardar textos con la foto anterior; la espera de mutaciones sí pausa el guardado, sin vaciar el formulario. Al vencer la espera se requiere otro clic: no hay reenvíos automáticos de escrituras.

Salir/Cancelar, Atrás o cerrar el acceso con cambios pide confirmación; rechazarla mantiene el borrador. La recarga manual elimina la credencial como en T12 y requiere reabrir el enlace original. Una comprobación de acceso temporal conserva el formulario, y una revocación impide seguir guardando o aceptar una respuesta tardía.

## Versiones y permisos

El formulario lee la versión pública actual junto a los campos del perfil. Envía `update_profile`, UUID, versión esperada y exclusivamente `photo_path`, `photo_url`, `avatar_key`, `personal_message`, `general_preferences`. Nombre, slug, orden, regalos y campos privados no se pueden colar en el payload. Las fotos de archivo deben pertenecer al mismo participante y al propósito `avatar`, comprobado también en el servidor.

El token viaja únicamente por `X-Edit-Token` a `wishlist-api`/`media-upload`, con clave pública, sin cookies ni Authorization de usuario. No se envía a URLs de fotos, al DOM, almacenamiento o query strings. La sesión comprueba rol/propietario, evita duplicados por perfil, aborta al cerrar/reemplazar credencial y descarta respuestas antiguas. El servidor sigue siendo la autoridad en cada operación.

La respuesta de guardado debe corresponder al mismo UUID y a una versión mayor; se seleccionan únicamente campos permitidos antes de conservarla. Cuerpo de respuesta acotado a 32 KiB y plazo de 12 segundos, incluida su lectura. La lectura pública por slug/UUID usa el SDK y un plazo de 12 segundos; el SDK conserva su política de reintento para lecturas, nunca para las escrituras del formulario.

Un conflicto o una respuesta perdida exige **Revisar versión actual**. El borrador se conserva y Guardar se bloquea hasta comparar. Puedes seguir con tu borrador sobre la versión consultada o cargar el perfil guardado, con confirmación de descarte cuando corresponda. Comparar/cargar no escribe. Si la persona ya no existe, no se crea otra automáticamente.

## Ensayo completo local

Con Docker Desktop y Supabase local ya iniciados/migrados, funciones locales cerradas y puerto **5177** libre:

```powershell
npm.cmd run test:profile:ui:local
```

El runner rechaza reemplazar funciones ya abiertas. Inicia su propio Edge Runtime con orígenes locales explícitos y un Vite en loopback, caché independiente y sin watcher/HMR. Usa configuración pública exclusivamente de la pila local y credenciales privadas efímeras en memoria. No modifica los archivos de entorno del usuario ni despliega nada.

Comprueba con navegador, Edge, Storage y PostgreSQL reales:

1. Subir JPEG de 16 MP y comprobar WebP de hasta 512 px; reserva pendiente sin cambiar el perfil antes de guardar.
2. Guardar mensaje/preferencias/foto y comprobar la asociación en SQL.
3. Reemplazar por PNG, conservando la foto vigente hasta confirmar; la anterior pasa a pendiente de limpieza.
4. Elegir ilustración y guardar, desvinculando la segunda foto; regalo de prueba intacto, incluidos UUID/versión/detalles.
5. Denegar otra persona con 403 y versión antigua con 409.
6. Ver el resultado público y recargar, sin heredar permisos de edición.

Al terminar cierra navegador, Vite y runtime propios; borra por Storage API exclusivamente los archivos de sus participantes efímeros y retira sus filas/contadores. El archivo temporal bajo `artifacts/` se elimina incluso si falla la limpieza SQL. La pila base local se conserva. El script solo acepta su destino fijo `127.0.0.1`; no tiene argumentos para una instancia remota.

Para verificar interfaz aislada, sin Docker ni credenciales:

```powershell
npm.cmd run test:unit
npm.cmd run test:ui -- tests/ui/profile-editor.spec.ts --workers=2
npm.cmd run build
```

La regresión completa usa `npm.cmd run test:ui -- --workers=2`. `preview:local` sigue mostrando el catálogo público con listas vacías y una API temporal **de solo lectura**; no acepta enlaces privados ni simula permisos para editar tus datos.

Para editar manualmente con persistencia, revisa la configuración del cliente para que apunte a Supabase local, inicia `npm.cmd run functions:local` y `npm.cmd run dev -- --host 127.0.0.1 --port 5173`; abre tu enlace local original. No se necesita el transporte Node de tiendas para editar perfiles. Si otra terminal está sirviendo funciones con configuración propia, conserva ese servidor y no inicies uno adicional.

## Archivos

| Archivo | Cambio |
| --- | --- |
| `src/domain/profile-editor.ts` | Borrador, payload permitido, propósito avatar, versión y validación de recibos. |
| `src/services/profile-editor.ts` | Lectura pública con versión y guardado privado acotado, sin reintentos de escritura. |
| `src/services/private-session.ts`, `src/app/PrivateAccessProvider.tsx` | Operación de perfil con aislamiento, cancelación y descarte de respuestas tardías. |
| `src/hooks/useProfileEditor.ts` | Guardado, subida pendiente, cuotas, revisión de conflictos y borrador. |
| `src/components/editor/ProfileEditor.tsx`, `ProfilePhotoField.tsx` | Formulario, ilustraciones, URL/foto, contadores, confirmaciones y mensajes. |
| `src/pages/ProfileEditorPage.tsx`, `src/app/App.tsx`, `src/styles/gift-editor.css` | Ruta autorizada y presentación adaptable en una columna. |
| `scripts/preview-catalogue.mjs` | La lectura temporal devuelve también la versión pública; conserva SQL fijo, parámetros y ausencia de escrituras. |
| `scripts/test-profile-ui-local.mjs`, `package.json`, `vite.config.ts` | Ensayo real reproducible y caché aislada del servidor de prueba. |
| `tests/unit/profile-editor.test.ts`, `tests/ui/profile-editor.spec.ts`, `tests/ui/fixtures/profile-editor.ts`, `tests/ui/private-access.spec.ts` | Contrato, campos, permisos, cuotas, fallos, versiones, foto y accesibilidad; foco y reintento de la nueva ruta. |
| README y guías de avance, validación, imágenes, navegación y Supabase | Estado y comandos actuales. |

Validación final: **100 pruebas unitarias, 249 casos UI completos, TypeScript, build y recorrido real local correctos**. Se mantiene el aviso previo de chunk de Vite mayor de 500 KB; entrada inicial de 173,44 KB gzip, dentro del objetivo de 200 KB. Las capturas `artifacts/ui/profile-editor-*.png` y `profile-live-local.png` usan datos de prueba. Resultados en [validación T18](validation-results.md). Las comprobaciones automáticas de accesibilidad no sustituyen lector de pantalla real u otros motores de navegador de T21. No se declara verificado ningún despliegue alojado.
