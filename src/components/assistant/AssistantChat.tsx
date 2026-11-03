import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { LoaderCircle, Send } from 'lucide-react';
import { ASSISTANT_LIMITS, type AssistantTurn } from '../../../supabase/functions/_shared/assistant-contract';
import { askGiftAssistant, AssistantError, type AssistantErrorKind } from '../../services/gift-assistant';
import { Button } from '../ui/Button';

const GREETING = 'Que fue';
const failures: Record<AssistantErrorKind, string> = {
  invalid: 'Revisa tu mensaje: hasta 500 caracteres y sin caracteres especiales.',
  missing: 'Esta persona ya no está disponible. Recarga la página.',
  rate: 'Hay muchas consultas en este momento. Espera un minuto antes de volver a escribir.',
  unavailable: 'El asistente no está disponible en este momento.',
  provider: 'No pudimos obtener una respuesta. Inténtalo de nuevo en unos instantes.',
  offline: 'Parece que no hay conexión. Revísala e inténtalo de nuevo.',
};
type Message = { role: 'user' | 'assistant'; text: string };

// Chat about one person's whole public wishlist. The conversation lives only in this component:
// closing the panel discards it. The last turns travel with each message so follow-ups make sense.
// When the assistant is switched off the chat still opens, explains it and points to the prompt actions.
export function AssistantChat({ participantId, available }: { participantId: string; available: boolean }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const log = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const request = useRef<AbortController | null>(null);
  const ids = { field: useId(), note: useId() };
  const text = draft.trim();
  const tooLong = text.length > ASSISTANT_LIMITS.message;

  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => { if (available) field.current?.focus(); else log.current?.focus(); }, [available]);
  // Keep the newest message in view inside the scrolling log.
  useEffect(() => { log.current?.lastElementChild?.scrollIntoView({ block: 'nearest' }); }, [messages, pending, error]);

  async function send(event?: FormEvent) {
    event?.preventDefault();
    if (!available || !text || tooLong || pending) return;
    const history: AssistantTurn[] = [];
    for (let i = 0; i + 1 < messages.length; i += 2) history.push({ q: messages[i].text, a: messages[i + 1].text.slice(0, ASSISTANT_LIMITS.historyAnswer) });
    const controller = new AbortController(); request.current = controller;
    setMessages((current) => [...current, { role: 'user', text }]); setDraft(''); setError(''); setPending(true);
    try {
      const answer = await askGiftAssistant({ v: 1, participant_id: participantId, message: text, history: history.slice(-ASSISTANT_LIMITS.turns) }, controller.signal);
      setMessages((current) => [...current, { role: 'assistant', text: answer }]);
    } catch (failure) {
      if (controller.signal.aborted) return;
      const kind = failure instanceof AssistantError ? failure.kind : 'provider';
      // The unanswered message goes back to the field so it can be sent again.
      setMessages((current) => current.slice(0, -1)); setDraft(text);
      // Waits longer than a minute only come from the daily cap.
      setError(kind === 'rate' && failure instanceof AssistantError && failure.retryAfter > 60 ? 'El asistente llegó a su límite de mensajes por hoy.' : failures[kind]);
    } finally {
      if (request.current === controller) { request.current = null; setPending(false); field.current?.focus(); }
    }
  }
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends; Shift+Enter keeps a new line.
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); }
  }

  return <div className="assistant-chat">
    <div ref={log} className="assistant-chat__log" tabIndex={-1} role="log" aria-label="Conversación con el asistente" aria-live="polite">
      <p className="assistant-bubble assistant-bubble--assistant">{GREETING}</p>
      {!available && <p className="assistant-bubble assistant-bubble--assistant">Ahorita el chat no está disponible. Mientras tanto, cierra este panel, toca la burbuja y elige «Opciones similares» o «Tiendas físicas»: marcas el regalo, tocas «Generar prompt» y lo pegas en ChatGPT, Gemini o Claude con la búsqueda web activada.</p>}
      {messages.map((message, index) => <p key={index} className={`assistant-bubble assistant-bubble--${message.role}`}>
        {message.role === 'assistant' && <span className="sr-only">Asistente: </span>}{message.text}</p>)}
      {pending && <p className="assistant-bubble assistant-bubble--assistant assistant-bubble--typing"><LoaderCircle aria-hidden="true" className="spinner" />Escribiendo…</p>}
      {error && <p className="assistant-chat__error" role="alert">{error}</p>}
    </div>
    <form className="assistant-chat__compose" onSubmit={(event) => void send(event)}>
      <label className="sr-only" htmlFor={ids.field}>Tu mensaje</label>
      <textarea ref={field} id={ids.field} className="field__control assistant-chat__field" value={draft} rows={2} maxLength={ASSISTANT_LIMITS.message}
        placeholder="Escribe tu pregunta…" disabled={!available} aria-describedby={ids.note} onChange={(event) => setDraft(event.target.value)} onKeyDown={onKeyDown} />
      <Button type="submit" className="button--icon assistant-chat__send" aria-label="Enviar" title="Enviar" disabled={!available || !text || tooLong}
        aria-disabled={pending || undefined}><Send aria-hidden="true" /></Button>
    </form>
    <p id={ids.note} className="assistant-chat__note">Respuestas generadas por IA con Google Gemini; pueden equivocarse. Tus mensajes y los datos públicos de esta lista se envían a Google, que puede usarlos para mejorar sus productos.</p>
  </div>;
}
