# Plan de implementación — Amigo Secreto · Christmas Wishlist

**Fecha:** 26 de octubre de 2026.  
**Estado:** propuesta para revisión; fase 1, sin implementación.  
**Condición para continuar:** la fase 2 comienza únicamente después de la aprobación explícita de este documento.

## 1. Interpretación general del proyecto

Una aplicación pequeña y personal para compartir ideas de regalos navideños. El recorrido principal será entrar, descubrir a los participantes y consultar las tres opciones de una persona. El recorrido de edición comenzará desde un enlace privado, sin cuentas, correo, contraseña ni formulario de acceso.

La aplicación tendrá lectura pública y escritura autorizada en el servidor. Las listas, preferencias y fotografías publicadas serán visibles para cualquier visitante que conozca la dirección; los enlaces privados solamente concederán permisos de edición. No se presentará el sitio como un espacio de información confidencial.

Se propone un único evento inicial con 11 participantes ficticios, cargados desde PostgreSQL. La interfaz no tendrá nombres ni cantidad de participantes incrustados en sus componentes. Cada persona contará con exactamente tres posiciones visuales, de las cuales podrá completar ninguna, una, dos o tres.

El repositorio revisado contiene únicamente un README inicial. Esta fase añadirá exclusivamente este plan: no se instalarán dependencias, crearán recursos en la nube ni publicará una aplicación.

### Supuestos y decisiones de partida

- Interfaz en español; formato regional `es-PE`, moneda inicial PEN y zona horaria `America/Lima`.
- Los números 1, 2 y 3 identifican opciones; no expresan una clasificación de preferencias.
- Título y tipo identifican el regalo. Imagen, precio, descripción, enlace y detalles serán opcionales, para que la carga manual sea sencilla.
- El organizador gestionará nombre, slug y orden de participantes. Cada participante editará su foto/avatar, mensaje, preferencias y regalos. El organizador también podrá editar esos datos.
- Sin fecha obligatoria, presupuesto inventado ni cuenta regresiva. Los valores definitivos se completarán después desde la administración.
- Los nombres y avatares de prueba no representan personas reales. Las fotografías reales se incorporarán con autorización de sus propietarios.
- La captura funcional mencionada en el requerimiento no aparece entre los archivos recibidos. La cuadrícula se define mediante las reglas explícitas de tres, dos y una columnas; no depende de esa captura.

## 2. Objetivos del MVP

1. Ofrecer una bienvenida cálida integrada con un catálogo fácil de explorar.
2. Mostrar perfiles legibles con tres opciones y preferencias generales diferenciadas.
3. Permitir guardar cada opción de manera independiente y conservarla al recargar o cambiar de dispositivo.
4. Facilitar la captura de información con formularios breves, imágenes y una importación asistida de metadatos.
5. Proteger todas las modificaciones con enlaces privados revocables, validados en el servidor.
6. Dar al organizador herramientas suficientes para mantener participantes, listas y mensajes del evento.
7. Entregar una base pequeña, documentada y reproducible en Supabase y Vercel.

## 3. Alcance y exclusiones

| Incluido en el MVP | Decisión concreta |
| --- | --- |
| Bienvenida y catálogo | Una página inicial; 11 participantes de prueba y cantidad real tomada de la base de datos. |
| Perfiles públicos | Fotografía/avatar, mensaje, tres opciones y consideraciones generales. |
| Edición individual | Crear, modificar y limpiar cada opción; guardar preferencias y foto. |
| Formularios contextuales | Prenda/calzado u objeto, con detalles opcionales desplegables. |
| Imágenes | Archivos propios en Storage y enlaces HTTPS externos válidos. |
| Importación | Consulta desde servidor, vista previa, selección de campos y alternativa manual. |
| Administración | Participantes, fotos, listas, orden, enlaces privados, título, bienvenida y fecha opcional. |
| Persistencia y protección | PostgreSQL, restricciones, RLS, tokens aleatorios con hashes y permisos por operación. |
| Entrega técnica | Código, SQL, seed, funciones, variables de ejemplo, documentación y validación. |

**Fuera del MVP:** sorteo, emparejamientos, destinatarios secretos, reservas o compras, notificaciones, mensajería, cuentas convencionales, historial de eventos, múltiples ediciones, actualizaciones en tiempo real, aplicación móvil nativa y funcionamiento sin conexión.

**Presupuesto:** el requerimiento lo contempla como dato opcional del modelo y también lo excluye como función del MVP. Se reservará `suggested_budget` nullable en el esquema, sin formulario, reglas ni indicadores de presupuesto en la primera interfaz. El precio individual del regalo sí se incluye.

No se crearán tablas de futuras asignaciones. Si se añade un sorteo, tendrá un modelo privado propio y permisos explícitos; no se reutilizará la lectura pública de regalos para publicar destinatarios.

## 4. Arquitectura propuesta

### 4.1 Distribución de responsabilidades

```text
Navegador — React / TypeScript / Vite
  ├── componentes y páginas: presentación y accesibilidad
  ├── hooks y servicios: formularios, carga y estado de solicitudes
  ├── consultas públicas → Supabase Data API → PostgreSQL con RLS
  └── operaciones privadas → Supabase Edge Functions
                                ├── validación del token y del recurso
                                ├── operaciones transaccionales → PostgreSQL
                                ├── validación de archivos → Supabase Storage
                                └── importación → transporte HTTP protegido → tienda

Vercel: frontend estático, rutas SPA y cabeceras de seguridad
Supabase: PostgreSQL, Storage y funciones de servidor
```

La clave pública de Supabase permite consultar únicamente datos autorizados por grants y RLS. No constituye una contraseña de edición. Los componentes nunca recibirán una clave privilegiada.

Las funciones del servidor utilizarán un cliente privilegiado después de autenticar y autorizar cada operación. Como ese cliente puede eludir RLS, los permisos de propietario deberán comprobarse explícitamente; no se confiará en RLS para suplirlos. La documentación de [RLS de Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security) fundamenta la combinación de grants y políticas.

### 4.2 Funciones y contratos propuestos

| Función | Responsabilidad | Autorización |
| --- | --- | --- |
| `wishlist-api` | Validar acceso, actualizar perfil, guardar/limpiar posiciones y operaciones de administración. | Token personal sobre su propio participante o token de organizador. |
| `product-metadata` | Validar URL, limitar consultas, descargar HTML y devolver candidatos normalizados; nunca guardar un regalo. | Token válido de participante u organizador. |
| `media-upload` | Validar, normalizar y cargar imágenes; devolver una referencia de archivo pendiente. | Token válido y pertenencia del destino. |

Un único manejador por función delegará en módulos de dominio; no contendrá toda la lógica en su archivo de entrada. Se definirán acciones cerradas y campos permitidos, sin admitir nombres de tablas, filtros SQL ni rutas de Storage arbitrarios enviados por el cliente.

Las respuestas privadas tendrán `Cache-Control: no-store`. El contrato de error incluirá código estable, mensaje en español y errores por campo cuando corresponda. Se distinguirán 401, 403, 404, 409, 413, 422, 429 y errores temporales del proveedor. No se devolverán trazas, SQL ni secretos.

El catálogo necesitará una consulta de participantes con conteo de regalos y una de configuración, sin una consulta por tarjeta. El perfil cargará participante y regalos por slug. Se invalidará el estado local después de guardar y al regresar al catálogo; no habrá polling ni suscripciones permanentes.

### 4.3 Alternativas relevantes

| Decisión | Alternativa | Recomendación y motivo |
| --- | --- | --- |
| SPA en Vite | Framework con SSR | SPA: el caso no requiere SEO de perfiles ni renderizado de servidor. |
| Enlaces con tokens aleatorios | PIN compartido, password o magic link por correo | Token individual revocable: evita cuentas y un secreto común para todos. |
| Validación de token por petición | JWT propio con sesiones y renovación | Validar el hash: revocación sencilla y menos piezas para 11 usuarios. |
| Edge Functions | Backend Express permanente | Funciones bajo demanda, cercanas a los datos. |
| JSONB para características | Una columna por cada variante o modelo EAV | JSONB validado por tipo; no habrá búsquedas complejas sobre detalles. |
| Estado React y hooks | Redux, store global o caché avanzada | Estado local más contexto de acceso y una capa de consultas pequeña. |
| Extracción HTML | Navegador remoto, scraping comercial | HTML estructurado, sin ejecutar JavaScript y sin nuevo servicio de pago por defecto. |

La compatibilidad del transporte HTTP seguro es el único punto que requiere una prueba técnica temprana en el runtime real. La alternativa acotada se describe en la sección 9; no se añadirá infraestructura de scraping preventiva.

## 5. Tecnologías y dependencias justificadas

