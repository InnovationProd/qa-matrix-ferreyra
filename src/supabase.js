import { createClient } from '@supabase/supabase-js';
const URL = import.meta.env.VITE_SUPABASE_URL;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const supabase = createClient(URL, KEY);

// Auth
export const signIn = async (e, p) => { const { data, error } = await supabase.auth.signInWithPassword({ email: e, password: p }); if (error) throw error; return data; };
export const signOut = async () => { await supabase.auth.signOut(); };
export const getSession = async () => (await supabase.auth.getSession()).data.session;
export const onAuthChange = (cb) => supabase.auth.onAuthStateChange((_e, s) => cb(s));

// Líneas
export const fetchLineas = async () => { const { data, error } = await supabase.from('lineas').select('*').order('id'); if (error) throw error; return data; };

// Defectos (by linea)
export const fetchDefectos = async (linea) => { const { data, error } = await supabase.from('defectos').select('*').eq('linea', linea).order('nombre'); if (error) throw error; return data; };
export const upsertDefecto = async (d, linea) => { const { data, error } = await supabase.from('defectos').upsert({ nombre: d.nombre, severidad: d.severidad, costo_interno: d.costo_interno, costo_externo: d.costo_externo, linea, updated_at: new Date().toISOString() }, { onConflict: 'nombre,linea' }).select().single(); if (error) throw error; return data; };
export const deleteDefecto = async (id) => { const { error } = await supabase.from('defectos').delete().eq('id', id); if (error) throw error; };
export const bulkUpsertDefectos = async (list, linea) => { const { data, error } = await supabase.from('defectos').upsert(list.map(d => ({ nombre: d.nombre, severidad: d.severidad, costo_interno: d.costo_interno, costo_externo: d.costo_externo, linea, updated_at: new Date().toISOString() })), { onConflict: 'nombre,linea' }).select(); if (error) throw error; return data; };

// Giros (by linea)
export const saveGiro = async (g, linea) => { const { data, error } = await supabase.from('giros').insert({ name: g.name, date: g.date, bancos_controlados: g.bancosControlados, total_records: g.totalRecords, total_defects: g.totalDefects, total_defect_types: g.totalDefectTypes, summary: g.summary, qa_rows: g.qaRows, format: g.format, linea }).select().single(); if (error) throw error; return data; };
export const fetchGiros = async (linea) => { const { data, error } = await supabase.from('giros').select('id, name, date, bancos_controlados, total_defects, total_defect_types, summary').eq('linea', linea).order('created_at', { ascending: false }); if (error) throw error; return data; };
export const fetchGiro = async (id) => { const { data, error } = await supabase.from('giros').select('*').eq('id', id).single(); if (error) throw error; return data; };
export const deleteGiro = async (id) => { const { error } = await supabase.from('giros').delete().eq('id', id); if (error) throw error; };
export const updateGiroRows = async (id, qaRows, summary) => { const { error } = await supabase.from('giros').update({ qa_rows: qaRows, summary, total_defect_types: qaRows.length }).eq('id', id); if (error) throw error; };

// PDCA
export const savePdca = async (giroId, vn, p) => { const { data, error } = await supabase.from('pdca').upsert({ giro_id: giroId, voz_num: vn, responsable: p.responsable, plan: p.plan, do_step: p.do_step, check: p.check, act: p.act, comments: p.comments, updated_at: new Date().toISOString() }, { onConflict: 'giro_id,voz_num' }).select().single(); if (error) throw error; return data; };
export const fetchPdcas = async (giroId) => { const { data, error } = await supabase.from('pdca').select('*').eq('giro_id', giroId); if (error) throw error; const m = {}; for (const p of data) m[p.voz_num] = p; return m; };

// Unificaciones
export const saveUnificacion = async (giroId, dest, orig) => { const { error } = await supabase.from('unificaciones').upsert({ giro_id: giroId, voz_destino: dest, voz_origen: orig }, { onConflict: 'giro_id,voz_origen' }); if (error) throw error; };

// Realtime
export function subscribeGiros(linea, cb) {
  const ch = supabase.channel(`giros-${linea}`).on('postgres_changes', { event: '*', schema: 'public', table: 'giros', filter: `linea=eq.${linea}` }, cb).subscribe();
  return () => supabase.removeChannel(ch);
}
export function subscribePdca(giroId, cb) {
  const ch = supabase.channel(`pdca-${giroId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'pdca', filter: `giro_id=eq.${giroId}` }, cb).subscribe();
  return () => supabase.removeChannel(ch);
}
