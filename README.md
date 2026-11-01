# Amigo Secreto 2026

Catálogo de participantes y listas de tres ideas de regalo, con edición mediante enlaces privados y panel del organizador. React, TypeScript, Vite y Supabase; sin cuentas convencionales de Auth. Funciones, permisos, imágenes e importación están implementados y probados en local/staging; la aplicación ya está publicada en producción, con staging independiente.

El grupo contiene Melyza, Karina, Norma, Magaly, Cesar, Fabrizio, Brandon, Pamela, Franco, Derek Leonardo y Alice. La previsualización comienza con listas vacías; nombres, orden, perfiles y deseos se administran desde el panel en el entorno persistente. No incluye sorteo, asignaciones, reservas, notificaciones o presupuesto configurable.

## Instalar y previsualizar

Requiere Node 24.x, npm y Git; el lockfile fija las versiones. Docker Desktop con WSL2/contenedores Linux se necesita para Supabase, no para la vista temporal. Las pruebas TLS usan OpenSSL de Git para Windows (C:/Program Files/Git/usr/bin/openssl.exe); las pruebas de navegador usan Edge. No necesitas instalar psql o Deno en Windows: los ensayos usan sus contenedores.

~~~cmd
npm.cmd ci --ignore-scripts
npm.cmd run preview:local
~~~

Abre **http://127.0.0.1:5173/**. Ctrl+C detiene esta vista temporal. Reserva también 5174 para su API de lectura. No lee .env.local, no requiere claves ni Docker y no modifica Supabase. Otro puerto:

~~~cmd
npm.cmd run preview:local -- --port 5175
~~~

La raíz muestra las once tarjetas, /participante/melyza su perfil y /diseno la galería de componentes. La vista temporal no permite editar ni otorga acceso ficticio al organizador.

## Comprobar sin tocar tus datos

~~~cmd
npm.cmd test
npm.cmd run build
npm.cmd run check:docs
npm.cmd run test:security
npm.cmd run test:hosting:local
~~~

Las pruebas usan PostgreSQL temporal en memoria; build genera dist y valida que no se incluyan claves privilegiadas. Para navegador: npm.cmd run test:ui y npm.cmd run test:a11y; consulta [pruebas y revisión manual](docs/operations.md#pruebas-y-aceptación) para requisitos, puertos alternativos y resultados. npm.cmd run measure:performance mide producción con datos sintéticos, sin usar tus variables o base de datos.

Con Docker Desktop activo, estos ensayos crean y retiran su propia pila **AmigoSecretoAdminTest**, separada de la instancia local principal. Ejecutarlos uno después del otro:

~~~cmd
npm.cmd run test:security:local
npm.cmd run test:admin:ui:local
npm.cmd run test:recovery:local
~~~

El último exporta/restaura datos y archivos sintéticos, verifica permisos y recuperación de enlaces y elimina solo su pila. No es un comando para restaurar tus datos. Ver [respaldo y recuperación](docs/backup-recovery.md).

## Ejecutar la aplicación persistente en local

Inicia Docker Desktop y espera al motor Linux. Prepara la pila local sin reset ni seed automático:

~~~cmd
npm.cmd run supabase -- start
npm.cmd run supabase -- migration up --local
~~~

Configura los tres archivos de variables según [entornos y secretos](docs/environment.md), conservando cualquier archivo existente. Para edición manual bastan las variables públicas y los valores de ejemplo Edge; la importación necesita además el transporte firmado.

En terminales separadas, deja abiertos:

~~~cmd
npm.cmd run functions:local
~~~

~~~cmd
npm.cmd run dev -- --host 127.0.0.1 --port 5173 --strictPort
~~~

Abre **http://localhost:5173/**. Este modo sí usa el destino de .env.local: revisa que sea http://127.0.0.1:54321 antes de usarlo. Studio local suele estar en http://localhost:54323/. Si configuraste un archivo Edge propio, usa npm.cmd run supabase -- functions serve --env-file supabase/functions/.env.local en lugar de functions:local, que utiliza el ejemplo y deja la importación sin configurar.

Para un entorno local nuevo, npm.cmd run participants:local prepara los once nombres con listas vacías. Conserva ediciones posteriores y rechaza mezclas incompatibles; lee [sus condiciones](docs/catalogue.md) antes de ejecutarlo sobre datos existentes. La demo seed:local contiene regalos ficticios y **no se usa sobre el grupo del usuario ni producción**.

## Acceder y administrar

Si el organizador local aún no existe:

~~~cmd
npm.cmd run organizer:bootstrap -- --app-url http://localhost:5173
~~~

Muestra el enlace una sola vez: guárdalo en privado y ábrelo con frontend y funciones activos. Un organizador ya inicializado se conserva. El panel permite participantes, evento, fotos, deseos, orden y emisión/revocación de enlaces personales. Recargar elimina el acceso en memoria; vuelve a abrir el enlace privado. Copiar perfil público nunca copia la credencial.

Si perdiste el enlace, npm.cmd run organizer:bootstrap -- --recover --app-url http://localhost:5173 crea un reemplazo y revoca el anterior. No lo ejecutes para previsualizar o si conservas el acceso. Instrucciones: [enlaces privados](docs/private-access.md) y [panel](docs/organizer-panel.md).

## Operación y siguientes pasos

| Tema | Guía |
| --- | --- |
| Entender cómo se construyó el proyecto y por qué | [Guía didáctica del proyecto](docs/guia-didactica-del-proyecto.md) |
| Variables públicas, Edge/Node, orígenes y proxy local | [Entornos](docs/environment.md) |
| Migraciones locales y revisión previa a vincular | [Integración Supabase](docs/supabase-integration.md) |
| Arranque, limpieza, errores y aceptación manual | [Operación](docs/operations.md) |
| DB y Storage, exportación/restauración y accesos | [Respaldos](docs/backup-recovery.md) |
| Estado de staging/producción y rollback | [Despliegue](docs/deployment-review.md) |
| Configuración, manifiesto SHA-256 y ensayo local de hosting | [Paquete T25](docs/deployment-package.md) |
| Rutas privadas 404 y configuración persistente para despliegues Git | [Corrección de enrutamiento](docs/routing-git-deployment-fix.md) |
| Evidencia y comprobaciones | [Seguridad](docs/security-review.md), [rendimiento](docs/performance-review.md), [resultados](docs/validation-results.md) |
| Estado y validación con lector de pantalla | [Avance](docs/implementation-progress.md), [accesibilidad](docs/accessibility-review.md) |

**T25 completado en el alcance autorizado: [producción publicada](https://amigo-secreto2026.vercel.app)** y [staging separado](https://amigo-secreto2026-staging.vercel.app). Node 24 efectivo, tres Edge activas, catorce migraciones y cero pendientes. Confirmación de guardado y fotos corregidas, recorrido guiado T21 y aceptación/logs completados. **Un organizador inicial cifrado; cero participantes o regalos añadidos a producción.** [Resultado, límites y comando para abrir el organizador](docs/production-deployment-result.md). Respaldo/restauración local verificados; copia externa pendiente por decisión del usuario. `.env.local`, artefactos y respaldos no se versionan.
