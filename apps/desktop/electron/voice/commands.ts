import type { VoiceLanguage } from '../../../../shared/contracts/voice';
import { commandText } from '../../../../shared/contracts/identity';
export interface VoiceReply {
  text: string;
  handled?: boolean;
  action: 'none' | 'dashboard' | 'stop';
}
export function interpretCommand(
  text: string,
  language: VoiceLanguage,
  now = new Date(),
): VoiceReply {
  const normalized = commandText(text);
  const ro = language === 'ro';
  const phrase = normalized
    .trim()
    .replace(/^(?:jarvis|(?:yo |hey )?twenty one|21)[,. ]+/,'')
    .replace(/[?.!]+$/, '')
    .trim();
  if (/^(?:stop|mute|opreste|taci)$/.test(normalized))
    return { action: 'stop', text: '', handled: true };
  if (
    /^(?:what time(?: is it)?|what is the time|tell me the time|time|cat (?:este|e) (?:ceasul|ora)|(?:este )?ceasul|ora)$/.test(
      phrase,
    )
  )
    return {
      handled: true,
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
      handled: true,
      action: 'dashboard',
      text: ro ? 'Deschid panoul de control.' : 'Opening the control room.',
    };
  if (
    /^(?:jarvis[, ]+)?(?:salut|buna|hello|hi)[!.? ]*$/.test(normalized.trim()) ||
    /^(?:who are you|what is your name|cine esti|cum te cheama)[?.! ]*$/.test(normalized.trim())
  )
    return {
      handled: true,
      action: 'none',
      text: ro
        ? 'Salut! Sunt Twenty One, asistentul tău local.'
        : 'Hello! I am Twenty One, your local assistant.',
    };
  return {
    handled: false,
    action: 'none',
    text: ro
      ? 'AI local este indisponibil. Pot să spun ora sau să deschid panoul de control.'
      : 'Local AI is unavailable. I can tell you the time or open the control room.',
  };
}
