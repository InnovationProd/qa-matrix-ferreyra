import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { fetchLineas, fetchDefectos, fetchTiposAsiento, fetchPartesAsiento, fetchModelos, fetchCuadrantes, saveReporteDefecto } from './supabase';
import { DETECTION_POINTS, todayLocal } from './config';
import { parseLearQr } from './qrParse';
import { startQrScanner } from './qrScanner';

const Btn = ({ children, onClick, bg = '#334155', color = '#F8FAFC', style, ...p }) => (
  <button onClick={onClick} style={{ padding: '10px 20px', background: bg, color, border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 14, ...style }} {...p}>{children}</button>
);

const BigBtn = ({ label, sub, selected, onClick }) => (
  <button onClick={onClick} style={{
    padding: '12px 12px', borderRadius: 10, border: `2px solid ${selected ? '#F59E0B' : '#334155'}`,
    background: selected ? 'rgba(245,158,11,0.12)' : '#1E293B', color: '#F8FAFC', textAlign: 'left', cursor: 'pointer',
    fontSize: 13, lineHeight: 1.25, fontWeight: 700, minHeight: 56, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2,
    wordBreak: 'break-word', overflowWrap: 'anywhere', hyphens: 'auto',
  }}>
    {label}
    {sub && <span style={{ fontSize: 10, fontWeight: 400, color: '#94A3B8' }}>{sub}</span>}
  </button>
);

