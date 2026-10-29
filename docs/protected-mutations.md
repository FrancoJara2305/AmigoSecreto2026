# T08 — Edición protegida de perfiles y regalos

El backend de T08 se implementó y validó exclusivamente en Supabase local. T13 ya conecta el [editor manual de regalos](gift-editor.md); la edición visual del perfil sigue en T18.

## Alcance entregado

- Actualizar avatar, referencia de foto, mensaje y preferencias generales del participante.
- Crear, editar y limpiar cada una de las tres posiciones de regalo independientemente.
- Un token personal actúa solo sobre su participante; el organizador puede actuar sobre todos, dentro de estos mismos campos permitidos.
- Validación de tipo de regalo, detalles contextuales, moneda, precio, enlaces e imágenes de referencia.
- Control de versiones, identidad del registro y transacciones. Un conflicto devuelve 409 y conserva los datos ya confirmados.

El alta/baja, nombre, slug y orden de participantes corresponden a T19. No se implementan aquí sus endpoints administrativos. El upload binario y la eliminación física de archivos corresponden a T14; importar tiendas corresponde a T16/T17. No se crean cuentas de Auth.

## Ejecución local

Las migraciones de T08 ya se aplicaron al contenedor local. Para repetir la preparación en otro entorno de desarrollo:

```powershell
npm run supabase -- start
npm run supabase -- migration up --local
npm run functions:local
```

La función `wishlist-api` atiende en `http://127.0.0.1:54321/functions/v1/wishlist-api`. Se usa el enlace/token de T07; el bootstrap y recuperación se documentan en [private-access.md](private-access.md).

No se ha vinculado, migrado ni desplegado el proyecto remoto. No ejecutar `db push` ni comandos `--linked` para probar esta iteración.

## Contrato HTTP

POST JSON con `X-Edit-Token` y `Content-Type: application/json`. Sin tokens en URL o cuerpo. Orígenes exactos, respuestas `no-store`, límite de cuerpo de 32 KiB y timeout de la RPC interna de 5 segundos. Las acciones de T07 conservan el límite original de 4 KiB.

| Acción | Datos requeridos | Datos editables | Respuesta |
| --- | --- | --- | --- |
| `update_profile` | `participant_id`, `expected_version`, `profile` | `photo_url`, `photo_path`, `avatar_key`, `personal_message`, `general_preferences` | 200, `participant` actualizado. |
| `create_gift` | `participant_id`, `position`, `gift` | `title` y `gift_type` obligatorios; restantes opcionales | 201, `gift` con UUID y versión 1. |
| `update_gift` | `participant_id`, `position`, `gift_id`, `expected_version`, `gift` | Parche de los campos del regalo | 200, `gift` con nueva versión. |
| `delete_gift` | `participant_id`, `position`, `gift_id`, `expected_version` | Sin payload de regalo | 200, `deleted` con id/posición. |

Ejemplo de creación (identificadores ilustrativos; el token va en el encabezado):

```json
{
  "action": "create_gift",
  "participant_id": "11111111-1111-4111-8111-000000000001",
  "position": 1,
  "gift": {
    "title": "Polo de algodón",
    "gift_type": "clothing",
    "reference_price": "59,90",
    "currency": "PEN",
    "details": { "subtype": "polo", "size": "M", "color": "Azul" }
  }
}
```

Campos del regalo: `title`, `description`, `image_url`, `image_path`, `product_url`, `reference_price`, `currency`, `gift_type`, `details`. No se aceptan id, propietario, versión ni timestamps dentro de `gift` o `profile`. Los campos desconocidos se rechazan en Edge y en SQL.

Actualizar un parche no modifica campos omitidos. Los textos opcionales pueden limpiarse con `null`. Cambiar `gift_type` sin enviar `details` elimina las características del tipo anterior; si se proporcionan detalles explícitos, deben corresponder al tipo final. Cuando el parche de detalles no indica tipo, SQL los valida contra el tipo actual del registro.

## Validaciones y errores

Las reglas puras están en `supabase/functions/_shared/mutation-validation.ts`, sin acceso a red, entorno ni credenciales. `src/domain/mutation-validation.ts` las reexporta y el editor T13 las reutiliza antes del envío. No se añadió una biblioteca de validación ni otra dependencia.

- Precio decimal no negativo, hasta dos decimales y límite compatible con `numeric(12,2)`. Se acepta número JSON o texto con punto/coma decimal; se rechazan miles ambiguos, NaN, infinito y precisiones excesivas. Se normaliza a texto decimal para SQL y no se permite redondear silenciosamente una tercera cifra. Cero y ausencia de precio son válidos. PEN por defecto al crear; no hay conversiones automáticas de moneda.
- Título y tipo obligatorios al crear. Ropa/objetos con claves y longitudes acotadas. Calzado permite talla y sistema; colores alternativos hasta ocho. `details` es un objeto de hasta 8 KiB, sin valores anidados arbitrarios.
- URLs HTTPS públicas sintácticamente válidas, sin userinfo, puertos no admitidos, IPs literales, hosts locales evidentes, protocolos ejecutables o backslashes. Estas URLs solo se almacenan; no se descargan. No se presenta esta comprobación como solución SSRF para el futuro importador.
- Los límites de texto coinciden con el esquema, contando caracteres Unicode en las validaciones de dominio. Texto de usuario se trata como texto plano, sin renderizar HTML.
- Versiones positivas y posiciones enteras del 1 al 3. El servidor exige id de regalo para actualizar/eliminar y no lo deriva solo de una posición.

