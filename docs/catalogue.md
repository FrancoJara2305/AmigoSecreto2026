# T10: bienvenida y catálogo público

La raíz muestra la bienvenida, el número real de participantes y tarjetas en tres columnas desde 1.024 px, dos entre 640 y 1.023 px y una en móvil. Las once personas dejan dos tarjetas en la última fila de escritorio. No hay rellenos, filtros, prioridades entre regalos, login ni acciones públicas de administración.

## Ver las tarjetas ahora

```powershell
npm run preview:local
```

Abre `http://127.0.0.1:5173/`. Se muestran Melyza, Karina, Norma, Magaly, Cesar, Fabrizio, Brandon, Pamela, Franco, Derek Leonardo y Alice, en ese orden y con **cero regalos**, según la elección del usuario. `/diseno` conserva la galería de T09. Ctrl+C detiene los procesos.

Este modo usa PGlite (PostgreSQL en memoria, dependencia de pruebas ya existente), las migraciones del repositorio y `supabase/participants.local.sql`. Sirve una API temporal de solo lectura en el puerto siguiente al de Vite. Los SQL de lectura son fijos; no acepta filtros SQL ni escrituras HTTP. Solo escucha loopback y admite el origen local de Vite. No replica toda la plataforma Supabase, no persiste al cerrar y no permite editar. No crea cuentas ni enlaces privados.

La configuración pública de la API temporal se pasa únicamente al proceso hijo de Vite; no se reemplaza `.env.local`. La clave de ese modo es un marcador sin validez en Supabase. El servidor y sus dependencias de pruebas no se incluyen en el bundle de producción. Para cambiar el puerto: `npm run preview:local -- --port 5175`; también debe estar libre el 5176.

## Cargar los nombres en Supabase local

Con Docker Desktop iniciado, desde la raíz:

```powershell
npm run supabase -- start
npm run participants:local
```

El ejecutor apunta exclusivamente al contenedor `supabase_db_AmigoSecreto2026`, al socket Docker local y a PostgreSQL en loopback. No acepta URL, referencia, credenciales ni argumentos. El SQL exige un marcador local y se ejecuta en una sola transacción con bloqueo durante la conversión.

- Base vacía: crea once filas, sin regalos, fotos reales, mensajes ni preferencias inventadas.
- Demo T06 intacta: conserva UUIDs, reemplaza nombres/slug/avatares y limpia sus 18 regalos ficticios y textos de ejemplo. Se comprueban IDs, versiones, ausencia de fotos/media y enlaces personales. El acceso global del organizador no se cambia.
- Demo con cambios, participantes ajenos, conflictos de slug o enlaces personales: aborta sin modificar datos. Revisar el conflicto localmente; no usar `db reset` para forzar la conversión.
- Grupo ya cargado: repetir no cambia nombres, slugs, orden, mensajes ni regalos editados después.

`seed:local` sigue siendo la demo ficticia de T06 para pruebas aisladas. No mezclar los dos seeds ni volver a ejecutar la demo sobre este grupo. Ninguno forma parte de las migraciones o se aplica automáticamente con la CLI.

Después de revisar `.env.local` y asegurarse de que corresponde al entorno local autorizado:

```powershell
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Este modo consulta el destino configurado en `.env.local`. La ejecución de T10 no lo utilizó porque estaba configurado para un destino remoto. No se debe iniciar esa conexión para validación hasta revisar y autorizar su uso.

## Mantener los datos editables

Los nombres solo figuran como **datos iniciales** en el SQL local, nunca en los componentes React. El catálogo renderiza `name`, `slug`, `display_order`, fuentes de foto y `avatar_key` devueltos por PostgreSQL. El conteo viene de `gifts(count)`, no de la posición máxima ni de un array estático. Las actualizaciones aparecen al volver a entrar al catálogo o recargar, sin polling.

Se mantiene el modelo del plan: el organizador podrá cambiar nombre, slug, orden y miembros desde T20; el participante editará su foto, mensaje, preferencias y deseos en los bloques correspondientes. T10 no expone un editor público ni un endpoint nuevo de administración. Las políticas RLS y las escrituras protegidas existentes permanecen iguales. Cambiar el archivo de carga después no sobrescribe filas ya existentes: las ediciones posteriores deben hacerse por el mecanismo autorizado.

## Código y validación

| Archivos | Función |
| --- | --- |
| `src/app/App.tsx`, `src/components/layout/AppLayout.tsx` | React Router, cabecera, contenido, pie y anclas con foco. |
| `src/pages/CataloguePage.tsx`, `src/hooks/useCatalogue.ts` | Coordinación de carga, cancelación al salir, reintento y estados. |
| `src/services/catalogue.ts`, `src/domain/catalogue.ts` | Dos GET públicos, conteos tipados y resolución de fotos. |
| `src/components/participants/` | Bienvenida, tarjetas y avatar con fallback. |
| `src/styles/catalogue.css` | Cuadrícula, revelado por hover/foco, tacto y movimiento reducido. |
| `supabase/participants.local.sql`, `scripts/participants-local.mjs` | Roster local revisable y carga protegida. |
| `scripts/preview-catalogue.mjs` | Previsualización temporal sin Docker ni conexión remota. |
| `tests/unit/catalogue.test.ts`, `tests/database/participants.test.mjs`, `tests/ui/catalogue.spec.ts` | Consultas, integridad de datos, interacción y accesibilidad. |

Las consultas usan el cliente público sin Supabase Auth ni claves privilegiadas. Se cancela al salir y hay un límite de 12 segundos; los errores visibles no muestran trazas ni mensajes internos del proveedor. Solo se seleccionan los campos necesarios. La relación FK de regalos está declarada también en los tipos del cliente para obtener conteos tipados.

En escritorio, hover y foco revelan el mismo avatar; el nombre conserva una banda sólida. En pantallas táctiles ambos se ven desde el comienzo y un solo toque navega. Las fotos reservan tamaño y fallan a ilustraciones locales según `avatar_key`, o iniciales si la clave no se reconoce. Las tarjetas son enlaces completos, sin botones anidados.

Desde T11, las rutas `/participante/:slug` muestran el [perfil público completo](public-profiles.md), sus tres posiciones y el estado correcto para un slug inexistente. Conservan enlace, historial y retorno al catálogo. Las rutas de producción necesitarán el rewrite SPA previsto en T22; Vite soporta la recarga local.

Fuentes consultadas: [consultas y conteos relacionados](https://supabase.com/docs/reference/javascript/select), [cancelación de solicitudes](https://supabase.com/docs/reference/javascript/using-modifiers-abortsignal) y [React Router declarativo](https://reactrouter.com/start/declarative/installation).
