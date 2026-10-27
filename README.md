# Amigo Secreto 2026

Preparación local de React/Vite y Supabase. **Sin vinculación ni despliegue remoto.**

- Cliente público de solo lectura, sin cuentas de Supabase Auth.
- Migraciones revisables: esquema, permisos/RLS, bucket y ciclo de tokens privados.
- Tokens y metadatos en esquema privado; no se crean credenciales de acceso.
- Seed local opcional: 11 participantes ficticios y 18 regalos, sin escrituras remotas.
- T07: enlaces privados con validación, emisión, revocación y rotación; bootstrap local del organizador.
- Las funciones de importación y archivos siguen deshabilitadas.

Requiere Node 24+ y npm. Para comprobar sin Docker ni credenciales:

```powershell
npm ci
npm run typecheck
npm test
npm run build
```

Si necesitas configurar el cliente, consulta `.env.example` y conserva cualquier `.env.local` existente. Nunca uses una clave privilegiada en variables `VITE_*`. La pantalla mínima no realiza consultas al iniciar.

Con Docker y Supabase local iniciados, puedes cargar datos de ejemplo:

```powershell
npm run seed:local
npm run test:db:local
```

La carga puede repetirse: conserva los registros y cambios existentes. Rechaza una base que contenga participantes ajenos a la demo. No requiere claves ni `login`/`link`. El seed automático de la CLI permanece desactivado. Puedes consultar los datos en Supabase Studio local, habitualmente en `http://localhost:54323`. El catálogo React se implementará posteriormente.

La [guía de integración](docs/supabase-integration.md) detalla el estado frente al plan, las migraciones, las pruebas con Docker y los pasos **manuales** de vinculación/revisión. Los [resultados de validación](docs/validation-results.md) distinguen pruebas ejecutadas y pendientes. Lee también las [condiciones para habilitar Edge Functions](supabase/functions/README.md).

Para generar el enlace privado del organizador local, después de aplicar las migraciones:

```powershell
npm run organizer:bootstrap
```

Lo muestra una sola vez. Conserva ese enlace en privado. `npm run functions:local` inicia la API local de acceso. Lee la [guía de T07](docs/private-access.md) para recuperación, API y pruebas. Las pantallas para abrir el enlace se conectarán en T12; la edición de datos requiere T08.

El CRUD, los uploads, el importador y las pantallas del [plan completo](implementation_plan.md) siguen pendientes de próximas iteraciones.

Consulta el [avance por tareas](docs/implementation-progress.md) para conocer el punto actual del plan.
