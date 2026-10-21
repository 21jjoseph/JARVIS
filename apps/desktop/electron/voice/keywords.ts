/** Tokenise a configurable English wake phrase against the shipped KWS vocabulary. */
export function sentencePieceScores(bytes: Uint8Array): Map<string, number> {
  const scores = new Map<string, number>();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 0;
  const number = () => {
    let value = 0,
      shift = 0;
    while (at < bytes.length) {
      const byte = bytes[at++]!;
      value += (byte & 127) * 2 ** shift;
      if (!(byte & 128)) return value;
      shift += 7;
      if (shift > 35) throw new Error('Invalid tokenizer model.');
    }
    throw new Error('Truncated tokenizer model.');
  };
  const skip = (wire: number) => {
    if (wire === 0) number();
    else if (wire === 1) at += 8;
    else if (wire === 2) {
      const size = number();
      at += size;
    } else if (wire === 5) at += 4;
    else throw new Error('Unsupported tokenizer data.');
    if (at > bytes.length) throw new Error('Truncated tokenizer data.');
  };
  while (at < bytes.length) {
    const tag = number();
    if (tag !== 10) {
      skip(tag & 7);
      continue;
    }
    const size = number(),
      end = at + size;
    let piece = '',
      score = 0;
    while (at < end) {
      const field = number();
      if (field === 10) {
        const length = number();
        piece = new TextDecoder().decode(bytes.subarray(at, at + length));
        at += length;
      } else if (field === 21) {
        score = view.getFloat32(at, true);
        at += 4;
      } else skip(field & 7);
    }
    if (at !== end) throw new Error('Invalid tokenizer record.');
    if (piece && !piece.startsWith('<')) scores.set(piece, score);
  }
  return scores;
}
export function keywordTokens(phrase: string, vocabulary: string, model?: Uint8Array): string {
  const tokens = new Set(
    vocabulary
      .split('\n')
      .map((line) => line.split(' ')[0]!)
      .filter((token) => token && !token.startsWith('<')),
  );
  const input = phrase
    .toUpperCase()
    .split(' ')
    .map((word) => '▁' + word)
    .join('');
  const scores = model ? sentencePieceScores(model) : new Map<string, number>();
  const best = new Map<number, { tokens: string[]; score: number }>();
  best.set(input.length, { tokens: [], score: 0 });
  for (let i = input.length - 1; i >= 0; i--) {
    for (let j = i + 1; j <= input.length; j++) {
      const token = input.slice(i, j),
        tail = best.get(j);
      const score = (scores.get(token) ?? -100) + (tail?.score ?? 0);
      if (tokens.has(token) && tail && (!best.has(i) || score > best.get(i)!.score))
        best.set(i, { tokens: [token, ...tail.tokens], score });
    }
  }
  const result = best.get(0);
  if (!result)
    throw new Error(
      'This wake phrase cannot be represented by the local English keyword model. Use push-to-talk or another phrase.',
    );
  return result.tokens.join(' ');
}
