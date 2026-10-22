import { describe,expect,it } from 'vitest';
import { DEFAULT_SETTINGS,validateSettingsPatch } from '../../shared/contracts';
import { WAKE_PHRASES,spokenIdentity,wordErrorRate } from '../../shared/contracts/identity';
import { interpretCommand } from '../../apps/desktop/electron/voice/commands';
import { desktopCommand } from '../../apps/desktop/electron/ai/commands';
import { decodeCloudAudio } from '../../apps/desktop/electron/voice/cloud';

describe('21 identity and privacy boundaries',()=>{
  it('keeps technical quantities while pronouncing the assistant name in English',()=>{
    expect(spokenIdentity('Sunt 21. Motorul are 21 de dinți.')).toBe('Sunt Twenty One. Motorul are 21 de dinți.');
    expect(spokenIdentity('I am 21. Pin 21 is high.')).toBe('I am Twenty One. Pin 21 is high.');
    expect(spokenIdentity('Set 21 mm; 21 NEMA17 motors.')).toBe('Set 21 mm; 21 NEMA17 motors.');
    expect(spokenIdentity('21:1 gear ratio. I am 21 mm away.')).toBe('21:1 gear ratio. I am 21 mm away.');
  });
  it.each(WAKE_PHRASES)('handles %s prefixes without requiring a model',(phrase)=>{
    expect(interpretCommand(`${phrase}, stop!`,'en').action).toBe('stop');
    expect(interpretCommand(`${phrase}, cine ești?`,'ro').text).toContain('Twenty One');
    expect(desktopCommand(`${phrase}, deschide CoppeliaSim.`)).toEqual({name:'open_app',arguments:{app:'coppeliasim'}});
    expect(desktopCommand(`${phrase}, open calculator; run malicious shell`)).toBeNull();
  });
  it('starts with cloud and all audio sharing disabled',()=>{
    expect(DEFAULT_SETTINGS.aiMode).toBe('local');
    expect(DEFAULT_SETTINGS.cloudEnabled).toBe(false);
    expect(DEFAULT_SETTINGS.cloudAudioConsent).toBe(false);
    expect(DEFAULT_SETTINGS.voiceCloudTextConsent).toBe(false);
    expect(DEFAULT_SETTINGS.hybridCloudConsent).toBe(false);
    expect(DEFAULT_SETTINGS.wakeWord).toBe('Twenty One');
    expect(()=>validateSettingsPatch({localEndpoint:'http://192.168.1.1:8080'})).toThrow();
    expect(()=>validateSettingsPatch({technicalVocabulary:['word\ncontrol']})).toThrow();
    expect(()=>validateSettingsPatch({inferenceThreads:99})).toThrow();
    expect(()=>validateSettingsPatch({geminiKey:'renderer-secret'})).toThrow();
  });
  it('measures corrections without altering or learning from the original transcript',()=>{
    expect(wordErrorRate('open the NEMA seventeen project','open a NEMA seventeen')).toEqual({errors:2,words:5,rate:0.4});
    expect(wordErrorRate('Bună, Twenty One!','bună twenty one')).toEqual({errors:0,words:3,rate:0});
  });
  it('decodes actual PCM16 samples and rejects malformed or oversized cloud output',()=>{
    const data=Buffer.alloc(6);data.writeInt16LE(-32768,0);data.writeInt16LE(0,2);data.writeInt16LE(16384,4);
    const audio=decodeCloudAudio({audio:data.toString('base64'),mime:'audio/L16;codec=pcm;rate=24000',sample_rate:24000});
    expect(audio.sampleRate).toBe(24000);expect(Array.from(audio.samples)).toEqual([-1,0,0.5]);
    expect(()=>decodeCloudAudio({audio:'!!!',mime:'audio/L16',sample_rate:24000})).toThrow();
    expect(()=>decodeCloudAudio({audio:'AA==',mime:'audio/L16',sample_rate:24000})).toThrow();
    expect(()=>decodeCloudAudio({audio:data.toString('base64'),mime:'audio/mp3',sample_rate:24000})).toThrow();
  });
});