export default function KioskApp({ onExit }) {
  const [lineas, setLineas] = useState([]);
  const [linea, setLinea] = useState(null);
  const [step, setStep] = useState(0); // 0 = elegir línea, 1 = QR, 2 = deteccion, 3 = asiento/cuadrante, 4 = modelo, 5 = componente/defecto, 6 = confirmar
  const [data, setData] = useState({ secuencia: '', bsn: '', qrRaw: '', deteccion: '', tipoAsiento: '', parteAsiento: '', cuadrante: '', modelo: '', componente: '', defectoParte: '' });
  const [tiposAsiento, setTiposAsiento] = useState([]);
  const [partesAsiento, setPartesAsiento] = useState([]);
  const [modelos, setModelos] = useState([]);
  const [cuadrantes, setCuadrantes] = useState([]);
  const [defectos, setDefectos] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState('');
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);
  const [sessionCount, setSessionCount] = useState(0);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const stopScanRef = useRef(null);

  useEffect(() => { fetchLineas().then(setLineas).catch(console.error); }, []);

  useEffect(() => {
    if (!linea) return;
    fetchTiposAsiento(linea).then(setTiposAsiento).catch(console.error);
    fetchPartesAsiento(linea).then(setPartesAsiento).catch(console.error);
    fetchModelos(linea).then(setModelos).catch(console.error);
    fetchCuadrantes(linea).then(setCuadrantes).catch(console.error);
    fetchDefectos(linea).then(setDefectos).catch(console.error);
  }, [linea]);

  const defectosParsed = useMemo(() => defectos.map(d => { const idx = d.nombre.indexOf(' - '); return { ...d, componenteParsed: idx === -1 ? d.nombre : d.nombre.slice(0, idx).trim(), defectoParte: idx === -1 ? '' : d.nombre.slice(idx + 3).trim() }; }), [defectos]);
  const componentesUnicos = useMemo(() => [...new Set(defectosParsed.map(d => d.componenteParsed))].sort((a, b) => a.localeCompare(b)), [defectosParsed]);
  const defectosDelComponente = useMemo(() => defectosParsed.filter(d => d.componenteParsed === data.componente).sort((a, b) => a.defectoParte.localeCompare(b.defectoParte)), [defectosParsed, data.componente]);
  const cuadrantesDelTipo = useMemo(() => cuadrantes.filter(c => c.tipo_asiento === data.tipoAsiento && c.parte_asiento === data.parteAsiento), [cuadrantes, data.tipoAsiento, data.parteAsiento]);
  const partesDelTipo = useMemo(() => partesAsiento.filter(p => p.tipo_asiento === data.tipoAsiento), [partesAsiento, data.tipoAsiento]);

  const resetForm = useCallback(() => {
    setData({ secuencia: '', bsn: '', qrRaw: '', deteccion: '', tipoAsiento: '', parteAsiento: '', cuadrante: '', modelo: '', componente: '', defectoParte: '' });
    setStep(1);
  }, []);

  const startScan = useCallback(async () => {
    setScanning(true); setScanError('');
    setTimeout(async () => {
      if (!videoRef.current || !canvasRef.current) return;
      const stop = await startQrScanner(videoRef.current, canvasRef.current, (text) => {
        const parsed = parseLearQr(text);
        if (parsed) {
          setData(p => ({ ...p, secuencia: parsed.secuencia || p.secuencia, bsn: parsed.bsn || p.bsn, qrRaw: parsed.raw }));
          setScanning(false);
        } else {
          setData(p => ({ ...p, qrRaw: text }));
          setScanning(false);
        }
      }, (err) => { setScanError(err); setScanning(false); });
      stopScanRef.current = stop;
    }, 50);
  }, []);

  const cancelScan = useCallback(() => { if (stopScanRef.current) stopScanRef.current(); setScanning(false); }, []);

  const handleSave = useCallback(async () => {
    if (!data.deteccion || !data.componente || !data.defectoParte) return;
    setSaving(true);
    try {
      const defectoNombre = `${data.componente} - ${data.defectoParte}`;
      await saveReporteDefecto({
        secuencia: data.secuencia, bsn: data.bsn, qrRaw: data.qrRaw,
        deteccion: data.deteccion, tipoAsiento: data.tipoAsiento, parteAsiento: data.parteAsiento, cuadrante: data.cuadrante,
        modelo: data.modelo, componente: data.componente, defecto: data.defectoParte, defectoNombre,
        fecha: todayLocal(),
      }, linea);
      setLastSaved(defectoNombre);
      setSessionCount(c => c + 1);
      resetForm();
    } catch (e) { alert('Error al guardar: ' + e.message); }
    setSaving(false);
  }, [data, linea, resetForm]);

  useEffect(() => () => { if (stopScanRef.current) stopScanRef.current(); }, []);

  const wrap = { minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'linear-gradient(165deg,#0F172A,#1E293B 50%,#0F172A)', padding: 20 };
  const header = (title, backFn) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
      {backFn && <Btn onClick={backFn} style={{ padding: '8px 14px' }}>←</Btn>}
      <h2 style={{ fontSize: 20, fontWeight: 700, color: '#F8FAFC', margin: 0, flex: 1 }}>{title}</h2>
      {sessionCount > 0 && <span style={{ fontSize: 12, color: '#16A34A', fontWeight: 700 }}>✓ {sessionCount} cargados</span>}
      <Btn onClick={onExit} bg="#7F1D1D" color="#FCA5A5" style={{ fontSize: 11, padding: '6px 12px' }}>Salir</Btn>
    </div>
  );

  // Step 0: elegir línea
  if (step === 0) return (
    <div style={wrap}>
      {header('Carga de Defectos', null)}
      <p style={{ color: '#94A3B8', marginBottom: 16, fontSize: 14 }}>Elegí la línea de producción:</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 14 }}>
        {lineas.map(l => <BigBtn key={l.id} label={l.id} sub={l.nombre} selected={linea === l.id} onClick={() => { setLinea(l.id); setStep(1); }} />)}
      </div>
    </div>
  );

  // Step 1: escaneo QR (opcional)
  if (step === 1) return (
    <div style={wrap}>
      {header(`Línea ${linea}`, () => setStep(0))}
      {lastSaved && <div style={{ background: '#14532D', color: '#86EFAC', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>✓ Guardado: {lastSaved}</div>}
      <p style={{ color: '#94A3B8', marginBottom: 16, fontSize: 14 }}>Escaneá el código QR de la etiqueta LEAR (o saltá este paso si no está disponible):</p>

      {!scanning ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 400 }}>
          <Btn bg="#F59E0B" color="#0F172A" onClick={startScan} style={{ padding: '18px', fontSize: 16 }}>📷 Escanear código QR</Btn>
          {(data.secuencia || data.bsn) && (
            <div style={{ background: '#1E293B', borderRadius: 10, padding: 14, border: '1px solid #16A34A' }}>
              <div style={{ fontSize: 11, color: '#16A34A', fontWeight: 700, marginBottom: 6 }}>✓ Datos leídos del QR</div>
              {data.secuencia && <div style={{ fontSize: 13, color: '#F8FAFC' }}>Secuencia: <b>{data.secuencia}</b></div>}
              {data.bsn && <div style={{ fontSize: 13, color: '#F8FAFC' }}>BSN: <b>{data.bsn}</b></div>}
            </div>
          )}
          <Btn onClick={() => setStep(2)} style={{ padding: '14px' }}>{(data.secuencia || data.bsn) ? 'Continuar →' : 'Saltar este paso →'}</Btn>
          {scanError && <div style={{ color: '#FCA5A5', fontSize: 12 }}>{scanError}</div>}
        </div>
      ) : (
        <div style={{ maxWidth: 500 }}>
          <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', border: '3px solid #F59E0B' }}>
            <video ref={videoRef} style={{ width: '100%', display: 'block' }} muted playsInline />
            <canvas ref={canvasRef} style={{ display: 'none' }} />
          </div>
          <p style={{ color: '#94A3B8', fontSize: 12, marginTop: 10, textAlign: 'center' }}>Apuntá la cámara al código QR de la etiqueta</p>
          <Btn onClick={cancelScan} bg="#7F1D1D" color="#FCA5A5" style={{ width: '100%', marginTop: 10 }}>Cancelar</Btn>
        </div>
      )}
    </div>
  );

  // Step 2: lugar de detección
  if (step === 2) return (
    <div style={wrap}>
      {header('Lugar de Detección', () => setStep(1))}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(110px,1fr))', gap: 12 }}>
        {DETECTION_POINTS.map(dp => (
          <BigBtn key={dp.key} label={dp.key} sub={dp.scope === 'ext' ? 'Externo' : 'Interno'} selected={data.deteccion === dp.key}
            onClick={() => { setData(p => ({ ...p, deteccion: dp.key })); setStep(3); }} />
        ))}
      </div>
    </div>
  );

  // Step 3: tipo de asiento + respaldo/asiento + cuadrante
  if (step === 3) return (
    <div style={wrap}>
      {header('Tipo de Asiento', () => setStep(2))}
      {tiposAsiento.length === 0 ? <p style={{ color: '#DC2626' }}>No hay tipos de asiento cargados para {linea}. Pedile a Calidad que los configure.</p> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(110px,1fr))', gap: 12, marginBottom: 24 }}>
          {tiposAsiento.map(t => <BigBtn key={t.id} label={t.nombre} selected={data.tipoAsiento === t.nombre} onClick={() => setData(p => ({ ...p, tipoAsiento: t.nombre, parteAsiento: '', cuadrante: '' }))} />)}
        </div>
      )}
      {data.tipoAsiento && (
        <>
          <h3 style={{ fontSize: 14, color: '#F59E0B', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Respaldo o Asiento</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(110px,1fr))', gap: 12, marginBottom: 24 }}>
            {partesDelTipo.map(pa => <BigBtn key={pa.id} label={pa.nombre} selected={data.parteAsiento === pa.nombre} onClick={() => setData(p => ({ ...p, parteAsiento: pa.nombre, cuadrante: '' }))} />)}
          </div>
          {partesDelTipo.length === 0 && <p style={{ color: '#DC2626', fontSize: 12, marginBottom: 24 }}>Sin partes (Respaldo/Asiento) configuradas para {data.tipoAsiento}. Pedile a Calidad que las cargue en Catálogos.</p>}
        </>
      )}
      {data.tipoAsiento && data.parteAsiento && (
        <>
          <h3 style={{ fontSize: 14, color: '#F59E0B', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Cuadrante</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(100px,1fr))', gap: 10 }}>
            {cuadrantesDelTipo.map(c => <BigBtn key={c.id} label={c.nombre} selected={data.cuadrante === c.nombre} onClick={() => { setData(p => ({ ...p, cuadrante: c.nombre })); setStep(4); }} />)}
          </div>
          {cuadrantesDelTipo.length === 0 && <p style={{ color: '#94A3B8', fontSize: 12 }}>Sin cuadrantes configurados para {data.tipoAsiento} · {data.parteAsiento}.</p>}
        </>
      )}
    </div>
  );

  // Step 4: modelo
  if (step === 4) return (
    <div style={wrap}>
      {header('Modelo', () => setStep(3))}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(110px,1fr))', gap: 12 }}>
        {modelos.map(m => <BigBtn key={m.id} label={m.nombre} selected={data.modelo === m.nombre} onClick={() => { setData(p => ({ ...p, modelo: m.nombre })); setStep(5); }} />)}
      </div>
      {modelos.length === 0 && <p style={{ color: '#DC2626' }}>No hay modelos cargados para {linea}.</p>}
    </div>
  );

  // Step 5: componente + defecto
  if (step === 5) return (
    <div style={wrap}>
      {header('Componente y Defecto', () => setStep(4))}
      <h3 style={{ fontSize: 14, color: '#F59E0B', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Componente</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(100px,1fr))', gap: 10, marginBottom: 24 }}>
        {componentesUnicos.map(c => <BigBtn key={c} label={c} selected={data.componente === c} onClick={() => setData(p => ({ ...p, componente: c, defectoParte: '' }))} />)}
      </div>
      {data.componente && (
        <>
          <h3 style={{ fontSize: 14, color: '#F59E0B', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Defecto</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(110px,1fr))', gap: 10 }}>
            {defectosDelComponente.map(d => <BigBtn key={d.id} label={d.defectoParte} selected={data.defectoParte === d.defectoParte} onClick={() => { setData(p => ({ ...p, defectoParte: d.defectoParte })); setStep(6); }} />)}
          </div>
        </>
      )}
    </div>
  );

  // Step 6: confirmar
  if (step === 6) return (
    <div style={wrap}>
      {header('Confirmar Carga', () => setStep(5))}
      <div style={{ background: '#1E293B', borderRadius: 12, padding: 20, border: '1px solid #334155', maxWidth: 480 }}>
        <Row l="Línea" v={linea} />
        <Row l="Secuencia" v={data.secuencia || '—'} />
        <Row l="BSN" v={data.bsn || '—'} />
        <Row l="Lugar de detección" v={data.deteccion} />
        <Row l="Tipo de asiento" v={data.tipoAsiento || '—'} />
        <Row l="Respaldo/Asiento" v={data.parteAsiento || '—'} />
        <Row l="Cuadrante" v={data.cuadrante || '—'} />
        <Row l="Modelo" v={data.modelo || '—'} />
        <Row l="Componente" v={data.componente} />
        <Row l="Defecto" v={data.defectoParte} highlight />
      </div>
      <div style={{ display: 'flex', gap: 12, marginTop: 20, maxWidth: 480 }}>
        <Btn bg="#16A34A" color="#fff" onClick={handleSave} disabled={saving} style={{ flex: 1, padding: 16, fontSize: 16 }}>{saving ? 'Guardando...' : '✓ Confirmar y Cargar'}</Btn>
      </div>
    </div>
  );

  return null;
}

function Row({ l, v, highlight }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #334155' }}>
    <span style={{ fontSize: 12, color: '#94A3B8' }}>{l}</span>
    <span style={{ fontSize: 14, fontWeight: 700, color: highlight ? '#F59E0B' : '#F8FAFC' }}>{v}</span>
  </div>;
}
