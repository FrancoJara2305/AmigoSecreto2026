import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { Copy, LoaderCircle, MapPin, MessageCircle, Search, Sparkles, Store, X } from 'lucide-react';
import type { Gift } from '../../domain/database.types';
import { buildGiftPrompt, limaToday, PROMPT_LIMITS, type PromptIntent } from '../../domain/gift-prompt';
import { loadAssistantAvailability } from '../../services/gift-assistant';
import { AssistantChat } from './AssistantChat';
import { Button } from '../ui/Button';
import { Notice } from '../ui/Feedback';
import { useToast } from '../ui/ToastNotifications';
import '../../styles/assistant.css';

const intents: { value: PromptIntent; label: string; short: string; icon: typeof Search }[] = [
  { value: 'similar', label: 'Mostrar opciones similares para este regalo', short: 'Opciones similares', icon: Search },
  { value: 'stores', label: 'Mostrar tiendas físicas con este producto', short: 'Tiendas físicas', icon: Store },
  { value: 'other', label: 'Otra consulta…', short: 'Otra consulta', icon: MessageCircle },
];
const GENERAL = 'general';

// One availability check per page load, made only when "Otra consulta" opens. The server switch
// still decides every message; a missing function or any failure keeps the copy-text form.
let availability: Promise<boolean> | null = null;
const checkAvailability = () => availability ??= loadAssistantAvailability(new AbortController().signal).catch(() => false);

