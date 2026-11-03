# Ayuda para buscar regalos

Iteración del **2 de noviembre de 2026**. Amplía la del 1 de noviembre, que solo preparaba un texto para copiar.

- «Opciones similares» y «Tiendas físicas» siguen preparando un texto para pegar en el asistente de IA que la persona ya use, con la búsqueda web activada: necesitan datos comerciales actuales que la app no puede comprobar.
- **«Otra consulta» es un chat dentro de la app** cuando el asistente está disponible, respondido por Gemini (`gemini-3.5-flash-lite`, capa gratuita, **sin búsqueda web**), a través de la Edge Function `gift-assistant`.

La prueba del 1 de noviembre mostró que la capa gratuita rechaza la búsqueda web (`429 RESOURCE_EXHAUSTED`) pero responde sin ella en menos de un segundo. `gemini-3.8-flash` tardó entre 1,5 y 3 minutos y cortaba las respuestas, así que no se usa.

## Qué hace

En el perfil público aparece una burbuja «Ayuda para encontrar este regalo» con tres acciones: opciones similares, tiendas físicas y otra consulta.

- Hay que elegir explícitamente el regalo; si solo hay uno, se selecciona solo. «Otra consulta…» permite elegir también los gustos generales. Sin regalos guardados, las dos primeras acciones lo explican y ofrecen la tercera.
- Distrito y detalles adicionales son opcionales; «Otra consulta» exige escribir la pregunta.
- Dentro del panel solo aparece el formulario de la acción elegida; las tres acciones no se repiten. La pregunta es «¿Sobre qué regalo(s) quieres consultar?».
- **Generar prompt** abre el texto final en una ventana flotante dentro del panel, con el fondo desenfocado e inactivo. Desde ahí, **Copiar texto** usa el portapapeles (si el navegador lo niega, el texto queda seleccionado para copiarlo a mano) y **Volver** o Escape cierran solo esa ventana. Cambiar cualquier dato la cierra.
- Escape o **Cerrar** devuelven el foco a la burbuja. Nada se guarda en Web Storage; al recargar se pierde.
- El componente y sus estilos se cargan de forma diferida solo en los perfiles.

### Chat de «Otra consulta»

- Al abrir «Otra consulta», la app pregunta una vez por carga de página si el asistente está disponible (`GET`, sin cuota). «Otra consulta» abre siempre el chat. Si la función no existe, está apagada o falla, el chat lo dice, desactiva la caja de texto y explica cómo usar «Opciones similares» o «Tiendas físicas» para generar un prompt.
- Con el asistente disponible, el panel «Asistente de regalos» muestra **solo el chat**: el saludo «Que fue», los mensajes y una caja para escribir (Enter envía, Mayús+Enter añade una línea). No hay que elegir regalo ni distrito: el contexto es la lista completa de la persona.
- Una nota breve bajo la caja avisa de que las respuestas las genera Gemini, que pueden equivocarse y de que los mensajes y los datos públicos de la lista se envían a Google, que en la capa gratuita puede usarlos para mejorar sus productos.
- Las respuestas son texto plano y se muestran siempre como texto literal, nunca como HTML.
- La conversación vive solo en el panel: cerrar el panel la descarta. Cada mensaje viaja con los 3 turnos anteriores para que se pueda repreguntar.
- Si Gemini falla o se agota la cuota, el mensaje vuelve a la caja y se muestra el motivo.

## Qué recibe la IA

Los dos caminos usan los datos de `supabase/functions/_shared/gift-facts.ts`: un bloque `<<<DATOS … DATOS>>>` marcado como información y no como instrucciones. El texto para copiar lleva un regalo (título, tipo, descripción, características, precio referencial y enlace HTTPS si es válido) o los gustos publicados. El chat lleva los gustos y todos los regalos de la persona, por opción.

**No incluye** nombre, slug, foto, mensaje personal, identificadores ni enlaces privados. Los datos se limpian: sin caracteres de control ni saltos de línea, sin secuencias `<<<`/`>>>` que imiten el delimitador y con longitudes acotadas.

