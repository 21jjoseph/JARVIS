import { resolve } from 'node:path';
import { installModels } from '../apps/desktop/electron/voice/models';
let previous = '';
void installModels(
  process.env.JARVIS_VOICE_MODELS_DIR || resolve('.cache/voice-models'),
  (percent, message) => {
    const output = `${Math.floor(percent)}% ${message}`;
    if (output !== previous) {
      console.log(output);
      previous = output;
    }
  },
).catch((error) => {
  console.error(error instanceof Error ? error.message : 'Model installation failed.');
  process.exitCode = 1;
});