// Prepares a request for the person's own AI assistant to copy. When the gift assistant is available,
// "Otra consulta" is instead a chat answered by the gift-assistant Edge Function.
export function GiftAssistant({ participant, gifts }: { participant: { id: string; name: string; general_preferences: string | null }; gifts: Gift[] }) {
  const notify = useToast();
  const [view, setView] = useState<'closed' | 'menu' | 'panel'>('closed');
  const [intent, setIntent] = useState<PromptIntent>('similar');
  const [targetId, setTargetId] = useState<string | null>(null);
  const [district, setDistrict] = useState('');
  const [message, setMessage] = useState('');
  const [manual, setManual] = useState(false);
  const [lift, setLift] = useState(0);
  const [chatAvailable, setChatAvailable] = useState<boolean | null>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const output = useRef<HTMLTextAreaElement>(null);
  const previousView = useRef(view);
  const ids = { panel: useId(), menu: useId(), title: useId(), context: useId(), message: useId(), district: useId(), output: useId(), hint: useId(), choice: useId() };

  const gift = targetId && targetId !== GENERAL ? gifts.find((item) => item.id === targetId) ?? null : null;
  const general = targetId === GENERAL;
  const contextLabel = gift ? `${participant.name} · Opción ${gift.position} · ${gift.title}` : general ? `${participant.name} · Gustos generales` : participant.name;
  const chat = intent === 'other' && chatAvailable === true;
  const checking = intent === 'other' && chatAvailable === null;
  const needsGift = intent !== 'other' && gifts.length === 0;
  const ready = (gift || general) && (intent !== 'other' || message.trim());
  const prompt = useMemo(() => ready ? buildGiftPrompt({ intent, gift, preferences: participant.general_preferences, district, message, today: limaToday() }) : '',
    [ready, intent, gift, participant.general_preferences, district, message]);

  // A gift removed after reloading the profile can no longer be the selected context.
  useEffect(() => { if (targetId && targetId !== GENERAL && !gift) setTargetId(null); }, [targetId, gift]);
  // Stay above the notifications in the same corner.
  useEffect(() => {
    const stack = document.querySelector('.toast-stack');
    if (!stack) return;
    const measure = () => setLift(stack.childElementCount ? Math.ceil(stack.getBoundingClientRect().height) + 12 : 0);
    const observer = new ResizeObserver(measure); observer.observe(stack);
    const mutations = new MutationObserver(measure); mutations.observe(stack, { childList: true });
    measure();
    return () => { observer.disconnect(); mutations.disconnect(); };
  }, []);
  const focusPanel = () => panel.current?.querySelector<HTMLElement>('[data-autofocus], input:checked, input[type="radio"], textarea')?.focus();
  useEffect(() => {
    const before = previousView.current; previousView.current = view;
    if (view === 'menu') menu.current?.querySelector('button')?.focus();
    else if (view === 'panel' && before !== 'panel') focusPanel();
    else if (view === 'closed' && before !== 'closed') launcher.current?.focus();
  }, [view]);

  useEffect(() => {
    if (view !== 'panel' || intent !== 'other') return;
    let active = true;
    void checkAvailability().then((available) => {
      if (!active) return;
      setChatAvailable(available);
      // While checking there was nothing to focus; the copy form takes focus once it appears (the chat focuses itself).
      if (!available) requestAnimationFrame(() => { if (!panel.current?.contains(document.activeElement)) focusPanel(); });
    });
    return () => { active = false; };
  }, [view, intent]);

  function open(next: PromptIntent) {
    setIntent(next); setManual(false);
    // General preferences only fit "other"; a single saved gift is selected automatically.
    if (next !== 'other' && targetId === GENERAL) setTargetId(gifts.length === 1 ? gifts[0].id : null);
    else if (!targetId && next !== 'other' && gifts.length === 1) setTargetId(gifts[0].id);
    // From inside the panel the pressed button disappears, so focus moves to the new form.
    if (view === 'panel') requestAnimationFrame(focusPanel);
    setView('panel');
  }
  function onKeyDown(event: KeyboardEvent) { if (event.key === 'Escape') { event.stopPropagation(); setView('closed'); } }
  async function copy() {
    if (!prompt) return;
    try {
      await navigator.clipboard.writeText(prompt);
      setManual(false);
      notify({ title: 'Texto copiado', description: 'Pégalo en tu asistente de IA con la búsqueda web activada.' });
    } catch {
      setManual(true);
      requestAnimationFrame(() => { output.current?.focus(); output.current?.select(); });
    }
  }

  return <div className="assistant" style={{ '--assistant-lift': `${lift}px` } as CSSProperties}>
    {view === 'menu' && <div ref={menu} id={ids.menu} className="assistant-menu" role="group" aria-label="Ayuda para encontrar este regalo" onKeyDown={onKeyDown}>
      {intents.map(({ value, label, icon: Icon }) => <button key={value} type="button" className="assistant-menu__item" onClick={() => open(value)}><Icon aria-hidden="true" /><span>{label}</span></button>)}
    </div>}
    {view === 'panel' && <section ref={panel} id={ids.panel} className="assistant-panel" role="dialog" aria-labelledby={ids.title} aria-describedby={ids.context} onKeyDown={onKeyDown}>
      <header className="assistant-panel__header">
        <div className="assistant-panel__heading">
          <span className="assistant-panel__symbol" aria-hidden="true"><Sparkles /></span>
          <div><h2 id={ids.title}>{chat ? 'Asistente de regalos' : 'Prepara tu consulta'}</h2>
            <p id={ids.context} className="assistant-panel__context">{chat ? participant.name : contextLabel}</p>
            <p className="assistant-panel__place"><MapPin aria-hidden="true" />Lima, Perú</p></div>
        </div>
        <div className="assistant-panel__window">
          <Button variant="quiet" className="button--icon" aria-label="Cerrar ayuda" title="Cerrar" onClick={() => setView('closed')}><X aria-hidden="true" /></Button>
        </div>
      </header>
      <div className={`assistant-panel__body${chat ? ' assistant-panel__body--chat' : ''}`}>
        {chat ? <AssistantChat participantId={participant.id} />
        : checking ? <p className="assistant-note assistant-checking" role="status"><LoaderCircle aria-hidden="true" className="spinner" />Abriendo el chat…</p>
        : needsGift ? <div className="assistant-empty">
          <Notice title="Todavía no hay ideas guardadas">Para buscar opciones o tiendas hace falta un regalo guardado en esta lista. Puedes preguntar por sus gustos generales.</Notice>
          <Button variant="secondary" icon={<MessageCircle />} data-autofocus onClick={() => open('other')}>Hacer otra consulta</Button>
        </div> : <div className="assistant-compose">
          <fieldset className="assistant-choice"><legend>¿Sobre qué quieres consultar?</legend>
            {gifts.map((item) => <label key={item.id} className="assistant-choice__option"><input type="radio" name={ids.choice} value={item.id} checked={targetId === item.id}
              onChange={() => setTargetId(item.id)} /><span>Opción {item.position} · {item.title}</span></label>)}
            {intent === 'other' && <label className="assistant-choice__option"><input type="radio" name={ids.choice} value={GENERAL} checked={general}
              onChange={() => setTargetId(GENERAL)} /><span>Gustos generales de esta persona</span></label>}
          </fieldset>
          {gift && <fieldset className="assistant-intents"><legend className="sr-only">Tipo de consulta</legend>
            {intents.map(({ value, short }) => <label key={value} className="assistant-intent"><input type="radio" name={`${ids.choice}-intent`} value={value} checked={intent === value}
              onChange={() => setIntent(value)} /><span>{short}</span></label>)}
          </fieldset>}
          <div className="field"><label className="field__label" htmlFor={ids.district}>Distrito (opcional)</label>
            <input id={ids.district} className="field__control" value={district} maxLength={PROMPT_LIMITS.district} autoComplete="off" placeholder="Por ejemplo, Miraflores"
              onChange={(event) => setDistrict(event.target.value)} /></div>
          <div className="field"><label className="field__label" htmlFor={ids.message}>{intent === 'other' ? 'Tu consulta' : 'Detalles adicionales (opcional)'}</label>
            <textarea id={ids.message} className="field__control assistant-compose__text" value={message} maxLength={PROMPT_LIMITS.message} rows={3} aria-describedby={ids.hint}
              placeholder={intent === 'other' ? 'Por ejemplo, ¿qué color le quedaría mejor?' : 'Por ejemplo, presupuesto máximo o marca preferida'}
              onChange={(event) => setMessage(event.target.value)} />
            <p id={ids.hint} className="field__hint">{message.length}/{PROMPT_LIMITS.message} caracteres</p></div>
          {prompt ? <div className="field assistant-prompt"><label className="field__label" htmlFor={ids.output}>Texto para tu asistente de IA</label>
            <textarea ref={output} id={ids.output} className="field__control assistant-prompt__text" value={prompt} readOnly rows={8} spellCheck={false}
              onFocus={(event) => event.currentTarget.select()} />
            <p className="assistant-note">Cópialo y pégalo en Claude, ChatGPT o Gemini con la búsqueda web activada. Solo incluye datos públicos de esta lista: ni nombres ni enlaces privados. La respuesta queda en ese asistente; esta página no recibe nada.</p>
          </div> : <p className="assistant-note">{targetId ? 'Escribe tu consulta para preparar el texto.' : 'Elige sobre qué quieres consultar para preparar el texto.'}</p>}
          {manual && <Notice title="Puedes copiarlo desde aquí" live>Seleccionamos el texto. Cópialo manualmente (Ctrl+C o mantener pulsado).</Notice>}
          <Button icon={<Copy />} disabled={!prompt} onClick={() => void copy()}>Copiar texto</Button>
        </div>}
      </div>
    </section>}
    <button ref={launcher} type="button" className="assistant-launcher" aria-label="Ayuda para encontrar este regalo"
      aria-expanded={view !== 'closed'} aria-controls={view === 'menu' ? ids.menu : view === 'panel' ? ids.panel : undefined}
      onClick={() => setView(view === 'closed' ? 'menu' : 'closed')}>
      <MessageCircle aria-hidden="true" />
      <span className="assistant-launcher__label" aria-hidden="true">Ayuda para encontrar este regalo</span>
    </button>
  </div>;
}