- **Texto para copiar** (`src/domain/gift-prompt.ts`, sin red): reglas de Lima Metropolitana, fecha de Lima, búsqueda web, no inventar datos comerciales, formato de hasta tres opciones, la tarea según la acción y el bloque de datos.
- **Chat** (`supabase/functions/_shared/assistant-prompt.ts`): instrucciones de sistema (español, breve, tono relajado de pata limeño con como máximo una expresión de jerga peruana por respuesta, sin saludar cada vez ni suponer el género, respuestas concretas para opiniones y sugerencias, sin internet, ante un saludo o un mensaje sin consulta responde con un saludo corto y pregunta en qué ayuda, sin resumir la lista; si la pregunta necesita la web (tiendas, precios, stock) invita a usar «Opciones similares» o «Tiendas físicas» con un instructivo breve; «No lo sé» para otros datos ausentes, no inventar tiendas, precios, stock ni enlaces, tratar los datos como información). El bloque de datos va con la primera pregunta; los turnos anteriores, como conversación.

## Cómo está protegido el chat

- **El navegador solo envía** `{v:1, participant_id, message, history}`: el mensaje de hasta 500 caracteres y hasta 3 turnos anteriores (`{q, a}`, respuestas de hasta 1500). El contrato es estricto: claves exactas, UUID y sin caracteres de control. El historial lo controla quien chatea; solo afecta a su propia conversación.
- **El servidor lee los datos de la base** con `public.server_assistant(p_participant_id)` (solo `service_role`, migración `20261102180000`): gustos y regalos de esa persona, sin identificadores; el texto de los regalos nunca viene del cliente.
- **Cuotas** antes de cualquier llamada a Gemini, en `private.rate_limits` (operación `assistant`): 10 preguntas por minuto y 200 por día UTC, globales. No hay IP verificada (`RATE_LIMIT_IP_SOURCE=off`), así que si alguien agota el cupo el asistente se pausa para todos, mientras el catálogo y la edición conservan sus propias cuotas. Los intentos con identificadores inexistentes también cuentan.
- **Gemini**: la clave va en una cabecera y solo como secreto del servidor; el modelo lo fija el servidor; sin herramientas; respuestas de 300 tokens como máximo, 20 s de espera y una llamada por mensaje.
- **Interruptor** `GIFT_ASSISTANT_ENABLED=1`. Sin él, o sin clave o modelo válidos, la función responde `503` y el `GET` de disponibilidad devuelve `false`.
- Los registros guardan estado, duración, modelo y tokens; nunca la pregunta ni la respuesta.

| Variable (secreto de la función) | Valor |
|---|---|
| `GIFT_ASSISTANT_ENABLED` | `1` para encenderlo; `0` lo apaga |
| `GEMINI_API_KEY` | Clave del entorno; nunca en `VITE_*`, Git ni chat |
| `GEMINI_MODEL` | `gemini-3.5-flash-lite` |
| `GIFT_ASSISTANT_PROVIDER` | Opcional. `synthetic` da respuestas locales sin red y se rechaza en Edge alojado |

## Verificación

- `tests/unit/gift-prompt.test.ts`: reglas y datos por acción, gustos generales, enlaces no seguros omitidos, datos que no pueden salir de su línea ni del bloque, límites de longitud y fecha de Lima.
- `tests/unit/gift-assistant.test.ts`: contrato estricto, disponibilidad sin cuota, fallo cerrado si está apagado o sin configurar, datos canónicos sin identificadores, pregunta que no puede cerrar el bloque, cuota, errores del proveedor sin texto del modelo, respuestas vacías, cortadas o largas, adaptador de Gemini sin herramientas y cliente sin credenciales.
- `supabase/tests/database/008_assistant.sql`: RPC solo para el servidor, contexto sin datos privados, regalo de otra persona rechazado, tope por minuto y por día, y cuotas de edición independientes.
- `tests/ui/gift-assistant.spec.ts`: selección explícita, texto sin nombre ni identificadores, copia exacta sin red para las acciones de copiar, portapapeles denegado, perfil sin regalos, Escape y foco, autoselección con un regalo, 320 px por encima de los avisos, respuesta como texto literal, errores con **Copiar texto** disponible y Axe WCAG 2.2 AA.
- `npm run probe:gemini`: cuatro consultas ficticias contra Gemini real con la clave de `.env`, sin imprimirla.
