# Amigo Secreto 2026

Preparación local de React/Vite y Supabase. **Sin vinculación ni despliegue remoto.**

- Cliente público de solo lectura, sin cuentas de Supabase Auth.
- Migraciones revisables: esquema, permisos/RLS, bucket y ciclo de tokens privados.
- Tokens y metadatos en esquema privado; no se crean credenciales de acceso.
- Seed local opcional: 11 participantes ficticios y 18 regalos, sin escrituras remotas.
- T07: enlaces privados con validación, emisión, revocación y rotación; bootstrap local del organizador.
- T08: actualización de perfiles y CRUD de regalos con permisos, validación y control de versión en servidor.
- T09: sistema visual, componentes accesibles y previsualización interactiva sin persistencia.
- T10: bienvenida y catálogo con once nombres proporcionados por el usuario, tarjetas adaptables y lectura pública desde Supabase.
- T11: perfiles públicos por slug, tres posiciones, detalles de regalos, preferencias y copia de enlace público.
- T12: captura y limpieza de enlaces privados, permisos solo en memoria y rutas protegidas por rol/participante.
- T13: editor manual de regalos con guardado independiente, detalles por tipo, limpieza y revisión de conflictos.
- T14/T15: subida segura de imágenes, limpieza y cuotas atómicas por minuto/hora.
- T16: servidor de importación con transporte HTTPS protegido y parser; selección de campos en la interfaz pendiente de T17. Ver [configuración y pruebas locales](docs/product-import.md).

Requiere Node 24+ y npm. Para comprobar sin Docker ni credenciales:

```powershell
npm ci
npm run typecheck
npm test
npm run build
```

Si necesitas configurar el cliente, consulta `.env.example` y conserva cualquier `.env.local` existente. Nunca uses una clave privilegiada en variables `VITE_*`.

Para ver las once tarjetas con listas vacías sin Docker ni conexión remota, desde la carpeta del proyecto:

```powershell
npm run preview:local
```

Abre `http://127.0.0.1:5173/`. Ctrl+C detiene la previsualización. Este comando crea PostgreSQL temporal en memoria con los nombres y no utiliza `.env.local` para conectarse a Supabase. La API temporal solo permite lectura. Admite otro puerto: `npm run preview:local -- --port 5175` (también reserva el puerto siguiente para la API).

La galería T09 está en `/diseno`: formulario simulado, notificaciones y confirmaciones. Las tarjetas del catálogo ya abren el perfil público, por ejemplo `/participante/melyza`, con sus tres posiciones pendientes. Consulta el [sistema visual](docs/ui-system.md), el [catálogo T10](docs/catalogue.md) y los [perfiles T11](docs/public-profiles.md).

Para cargar el grupo de forma persistente en Supabase **local**, después de iniciar Docker y Supabase:

```powershell
npm run participants:local
```

Inserta once participantes con listas vacías. Si detecta la demo ficticia T06 intacta, la convierte sin inventar preferencias ni deseos. Rechaza la conversión si hay cambios propios o enlaces personales. Repetirlo conserva ediciones posteriores. El panel para cambiar nombres, orden y participantes llegará en T20; los nombres no están incrustados en los componentes. Lee las condiciones de la [guía](docs/catalogue.md) antes de ejecutarlo.

`npm run dev -- --host 127.0.0.1 --port 5173 --strictPort` inicia la aplicación contra el destino de `.env.local`. Revisa que sea el entorno local autorizado antes de usarlo; este modo sí consulta Supabase.

Con Docker y Supabase local iniciados, puedes cargar datos de ejemplo:

```powershell
npm run seed:local
npm run test:db:local
```

La demo ficticia T06 queda disponible para pruebas aisladas; no ejecutarla sobre el grupo de nombres reales. Su carga puede repetirse: conserva los registros y cambios existentes. Rechaza identidades incompatibles. No requiere claves ni `login`/`link`. El seed automático de la CLI permanece desactivado. Puedes consultar los datos en Supabase Studio local, habitualmente en `http://localhost:54323`. La raíz React ya contiene el catálogo público.

La [guía de integración](docs/supabase-integration.md) detalla el estado frente al plan, las migraciones, las pruebas con Docker y los pasos **manuales** de vinculación/revisión. Los [resultados de validación](docs/validation-results.md) distinguen pruebas ejecutadas y pendientes. Lee también las [condiciones para habilitar Edge Functions](supabase/functions/README.md).

Para generar el enlace privado del organizador local, después de aplicar las migraciones:

```powershell
npm run organizer:bootstrap
```

Lo muestra una sola vez. Conserva ese enlace en privado. `npm run functions:local` inicia la API local de acceso y edición. Las pantallas de T12 capturan el enlace, limpian la URL y validan el rol con esa API; consulta [navegación privada](docs/private-navigation.md). Lee la [guía de T07](docs/private-access.md) para recuperación y [T08](docs/protected-mutations.md) para mutaciones. El [editor de regalos T13](docs/gift-editor.md) ya permite guardar y limpiar cada opción; la edición de perfil sigue en T18 y el panel completo en T20.

El importador y las pantallas restantes del [plan completo](implementation_plan.md) siguen pendientes de próximas iteraciones. El backend de edición y la carga de archivos están implementados y probados localmente.

Consulta el [avance por tareas](docs/implementation-progress.md) para conocer el punto actual del plan.
## Carga de imágenes (T14)

La subida, asociación y limpieza están implementadas y probadas solo en Supabase local. Consulta [la guía de imágenes](docs/media-upload.md) para ejecutar el formulario, validar las migraciones y revisar la simulación de limpieza. La previsualización temporal del catálogo conserva su modo de solo lectura.

## Cuotas atómicas (T15)

Las funciones privadas comparten cuotas persistentes por minuto y hora, con 429/Retry-After y limpieza acotada. La subida respeta la espera sin perder el borrador. La identidad de red usa fallback global hasta verificar la cabecera del proveedor. Consulta [archivos, políticas y pruebas de T15](docs/rate-limits.md). `npm run cleanup:rates:local` simula el mantenimiento de ventanas vencidas, sin tocar archivos ni datos de participantes.
