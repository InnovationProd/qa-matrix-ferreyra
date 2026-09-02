export const DETECTION_POINTS = [
  { key: 'Recepción', weight: 2, scope: 'int', label: 'Recep.' },
  { key: 'Autocontrol', weight: 4, scope: 'int', label: 'Autoc.' },
  { key: 'IPPM', weight: 6, scope: 'int', label: 'IPPM' },
  { key: 'Scrap', weight: 8, scope: 'int', label: 'Scrap' },
  { key: 'Quality Gate', weight: 10, scope: 'int', label: 'Q.Gate' },
  { key: 'Fast Audit', weight: 12, scope: 'int', label: 'F.Aud.' },
  { key: 'Auditoría de Producto', weight: 14, scope: 'int', label: 'Aud.P.' },
  { key: 'Antena', weight: 16, scope: 'ext', label: 'Antena' },
  { key: 'SCA', weight: 18, scope: 'ext', label: 'SCA' },
  { key: 'TDF/TTV', weight: 20, scope: 'ext', label: 'TDF' },
  { key: 'Garantía', weight: 22, scope: 'ext', label: 'Gta.' },
];
export const OCCURRENCE_TABLE = [
  { pct: 0, occ: 1 },{ pct: 0.000001, occ: 2 },{ pct: 0.00001, occ: 3 },
  { pct: 0.0001, occ: 4 },{ pct: 0.0005, occ: 5 },{ pct: 0.002, occ: 6 },
  { pct: 0.01, occ: 7 },{ pct: 0.02, occ: 8 },{ pct: 0.05, occ: 9 },{ pct: 0.1, occ: 10 },
];

export const TURNOS = ['A', 'B'];
export const ORIGENES = ['Producción', 'Proveedor'];
export const DESTINOS = ['Scrap', 'Devolución Proveedor', 'Retrabajo'];
export const TIPOS_MATERIAL = ['Bailment', 'Cuenta Plena'];
export const DESTINO_COLORS = { 'Scrap': '#DC2626', 'Devolución Proveedor': '#1D4ED8', 'Retrabajo': '#CA8A04' };
