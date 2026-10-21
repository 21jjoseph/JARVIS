import type { VoiceLanguage } from '../../../../shared/contracts/voice';
export interface VoiceReply {
  text: string;
  action: 'none' | 'dashboard' | 'stop';
}
export function interpretCommand(
  text: string,
  language: VoiceLanguage,
  now = new Date(),
): VoiceReply {
  const normalized = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const ro = language === 'ro';
  if (/\b(stop|mute|opreste|taci)\b/.test(normalized)) return { action: 'stop', text: '' };
  if (/\b(ceas(?:ul)?|ora|time)\b/.test(normalized))
    return {
      action: 'none',
      text:
        (ro ? 'Este ora ' : 'The time is ') +
        now.toLocaleTimeString(ro ? 'ro-RO' : 'en-GB', { hour: '2-digit', minute: '2-digit' }) +
        '.',
    };
  if (
    /\b(deschide|open|arata|show)\b/.test(normalized) &&
    /\b(panou|panoul|dashboard|control|interfata)\b/.test(normalized)
  )
    return {
      action: 'dashboard',
      text: ro ? 'Deschid panoul de control.' : 'Opening the control room.',
    };
  if (/\b(salut|buna|hello|hi|cine|who|nume|name)\b/.test(normalized))
    return {
      action: 'none',
      text: ro
        ? 'Salut! Sunt Jarvis, asistentul tău local.'
        : 'Hello! I am Jarvis, your local assistant.',
    };
  return {
    action: 'none',
    text: ro
      ? 'Pot să spun ora sau să deschid panoul de control. Conversația AI va fi adăugată în faza următoare.'
      : 'I can tell you the time or open the control room. AI conversation is planned for the next phase.',
  };
}
