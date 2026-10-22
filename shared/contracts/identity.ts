export const ASSISTANT_NAME='21';
export const SPOKEN_NAME='Twenty One';
export const WAKE_PHRASES=['Yo Twenty One','Hey Twenty One','Twenty One'] as const;
/** Normalize the assistant's identity, preserving unrelated technical quantities. */
export function spokenIdentity(text:string):string {
  return text.replace(/\b(My name is|Numele meu este)\s+21\b/gi,(_match,prefix:string)=>`${prefix} ${SPOKEN_NAME}`)
    .replace(/\b(I am|I'm|Sunt|Eu sunt)\s+21\b(?=\s*(?:$|[.,:;!?]))/gi,(_match,prefix:string)=>`${prefix} ${SPOKEN_NAME}`);
}
export function wordErrorRate(expected:string,actual:string):{errors:number;words:number;rate:number} {
  const words=(text:string)=>text.toLocaleLowerCase().replace(/[^\p{L}\p{N}\s]/gu,'').trim().split(/\s+/).filter(Boolean);
  const reference=words(expected),recognized=words(actual);
  let previous=Array.from({length:recognized.length+1},(_,i)=>i);
  for(let i=1;i<=reference.length;i++){
    const row=[i];for(let j=1;j<=recognized.length;j++)row[j]=Math.min(row[j-1]!+1,previous[j]!+1,previous[j-1]!+(reference[i-1]===recognized[j-1]?0:1));
    previous=row;
  }
  const errors=previous[recognized.length]!;
  return {errors,words:reference.length,rate:reference.length?errors/reference.length:0};
}
/** Normalize only for the bounded offline parser; retain raw speech separately. */
export function commandText(text:string):string {
  return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim()
    .replace(/^(?:jarvis|(?:yo |hey )?twenty one|21)[,. ]+/,'')
    .replace(/[?.!]+$/,'').trim();
}