| Tecnología | Utilidad y límites |
| --- | --- |
| React + TypeScript | Componentes y contratos tipados; los tipos no reemplazan la validación del servidor. |
| Vite | Desarrollo y compilación de una SPA estática. Versiones compatibles se fijarán al iniciar fase 2 y se conservará el lockfile. |
| Tailwind CSS | Sistema de espaciado, colores, estados y breakpoints; CSS propio para la ilustración y el revelado de tarjetas. |
| HTML semántico y componentes accesibles equivalentes | Botones, inputs, select y details nativos; diálogo nativo con foco y cierre controlados. No se instalará una biblioteca completa para unos pocos controles. |
| Lucide React | Iconos coherentes importados individualmente; las acciones seguirán teniendo texto accesible. |
| React Router | Rutas, enlaces, parámetros e historial. Justifica una dependencia adicional para evitar un router artesanal. |
| `@supabase/supabase-js` | Consultas y Storage; un cliente público en frontend y otro privilegiado exclusivamente en servidor. |
| PostgreSQL y SQL versionado | Relaciones, restricciones, transacciones y seed; sin ORM adicional. |
| Parser HTML, por ejemplo `htmlparser2` | Solo servidor. Necesario para interpretar HTML y entidades correctamente; no se intentará parsear páginas completas con regex. Se confirmará compatibilidad con Deno. |
| Validador de direcciones IP, por ejemplo `ipaddr.js` | Solo servidor. Clasificar IPv4/IPv6 y rangos especiales es delicado; evita una implementación incompleta de SSRF. |
| Decodificador/codificador de imágenes compatible con Edge | Solo si supera la prueba de runtime: validar bytes, dimensiones y recodificar imágenes exige una herramienta real, no confiar en el MIME declarado. Selección y tamaño quedarán documentados. |
| Vitest y Playwright | Dependencias de desarrollo para lógica crítica y recorridos de navegador; no se incluirán en el bundle público. SQL y funciones tendrán además pruebas de integración. |

Se empezará con animaciones CSS. No se incorporarán Motion, bibliotecas de formularios, Zod, Redux, Redis, carruseles, SDK de analítica ni servicios externos de scraping sin una necesidad demostrada. Web Crypto, URL, AbortController, Intl y APIs nativas cubrirán sus casos respectivos.

