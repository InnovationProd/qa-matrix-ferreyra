import { useState, useEffect, useCallback, useMemo } from 'react';
import { fetchLineas, fetchDefectos, fetchTiposAsiento, fetchPartesAsiento, fetchModelos, fetchCuadrantes, saveScrapEvento } from './supabase';
import { DESTINOS, TIPOS_MATERIAL, TURNOS, ORIGENES, DESTINO_COLORS, todayLocal } from './config';

const Btn = ({ children, onClick, bg = '#3F3F46', color = '#FAFAFA', style, ...p }) => (
  <button onClick={onClick} style={{ padding: '10px 20px', background: bg, color, border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 14, ...style }} {...p}>{children}</button>
);

const BigBtn = ({ label, sub, selected, selColor, onClick }) => (
  <button onClick={onClick} style={{
    padding: '12px 12px', borderRadius: 10, border: `2px solid ${selected ? (selColor || '#B91C1C') : '#3F3F46'}`,
    background: selected ? `${selColor || '#B91C1C'}20` : '#1F1F23', color: '#FAFAFA', textAlign: 'left', cursor: 'pointer',
    fontSize: 13, lineHeight: 1.25, fontWeight: 700, minHeight: 56, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2,
    wordBreak: 'break-word', overflowWrap: 'anywhere',
  }}>
    {label}
    {sub && <span style={{ fontSize: 10, fontWeight: 400, color: '#A1A1AA' }}>{sub}</span>}
  </button>
);

