import { useState, useEffect, useCallback, useMemo } from 'react';
import { fetchLineas, fetchMncEventos, saveMncEvento, subscribeMnc } from './supabase';
import { TIPOS_MATERIAL, todayLocal } from './config';
import { computeLotes } from './mncUtils';

const Btn = ({ children, onClick, bg = '#3F3F46', color = '#FAFAFA', style, ...p }) => (
  <button onClick={onClick} style={{ padding: '10px 20px', background: bg, color, border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 14, ...style }} {...p}>{children}</button>
);
const BigBtn = ({ label, sub, selected, selColor, onClick }) => (
  <button onClick={onClick} style={{
    padding: '12px 12px', borderRadius: 10, border: `2px solid ${selected ? (selColor || '#B91C1C') : '#3F3F46'}`,
    background: selected ? `${selColor || '#B91C1C'}20` : '#1F1F23', color: '#FAFAFA', textAlign: 'left', cursor: 'pointer',
    fontSize: 13, lineHeight: 1.25, fontWeight: 700, minHeight: 56, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2,
    wordBreak: 'break-word', overflowWrap: 'anywhere',
  }}>{label}{sub && <span style={{ fontSize: 10, fontWeight: 400, color: '#A1A1AA' }}>{sub}</span>}</button>
);

const ESTADO_COLOR = { 'Pendiente': '#71717A', 'En Análisis': '#B91C1C', 'Resuelto': '#3F3F46' };

