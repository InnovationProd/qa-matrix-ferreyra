// Groups material_no_conforme_eventos rows by lote_id and derives the CURRENT state
// of each lote by looking at its most recent event. Used by both kiosks and future dashboards.
//
// Possible current states:
//   'Pendiente'    → solo existe el evento 'Generado', todavía nadie en Sala lo clasificó
//   'En Análisis'  → Sala lo clasificó como 'En Análisis', todavía sin resolver
//   'Resuelto'     → terminó en OK o Scrap (directo desde Sala, o después de análisis)
export function computeLotes(events) {
  const byLote = {};
  for (const e of events) {
    if (!byLote[e.lote_id]) byLote[e.lote_id] = [];
    byLote[e.lote_id].push(e);
  }
  const lotes = [];
  for (const [loteId, evsRaw] of Object.entries(byLote)) {
    const evs = [...evsRaw].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const base = evs[0]; // evento 'Generado' — tiene los datos del material
    const last = evs[evs.length - 1];
    let estado, resultado;
    if (last.tipo_evento === 'Generado') { estado = 'Pendiente'; resultado = null; }
    else if (last.tipo_evento === 'Clasificado') {
      if (last.resultado === 'En Análisis') { estado = 'En Análisis'; resultado = null; }
      else { estado = 'Resuelto'; resultado = last.resultado; }
    } else { estado = 'Resuelto'; resultado = last.resultado; }
    lotes.push({ loteId, base, events: evs, estado, resultado, lastEvent: last });
  }
  return lotes.sort((a, b) => new Date(a.base.created_at) - new Date(b.base.created_at));
}