La respuesta 422 contiene `error.code`, mensaje y, si lo detectó el validador de dominio, `error.fields` con errores por campo. Las restricciones SQL siguen siendo autoritativas para datos y referencias reales; un fallo de SQL se traduce a un error controlado, sin consultas ni trazas en la respuesta.

401 indica token desconocido, expirado o revocado; 403 ámbito o archivo no permitido; 404 registro no encontrado; 409 conflicto de versión, identidad o posición; 429 cuota; 503 fallo de transporte/servidor. Los cuerpos inválidos o demasiado grandes se rechazan antes de mutar.

## Transacciones y concurrencia

`public.server_mutate` es un puente exclusivamente para service_role, SECURITY INVOKER y `search_path` fijo. `anon`/`authenticated` no tienen EXECUTE ni escrituras de tablas. No se expone `private`. La RPC llama a `private.require_access` **dentro de la misma transacción que guarda**: no confía en una validación HTTP anterior ni en una bandera de administrador del cliente.

Orden de bloqueo: cuota → credencial compartida → participante → regalo → archivos registrados. Se vuelve a comprobar expiración después de esperar al participante. El bloqueo por participante mantiene coherentes las asociaciones de imágenes y las posiciones; cada perfil/regalo conserva su propia versión. Editar un regalo no incrementa por sí solo la versión del perfil.

- Perfil: se compara la versión esperada antes de actualizar.
- Alta de regalo: exige posición libre; nunca se usa un upsert que sobrescriba una opción existente.
- Edición/eliminación: se verifican participante, posición, UUID y versión. El control de UUID impide que una pestaña antigua borre una nueva fila creada en la misma posición y con versión inicial 1.
- Si falla cualquier comprobación, los cambios de aplicación y estado de medios se revierten juntos. Los contadores de frecuencia sí conservan el intento fallido.

Ante 409, el futuro formulario debe conservar el borrador y permitir revisar la versión actual. Ante pérdida de respuesta o error de red, **no reenviar automáticamente**: la transacción puede haberse confirmado. Primero consultar el estado actual y resolver el conflicto. T08 no introduce guardado optimista que afirme éxito antes de confirmación.

La confirmación visual de limpiar un regalo ya se implementó en T13. El servidor exige el UUID y la versión exactos y solo borra esa fila; la interfaz conserva su posición pendiente.

Referencias de los mecanismos utilizados: [funciones de Supabase](https://supabase.com/docs/guides/database/functions) y [bloqueos de PostgreSQL](https://www.postgresql.org/docs/current/explicit-locking.html).

## Imágenes y archivos

Una URL nueva limpia de forma atómica la referencia de archivo anterior; un archivo nuevo limpia la URL. Si se envían ambas fuentes no nulas, se rechaza. La ruta debe pertenecer a `participant_id` y existir en `private.media_assets`; una ruta conocida de otra persona no concede acceso. Las claves foráneas del esquema siguen siendo una segunda barrera.

Después de guardar o limpiar se recalcula el estado `attached`/`pending` de los archivos registrados de esa persona según las referencias reales. No se eliminan bytes ni filas de Storage desde estas funciones. T14 añadirá subida, normalización, compensaciones y limpieza, comprobando referencias antes de cualquier eliminación.

## Frecuencia y límites

Como protección mínima de las nuevas escrituras se añaden cuotas atómicas: 60 intentos por minuto y hash, y 240 por minuto para todo el evento. Se separan de las cuotas de T07 mediante `operation='mutation'`. Un rechazo por credencial o datos también consume cuota. Se devuelve `Retry-After` al agotarla; no se confía en IPs enviadas por el cliente.

Esto adelanta el límite imprescindible de mutaciones. T15 aún debe completar cuotas de importación/archivos y la estrategia general de mantenimiento de contadores.

## Pruebas y migraciones

```powershell
npm test
npm run build
npm run test:db:local
npm run test:mutations:concurrency
npm run test:mutations:http
```

Las dos últimas requieren Docker y Supabase local; HTTP requiere `npm run functions:local` en otra terminal. No aceptan URL de DB ni proyecto remoto. Las identidades temporales se limpian al finalizar y no se imprimen tokens ni claves. El contrato SQL se ejecuta en transacciones con ROLLBACK; usar solo el entorno local aislado.

Se verificaron dos ediciones simultáneas con una misma versión (una gana y la otra recibe 409), dos altas sobre la misma posición (una sola fila) y revocación mientras una escritura mantiene el bloqueo de autorización (la revocación espera y las nuevas escrituras devuelven 401). También se verificó el ciclo completo por HTTP real en Edge/Deno y la persistencia por consulta independiente de PostgreSQL.

Migraciones nuevas:

- `20261027103637_protected_wishlist_mutations.sql`: funciones de normalización, referencias y mutación protegida.
- `20261027104406_correct_mutation_helper_volatility.sql`: corrige la clasificación del normalizador a STABLE, conforme a los constructores JSON usados; se conserva intacta la migración ya aplicada.

El lint local pasó con `--fail-on warning`; los asesores de seguridad no reportaron problemas. La comprobación del sitio compilado sigue pasando. La interfaz React continúa preparatoria: el próximo bloque es T09, componentes visuales y accesibilidad.