export default function SalaKioskApp({ onExit }) {
  const [lineas, setLineas] = useState([]);
  const [linea, setLinea] = useState(null);
  const [step, setStep] = useState(0); // 0=linea, 1=cola, 2=clasificar
  const [eventos, setEventos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedLote, setSelectedLote] = useState(null);
  const [resultado, setResultado] = useState('');
  const [tipoMaterial, setTipoMaterial] = useState('Cuenta Plena');
  const [costoUnitario, setCostoUnitario] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [lastAction, setLastAction] = useState(null);

  const loadEventos = useCallback(async (L) => {
    setLoading(true);
    try { const ev = await fetchMncEventos(L); setEventos(ev); } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchLineas().then(setLineas).catch(console.error); }, []);
  useEffect(() => { if (linea) loadEventos(linea); }, [linea, loadEventos]);
  useEffect(() => {
    if (!linea) return;
    const unsub = subscribeMnc(linea, () => loadEventos(linea));
    return unsub;
  }, [linea, loadEventos]);

  const lotes = useMemo(() => computeLotes(eventos), [eventos]);
  const cola = useMemo(() => lotes.filter(l => l.estado === 'Pendiente' || l.estado === 'En Análisis'), [lotes]);

  const openLote = useCallback((lote) => { setSelectedLote(lote); setResultado(''); setCostoUnitario(''); setTipoMaterial('Cuenta Plena'); setError(''); setStep(2); }, []);

  const handleClasificar = useCallback(async () => {
    if (!selectedLote) return;
    setError('');
    const esPendiente = selectedLote.estado === 'Pendiente';
    if (!resultado) { setError('Elegí un resultado'); return; }
    let costo = null;
    if (resultado === 'Scrap') {
      costo = parseFloat(costoUnitario);
      if (isNaN(costo) || costo < 0) { setError('Ingresá el costo unitario para Scrap'); return; }
    }
    setSaving(true);
    try {
      const b = selectedLote.base;
      await saveMncEvento({
        loteId: selectedLote.loteId, linea, tipoEvento: esPendiente ? 'Clasificado' : 'Resuelto', resultado,
        componente: b.componente, defecto: b.defecto, defectoNombre: b.defecto_nombre,
        tipoAsiento: b.tipo_asiento, parteAsiento: b.parte_asiento, cuadrante: b.cuadrante, modelo: b.modelo,
        cantidad: b.cantidad, origen: b.origen, turno: b.turno,
        tipoMaterial: resultado === 'Scrap' ? tipoMaterial : null,
        costoUnitario: resultado === 'Scrap' ? costo : null,
        fecha: todayLocal(),
      });
      setLastAction(`${b.defecto_nombre} → ${resultado}`);
      await loadEventos(linea);
      setSelectedLote(null);
      setStep(1);
    } catch (e) { setError('Error al guardar: ' + e.message); }
    setSaving(false);
  }, [selectedLote, resultado, costoUnitario, tipoMaterial, linea, loadEventos]);

  const wrap = { minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'linear-gradient(165deg,#121212,#1F1F23 50%,#121212)', padding: 20 };
  const header = (title, backFn) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
      {backFn && <Btn onClick={backFn} style={{ padding: '8px 14px' }}>←</Btn>}
      <h2 style={{ fontSize: 20, fontWeight: 700, color: '#FAFAFA', margin: 0, flex: 1 }}>{title}</h2>
      <Btn onClick={onExit} bg="#450A0A" color="#FCA5A5" style={{ fontSize: 11, padding: '6px 12px' }}>Salir</Btn>
    </div>
  );

  if (step === 0) return (
    <div style={wrap}>
      {header('Sala de No Conforme', null)}
      <p style={{ color: '#A1A1AA', marginBottom: 16, fontSize: 14 }}>Elegí la línea para ver la cola pendiente:</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 14 }}>
        {lineas.map(l => <BigBtn key={l.id} label={l.id} sub={l.nombre} selected={linea === l.id} onClick={() => { setLinea(l.id); setStep(1); }} />)}
      </div>
    </div>
  );

  if (step === 1) return (
    <div style={wrap}>
      {header(`Cola — Línea ${linea}`, () => setStep(0))}
      {lastAction && <div style={{ background: '#1F1F23', border: '1px solid #3F3F46', color: '#FAFAFA', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>✓ {lastAction}</div>}
      {loading && <p style={{ color: '#71717A', fontSize: 13 }}>Cargando...</p>}
      {!loading && cola.length === 0 && <p style={{ color: '#71717A', fontSize: 14, padding: 30, textAlign: 'center' }}>No hay material pendiente de clasificar para {linea}.</p>}
      <div style={{ display: 'grid', gap: 10 }}>
        {cola.map(lote => (
          <button key={lote.loteId} onClick={() => openLote(lote)} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
            padding: '14px 16px', borderRadius: 10, border: `1px solid ${ESTADO_COLOR[lote.estado]}`,
            background: '#1F1F23', color: '#FAFAFA', textAlign: 'left', cursor: 'pointer',
          }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{lote.base.defecto_nombre}</div>
              <div style={{ fontSize: 11, color: '#A1A1AA', marginTop: 3 }}>
                {lote.base.modelo && `${lote.base.modelo} · `}{lote.base.cuadrante && `${lote.base.cuadrante} · `}Cant: {lote.base.cantidad} · {lote.base.fecha}
              </div>
            </div>
            <span style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: ESTADO_COLOR[lote.estado], color: '#FAFAFA', whiteSpace: 'nowrap' }}>{lote.estado}</span>
          </button>
        ))}
      </div>
    </div>
  );

  if (step === 2 && selectedLote) {
    const esPendiente = selectedLote.estado === 'Pendiente';
    const opciones = esPendiente ? ['OK', 'Scrap', 'En Análisis'] : ['OK', 'Scrap'];
    return (
      <div style={wrap}>
        {header('Clasificar', () => { setStep(1); setSelectedLote(null); })}
        <div style={{ background: '#1F1F23', borderRadius: 12, padding: 16, border: '1px solid #3F3F46', marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 16, color: '#FAFAFA', marginBottom: 4 }}>{selectedLote.base.defecto_nombre}</div>
          <div style={{ fontSize: 12, color: '#A1A1AA' }}>{selectedLote.base.modelo && `${selectedLote.base.modelo} · `}{selectedLote.base.cuadrante && `${selectedLote.base.cuadrante} · `}Cantidad: {selectedLote.base.cantidad} · Generado: {selectedLote.base.fecha}</div>
          {!esPendiente && <div style={{ fontSize: 11, color: '#B91C1C', marginTop: 6 }}>Estaba "En Análisis" — ahora resolvé el destino final.</div>}
        </div>

        <h3 style={{ fontSize: 13, color: '#B91C1C', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>Resultado</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 10, marginBottom: 20 }}>
          {opciones.map(o => <BigBtn key={o} label={o} selected={resultado === o} selColor={o === 'Scrap' ? '#B91C1C' : o === 'OK' ? '#A1A1AA' : '#71717A'} onClick={() => setResultado(o)} />)}
        </div>

        {resultado === 'Scrap' && (<>
          <h3 style={{ fontSize: 13, color: '#B91C1C', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>Tipo de material</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 10, marginBottom: 20 }}>
            {TIPOS_MATERIAL.map(t => <BigBtn key={t} label={t} selected={tipoMaterial === t} onClick={() => setTipoMaterial(t)} />)}
          </div>
          <label style={{ display: 'block', maxWidth: 220, marginBottom: 20 }}>
            <span style={{ fontSize: 11, color: '#B91C1C', display: 'block', marginBottom: 6 }}>Costo unitario (USD) *</span>
            <input type="number" inputMode="decimal" min="0" step="0.01" value={costoUnitario} onChange={e => setCostoUnitario(e.target.value)} placeholder="Ej: 12.50" style={{ width: '100%', padding: '12px 14px', borderRadius: 8, border: '1px solid #3F3F46', background: '#1F1F23', color: '#FAFAFA', fontSize: 16, fontWeight: 700 }} />
          </label>
        </>)}

        {error && <div style={{ padding: '10px 14px', background: '#450A0A', color: '#FCA5A5', borderRadius: 8, fontSize: 13, maxWidth: 480, marginBottom: 16 }}>{error}</div>}
        <Btn bg="#27272A" onClick={handleClasificar} disabled={saving || !resultado} style={{ padding: 16, fontSize: 16, maxWidth: 300 }}>{saving ? 'Guardando...' : '✓ Confirmar'}</Btn>
      </div>
    );
  }

  return null;
}
