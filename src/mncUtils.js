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
  const now = Date.now();
  const lotes = [];
  for (const [loteId, evsRaw] of Object.entries(byLote)) {
    const evs = [...evsRaw].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const base = evs[0];
    const last = evs[evs.length - 1];
    const generado = evs.find(e => e.tipo_evento === 'Generado');
    const clasificado = evs.find(e => e.tipo_evento === 'Clasificado');
    const resuelto = evs.find(e => e.tipo_evento === 'Resuelto');
    let estado, resultado;
    if (last.tipo_evento === 'Generado') { estado = 'Pendiente'; resultado = null; }
    else if (last.tipo_evento === 'Clasificado') {
      if (last.resultado === 'En Análisis') { estado = 'En Análisis'; resultado = null; }
      else { estado = 'Resuelto'; resultado = last.resultado; }
    } else { estado = 'Resuelto'; resultado = last.resultado; }

    // Tiempo en análisis: desde que Sala lo puso "En Análisis" hasta que se resolvió (o hasta ahora si sigue pendiente)
    let msEnAnalisis = null;
    if (clasificado && clasificado.resultado === 'En Análisis') {
      const desde = new Date(clasificado.created_at).getTime();
      const hasta = resuelto ? new Date(resuelto.created_at).getTime() : now;
      msEnAnalisis = hasta - desde;
    }
    const eventoScrap = evs.find(e => e.resultado === 'Scrap');
    const monto = eventoScrap && eventoScrap.costo_unitario != null ? Number(eventoScrap.costo_unitario) * (base.cantidad || 0) : 0;

    lotes.push({ loteId, base, events: evs, estado, resultado, lastEvent: last, generado, clasificado, resuelto, msEnAnalisis, monto });
  }
  return lotes.sort((a, b) => new Date(a.base.created_at) - new Date(b.base.created_at));
}

export function formatDuration(ms) {
  if (ms == null) return '—';
  const h = ms / 3600000;
  if (h < 1) return `${Math.round(ms / 60000)} min`;
  if (h < 24) return `${h.toFixed(1)} h`;
  return `${(h / 24).toFixed(1)} días`;
}