Referencias de integración: [Vite](https://vite.dev/guide/), [Tailwind con Vite](https://tailwindcss.com/docs/installation/using-vite) y [React Router](https://reactrouter.com/start/declarative/installation). No se asume que una versión particular de Node o Deno esté instalada actualmente.

## 6. Estructura de carpetas recomendada

La siguiente estructura es una propuesta, no archivos creados en esta fase:

```text
src/
  app/                 # router, proveedores mínimos y layout
  pages/               # inicio, perfil, acceso, edición y administración
  components/
    layout/            # cabecera y pie
    ui/                # botón, campo, diálogo, toast, estados
    participants/      # hero, cuadrícula, tarjeta y avatar
    gifts/             # lista, tarjeta, editor e importador
    preferences/       # lectura y edición de preferencias
    admin/             # lista y formularios del organizador
  hooks/               # acceso privado, consultas, guardado y carga
  services/            # cliente público, API privada, adaptadores
  domain/              # tipos, validación pura y reglas de opciones
  lib/                 # formato, URLs y utilidades pequeñas
  styles/              # tokens, estilos base y movimiento
  assets/              # ilustraciones propias, avatares y fuentes si aplica
supabase/
  config.toml
  migrations/          # esquema, grants, RLS, RPC y bucket
  seed.sql             # 11 participantes ficticios y casos representativos
  tests/               # restricciones, permisos y transacciones
  functions/
    _shared/           # auth, validación, errores, CORS y rate limit
    wishlist-api/      # handlers de perfil, regalos y administración
    product-metadata/  # transporte seguro, parser y normalización
    media-upload/      # validación, recodificación y carga
scripts/               # bootstrap del organizador y mantenimiento
tests/
  unit/
  fixtures/            # HTML sintético y archivos para pruebas
  e2e/
docs/
  deployment.md
  manual-tests.md
  security.md
.env.example
README.md
vercel.json
implementation_plan.md
```

Los módulos visuales no importarán clientes privilegiados. La validación pura podrá compartirse con el servidor mediante imports explícitos; no se arrastrarán dependencias de React al runtime Edge.

## 7. Diseño preliminar de base de datos

### 7.1 `public.participants`

| Campo | Tipo propuesto / restricción |
| --- | --- |
| `id` | UUID, clave primaria, generado por base de datos. |
| `name` | Texto obligatorio, 1–80 caracteres después de trim. |
| `slug` | Texto obligatorio y único, 1–100 caracteres, minúsculas, números y guiones. |
| `photo_path` / `photo_url` | Texto nullable; como máximo una fuente. El primero referencia un objeto de Storage. |
| `avatar_key` | Identificador de una ilustración local permitida; valor por defecto. |
| `personal_message` | Texto opcional, hasta 500 caracteres. |
| `general_preferences` | Texto opcional, hasta 2.000 caracteres; sin HTML enriquecido. |
| `display_order` | Entero no negativo; orden secundario por nombre e id. |
| `version` | Entero positivo, incrementado en cada edición para detectar conflictos. |
| `created_at`, `updated_at` | `timestamptz`, valores gestionados por base de datos. |

El slug se propone desde el nombre al crear el participante, resolviendo colisiones con un sufijo corto. Renombrar una persona no cambiará automáticamente su slug ni romperá su enlace público. El organizador podrá modificarlo conscientemente, viendo el enlace resultante; los tokens seguirán vinculados al UUID.

### 7.2 `public.gifts`

| Campo | Tipo propuesto / restricción |
| --- | --- |
| `id` | UUID, clave primaria. |
| `participant_id` | UUID obligatorio, FK a participants, `ON DELETE CASCADE`. |
| `position` | `smallint`, obligatorio, `CHECK` entre 1 y 3. |
| `title` | Texto obligatorio, 1–120 caracteres. |
| `description` | Texto opcional, hasta 2.000 caracteres. |
| `image_path` / `image_url` | Fuentes opcionales y excluyentes, equivalentes a las del perfil. |
| `product_url` | URL HTTPS opcional, hasta 2.048 caracteres. |
| `reference_price` | `numeric(12,2)` nullable, no negativo; nunca float. |
| `currency` | Código de moneda de tres letras, default PEN; si hay precio, debe haber moneda. |
| `gift_type` | Texto con `CHECK` en `clothing`, `object`; etiquetas en español en la interfaz. |
| `details` | JSONB no nulo, objeto por defecto; tamaño máximo 8 KB y claves permitidas por tipo. |
| `version` | Entero positivo para concurrencia. |
| `created_at`, `updated_at` | `timestamptz`, gestionados en la base. |

Restricción `UNIQUE(participant_id, position)`: junto con el rango de posición impide una cuarta opción y duplicados incluso con peticiones simultáneas. No se precrearán regalos vacíos. La interfaz compondrá siempre los tres espacios a partir de los registros existentes; eliminar una opción borra su fila y devuelve ese espacio a pendiente.

Los detalles tendrán claves de dominio estables: para ropa, subtipo, talla, sistema, color, alternativas, ajuste, marca, material y notas; para objetos, categoría, marca, modelo, color, dimensiones, material, especificaciones y notas. El servidor rechazará claves desconocidas y valores anidados arbitrarios. El calzado utilizará numeración y sistema de talla y ocultará el campo de ajuste de ropa.

### 7.3 `private.access_tokens`

| Campo | Tipo propuesto / restricción |
| --- | --- |
| `id` | UUID, clave primaria. |
| `access_type` | `participant` u `organizer`. |
| `participant_id` | FK nullable, con borrado en cascada. Obligatorio para participante y nulo para organizador mediante CHECK. |
| `token_hash` | SHA-256 del token aleatorio, bytes de longitud fija y UNIQUE. Nunca el token original. |
| `created_at` | `timestamptz`. |
| `expires_at` | Nullable; en MVP los enlaces duran hasta revocación, salvo expiración configurada en servidor. |
| `revoked_at` | Nullable; su presencia invalida el enlace. |

El esquema `private` no estará expuesto por Data API y no concederá permisos a `anon`, `authenticated` ni `PUBLIC`. Se añadirá RLS como defensa complementaria. Las funciones de acceso SQL estarán limitadas a `service_role`, con `search_path` fijo y sin SQL dinámico.

Índices parciales impedirán dos enlaces no revocados para un mismo participante y más de un enlace vigente de organizador. Emitir uno nuevo revocará el anterior en la misma transacción. Un enlace expirado deberá revocarse al reemplazarlo para no bloquear esa unicidad.

### 7.4 `public.event_settings`

Una fila singleton con `id = 1` protegido por CHECK; título de hasta 100 caracteres, bienvenida de hasta 500, `exchange_date` nullable de tipo date, `default_currency = PEN`, `suggested_budget` nullable y no negativo, versión y timestamps. Los colores serán tokens de diseño en código: no hace falta un constructor de temas en base de datos.

La fecha se tratará como fecha de calendario en Lima, evitando que la conversión desde UTC la mueva al día anterior. La fila inicial existirá mediante migración; el organizador podrá actualizarla pero no eliminarla.

### 7.5 Tablas auxiliares privadas mínimas

- `private.rate_limits`: clave hash, operación, ventana temporal y contador. Actualización atómica e índice único sobre clave/operación/ventana. Hace efectivos los límites entre múltiples instancias serverless, sin Redis. Limpieza de ventanas vencidas con un comando de mantenimiento y borrado acotado durante nuevas ventanas.
- `private.media_assets`: id, participante, ruta única, token que creó la carga, MIME, tamaño, estado pendiente/adjunto y fecha. Permite comprobar propiedad antes de vincular imágenes y limpiar cargas abandonadas sin confiar en una ruta recibida del navegador.

Estas tablas responden a seguridad y consistencia del MVP. No habrá tabla adicional de sesiones ni caché persistente de scraping en la primera versión.

### 7.6 Índices, permisos y operaciones atómicas

- PK y UNIQUE crean los índices de identidad, slug, hash y posición. La unicidad de `(participant_id, position)` también sirve para obtener los regalos de una persona; no duplicar ese índice.
- Índice de participantes por `display_order, name, id`; índices sobre FKs de tablas privadas para borrados y comprobaciones.
- Sin índice GIN de JSONB: no se buscará por características en el MVP.
- Lectura pública permitida de participants, gifts y event_settings. Escrituras directas denegadas a `anon` y `authenticated`, incluso si alguien conoce un token privado.
- Revocar EXECUTE por defecto de funciones SQL sensibles a PUBLIC. Los procedimientos expuestos solo para el backend no deberán poder invocarse con la clave pública.
- Las mutaciones SQL volverán a comprobar token, rol y pertenencia dentro de la transacción. Bloquearán la fila del token mientras realizan el cambio: después de confirmar una revocación, las nuevas escrituras no serán válidas.
- Actualizaciones y eliminaciones usarán id y versión esperada. Un cambio simultáneo devuelve 409 sin sobrescribir silenciosamente. Dos altas simultáneas de una misma posición se resolverán con la restricción UNIQUE, no con un upsert que sobrescriba la primera.
- Fechas y versiones se actualizarán mediante triggers o procedimientos comunes, sin depender del reloj del navegador.

### 7.7 Reproducibilidad y datos de prueba

Las migraciones SQL se aplicarán en orden sobre una base vacía y mediante el historial de migraciones sobre una existente. No se mezclarán credenciales ni operaciones destructivas de reset con el despliegue normal. El seed será independiente y repetible por identificadores fijos, reservado a desarrollo/demo.

Participantes ficticios propuestos: Ana, Bruno, Camila, Diego, Elena, Gabriel, Lucía, Mateo, Natalia, Sofía y Tomás. Habrá ejemplos de listas con 0, 1, 2 y 3 regalos, ropa, calzado, objetos, precio ausente, foto opcional y preferencias de distinta extensión. Los avatares serán locales, sin depender de servicios externos.

El seed no incluirá tokens conocidos. Un comando separado generará enlaces de desarrollo con aleatoriedad real. El SQL de producción creará el evento, pero no incorporará automáticamente personas ficticias a un grupo real.

## 8. Modelo de seguridad sin login

### 8.1 Enlace y ciclo de vida

1. El servidor genera 32 bytes criptográficamente aleatorios y los codifica en base64url. Se almacena exclusivamente su SHA-256. La entropía permite usar SHA-256; no se trata de una contraseña humana que requiera un hash lento.
2. El enlace personal será `/acceso#token=...` y el del organizador `/organizador/acceso#token=...`. El fragmento evita enviar el secreto en la ruta HTTP, query string y Referer.
3. Antes de cargar recursos remotos, la aplicación extrae el token, elimina el fragmento mediante `history.replaceState` y lo conserva únicamente en memoria de la pestaña.
4. Envía el token por HTTPS en un encabezado específico, por ejemplo `X-Edit-Token`, a la función. Nunca en query string, campos públicos, trazas ni herramientas de analítica.
5. El servidor valida formato, hash, revocación, vencimiento y rol. Devuelve capacidades y participante autorizado; no devuelve hashes ni enlaces de otros participantes.
6. Tras validar, navega al perfil privado o panel. Cada operación repite la autorización; cambiar el UUID en el cuerpo no concede acceso a otra persona.
7. Al cerrar el acceso se borra el token de memoria. Al recargar habrá que reabrir el enlace original. Esta fricción pequeña evita guardarlo permanentemente en localStorage o sessionStorage.

El enlace es una credencial transferible: quien lo reciba puede editar. No hay verificación de identidad ni protección frente a un destinatario que lo reenvíe. El modo privado mostrará «Este enlace permite editar tu lista. Guárdalo y no lo compartas». La acción «Copiar perfil público» construirá una URL limpia, sin token.

### 8.2 Autorización por operación

| Operación | Público | Token personal | Organizador |
| --- | --- | --- | --- |
| Ver catálogo, perfiles y regalos | Sí | Sí | Sí |
| Editar foto, mensaje, preferencias y regalos | No | Solo propios | Todos |
| Cambiar nombre, slug u orden | No | No | Sí |
| Crear/eliminar participantes | No | No | Sí |
| Editar configuración del evento | No | No | Sí |
| Generar/revocar enlaces personales | No | No | Sí |
| Rotar enlace del organizador | No | No | Sí, con relevo seguro |
| Consultar hashes o tokens originales | No | No | No |
| Importar/cargar archivos | No | Para su lista | Para participante seleccionado |

El organizador solo verá el token original al generarlo. Si pierde el enlace de un participante, emitirá uno nuevo y revocará el anterior; no habrá un listado de secretos recuperables.

### 8.3 Bootstrap, rotación y recuperación

El primer token de organizador se generará mediante un comando local de mantenimiento con credenciales de servidor, ingresadas de forma segura y excluidas del repositorio. Insertará el hash y mostrará el enlace una sola vez. No existirá un endpoint público de «crear primer administrador», contraseña inicial compartida ni secreto incluido en el seed.

La rotación del organizador validará el token actual, generará el reemplazo y revocará el anterior de manera atómica. La respuesta entregará el nuevo enlace y actualizará la credencial en memoria. Si se pierde la respuesta, el propietario del proyecto recuperará acceso mediante el mismo comando de mantenimiento, revocando el enlace anterior. La administración explicará este efecto antes de la rotación.

### 8.4 Controles transversales

- En estas funciones se desactivará la comprobación JWT de plataforma por función, ya que los tokens privados no son JWT de Supabase Auth. El manejador realizará obligatoriamente su validación propia antes de cualquier operación protegida. Desactivar esa opción no convierte el endpoint en público. Referencia: [cabeceras y verificación de Edge Functions](https://supabase.com/docs/guides/functions/auth-headers).
- CORS permitirá orígenes concretos de producción y desarrollo, encabezados necesarios y métodos limitados. OPTIONS no ejecutará lógica de negocio. CORS no se considerará autorización.
- No se usarán cookies de autenticación; las peticiones privadas llevarán el token explícito. La protección principal frente a XSS será no renderizar HTML de usuarios, limitar URLs y aplicar CSP.
- Cabeceras `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, CSP con scripts propios, `object-src 'none'`, `base-uri 'self'` y `frame-ancestors 'none'`. Conexiones limitadas a Supabase y al origen de la aplicación.
- `robots`/`X-Robots-Tag: noindex` para reducir descubrimiento de un evento personal, sin presentarlo como control de acceso.
- Enlaces externos con `noopener noreferrer`; no cargar scripts, iframes ni embeds de tiendas.
- Errores de token inválido, expirado o revocado compartirán un mensaje general. Se limitarán los intentos para evitar abuso del endpoint.
- Valores iniciales propuestos: validaciones fallidas 20 por minuto por origen de red, mutaciones 60 por minuto por token, importaciones 5 por minuto y 30 por hora por token, cargas 10 por hora por token. Contadores atómicos y respuesta 429 con `Retry-After`.
- La clave por IP se derivará con HMAC y secreto de servidor, usando únicamente la cabecera de cliente confiable del proveedor. No se aceptará ciegamente un `X-Forwarded-For` aportado por el cliente. Un límite global acotará el consumo si esa identidad no está disponible.
- Logs con id de solicitud, acción, resultado y duración. Sin encabezados privados, cuerpos de formularios, URLs comerciales completas con parámetros ni tokens.

## 9. Flujo de autocompletado de productos

### 9.1 Experiencia y contrato

1. El usuario pega un enlace y pulsa «Importar información». No se enviarán peticiones al escribir cada carácter.
2. El botón muestra progreso y permite cancelar. Los campos manuales siguen disponibles.
3. El servidor devuelve candidatos de título, descripción, imagen, precio, moneda, marca y propiedades, con fuente y advertencias.
4. Una vista previa dentro del formulario muestra solo los datos encontrados. Cada campo tiene casilla de selección; los campos ya escritos estarán desmarcados por defecto.
5. «Aplicar campos seleccionados» rellena el borrador. Una moneda ausente o un precio ambiguo se señalan para revisión; no se interpreta USD como PEN ni se hace conversión monetaria.
6. Todo sigue editable. Solo «Guardar regalo» persiste los datos.

Si se modifica la URL o un campo mientras se importa, se descartará la respuesta obsoleta o se exigirá aplicar manualmente ese campo. Cancelar o fallar no borrará el borrador. No se inferirá talla, ajuste o preferencia personal a partir de información genérica del producto.

### 9.2 Orden de extracción

1. JSON-LD `Product`, incluyendo arrays y `@graph`, con `Offer` para precio y moneda.
2. Open Graph para título, imagen y descripción; etiquetas comerciales de precio si existen.
3. Metadatos estándar y título HTML como último recurso.

Se normalizarán entidades, espacios y longitudes a texto plano. Las imágenes relativas se resolverán contra la URL final validada. Un `AggregateOffer`, múltiples variantes o distintos productos no se convertirán en un precio exacto inventado: se mostrará la ambigüedad o se omitirá el campo. No se evaluará JavaScript ni se seguirá `@context` remoto.

Este orden es una decisión del proyecto basada en los formatos de [Schema.org Product](https://schema.org/Product) y [Open Graph](https://ogp.me/), no una garantía de calidad de los metadatos publicados por cada tienda.

### 9.3 Límites y protección SSRF

Parámetros iniciales propuestos: HTTPS, puerto 443, URL máxima de 2.048 caracteres, 8 segundos totales para DNS/descarga, máximo 3 redirecciones, 1 MiB de HTML descomprimido y 128 KiB de JSON-LD procesable. Lectura por streaming con aborto al superar el límite; no confiar solo en Content-Length. Limitar también cantidad y profundidad de nodos JSON.

Se rechazará userinfo en URL, protocolos alternativos, hosts locales, IPs literales y destinos no globales. Se resolverán y clasificarán registros A y AAAA, incluyendo IPv4 mapeada en IPv6, loopback, redes privadas, link-local, multicast, metadatos de nube y otros rangos especiales. Si alguna dirección resuelta no es pública, se rechazará el destino.

Las redirecciones se manejarán manualmente: cada destino repite validaciones, DNS y límite de saltos. No se reenviarán tokens de edición, cookies, Authorization ni otros encabezados sensibles al comercio. Solo se aceptará contenido HTML; un 403, captcha, timeout o contenido no compatible terminará con una alternativa manual.

**Control de DNS rebinding:** consultar DNS y luego llamar a un `fetch` que resuelve de nuevo no basta. El transporte debe conectarse a una IP previamente validada conservando hostname, SNI y verificación TLS, o disponer de una barrera de salida equivalente comprobable. Esta decisión se apoya en la guía de [prevención de SSRF de OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html).

### 9.4 Prueba temprana y alternativa acotada

La primera tarea técnica tras aprobar el plan verificará en Supabase Edge la compatibilidad con un transporte HTTPS que fije la resolución y con la clasificación de IPs. No se asumirá que las capacidades de Deno estándar coinciden con las del servicio alojado; la documentación de [Deno HttpClient](https://docs.deno.com/api/deno/fetch/) describe configuración de certificados y proxy, pero no demuestra por sí sola esa protección.

Si el runtime impide implementarla de forma fiable, se recomienda una única función Node en Vercel dedicada a la descarga protegida mediante resolución fijada y TLS, aprovechando el alojamiento ya previsto. Supabase conservará autenticación, cuotas y parsing; el transporte solo aceptará peticiones firmadas de servidor, con expiración corta, límites y protección contra replay. No recibirá tokens de participantes ni claves de base de datos. La opción se verificará con las APIs de [HTTPS de Node](https://nodejs.org/api/https.html) y tendrá una tarea condicional explícita.

Como defensa adicional podrá configurarse una lista de dominios comerciales exactos y revisados, incluyendo los destinos legítimos de redirección. No se considerará esa lista un reemplazo de la protección de red ni se permitirán comodines amplios. Las tiendas a validar se elegirán en fase 2; ninguna se declara compatible anticipadamente.

No se habilitará en producción un importador que falle estas comprobaciones. El ingreso manual seguirá disponible, pero el MVP no se declarará completo sin una importación segura demostrada sobre HTML compatible y una prueba controlada de extremo a extremo. Las limitaciones de tiendas concretas sí son un resultado esperado.

### 9.5 Mensajes previstos

- Sin metadatos: «No encontramos información utilizable. Puedes completar tu regalo manualmente».
- Bloqueo o timeout: «La tienda no respondió o no permite esta consulta. Tu enlace sigue disponible».
- URL no admitida: «Usa un enlace HTTPS público de un producto».
- Límite: «Has realizado varias importaciones. Inténtalo nuevamente en …».
- Éxito parcial: «Encontramos algunos datos. Revísalos antes de aplicarlos».

## 10. Arquitectura de componentes React

| Componente o grupo | Responsabilidad |
| --- | --- |
| `AppLayout`, `NavigationHeader` | Identidad del evento, navegación, enlace para saltar al contenido y estado privado. |
| `WelcomeHero` | Mensaje, ilustración y acceso al catálogo; no consulta datos por su cuenta. |
| `ParticipantsGrid`, `ParticipantCard` | Distribución responsiva, conteo y enlace semántico al perfil. |
| `ParticipantAvatar` | Foto o avatar local, proporción estable y fallback de error. |
| `ParticipantProfile` | Composición del encabezado, lista y preferencias a partir del modelo cargado. |
| `WishlistGrid`, `GiftCard`, `PendingGiftCard` | Exactamente tres posiciones; detalle, enlace de tienda y acciones según permisos. |
| `GiftEditor` | Borrador, validación, guardado y coordinación de secciones; delega importación, imagen y detalles. |
| `ProductLinkImporter`, `MetadataPreview` | Solicitud, cancelación, candidatos y aplicación selectiva al borrador. |
| `ClothingDetailsForm`, `ObjectDetailsForm` | Campos contextuales opcionales y ayuda específica de calzado. |
| `ImageField` | Archivo/URL, vista previa, progreso y eliminación de la referencia. |
| `GeneralPreferences`, `ProfileEditor` | Lectura y guardado de datos personales; separados de los detalles de regalos. |
| `PrivateAccessGate` | Estados verificando/válido/no válido; no sustituye la autorización del servidor. |
| `AdminParticipants`, `ParticipantAdminForm` | Alta, edición, orden, eliminación y acceso a listas. |
| `PrivateLinkManager`, `EventSettingsForm` | Emisión/revocación y configuración pública del evento. |
| `ToastNotifications`, `InlineError`, `LoadingState`, `EmptyState` | Retroalimentación accesible y consistente. |
| `ConfirmationDialog` | Solo eliminación, revocación, rotación o descarte de cambios. |

Los hooks `useParticipants`, `useParticipant`, `usePrivateAccess` y `useGiftEditor` separarán consultas y estado de la representación. Las reglas de permisos y validación pertenecerán al dominio y se repetirán autoritativamente en servidor. Evitar un único componente con catálogo, formulario y administración mezclados.

## 11. Diseño UX/UI de cada pantalla

### 11.1 Sistema visual

Dirección propuesta: **papelería navideña contemporánea**. Fondo marfil, tarjetas crema, bloques verde bosque, lazos rojos y pequeños acentos dorados. Ilustraciones originales de regalos, ramas y estrellas con contornos suaves y la misma paleta; no mezclar fotografías de stock, emojis y estilos 3D distintos.

| Token | Aplicación |
| --- | --- |
| Verde `#173E32` | Texto principal, hero, botones principales y foco sobre superficies claras. |
| Rojo `#A82E3C` | Acentos y acciones destructivas identificadas con texto; no único indicador de error. |
| Dorado `#E3BB70` | Líneas, estrellas y etiquetas sobre verde; evitar texto pequeño dorado sobre crema. |
| Crema `#F6E9D5` | Tarjetas, bloques de preferencias y fondos secundarios. |
| Marfil `#FFFAF2` | Fondo general, campos y texto sobre verde. |

Ancho máximo de contenido 1.120 px; márgenes laterales de 16 px en móvil, 24 px en tablet y 32 px en escritorio. Escala de separación de 8, 12, 16, 24, 32, 48 y 64 px. Radios de 20–24 px en tarjetas y 12 px en controles; sombras cortas de baja opacidad y bordes visibles.

Tipografía sans legible del sistema para cuerpo y controles; títulos con una familia serif cálida del sistema, sin descarga externa inicial. Cuerpo de 16 px, interlineado cercano a 1,5; título principal 44–56 px en escritorio y 32–36 px en móvil. Peso y tamaño harán la jerarquía, no párrafos en mayúsculas.

Interacciones de 160–240 ms con opacity y transform. Desplazamiento de tarjetas de hasta 4 px; sin giro completo, nieve continua, confeti automático ni efectos que tapen contenido. Con `prefers-reduced-motion`, se eliminan desplazamientos y scroll animado.

### 11.2 Inicio: bienvenida y catálogo

1. Cabecera de unos 72 px: pequeño símbolo de regalo y nombre del evento a la izquierda; «Participantes» a la derecha. Sin botón de login ni administración pública prominente.
2. Hero verde con radio amplio: texto en el 60 % izquierdo y una composición de cajas, lazos y ramas en el resto. Antetítulo «Navidad · 2026», título «¡Bienvenido a nuestro Amigo Secreto!», explicación de dos líneas y botón crema «Ver participantes».
3. En móvil, texto y botón primero, ilustración más pequeña debajo. El hero no ocupará una pantalla completa ni retrasará innecesariamente el catálogo.
4. Al pulsar el botón, desplazar al encabezado «Pequeñas pistas para un gran regalo» y trasladar el foco apropiadamente. Mostrar el número real de participantes en una etiqueta discreta.
5. Cuadrícula de tres columnas desde 1.024 px, dos entre 640 y 1.023 px, y una por debajo de 640 px. Gap de 24 px en escritorio y 16 px en móvil. Once personas producen una última fila con dos tarjetas, sin falso participante ni bloque de relleno.
6. Pie breve: «Hecho para compartir un poquito de ilusión» y enlace de regreso al inicio; sin texto técnico de infraestructura.

No habrá buscador ni filtros en el primer MVP: para once personas añadirían más controles que utilidad. El diseño permitirá introducirlos si crece el grupo.

### 11.3 Tarjetas de participantes

Tarjeta aproximadamente cuadrada, con proporción 1:1 y altura mínima adaptable para nombres largos y zoom. Fondo crema, pequeño motivo navideño en una esquina, nombre grande centrado y «2 de 3 ideas» en el borde inferior. La tarjeta completa será un enlace, sin botones interactivos anidados.

En dispositivos con hover y puntero fino, el avatar aparecerá al centro superior mediante opacidad y una escala moderada; el nombre se desplazará a una banda inferior con fondo sólido, siempre legible. `focus-visible` producirá el mismo revelado y un contorno claro. Enter abre directamente el perfil.

En móvil y punteros táctiles, avatar y nombre estarán visibles desde el principio. No habrá un primer toque dedicado al efecto. Avatar ausente o imagen rota se reemplazan por una ilustración determinista según `avatar_key`, con iniciales como último recurso.

### 11.4 Perfil público

En la parte superior: «Volver a participantes». Encabezado crema con avatar de 96–128 px, nombre y mensaje opcional. Al lado, «Copiar perfil público». Debajo, «Mi lista de deseos» y una línea aclaratoria: «Tres ideas para inspirarte; el orden no indica preferencia».

Tres tarjetas en escritorio y una columna legible en móvil; en tablet se permiten dos columnas sin alterar el orden. Cada tarjeta tendrá etiqueta «Opción 1», imagen en espacio de proporción fija con `object-fit: contain`, título, descripción, precio referencial, características relevantes y enlace «Ver en la tienda». La fotografía de producto no se recortará para llenar el cuadro.

Los espacios vacíos conservarán la misma estructura visual, con un icono de regalo y «Regalo pendiente · Pronto habrá una pista por aquí». No parecerán errores ni contendrán acciones de edición para visitantes.

Después de los regalos, un bloque diferenciado «Un poquito sobre mis gustos» mostrará consideraciones generales en texto legible. Si no existen, una frase breve indicará que todavía no se añadieron. Los detalles de cada regalo permanecerán en su propia tarjeta.

### 11.5 Perfil privado y edición de datos personales

Se reutiliza el perfil, añadiendo una franja «Estás editando tu lista», «Editar mi perfil», acciones sobre cada opción y «Cerrar acceso de edición». Las tarjetas vacías muestran «Añadir regalo»; las completas «Editar» y una acción secundaria «Limpiar opción».

La edición personal será una página o panel en el flujo, con foto/avatar, mensaje y preferencias. En móvil los campos estarán en una columna. El nombre se mostrará como contexto y se indicará que el organizador puede corregirlo. Guardar muestra progreso y confirmación inline; un error mantiene los datos escritos.

### 11.6 Editor de regalo

Página de ancho máximo 760 px, con retorno al perfil, «Tu opción 1» y texto que recuerda que las demás opciones pueden completarse después.

Orden de contenido:

1. Bloque opcional «¿Tienes un enlace?» con URL y botón de importación; la vista previa se despliega en ese mismo lugar.
2. Título obligatorio y selector de tipo mediante dos controles claros: «Prenda de vestir» y «Objeto».
3. Imagen: vista previa, botones «Subir imagen» y «Usar URL», mensajes de tamaño/formato.
4. Descripción y precio opcional con selector de moneda; valor inicial PEN y presentación «S/».
5. «Detalles que ayudarán a elegir», plegado inicialmente, con campos del tipo seleccionado.
6. Acciones «Guardar regalo» y «Cancelar»; «Limpiar opción» solamente si ya existe un regalo.

En ropa, lo primero será subtipo, talla o numeración y sistema de tallas. Color y alternativas estarán juntos; ajuste, marca, material y notas en «Más detalles». En calzado se pedirá sistema como EU/US/UK si el usuario desea indicarlo, sin asumir equivalencia entre sistemas. En objetos, categoría, marca/modelo y color; dimensiones, material, especificaciones y notas se revelarán después.

Cambiar de tipo no guardará ni borrará datos inmediatamente: se conservarán borradores separados por tipo durante la edición; al guardar se enviarán solo los detalles del tipo activo. Se informará de ello junto al selector.

No se usará un modal para el formulario completo. La barra de acciones podrá permanecer visible en móvil si no cubre campos, teclado ni mensajes de error.

### 11.7 Administración

Cabecera discreta «Organizar nuestro intercambio» con regreso al catálogo. Dos pestañas o enlaces internos: «Participantes» y «Evento».

En escritorio, lista compacta con avatar, nombre, cantidad de regalos, estado del enlace y acciones etiquetadas; en móvil se transforma en tarjetas. No se mostrarán tokens existentes. «Añadir participante» abre un formulario propio con nombre, slug propuesto, avatar/foto y orden. El orden tendrá controles «Subir» y «Bajar», accesibles por teclado; no requiere drag-and-drop.

Cada participante tendrá «Editar datos», «Ver y editar lista» y «Gestionar enlace privado». La emisión mostrará el enlace nuevo una sola vez, con «Copiar» y ayuda de conservación. Revocar mostrará una confirmación que identifica a la persona. El organizador entregará los enlaces por el canal que elija; el MVP no enviará mensajes automáticamente.

Eliminar un participante requerirá confirmar el nombre y explicará que se eliminarán sus regalos y acceso. «Evento» contendrá título, bienvenida y fecha opcional. Sin paneles de estadísticas, gráficos ni tablas administrativas innecesarias.

### 11.8 Pantallas de acceso y error

Mientras se verifica el enlace: ilustración pequeña y «Estamos preparando tu lista». Si falta o no funciona: «Este enlace de edición no está disponible. Pide uno nuevo al organizador», con retorno al catálogo. No se mostrará un campo para probar tokens manualmente.

Una ruta o slug inexistente mostrará «No encontramos este participante» y acceso al catálogo. Un fallo de red tendrá botón «Reintentar», sin confundirse con una lista vacía.

### 11.9 Referencias y alcance de la revisión visual

Se consultaron las páginas de [MySanta](https://dribbble.com/shots/26801428-MySanta-Platform-to-run-your-Secret-Santa-gift-exchange-online), [Secret Santa de Vikky](https://dribbble.com/shots/25392050-Secret-Santa-Mobile-App-Design) y [Secret Santa de Vladislav Surovets](https://dribbble.com/shots/20152219-Secret-Santa-Mobile-App). La extracción disponible permitió leer descripciones y algunas paletas, pero no inspeccionar las composiciones completas de sus imágenes. No se atribuyen a esos diseños detalles visuales que no se pudieron verificar.

La página de [Behance indicada](https://www.behance.net/gallery/219115979/Gift-Exchange-Platform-Website-Design) no pudo recuperarse. Se conserva como referencia para revisión visual posterior. La composición descrita aquí es una propuesta original basada en el brief, sin copiar ilustraciones ni recursos de autor.

## 12. Navegación, interacción y accesibilidad

| Ruta propuesta | Comportamiento |
| --- | --- |
| `/` | Bienvenida y catálogo; `#participantes` sirve de ancla. |
| `/participante/:slug` | Perfil público; controles extra solo si el acceso en memoria lo permite. |
| `/acceso#token=…` | Captura y validación de credencial; se limpia la URL inmediatamente. |
| `/participante/:slug/editar` | Editor de foto, mensaje y preferencias. |
| `/participante/:slug/regalo/:position/editar` | Editor de una posición válida entre 1 y 3. |
| `/organizador/acceso#token=…` | Entrada privada del organizador. |
| `/organizador` | Participantes y administración de enlaces. |
| `/organizador/participantes/nuevo` | Alta de participante. |
| `/organizador/participantes/:id/editar` | Edición administrativa. |
| `/organizador/evento` | Configuración del evento. |
| Cualquier otra | Estado 404 de aplicación, con regreso al inicio. |

Se conservarán Atrás/Adelante, enlaces profundos y recarga de rutas mediante configuración SPA. Las rutas privadas abiertas sin credencial mostrarán acceso no disponible; no bastará conocer su URL.

| Situación | Estado visible y comportamiento |
| --- | --- |
| Carga inicial | Skeletons de proporción estable y anuncio accesible de carga. |
| Cero participantes | Mensaje de evento en preparación, sin inventar tarjetas. |
| Guardando | Botón deshabilitado, texto «Guardando…» y prevención de doble envío. |
| Guardado confirmado | Datos devueltos por servidor, actualización de estado y anuncio de éxito. |
| Error de validación | Resumen y errores asociados a campos; foco al primero inválido. |
| Error de red al guardar | Borrador conservado; no afirmar éxito ni reenviar automáticamente una operación ambigua. Consultar el estado actual antes de reintentar si pudo haberse confirmado. |
| Conflicto 409 | Conservar borrador y ofrecer revisar la versión actual antes de reemplazar. |
| Cambios sin guardar | Confirmación solo al abandonar o descartar datos; no al navegar sin cambios. |
| Eliminación/revocación | Diálogo con objeto afectado, «Cancelar» inicial y acción destructiva inequívoca. |
| Importación fallida | Advertencia inline y formulario manual habilitado. |
| Imagen rota | Fallback de igual tamaño y alternativa accesible. |

Accesibilidad objetivo: WCAG 2.2 AA en los recorridos principales. Contraste mínimo 4,5:1 para texto normal y 3:1 para texto grande y controles; se medirá, no se inferirá de la paleta. Controles táctiles de al menos 44 px; foco visible, orden lógico, labels persistentes, errores con `aria-describedby` y anuncios con live regions moderadas.

Los diálogos atraparán el foco, admitirán Escape y devolverán el foco al disparador. No habrá información disponible solo por color o hover. Probar teclado, lector de pantalla, zoom al 200 %, reflow y movimiento reducido. Las ilustraciones puramente decorativas estarán ocultas a tecnologías de asistencia.

## 13. Persistencia y tratamiento de imágenes

### 13.1 Archivos subidos

Bucket público `wishlist-media`, porque sus fotografías son contenido de perfiles públicos. Lectura de objetos públicos, sin políticas de escritura ni eliminación para clientes anónimos. Una URL pública no equivale a permitir modificar el objeto, conforme a [Storage Access Control](https://supabase.com/docs/guides/storage/security/access-control).

Rutas generadas por servidor, por ejemplo participante/uso/UUID.webp; no conservar nombres originales. Máximo inicial de archivo: 3 MiB. Formatos aceptados: JPEG, PNG y WebP estáticos; rechazar SVG, GIF animado y archivos que solo aparentan ser imágenes.

El navegador ofrecerá previsualización y reducción de tamaño con APIs nativas para mejorar la experiencia. El servidor seguirá siendo la autoridad: comprobará tamaño real durante lectura, firma, decodificación completa, dimensiones máximas y límite de 16 megapíxeles; recodificará sin metadatos y reducirá a un máximo aproximado de 1.200 px de lado largo, o 512 px para avatar. El objetivo orientativo será menos de 250 KB por imagen de regalo y 100 KB por avatar, sin degradar su utilidad.

La prueba temprana elegirá una herramienta compatible con los límites de CPU y memoria de Edge. Si se requiere el transporte alternativo de Vercel, se evaluará concentrar allí solo el procesamiento binario necesario, manteniendo autorización y Storage en Supabase. No se dará por válida una comprobación de extensión/MIME como sustituto de decodificación. Referencia operativa: [límites de Edge Functions](https://supabase.com/docs/guides/functions/limits).

### 13.2 Asociación y limpieza

1. El servidor verifica token y participante antes de leer una carga grande.
2. Normaliza y sube el objeto con un nombre nuevo; registra su pertenencia y estado pendiente.
3. Guardar el perfil/regalo valida esa pertenencia y vincula la nueva imagen en una transacción SQL.
4. Solo después de confirmar se elimina la imagen anterior si no está referenciada.
5. Si falla el guardado, la imagen previa sigue válida; la carga pendiente se limpia posteriormente.

Storage y PostgreSQL no comparten una transacción: se implementarán compensaciones y un comando seguro que elimine pendientes con más de 24 horas y objetos huérfanos. Si falla un borrado, quedará registrado para reintento. Eliminar participantes invalidará sus permisos inmediatamente; la eliminación de sus archivos se completará con ese mismo procedimiento. No se borrarán URLs ajenas.

### 13.3 URLs externas

Se aceptarán enlaces HTTPS públicos, sin credenciales ni host/IP internos evidentes. Se visualizarán como imágenes, nunca como HTML o iframe, con `referrerPolicy="no-referrer"`. Se validará su carga y se ofrecerá fallback, sin prometer permanencia ni disponibilidad. La CSP permitirá imágenes HTTPS externas por este requisito, además de los recursos propios y previews blob.

No se copiará automáticamente la imagen remota a Storage ni se descargará desde servidor para «validarla»: eso crearía otra superficie SSRF. Si el usuario desea conservarla, podrá subir un archivo permitido. Las imágenes externas dependen del proveedor y pueden revelar su IP al servidor de la imagen; se recomienda la carga propia para fotografías personales.

No se guardarán base64 ni binarios en PostgreSQL. Los recursos tendrán dimensiones reservadas, carga diferida fuera del primer viewport y tamaños adecuados al contexto.

## 14. Validaciones y errores contemplados

| Dato / operación | Regla y respuesta |
| --- | --- |
| Nombre, título y mensajes | Trim, límites de sección 7, Unicode permitido, texto plano; no `dangerouslySetInnerHTML`. |
| Slug | Formato permitido, unicidad y resolución explícita de colisiones. |
| UUID y posición | UUID válido y entero 1–3; el propietario se deriva o verifica con el token. |
| Precio | Decimal válido con máximo dos decimales, no negativo ni infinito; normalización del separador local sin coerciones ambiguas. |
| Moneda | Código admitido; PEN inicial. Precio importado sin moneda requiere revisión. |
| URL | Parser URL, HTTPS, sin credenciales; rechazar `javascript:`, `data:`, `file:` y variantes. |
| Detalles | Objeto JSON acotado, claves por tipo y texto por campo; arrays pequeños para colores alternativos. |
| Imágenes | Comprobaciones de sección 13, referencia perteneciente al participante y fallback. |
| Payload | JSON ordinario máximo 32 KiB; multipart sujeto al límite propio de archivos. |
| Tipo de regalo | Solo valores permitidos; eliminar del payload campos del tipo inactivo. |
| Token | Longitud/formato, hash, rol, pertenencia, revocación y vencimiento en servidor. |
| Cambio concurrente | Versión esperada; 409 sin pérdida del borrador. |
| Petición repetida | Guardado por posición y restricciones; alta/rotación deshabilitan doble envío y revalidan estado ante timeout. |

Los errores de proveedor se traducirán a mensajes útiles. Un fallo de carga no publicará una imagen rota, y un fallo de importación no impedirá guardar manualmente. La inexistencia de un registro se distinguirá de falta de red. El servidor aplicará las mismas reglas aunque se omita completamente el frontend.

## 15. Riesgos técnicos, límites y rendimiento

| Riesgo | Tratamiento y límite residual |
| --- | --- |
| Enlace privado reenviado o filtrado | Fragmento, memoria, URLs públicas limpias, logs redactados y revocación. Quien posee el enlace sigue pudiendo editar. |
| Error en backend privilegiado | Validación central, campos permitidos, autorización transaccional y pruebas entre dos participantes. |
| DNS rebinding o redirección interna | Transporte con conexión a IP validada; prueba temprana y alternativa acotada. No abrir importación insegura. |
| Tiendas dinámicas, anti-bot o metadatos incorrectos | No ejecutar JS ni eludir bloqueos; revisión de datos y alternativa manual. |
| Recodificación incompatible con Edge | Medir en runtime real antes de construir el flujo de carga; no añadir una dependencia pesada sin justificarla. |
| Dependencia de imágenes externas | Fallback estable y opción de subir archivo; no garantía de hotlink. |
| Concurrencia entre organizador y participante | Control de versión y conflictos explícitos. |
| Desajuste entre Storage y DB | Estados pendientes, compensaciones y limpieza verificable. |
| Cuotas, suspensión o costes del proveedor | Verificar condiciones reales al desplegar, límites de uso y alertas; no prometer operación gratuita permanente. |
| Pérdida de datos o acceso del organizador | Exportación de base y archivos, prueba de restauración y bootstrap seguro. Los backups de DB no deben asumirse como respaldo de los binarios de Storage. |

Metas de rendimiento propuestas, a comprobar sobre build de producción: LCP ≤ 2,5 s y CLS ≤ 0,1 en una prueba móvil controlada; bundle inicial JS objetivo ≤ 200 KB gzip, sin contar rutas privadas diferidas. Son presupuestos de diseño, no mediciones ya obtenidas ni garantías sobre cualquier conexión.

Se cargarán de forma diferida administración, editor y utilidades que no necesite el catálogo. Ilustraciones locales ligeras, imágenes con tamaño reservado y sin video de fondo. Sin polling, búsquedas complejas, realtime ni cachés distribuidas. Los 11 participantes y hasta 33 regalos permiten consultas simples; se revisarán consultas repetidas antes de introducir una biblioteca de caché.

## 16. Despliegue en Supabase y Vercel

### 16.1 Desarrollo y Supabase

1. Tras aprobar el plan, verificar Node compatible, gestor de paquetes, Supabase CLI y runtime de pruebas. Desarrollo local con Supabase cuando Docker esté disponible; en su defecto, proyecto de desarrollo separado.
2. Fijar versiones, lockfile y configuración. Crear migraciones reproducibles y ejecutar pruebas de esquema/RLS.
3. Crear el proyecto Supabase de producción solo durante la fase de despliegue. Aplicar migraciones y configuración del bucket. No ejecutar reset ni seed de prueba sobre producción.
4. Desplegar funciones con configuración de autenticación personalizada explícita; configurar secretos, dominios permitidos y límites.
5. Generar el primer enlace de organizador mediante bootstrap; comprobar que no aparece en tablas públicas, archivos del proyecto o logs.
6. Cargar datos ficticios solamente en demo/desarrollo. Incorporar participantes reales desde el panel cuando esté validado.

### 16.2 Frontend en Vercel

1. Importar el repositorio, configurar build de Vite y salida `dist`.
2. Añadir únicamente variables públicas de frontend; las previews usarán Supabase de desarrollo, nunca producción por omisión.
3. Configurar rewrite SPA hacia `index.html` para rutas de aplicación, respetando assets y cualquier endpoint servidor condicional. La documentación de [Vite en Vercel](https://vercel.com/docs/frameworks/frontend/vite) advierte que las rutas profundas necesitan esa configuración.
4. Aplicar cabeceras de seguridad y revisar CSP en el navegador. Configurar dominio final y CORS exacto en Supabase.
5. Probar una ruta de perfil abierta directamente, recarga del editor, uso desde móvil y errores de acceso.
6. Ejecutar pruebas de aceptación con dos participantes y un organizador en un entorno aislado. Publicar cuando pasen las comprobaciones requeridas.

### 16.3 Variables previstas

| Ámbito | Variables o secretos |
| --- | --- |
| Frontend, públicos | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_APP_URL`. |
| Edge, solo servidor | URL y credencial privilegiada provistas/configuradas en el entorno Supabase; `APP_ALLOWED_ORIGINS`, `APP_BASE_URL`, `RATE_LIMIT_HMAC_SECRET`. |
| Importador | Límites y, si se decide restringir tiendas, `IMPORT_ALLOWED_HOSTS`; preferir constantes versionadas para valores no secretos. |
| Bootstrap y mantenimiento | Credencial de servidor/DB en entorno seguro y temporal, nunca prefijo `VITE_`. |
| Alternativa condicional Vercel | `FETCH_PROXY_URL` y secreto de firma exclusivamente entre servidores, si la prueba de Edge lo exige. |

El `.env.example` contendrá marcadores y comentarios, nunca valores reales. Los nombres definitivos de claves privilegiadas se ajustarán al mecanismo vigente del proyecto Supabase; los secretos personalizados no usarán el prefijo reservado `SUPABASE_`.

### 16.4 Operación mínima

README con instalación, variables, migración, seed, creación/rotación de enlaces y recuperación del organizador. Documentar limpieza de archivos, exportación y restauración por separado de DB y Storage, y despliegue/rollback del frontend.

Las migraciones serán incrementales y compatibles con un despliegue ordenado backend → frontend. Un rollback de frontend no revertirá automáticamente datos. Antes de migraciones destructivas futuras se requerirá respaldo y un procedimiento concreto de recuperación.

No se solicitarán credenciales para revisar este plan. La fase 2 identificará acceso a proyectos, dominio final y nombres/fotos reales cuando resulten necesarios para configurar y publicar.

## 17. Tareas de implementación y dependencias

Cada tarea debe producir un resultado pequeño revisable. No se iniciará ninguna hasta aprobar este plan.

| ID | Tarea | Depende de | Resultado y comprobación de salida |
| --- | --- | --- | --- |
| T00 | Registrar aprobación, supuestos y decisiones finales | Aprobación del usuario | Alcance confirmado; discrepancias actualizadas en este plan. |
| T01 | Probar transporte seguro y procesamiento de imágenes en runtime | T00 | DNS fijado/TLS, redirecciones y límites demostrados; codec medido; decisión Edge o alternativa documentada. |
| T02 | Inicializar React, TS, Vite, Tailwind y rutas | T00 | Build mínimo reproducible, lockfile y separación de carpetas. |
| T03 | Definir tipos y validadores de dominio | T02 | Casos válidos e inválidos cubiertos para regalos, URLs y precios. |
| T04 | Crear esquema, restricciones e índices | T03 | Migración sobre base vacía; posiciones duplicadas/cuarta opción rechazadas. |
| T05 | Configurar grants, RLS, RPC y Storage | T04 | Lectura pública autorizada y escritura directa denegada; secretos inaccesibles. |
| T06 | Preparar seed de 11 participantes | T04 | Datos repetibles con listas vacías, parciales y completas. |
| T07 | Implementar tokens y bootstrap | T05 | Emisión, validación, revocación, rotación y recuperación verificadas. |
| T08 | Implementar mutaciones de perfil y regalos | T03, T07 | Permisos por propietario, validación y control de versión probados. |
| T09 | Crear tokens visuales y componentes accesibles básicos | T02 | Tipografía, botones, campos, focos, diálogo y feedback consistentes. |
| T10 | Construir bienvenida, tarjetas y catálogo real | T06, T09 | Cuadrícula 3/2/1, once tarjetas y estados de carga/error/vacío. |
| T11 | Construir perfil público y sus tres posiciones | T10 | Regalos, pendientes y preferencias correctos por slug. |
| T12 | Integrar acceso privado y navegación protegida | T07, T11 | URL limpiada, permisos en memoria y copia de enlace público. |
| T13 | Construir editor manual y campos por tipo | T08, T09, T12 | CRUD independiente, calzado, errores y borradores conservados. |
| T14 | Implementar carga, asociación y limpieza de imágenes | T01, T05, T08 | Archivo validado, acceso acotado, cambio seguro y limpieza comprobada. |
| T15 | Implementar rate limit atómico | T05, T07 | Cuotas concurrentes, 429 y limpieza de ventanas verificadas. |
| T16 | Implementar transporte y parser de metadatos | T01, T03, T15 | Fixtures JSON-LD/OG, SSRF, límites y fallback; transporte alternativo solo si T01 lo exige. |
| T17 | Integrar vista previa y aplicación selectiva | T13, T16 | Importación no sobrescribe ni guarda sin acción del usuario. |
| T18 | Construir edición de perfil y preferencias | T08, T12, T14 | Foto, mensaje y gustos persistidos; datos ajenos protegidos. |
| T19 | Implementar backend de administración y enlaces | T07, T08, T15 | Altas, cambios, orden, bajas y ajustes con rol de organizador. |
| T20 | Construir panel del organizador | T09, T13, T18, T19 | Recorrido completo de mantenimiento y emisión de enlaces. |
| T21 | Verificar accesibilidad y presentación responsiva | T17, T20 | Teclado, lector, 200 % zoom, móvil, fallbacks y movimiento reducido. |
| T22 | Ejecutar integración y revisión de seguridad | T14–T21 | Matriz de aceptación, ataques a permisos, concurrencia y secretos sin fallos críticos. |
| T23 | Medir rendimiento y corregir problemas observados | T21, T22 | Build, tamaño, consultas y métricas registrados con condiciones de medición. |
| T24 | Completar README, variables y guías operativas | T22, T23 | Instalación reproducible, pruebas manuales, bootstrap y respaldo documentados. |
| T25 | Desplegar staging y después producción | T24 + accesos de infraestructura | Migraciones, rutas, CORS y aceptación en entorno real; entrega del enlace y límites conocidos. |

T01 y T02 son independientes; base de datos y diseño visual pueden avanzar sin depender de las imágenes reales. El orden funcional prioriza lectura pública y edición manual antes de la importación. Si T01 exige una alternativa, se actualizará su decisión técnica antes de extender el servidor, manteniendo el objetivo de mínimo mantenimiento.

## 18. Criterios de aceptación verificables

| ID | Funcionalidad | Prueba y resultado esperado |
| --- | --- | --- |
| A01 | Bienvenida | Abrir `/`: título solicitado, explicación y botón desplazan al catálogo sin pantalla intermedia. |
| A02 | Participantes dinámicos | Seed muestra 11 personas; añadir o eliminar una desde administración cambia el total sin editar código. |
| A03 | Cuadrícula | A 1.280, 768 y 390 px se observan 3, 2 y 1 columnas; sin tarjeta ficticia al final ni scroll horizontal. |
| A04 | Hover y tacto | Desktop revela avatar con nombre legible; teclado obtiene el mismo contenido; móvil muestra avatar y abre con un toque. |
| A05 | Rutas | Perfil directo y recarga funcionan; slug inexistente muestra estado correcto; Atrás devuelve al catálogo. |
| A06 | Tres posiciones | Lista con 0, 1, 2 o 3 registros siempre muestra exactamente tres espacios en orden. |
| A07 | Integridad SQL | Intentar posición 0/4 y duplicar participante/posición falla en base de datos, también con concurrencia. |
| A08 | Crear y editar | Guardar una opción sin completar las otras persiste después de recargar y consultar desde otro navegador. |
| A09 | Limpiar opción | Cancelar confirmación conserva datos; confirmar elimina solo esa opción y mantiene su espacio pendiente. |
| A10 | Tipos y calzado | Ropa y objeto muestran campos apropiados; calzado permite numeración/sistema; solo se persisten detalles activos. |
| A11 | Campos opcionales | Título y tipo bastan para guardar; no se inventan precio, foto ni enlace. |
| A12 | Precio y moneda | PEN se muestra en formato peruano; USD importado conserva USD; cero es válido y negativos/decimales inválidos se rechazan. |
| A13 | Enlaces comerciales | HTTPS válido abre una pestaña segura; protocolos peligrosos y URLs malformadas son rechazados por servidor. |
| A14 | Importación completa | Fixture controlado Product/OG devuelve campos; solo los seleccionados se aplican; nada se guarda hasta confirmar el regalo. |
| A15 | Importación parcial | HTML sin precio o moneda muestra faltantes; manual sigue disponible; datos previos no se pierden. |
| A16 | Tienda no compatible | Simular timeout, 403, captcha y HTML dinámico: mensaje entendible y continuidad manual, sin evasión. |
| A17 | SSRF | Loopback, redes privadas, IPv6 especial, DNS mixto, rebinding y redirección interna se rechazan antes de conectar a destinos prohibidos. Evidencia instrumentada en transporte. |
| A18 | Límites de importación | Exceso de bytes, compresión expansiva, JSON profundo, cuatro redirecciones y timeout abortan con error controlado. |
| A19 | Frecuencia | Peticiones concurrentes desde dos instancias respetan cuota; respuesta 429 incluye espera; no depende de memoria local. |
| A20 | Imágenes | JPEG/PNG/WebP válido se normaliza y persiste; archivo falso, SVG, exceso de peso o píxeles se rechaza. |
| A21 | Referencias y limpieza | Un token no puede adjuntar archivos ajenos; reemplazo fallido conserva anterior; pendientes/huérfanos se limpian sin borrar referencias vigentes. |
| A22 | URL de imagen y fallbacks | URL HTTPS se muestra o produce fallback estable; foto ausente usa avatar y no rompe el layout. |
| A23 | Preferencias | Mensaje y gustos se guardan en el perfil, separados de detalles específicos, y aparecen en lectura pública. |
| A24 | Escrituras públicas | Peticiones directas a tablas, RPC privadas, funciones y Storage sin token o con clave pública no modifican datos. |
| A25 | Aislamiento | Token de Ana intenta modificar UUID, regalo y archivo de Bruno: todas las operaciones fallan sin cambios. |
| A26 | Secreto privado | Revisar bundle, red pública, filas accesibles, URL tras apertura, Referer y logs: no hay claves privilegiadas, hashes ni tokens expuestos a visitantes. |
| A27 | Revocación | Abrir enlace, revocarlo desde organizador y guardar desde la pestaña abierta: servidor rechaza la nueva escritura. |
| A28 | Recuperación | Emitir un enlace reemplaza el anterior; primer organizador y recuperación funcionan sin endpoint público ni contraseña por defecto. |
| A29 | Administración | Crear, renombrar, cambiar foto/orden, editar lista y eliminar persona funciona solo con rol organizador; borrar elimina regalos y revoca acceso. |
| A30 | Evento | Título, bienvenida y fecha opcional persisten; fecha no cambia por zona horaria; no aparece configuración de presupuesto del futuro alcance. |
| A31 | Conflictos y red | Dos editores modifican el mismo registro: el segundo recibe 409 conservando borrador. Fallo de red no anuncia éxito ni duplica altas. |
| A32 | Estados | Carga, cero participantes, pendientes, guardado, error de red, acceso inválido y 404 tienen salida accionable. |
| A33 | Accesibilidad | Recorridos principales completos por teclado, foco visible, diálogo correcto, labels y anuncios; contraste medido y zoom sin pérdida de acciones. |
| A34 | Movimiento y diseño | Movimiento reducido elimina desplazamientos; imágenes rotas y nombres largos no rompen tarjetas; comprobación móvil y desktop. |
| A35 | Rendimiento | Registrar LCP/CLS, peso del build y número de solicitudes; corregir regresiones observadas frente a presupuestos de sección 15. |
| A36 | Despliegue reproducible | Nuevo entorno ejecuta migraciones y seed documentados; perfiles profundos funcionan en Vercel y frontend no requiere secretos privilegiados. |
| A37 | Restauración y mantenimiento | Exportar/restaurar datos y archivos de prueba; ejecutar limpieza y recuperación del organizador según documentación. |
| A38 | Exclusiones | No hay sorteo, asignaciones, reservas, notificaciones, cuentas ni presupuesto configurable accidentalmente incorporados. |

### Estrategia de comprobación

- **Unitarias:** normalización, validación de precios/URLs, detalles por tipo, parser de fixtures, selección de metadatos y clasificación de direcciones. No depender de tiendas en vivo para resultados deterministas.
- **Integración SQL/API:** restricciones, grants/RLS, EXECUTE, tokens, pertenencia, revocación, concurrencia, cuotas y Storage. Ejecutarlas con identidad pública y privilegiada, no solo como administrador.
- **Navegador:** visita pública, enlace privado, guardado manual, importación, carga y tareas de organizador. Recorridos en desktop y viewport móvil.
- **Manual:** teclado, lector de pantalla, zoom, contraste, movimiento reducido, calidad visual, una tienda real accesible y otra no compatible. Registrar qué se comprobó y qué no.
- **Producción:** smoke test con datos controlados después del despliegue; ninguna prueba destructiva sobre listas reales.

### Entregables y cierre de fase

La fase 1 entrega únicamente `implementation_plan.md`. No se han creado código, migraciones, datos reales ni infraestructura.

La fase 2 entregará código organizado, README, `.env.example`, migraciones SQL, seed de once participantes, configuración RLS/Storage, funciones protegidas, interfaz responsiva, guías de Supabase/Vercel y resultados de pruebas. El MVP estará completo cuando los criterios funcionales y de seguridad pasen y se documenten las limitaciones externas observadas.

La implementación queda pendiente de la revisión y aprobación explícita de este plan.
