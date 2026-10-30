# T20: panel del organizador

Panel local construido sobre los contratos de [T19](organizer-backend.md), sin nuevas migraciones, permisos o endpoints. Conserva la entrada mediante enlace privado y las credenciales solo en memoria; no usa cuentas de Supabase Auth. El acceso público no muestra un botón de administración.

## Uso

Abre tu enlace de organizador en la misma dirección y puerto configurados para la aplicación. Tras consumir el fragmento, la URL queda en `/organizador`. El panel vuelve a verificar el rol al entrar en cada destino y el servidor lo comprueba en cada operación.

**Participantes** muestra avatar, nombre, cantidad de ideas y estado del enlace. En escritorio es una lista compacta; en móvil, tarjetas. Subir/Bajar funciona con teclado y compara las versiones de ambas personas. Los movimientos vuelven a consultar el listado, incluso cuando normalizar empates cambia otras filas. Hay páginas de hasta cien personas; los movimientos entre páginas también consultan al vecino correspondiente.

- **Añadir participante** abre `/organizador/participantes/nuevo`. Nombre obligatorio, slug propuesto con resolución de colisiones en servidor, orden opcional al final, ilustración o URL de foto y textos opcionales. La lista se crea vacía. El UUID del borrador se conserva para reconciliar un alta cuya respuesta se haya perdido.
- **Editar datos** abre `/organizador/participantes/:id/editar`. Permite nombre, slug consciente, orden, foto/ilustración, mensaje y gustos. Renombrar conserva el slug; cambiarlo muestra la URL resultante y requiere confirmación antes de guardar.
- Una foto de archivo requiere crear primero a la persona, como exige el contrato de T19. Después del alta se abre automáticamente su edición para subirla. Subir prepara el avatar; **Guardar participante** lo asocia. Cambiar o restaurar una foto conserva los textos escritos. Los límites y limpieza siguen siendo los de [T14](media-upload.md).
- **Ver y editar lista** lleva al perfil público con los controles de organizador y reutiliza el editor de regalos de T13/T17. «Organizar» permite volver al panel manteniendo la credencial en memoria.
- **Eliminar** exige escribir exactamente el nombre y confirmar en un diálogo. Explica que se eliminan regalos y acceso privado. Las fotos propias quedan en la cola duradera de mantenimiento; sus bytes se retiran mediante Storage API, no mediante SQL.

**Evento**, en `/organizador/evento`, permite editar título, bienvenida y fecha opcional. La fecha se envía como `AAAA-MM-DD`, sin convertirla en un instante UTC, para conservar el día en Lima. Vaciarla envía `null`. No se habilita configuración de presupuesto o moneda.

## Enlaces y recuperación

«Gestionar enlace privado» identifica a la persona y permite emitir un reemplazo o revocar su acceso, previa confirmación. El listado solo muestra estado/vencimiento. Un enlace nuevo aparece en un campo de solo lectura con Copiar, selección manual si falla el portapapeles y «Ya lo conservé, ocultar enlace». No se envían mensajes automáticamente.

Ese campo es la única exposición deliberada del secreto en la interfaz: sirve para conservarlo y entregarlo. No se escribe en logs, historial, almacenamiento local, sessionStorage, cookies ni archivos. Al salir se advierte que el enlace no se podrá recuperar del listado. Ocultarlo o cerrar el acceso lo retira de la vista.

«Rotar mi enlace privado» explica que el anterior dejará de funcionar y que perder la respuesta exige recuperación por el propietario del proyecto. Al recibir una respuesta válida, la sesión reemplaza la credencial dentro de su clausura, verifica el nuevo acceso y usa solamente el reemplazo para las siguientes operaciones. Las verificaciones anteriores no restauran la credencial vieja. Si el resultado de la rotación es incierto, se retira el acceso de escritura; no se reintenta automáticamente. Recuperación y bootstrap: [guía de enlaces privados](private-access.md). Nunca ejecutes recuperación para una simple previsualización si ya conservas tu enlace.

## Errores y borradores

Los campos se validan antes de enviar y se repiten los controles en servidor. Los errores conservan lo escrito. Conflictos 409 y respuestas inciertas bloquean nuevos guardados hasta consultar el estado actual y elegir expresamente conservar el borrador sobre esa versión o cargar lo guardado. Esto incluye altas: se consulta su UUID original y no se crea otra persona automáticamente.

Un alta ausente tras la consulta puede volver a prepararse explícitamente con el mismo UUID. Un participante existente que fue eliminado no se recrea desde su editor. Los cambios de orden, bajas o enlaces de resultado incierto exigen actualizar el listado antes de otra acción. Los límites 429 respetan `Retry-After`; duplicados y reenvíos automáticos quedan bloqueados.

Revalidar al recuperar foco conserva el formulario y pausa sus acciones. Un rechazo de permisos, cierre, expiración o reemplazo del enlace impide aplicar respuestas tardías. Navegar con cambios pendientes o cerrar el acceso requiere confirmación. Una recarga manual retira la credencial, según el modelo privado del plan; conserva el enlace en un lugar privado para volver a entrar.

