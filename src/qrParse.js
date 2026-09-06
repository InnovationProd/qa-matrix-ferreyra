// Parses the LEAR traceability QR string.
// Format observed: 0002193AA.BLFBABAADxx.BBAAAABBCAxAC.....*002483235
//   - First 7 chars (before the 2-letter suffix) = secuencia, zero-padded
//   - Everything after the last '*' = BSN (unique piece identifier)
export function parseLearQr(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const text = raw.trim();

  let secuencia = null;
  const seqMatch = text.match(/^0*(\d+)[A-Z]{2}\./);
  if (seqMatch) secuencia = seqMatch[1];

  let bsn = null;
  const starIdx = text.lastIndexOf('*');
  if (starIdx !== -1) {
    bsn = text.slice(starIdx + 1).trim().replace(/^0+/, '') || text.slice(starIdx + 1).trim();
  }

  if (!secuencia && !bsn) return null;
  return { secuencia, bsn, raw: text };
}