export default function ScrapKioskApp({ onExit }) {
  const [lineas, setLineas] = useState([]);
  const [linea, setLinea] = useState(null);
  const [step, setStep] = useState(0);
  const [data, setData] = useState({
    componente: '', defectoParte: '', tipoAsiento: '', parteAsiento: '', cuadrante: '', modelo: '',
    destino: 'Scrap', tipoMaterial: 'Cuenta Plena', turno: 'A', origen: 'Producción', cantidad: '1', costoUnitario: '',
  });
  const [tiposAsiento, setTiposAsiento] = useState([]);
  const [partesAsiento, setPartesAsiento] = useState([]);
  const [cuadrantes, setCuadrantes] = useState([]);
  const [modelos, setModelos] = useState([]);
  const [defectos, setDefectos] = useState([]);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);
  const [sessionCount, setSessionCount] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => { fetchLineas().then(setLineas).catch(console.error); }, []);

  useEffect(() => {
    if (!linea) return;
    fetchTiposAsiento(linea).then(setTiposAsiento).catch(console.error);
    fetchPartesAsiento(linea).then(setPartesAsiento).catch(console.error);
    fetchCuadrantes(linea).then(setCuadrantes).catch(console.error);
    fetchModelos(linea).then(setModelos).catch(console.error);
    fetchDefectos(linea).then(setDefectos).catch(console.error);
  }, [linea]);

  const defectosParsed = useMemo(() => defectos.map(d => { const idx = d.nombre.indexOf(' - '); return { ...d, componenteParsed: idx === -1 ? d.nombre : d.nombre.slice(0, idx).trim(), defectoParte: idx === -1 ? '' : d.nombre.slice(idx + 3).trim() }; }), [defectos]);
  const componentesUnicos = useMemo(() => [...new Set(defectosParsed.map(d => d.componenteParsed))].sort((a, b) => a.localeCompare(b)), [defectosParsed]);
  const defectosDelComponente = useMemo(() => defectosParsed.filter(d => d.componenteParsed === data.componente).sort((a, b) => a.defectoParte.localeCompare(b.defectoParte)), [defectosParsed, data.componente]);
  const partesDelTipo = useMemo(() => partesAsiento.filter(p => p.tipo_asiento === data.tipoAsiento), [partesAsiento, data.tipoAsiento]);
  const cuadrantesDelTipo = useMemo(() => cuadrantes.filter(c => c.tipo_asiento === data.tipoAsiento && c.parte_asiento === data.parteAsiento), [cuadrantes, data.tipoAsiento, data.parteAsiento]);

  const resetForm = useCallback(() => {
    setData({ componente: '', defectoParte: '', tipoAsiento: '', parteAsiento: '', cuadrante: '', modelo: '', destino: 'Scrap', tipoMaterial: 'Cuenta Plena', turno: 'A', origen: 'Producción', cantidad: '1', costoUnitario: '' });
    setStep(1);
  }, []);

  const handleSave = useCallback(async () => {
    setError('');
    const cant = parseInt(data.cantidad); const costo = parseFloat(data.costoUnitario);
    if (!data.componente || !data.defectoParte) { setError('Falta componente/defecto'); return; }
    if (!cant || cant < 1) { setError('Cantidad inválida'); return; }
    if (isNaN(costo) || costo < 0) { setError('Costo unitario inválido'); return; }
    setSaving(true);
    try {
      const defectoNombre = `${data.componente} - ${data.defectoParte}`;
      await saveScrapEvento({
        defectoNombre, componente: data.componente, modelo: data.modelo || null, cuadrante: data.cuadrante || null,
        destino: data.destino, tipoMaterial: data.tipoMaterial, turno: data.turno, origen: data.origen,
        cantidad: cant, costoUnitario: costo, fecha: todayLocal(), notas: '',
      }, linea);
      setLastSaved(defectoNombre);
      setSessionCount(c => c + 1);
      resetForm();
    } catch (e) { setError('Error al guardar: ' + e.message); }
    setSaving(false);
  }, [data, linea, resetForm]);

  const wrap = { minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'linear-gradient(165deg,#121212,#1F1F23 50%,#121212)', padding: 20 };
  const header = (title, backFn) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
      {backFn && <Btn onClick={backFn} style={{ padding: '8px 14px' }}>←</Btn>}
      <h2 style={{ fontSize: 20, fontWeight: 700, color: '#FAFAFA', margin: 0, flex: 1 }}>{title}</h2>
      {sessionCount > 0 && <span style={{ fontSize: 12, color: '#D4D4D8', fontWeight: 700 }}>✓ {sessionCount} cargados</span>}
      <Btn onClick={onExit} bg="#450A0A" color="#FCA5A5" style={{ fontSize: 11, padding: '6px 12px' }}>Salir</Btn>
    </div>
  );

  // Step 0: elegir línea
  if (step === 0) return (
    <div style={wrap}>
      {header('Registro de Scrap', null)}
      <p style={{ color: '#A1A1AA', marginBottom: 16, fontSize: 14 }}>Elegí la línea de producción:</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 14 }}>
        {lineas.map(l => <BigBtn key={l.id} label={l.id} sub={l.nombre} selected={linea === l.id} onClick={() => { setLinea(l.id); setStep(1); }} />)}
      </div>
    </div>
  );

  // Step 1: componente + defecto
  if (step === 1) return (
    <div style={wrap}>
      {header(`Línea ${linea}`, () => setStep(0))}
      {lastSaved && <div style={{ background: '#27272A', color: '#E4E4E7', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>✓ Guardado: {lastSaved}</div>}
      <h3 style={{ fontSize: 14, color: '#B91C1C', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Componente</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(100px,1fr))', gap: 10, marginBottom: 24 }}>
        {componentesUnicos.map(c => <BigBtn key={c} label={c} selected={data.componente === c} onClick={() => setData(p => ({ ...p, componente: c, defectoParte: '' }))} />)}
      </div>
      {componentesUnicos.length === 0 && <p style={{ color: '#DC2626', fontSize: 12 }}>Sin defectos cargados para {linea}.</p>}
      {data.componente && (
        <>
          <h3 style={{ fontSize: 14, color: '#B91C1C', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Defecto</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(110px,1fr))', gap: 10 }}>
            {defectosDelComponente.map(d => <BigBtn key={d.id} label={d.defectoParte} selected={data.defectoParte === d.defectoParte} onClick={() => { setData(p => ({ ...p, defectoParte: d.defectoParte })); setStep(2); }} />)}
          </div>
        </>
      )}
    </div>
  );

  // Step 2: tipo asiento + parte + cuadrante (opcional)
  if (step === 2) return (
    <div style={wrap}>
      {header('Ubicación en el Asiento', () => setStep(1))}
      <p style={{ fontSize: 11, color: '#71717A', marginBottom: 16 }}>Opcional — saltalo si no aplica.</p>
      <h3 style={{ fontSize: 14, color: '#B91C1C', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Tipo de Asiento</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(110px,1fr))', gap: 10, marginBottom: 24 }}>
        {tiposAsiento.map(t => <BigBtn key={t.id} label={t.nombre} selected={data.tipoAsiento === t.nombre} onClick={() => setData(p => ({ ...p, tipoAsiento: t.nombre, parteAsiento: '', cuadrante: '' }))} />)}
      </div>
      {data.tipoAsiento && (
        <>
          <h3 style={{ fontSize: 14, color: '#B91C1C', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Respaldo o Asiento</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(110px,1fr))', gap: 10, marginBottom: 24 }}>
            {partesDelTipo.map(pa => <BigBtn key={pa.id} label={pa.nombre} selected={data.parteAsiento === pa.nombre} onClick={() => setData(p => ({ ...p, parteAsiento: pa.nombre, cuadrante: '' }))} />)}
          </div>
        </>
      )}
      {data.tipoAsiento && data.parteAsiento && (
        <>
          <h3 style={{ fontSize: 14, color: '#B91C1C', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Cuadrante</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(100px,1fr))', gap: 10 }}>
            {cuadrantesDelTipo.map(c => <BigBtn key={c.id} label={c.nombre} selected={data.cuadrante === c.nombre} onClick={() => setData(p => ({ ...p, cuadrante: c.nombre }))} />)}
          </div>
        </>
      )}
      <Btn bg="#27272A" color="#FAFAFA" onClick={() => setStep(3)} style={{ marginTop: 24, padding: 14 }}>Continuar →</Btn>
    </div>
  );

  // Step 3: modelo
  if (step === 3) return (
    <div style={wrap}>
      {header('Modelo', () => setStep(2))}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(110px,1fr))', gap: 10, marginBottom: 24 }}>
        {modelos.map(m => <BigBtn key={m.id} label={m.nombre} selected={data.modelo === m.nombre} onClick={() => setData(p => ({ ...p, modelo: m.nombre }))} />)}
      </div>
      <Btn bg="#27272A" color="#FAFAFA" onClick={() => setStep(4)} style={{ padding: 14 }}>Continuar →</Btn>
    </div>
  );

  // Step 4: destino, material, turno, origen, cantidad, costo
  if (step === 4) return (
    <div style={wrap}>
      {header('Detalle del Evento', () => setStep(3))}
      <h3 style={{ fontSize: 13, color: '#B91C1C', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>Destino final</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 10, marginBottom: 20 }}>
        {DESTINOS.map(d => <BigBtn key={d} label={d} selColor={DESTINO_COLORS[d]} selected={data.destino === d} onClick={() => setData(p => ({ ...p, destino: d }))} />)}
      </div>
      <h3 style={{ fontSize: 13, color: '#B91C1C', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>Tipo de material</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 10, marginBottom: 20 }}>
        {TIPOS_MATERIAL.map(t => <BigBtn key={t} label={t} selected={data.tipoMaterial === t} onClick={() => setData(p => ({ ...p, tipoMaterial: t }))} />)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        <div>
          <h3 style={{ fontSize: 13, color: '#B91C1C', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>Turno</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(70px,1fr))', gap: 8 }}>
            {TURNOS.map(t => <BigBtn key={t} label={t} selected={data.turno === t} onClick={() => setData(p => ({ ...p, turno: t }))} />)}
          </div>
        </div>
        <div>
          <h3 style={{ fontSize: 13, color: '#B91C1C', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>Origen</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(90px,1fr))', gap: 8 }}>
            {ORIGENES.map(o => <BigBtn key={o} label={o} selected={data.origen === o} onClick={() => setData(p => ({ ...p, origen: o }))} />)}
          </div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, maxWidth: 400 }}>
        <label><span style={{ fontSize: 11, color: '#A1A1AA', display: 'block', marginBottom: 6 }}>Cantidad</span><input type="number" inputMode="numeric" min="1" value={data.cantidad} onChange={e => setData(p => ({ ...p, cantidad: e.target.value }))} style={{ width: '100%', padding: '12px 14px', borderRadius: 8, border: '1px solid #52525B', background: '#1F1F23', color: '#FAFAFA', fontSize: 16, fontWeight: 700 }} /></label>
        <label><span style={{ fontSize: 11, color: '#B91C1C', display: 'block', marginBottom: 6 }}>Costo unit. (USD)</span><input type="number" inputMode="decimal" min="0" step="0.01" value={data.costoUnitario} onChange={e => setData(p => ({ ...p, costoUnitario: e.target.value }))} placeholder="Ej: 12.50" style={{ width: '100%', padding: '12px 14px', borderRadius: 8, border: '1px solid #B91C1C', background: '#1F1F23', color: '#FAFAFA', fontSize: 16, fontWeight: 700 }} /></label>
      </div>
      <Btn bg="#27272A" color="#FAFAFA" onClick={() => setStep(5)} style={{ marginTop: 24, padding: 14, maxWidth: 400 }}>Continuar →</Btn>
    </div>
  );

  // Step 5: confirmar
  if (step === 5) return (
    <div style={wrap}>
      {header('Confirmar', () => setStep(4))}
      <div style={{ background: '#1F1F23', borderRadius: 12, padding: 20, border: '1px solid #3F3F46', maxWidth: 480 }}>
        <Row l="Línea" v={linea} />
        <Row l="Componente" v={data.componente} />
        <Row l="Defecto" v={data.defectoParte} highlight />
        <Row l="Tipo asiento" v={data.tipoAsiento || '—'} />
        <Row l="Respaldo/Asiento" v={data.parteAsiento || '—'} />
        <Row l="Cuadrante" v={data.cuadrante || '—'} />
        <Row l="Modelo" v={data.modelo || '—'} />
        <Row l="Destino" v={data.destino} />
        <Row l="Material" v={data.tipoMaterial} />
        <Row l="Turno / Origen" v={`${data.turno} / ${data.origen}`} />
        <Row l="Cantidad" v={data.cantidad} />
        <Row l="Costo unitario" v={`$${data.costoUnitario}`} />
        <Row l="Monto total" v={`$${(parseFloat(data.costoUnitario || 0) * parseInt(data.cantidad || 0)).toFixed(2)}`} highlight />
      </div>
      {error && <div style={{ marginTop: 16, padding: '10px 14px', background: '#450A0A', color: '#FCA5A5', borderRadius: 8, fontSize: 13, maxWidth: 480 }}>{error}</div>}
      <Btn bg="#D4D4D8" color="#FAFAFA" onClick={handleSave} disabled={saving} style={{ marginTop: 20, padding: 16, fontSize: 16, maxWidth: 480 }}>{saving ? 'Guardando...' : '✓ Confirmar y Cargar'}</Btn>
    </div>
  );

  return null;
}

function Row({ l, v, highlight }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #3F3F46' }}>
    <span style={{ fontSize: 12, color: '#A1A1AA' }}>{l}</span>
    <span style={{ fontSize: 14, fontWeight: 700, color: highlight ? '#B91C1C' : '#FAFAFA' }}>{v}</span>
  </div>;
}