## Previsualización con tu pila local

Con Docker Desktop encendido, Supabase local ya migrado según T19 y el cliente configurado con su URL/clave **públicas locales**, usa terminales separadas:

```powershell
npm.cmd run functions:local
```

```powershell
npm.cmd run dev -- --host localhost --port 5173 --strictPort
```

Abre el enlace privado que ya conservas. Su origen debe coincidir con el navegador, `VITE_APP_URL`, `APP_BASE_URL` y los orígenes permitidos de las funciones; `localhost` y `127.0.0.1` son orígenes distintos. Mantén la clave privilegiada fuera de `VITE_*`. Los enlaces nuevos de otro origen se rechazan. No sobrescribas `.env.local` ni generes otro enlace permanente para ejecutar los tests.

`preview:local` sigue siendo una demostración pública de lectura; el panel necesita las operaciones protegidas de Supabase. No proporciona un acceso administrativo ficticio a esa previsualización.

## Ensayo reproducible sin tocar tus datos

```powershell
npm.cmd run test:admin:ui:local
```

Requiere Docker Desktop y Edge/Chromium compatible con Playwright. Usa exclusivamente la pila **AmigoSecretoAdminTest**, API 54421, PostgreSQL 54422, inspector 8094 y Vite en `http://localhost:5179`. Los puertos deben estar libres. No necesita iniciar `functions:local` ni el frontend manualmente.

El ejecutor copia el código y las migraciones a `artifacts/admin-local`, excluyendo `.env*`. Crea su propio organizador efímero y dos personas locales. Comprueba desde navegador altas con listas vacías, nombre/slug, avatar pendiente y asociado al guardar, regalo desde el editor existente, orden, emisión de enlace, rechazo de guardado desde otra pestaña tras revocar, evento/fecha, baja con cascadas y cola, rotación en memoria y pérdida de acceso al recargar. Las consultas de comprobación apuntan al contenedor de prueba fijado por el runner.

Al terminar cierra navegador/Vite/runtime y retira únicamente los contenedores y volúmenes del proyecto de prueba. La pila principal, sus datos y enlaces permanecen intactos. No acepta URLs, proyectos remotos ni otros argumentos. Si se interrumpe forzosamente, revisa los recursos de **AmigoSecretoAdminTest** antes de repetir; el runner rechaza reutilizar una pila existente. Las capturas de un fallo real ocultan el campo del enlace privado y quedan en `artifacts/`, excluido de Git; no se registran trazas del navegador con secretos reales de la prueba.

Para los contratos, presentación y regresiones controladas:

```powershell
npm.cmd test
npm.cmd run test:ui -- --workers=2
npm.cmd run build
```

`test:admin:local` conserva los ensayos HTTP/Storage y de concurrencia de T19. El modo `--ui` es el único argumento adicional permitido por ese runner; ningún modo opera sobre el proyecto principal o remoto. La configuración de Vite del ensayo usa caché separada y desactiva HMR para que una recarga del optimizador no retire la credencial durante el recorrido.

## Archivos de T20

| Archivo | Cambio |
| --- | --- |
| `src/pages/OrganizerPage.tsx`, `src/app/App.tsx` | Entrada protegida y cuatro rutas de administración con carga diferida. |
| `src/components/admin/AdminShared.tsx`, `OrganizerParticipants.tsx`, `OrganizerForm.tsx` | Navegación, lista, formularios, confirmaciones, revisión de conflictos y enlace de una sola presentación. |
| `src/hooks/useAdminOperation.ts`, `src/services/organizer.ts` | Transporte con campos y recibos validados, límites de respuesta, cancelación, cuotas y bloqueo de duplicados. |
| `src/services/private-session.ts`, `src/app/PrivateAccessProvider.tsx` | Acciones exclusivas del organizador y relevo de credencial dentro de la sesión en memoria. |
| `src/components/editor/ProfilePhotoField.tsx`, `src/styles/organizer.css` | Reutilización de avatar con creación previa y etiqueta de guardado; presentación adaptable. |
| `tests/unit/organizer-client.test.ts`, `tests/ui/organizer.spec.ts`, `tests/ui/fixtures/organizer.ts` | Contratos, sesión, privacidad, interacciones y accesibilidad. |
| `tests/ui/fixtures/gift-editor.ts` | Lectura administrativa en el fixture compartido para conservar las pruebas de editores existentes. |
| `tests/support/organizer-ui-local.mjs`, `scripts/test-admin-local.mjs`, `package.json`, `vite.config.ts` | Recorrido real aislado, comando y caché de prueba independiente. |
| README y guías de avance, validación, integración y enlaces | Uso, límites y resultados. |

Sin dependencias nuevas ni cambios en el alcance de datos de T19. Accesibilidad con lector real y otros motores, así como validación alojada y despliegue, continúan en sus bloques posteriores del plan.
