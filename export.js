// ============================================================================
// EXPORT.JS — Carga de diseños + navegación cross-page + PDF report
// saveCurrentDesign, updateSavedDesignsList, deleteDesign, clearAllDesigns,
// exportToJSON, exportToCSV, importDesign → definidas en main.js
// ============================================================================

// ---------------------------------------------------------------------------
// LOAD DESIGN — navega a la página correcta con parámetro URL y pre-carga
// ---------------------------------------------------------------------------
function loadDesign(index) {
    const design = savedDesigns[index];
    if (!design) return;

    const pageMap = {
        inductor:    'inductor.html',
        transformer: 'inductor.html',
        rewind:      'rebobinado.html',
        lcfilter:    'filtros.html',
        smps:        'smps.html',
        motor:       'motor.html'
    };

    const targetPage = pageMap[design.type];
    if (!targetPage) {
        showToast('Tipo de diseño desconocido', 'error');
        return;
    }

    // Guardar en sessionStorage qué diseño cargar al llegar
    try {
        sessionStorage.setItem('pendingLoadIndex', index);
        sessionStorage.setItem('pendingLoadData', JSON.stringify(design));
    } catch (_) {}

    window.location.href = targetPage;
}

// ---------------------------------------------------------------------------
// Restaurar diseño al llegar a la página destino (se llama desde main.js)
// ---------------------------------------------------------------------------
function restorePendingDesign() {
    const raw = sessionStorage.getItem('pendingLoadData');
    if (!raw) return;

    let design;
    try {
        design = JSON.parse(raw);
    } catch (_) { return; }
    sessionStorage.removeItem('pendingLoadData');
    sessionStorage.removeItem('pendingLoadIndex');

    if (!design || !design.type) return;

    try {
        if (design.type === 'inductor') {
            _restoreInductor(design.data);
        } else if (design.type === 'transformer') {
            _restoreTransformer(design.data);
        } else if (design.type === 'rewind') {
            _restoreRewind(design.data);
        } else if (design.type === 'lcfilter') {
            _restoreLCFilter(design.data);
        } else if (design.type === 'smps') {
            _restoreSMPS(design.data);
        } else if (design.type === 'motor') {
            if (typeof motorRestoreDesign === 'function') motorRestoreDesign(design.data);
        }
        showToast('Diseño cargado correctamente', 'success');
    } catch (e) {
        console.error('Error restaurando diseño:', e);
        showToast('Error al cargar el diseño', 'error');
    }
}

function _set(id, val) {
    const el = document.getElementById(id);
    if (el && val !== undefined && val !== null) { el.value = val; return true; }
    return false;
}

function _restoreInductor(d) {
    _set('coreType', d.coreType);
    _set('inductance', d.inductance);
    _set('inductanceUnit', d.inductanceUnit);
    _set('current', d.current);
    _set('wireGauge', d.wireGauge);
    const ct = document.getElementById('coreType');
    if (ct) ct.dispatchEvent(new Event('change'));
    // Navegar a pestaña inductor si existe navegación interna
    const btn = document.querySelector('.nav-btn[data-page="inductor"]');
    if (btn) btn.click();
    setTimeout(() => { if (typeof calculateInductor === 'function') calculateInductor(); }, 100);
}

function _restoreTransformer(d) {
    _set('transCore', d.coreType);
    _set('vPrimary', d.vPrimary);
    _set('vSecondary', d.vSecondary);
    _set('iSecondary', d.iSecondary);
    _set('frequency', d.frequency);
    const btn = document.querySelector('.nav-btn[data-page="transformer"]');
    if (btn) btn.click();
    setTimeout(() => { if (typeof calculateTransformer === 'function') calculateTransformer(); }, 100);
}

function _restoreRewind(d) {
    _set('rwMode', d.mode);
    _set('rwCoreType', d.coreType);
    _set('rwFreq', d.freq);
    _set('rwVprimary', d.Vp);
    _set('rwAe', d.Ae_cm2);
    _set('rwWindowArea', d.winArea_cm2);
    if (typeof rwToggleMode === 'function') rwToggleMode();
    if (d.secondaries) {
        d.secondaries.forEach((s, i) => {
            const n = i + 1;
            if (n > 1 && typeof rwAddSecondary === 'function') rwAddSecondary();
            _set(`rwVsec${n}V`, s.Vs);
            _set(`rwVsec${n}P`, s.Ps);
        });
    }
    setTimeout(() => { if (typeof calculateRewind === 'function') calculateRewind(); }, 100);
}

function _restoreLCFilter(d) {
    _set('lfType', d.filterType);
    _set('lfTopology', d.topology);
    _set('lfOrder', d.order);
    _set('lfFreqCut', d.fc);
    _set('lfLoad', d.Z);
    _set('lfCurrent', d.Imax);
    // Sincronizar botones de topología visual
    document.querySelectorAll('.topology-btn').forEach(b => b.classList.remove('active'));
    const activeTopoBtn = document.querySelector(`.topology-btn[onclick*="${d.topology}"]`);
    if (activeTopoBtn) activeTopoBtn.classList.add('active');
    setTimeout(() => { if (typeof calculateLCFilter === 'function') calculateLCFilter(); }, 100);
}

function _restoreSMPS(d) {
    _set('smTopology', d.topology);
    _set('smVinMin', d.VinMin);
    _set('smVinMax', d.VinMax);
    _set('smFreq', d.freqKHz);
    _set('smDutyMax', d.DutyMax * 100);
    _set('smCoreType', d.coreType);
    _set('smAe', d.Ae_mm2);
    _set('smEfficiency', d.efficiency * 100);
    _set('smRipplePct', d.ripplePct * 100);
    // Sincronizar botones de topología visual
    if (typeof smSelectTopology === 'function') smSelectTopology(d.topology);
    if (d.outputs) {
        d.outputs.forEach((o, i) => {
            const n = i + 1;
            if (n > 1 && typeof smAddOutput === 'function') smAddOutput();
            _set(`smVout${n}`, o.Vout);
            _set(`smIout${n}`, o.Iout);
        });
    }
    setTimeout(() => { if (typeof calculateSMPS === 'function') calculateSMPS(); }, 100);
}

// ---------------------------------------------------------------------------
// EXPORTAR CSV — todos los tipos de diseño
// ---------------------------------------------------------------------------
window.exportToCSV = function () {
    if (savedDesigns.length === 0) {
        showToast('No hay diseños para exportar', 'error');
        return;
    }

    const rows = [['Tipo', 'Fecha', 'Campo1', 'Valor1', 'Campo2', 'Valor2', 'Campo3', 'Valor3', 'Campo4', 'Valor4', 'Campo5', 'Valor5']];

    savedDesigns.forEach(d => {
        const date = new Date(d.timestamp).toLocaleString('es-ES');
        let cols = [];
        if (d.type === 'inductor') {
            cols = ['Material', d.data.coreType, 'Inductancia', `${d.data.inductance}${d.data.inductanceUnit}`, 'Corriente', `${d.data.current}A`, 'AWG', `AWG${d.data.wireGauge}`, '', ''];
        } else if (d.type === 'transformer') {
            cols = ['Material', d.data.coreType, 'Vprimario', `${d.data.vPrimary}V`, 'Vsecundario', `${d.data.vSecondary}V`, 'Isecundario', `${d.data.iSecondary}A`, 'Frecuencia', `${d.data.frequency}Hz`];
        } else if (d.type === 'rewind') {
            const secs = (d.data.secondaries || []).map(s => `${s.Vs}V/${s.Ps}VA`).join('; ');
            cols = ['Vprimario', `${d.data.Vp}V`, 'Frecuencia', `${d.data.freq}Hz`, 'Ae', `${d.data.Ae_cm2}cm²`, 'Secundarios', secs, 'Modo', d.data.mode];
        } else if (d.type === 'lcfilter') {
            cols = ['Tipo filtro', d.data.filterType, 'Topología', d.data.topology, 'Orden', d.data.order, 'fc', `${d.data.fc}Hz`, 'Carga', `${d.data.Z}Ω`];
        } else if (d.type === 'smps') {
            const outs = (d.data.outputs || []).map(o => `${o.Vout}V/${o.Iout}A`).join('; ');
            cols = ['Topología', d.data.topology, 'Vin', `${d.data.VinMin}-${d.data.VinMax}V`, 'Frecuencia', `${d.data.freqKHz}kHz`, 'Salidas', outs, 'η', `${(d.data.efficiency * 100).toFixed(0)}%`];
        } else if (d.type === 'motor') {
            cols = ['Tipo', d.data.motorType === 'three' ? 'Trifásico' : 'Monofásico', 'Tensión', `${d.data.voltage}V/${d.data.freq}Hz`, 'Potencia', `${d.data.powerKW}kW`, 'RPM', d.data.rpm, 'Ranuras Q', d.data.slots];
        } else {
            cols = ['', '', '', '', '', '', '', '', '', ''];
        }
        // Rellenar hasta 10 columnas
        while (cols.length < 10) cols.push('');
        rows.push([_csvEscape(d.type), _csvEscape(date), ...cols.map(_csvEscape)]);
    });

    const csv = rows.map(r => r.join(',')).join('\r\n');
    _download(csv, `disenos_magneticos_${Date.now()}.csv`, 'text/csv;charset=utf-8;');
    showToast('CSV exportado correctamente', 'success');
};

function _csvEscape(v) {
    const s = String(v ?? '');
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
}

// ---------------------------------------------------------------------------
// EXPORTAR PDF — reporte HTML completo que abre en ventana nueva para imprimir
// ---------------------------------------------------------------------------
window.exportToPDF = function () {
    if (savedDesigns.length === 0) {
        showToast('No hay diseños para exportar', 'error');
        return;
    }

    const icons  = { inductor: '🔌', transformer: '🔄', rewind: '🔧', lcfilter: '📐', smps: '⚡', motor: '⚙️' };
    const labels = { inductor: 'Inductor', transformer: 'Transformador', rewind: 'Rebobinado de Red', lcfilter: 'Filtro LC/EMI', smps: 'SMPS', motor: 'Motor de Inducción' };

    let cards = '';
    savedDesigns.forEach((d, i) => {
        const date = new Date(d.timestamp).toLocaleString('es-ES');
        const icon  = icons[d.type]  || '📦';
        const label = labels[d.type] || d.type;

        let details = '';
        if (d.type === 'inductor') {
            details = `<tr><td>Material</td><td>${d.data.coreType}</td></tr>
                       <tr><td>Inductancia</td><td>${d.data.inductance} ${d.data.inductanceUnit}</td></tr>
                       <tr><td>Corriente</td><td>${d.data.current} A</td></tr>
                       <tr><td>Calibre</td><td>AWG ${d.data.wireGauge}</td></tr>`;
        } else if (d.type === 'transformer') {
            details = `<tr><td>Material</td><td>${d.data.coreType}</td></tr>
                       <tr><td>Voltaje primario</td><td>${d.data.vPrimary} V</td></tr>
                       <tr><td>Voltaje secundario</td><td>${d.data.vSecondary} V</td></tr>
                       <tr><td>Corriente secundaria</td><td>${d.data.iSecondary} A</td></tr>
                       <tr><td>Frecuencia</td><td>${d.data.frequency} Hz</td></tr>`;
        } else if (d.type === 'rewind') {
            const secs = (d.data.secondaries || []).map((s, j) => `<tr><td>Secundario ${j+1}</td><td>${s.Vs} V / ${s.Ps} VA</td></tr>`).join('');
            details = `<tr><td>Voltaje primario</td><td>${d.data.Vp} V</td></tr>
                       <tr><td>Frecuencia</td><td>${d.data.freq} Hz</td></tr>
                       <tr><td>Sección Ae</td><td>${d.data.Ae_cm2} cm²</td></tr>
                       <tr><td>Ventana Aw</td><td>${d.data.winArea_cm2} cm²</td></tr>
                       <tr><td>Modo</td><td>${d.data.mode === 'rewind' ? 'Rebobinar existente' : 'Nuevo diseño'}</td></tr>
                       ${secs}`;
        } else if (d.type === 'lcfilter') {
            const ftypes = { lowpass: 'Paso Bajo', highpass: 'Paso Alto', bandpass: 'Paso Banda', notch: 'Notch' };
            details = `<tr><td>Tipo</td><td>${ftypes[d.data.filterType] || d.data.filterType}</td></tr>
                       <tr><td>Topología</td><td>${d.data.topology}</td></tr>
                       <tr><td>Orden</td><td>${d.data.order}</td></tr>
                       <tr><td>Frecuencia de corte</td><td>${d.data.fc} Hz</td></tr>
                       <tr><td>Impedancia de carga</td><td>${d.data.Z} Ω</td></tr>
                       <tr><td>Corriente máxima</td><td>${d.data.Imax} A</td></tr>`;
        } else if (d.type === 'smps') {
            const outs = (d.data.outputs || []).map((o, j) => `<tr><td>Salida ${j+1}</td><td>${o.Vout} V / ${o.Iout} A</td></tr>`).join('');
            details = `<tr><td>Topología</td><td>${d.data.topology === 'flyback' ? 'Flyback' : 'Forward'}</td></tr>
                       <tr><td>Tensión entrada</td><td>${d.data.VinMin}–${d.data.VinMax} V</td></tr>
                       <tr><td>Frecuencia</td><td>${d.data.freqKHz} kHz</td></tr>
                       <tr><td>Duty Cycle máx</td><td>${(d.data.DutyMax * 100).toFixed(0)}%</td></tr>
                       <tr><td>Eficiencia estimada</td><td>${(d.data.efficiency * 100).toFixed(0)}%</td></tr>
                       ${outs}`;
        }

        cards += `
        <div class="card">
            <div class="card-head">
                <span class="card-icon">${icon}</span>
                <div>
                    <div class="card-title">${label}</div>
                    <div class="card-date">${date}</div>
                </div>
                <span class="card-num">#${i + 1}</span>
            </div>
            <table class="card-table"><tbody>${details}</tbody></table>
        </div>`;
    });

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Reporte — Suite de Diseño Magnético</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', sans-serif; background: #f8fafc; color: #1e293b; padding: 32px; }
  h1 { font-size: 22px; font-weight: 800; margin-bottom: 4px; color: #1e293b; }
  .subtitle { font-size: 13px; color: #64748b; margin-bottom: 28px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 20px; }
  .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px; break-inside: avoid; }
  .card-head { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
  .card-icon { font-size: 26px; }
  .card-title { font-weight: 700; font-size: 15px; }
  .card-date { font-size: 11px; color: #94a3b8; margin-top: 2px; }
  .card-num { margin-left: auto; font-size: 12px; font-weight: 700; color: #94a3b8; background: #f1f5f9; padding: 3px 8px; border-radius: 20px; }
  .card-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .card-table td { padding: 5px 6px; border-bottom: 1px solid #f1f5f9; }
  .card-table td:first-child { color: #64748b; width: 50%; }
  .card-table td:last-child { font-weight: 600; }
  .footer { text-align: center; margin-top: 32px; font-size: 11px; color: #94a3b8; }
  @media print { body { padding: 16px; } .card { break-inside: avoid; } }
</style>
</head>
<body>
<h1>📋 Reporte de Diseños Magnéticos</h1>
<div class="subtitle">Generado el ${new Date().toLocaleString('es-ES')} · ${savedDesigns.length} diseño(s)</div>
<div class="grid">${cards}</div>
<div class="footer">Suite de Diseño Magnético — Calculadoras offline para ingeniería de componentes magnéticos</div>
<script>window.onload = () => window.print();<\/script>
</body>
</html>`;

    const win = window.open('', '_blank');
    if (win) {
        win.document.write(html);
        win.document.close();
    } else {
        showToast('El navegador bloqueó la ventana emergente. Permite pop-ups para exportar PDF.', 'error');
    }
};

// ---------------------------------------------------------------------------
// EXPORTAR PDF de un diseño individual — reporte completo
// ---------------------------------------------------------------------------
window.exportDesignToPDF = function (index) {
    const d = savedDesigns[index];
    if (!d) { showToast('Diseño no encontrado', 'error'); return; }

    const icons  = { inductor: '🔌', transformer: '🔄', rewind: '🔧', lcfilter: '📐', smps: '⚡', motor: '⚙️' };
    const labels = { inductor: 'Inductor Toroidal', transformer: 'Transformador de Red', rewind: 'Rebobinado de Transformador', lcfilter: 'Filtro LC/EMI', smps: 'Fuente Conmutada SMPS', motor: 'Rebobinado de Motor de Inducción' };

    const icon  = icons[d.type]  || '📦';
    const label = labels[d.type] || d.type;
    const date  = new Date(d.timestamp).toLocaleString('es-ES');

    let sections = '';

    if (d.type === 'inductor') {
        const core = (typeof coreDatabase !== 'undefined' && coreDatabase[d.data.coreType]) || {};
        sections = `
        <div class="section">
            <div class="section-title">Parámetros de Diseño</div>
            <table><tbody>
                <tr><td>Material del núcleo</td><td>${d.data.coreType}${core.name ? ' — ' + core.name : ''}</td></tr>
                <tr><td>Inductancia requerida</td><td>${d.data.inductance} ${d.data.inductanceUnit}</td></tr>
                <tr><td>Corriente de operación</td><td>${d.data.current} A</td></tr>
                <tr><td>Calibre de alambre</td><td>AWG ${d.data.wireGauge}</td></tr>
            </tbody></table>
        </div>
        <div class="section">
            <div class="section-title">Propiedades del Material</div>
            <table><tbody>
                <tr><td>Permeabilidad relativa (μr)</td><td>${core.mu_r || '—'}</td></tr>
                <tr><td>Saturación (Bsat)</td><td>${core.bsat ? core.bsat + ' T' : '—'}</td></tr>
                <tr><td>Pérdidas de referencia</td><td>${core.loss ? core.loss + ' mW/cm³' : '—'}</td></tr>
            </tbody></table>
        </div>`;
    } else if (d.type === 'transformer') {
        const core = (typeof coreDatabase !== 'undefined' && coreDatabase[d.data.coreType]) || {};
        const Pout = d.data.vSecondary * d.data.iSecondary;
        sections = `
        <div class="section">
            <div class="section-title">Parámetros de Diseño</div>
            <table><tbody>
                <tr><td>Material del núcleo</td><td>${d.data.coreType}${core.name ? ' — ' + core.name : ''}</td></tr>
                <tr><td>Voltaje primario</td><td>${d.data.vPrimary} V</td></tr>
                <tr><td>Voltaje secundario</td><td>${d.data.vSecondary} V</td></tr>
                <tr><td>Corriente secundaria</td><td>${d.data.iSecondary} A</td></tr>
                <tr><td>Potencia de salida</td><td>${Pout.toFixed(1)} VA</td></tr>
                <tr><td>Frecuencia</td><td>${d.data.frequency} Hz</td></tr>
                <tr><td>Relación de transformación</td><td>${(d.data.vPrimary / d.data.vSecondary).toFixed(2)} : 1</td></tr>
            </tbody></table>
        </div>
        <div class="section">
            <div class="section-title">Propiedades del Material</div>
            <table><tbody>
                <tr><td>Permeabilidad relativa (μr)</td><td>${core.mu_r || '—'}</td></tr>
                <tr><td>Saturación (Bsat)</td><td>${core.bsat ? core.bsat + ' T' : '—'}</td></tr>
                <tr><td>Rango de frecuencia</td><td>${core.frequency_range ? core.frequency_range.join(' – ') + ' Hz' : '—'}</td></tr>
            </tbody></table>
        </div>`;
    } else if (d.type === 'rewind') {
        const core = (typeof coreDatabase !== 'undefined' && coreDatabase[d.data.coreType]) || {};
        const Ptotal = (d.data.secondaries || []).reduce((s, x) => s + (Number(x.Ps) || 0), 0);
        const secRows = (d.data.secondaries || []).map((s, j) => `
                <tr><td>Secundario ${j+1} — Voltaje</td><td>${s.Vs} V</td></tr>
                <tr><td>Secundario ${j+1} — Potencia</td><td>${s.Ps} VA</td></tr>
                <tr><td>Secundario ${j+1} — Corriente</td><td>${(s.Ps / s.Vs).toFixed(3)} A</td></tr>`).join('');
        sections = `
        <div class="section">
            <div class="section-title">Parámetros del Transformador Original</div>
            <table><tbody>
                <tr><td>Modo de operación</td><td>${d.data.mode === 'rewind' ? 'Rebobinar existente' : 'Nuevo diseño'}</td></tr>
                <tr><td>Voltaje primario</td><td>${d.data.Vp} V</td></tr>
                <tr><td>Frecuencia de red</td><td>${d.data.freq} Hz</td></tr>
                <tr><td>Material del núcleo</td><td>${d.data.coreType}${core.name ? ' — ' + core.name : ''}</td></tr>
                <tr><td>Sección efectiva (Ae)</td><td>${d.data.Ae_cm2} cm²</td></tr>
                <tr><td>Área de ventana (Aw)</td><td>${d.data.winArea_cm2} cm²</td></tr>
                <tr><td>Potencia total secundaria</td><td>${Ptotal.toFixed(1)} VA</td></tr>
            </tbody></table>
        </div>
        <div class="section">
            <div class="section-title">Devanados Secundarios</div>
            <table><tbody>${secRows}</tbody></table>
        </div>
        <div class="section">
            <div class="section-title">Propiedades del Núcleo</div>
            <table><tbody>
                <tr><td>Permeabilidad relativa (μr)</td><td>${core.mu_r || '—'}</td></tr>
                <tr><td>Flujo de saturación (Bsat)</td><td>${core.bsat ? core.bsat + ' T' : '—'}</td></tr>
                <tr><td>Pérdidas (ref.)</td><td>${core.loss ? core.loss + ' mW/cm³' : '—'}</td></tr>
                <tr><td>Rango de frecuencia</td><td>${core.frequency_range ? core.frequency_range.join(' – ') + ' Hz' : '—'}</td></tr>
            </tbody></table>
        </div>`;
    } else if (d.type === 'lcfilter') {
        const ftypes = { lowpass: 'Paso Bajo (Low-Pass)', highpass: 'Paso Alto (High-Pass)', bandpass: 'Paso Banda (Band-Pass)', notch: 'Notch (Rechazo de banda)' };
        sections = `
        <div class="section">
            <div class="section-title">Especificaciones del Filtro</div>
            <table><tbody>
                <tr><td>Tipo de filtro</td><td>${ftypes[d.data.filterType] || d.data.filterType}</td></tr>
                <tr><td>Topología</td><td>${d.data.topology}</td></tr>
                <tr><td>Orden del filtro</td><td>${d.data.order}</td></tr>
                <tr><td>Frecuencia de corte (fc)</td><td>${d.data.fc} Hz</td></tr>
                <tr><td>Frecuencia angular (ωc)</td><td>${(2 * Math.PI * d.data.fc).toFixed(1)} rad/s</td></tr>
                <tr><td>Impedancia de carga (Z)</td><td>${d.data.Z} Ω</td></tr>
                <tr><td>Corriente máxima</td><td>${d.data.Imax} A</td></tr>
            </tbody></table>
        </div>
        <div class="section">
            <div class="section-title">Notas de Diseño</div>
            <table><tbody>
                <tr><td>Atenuación estimada (1 dec.)</td><td>${(20 * d.data.order).toFixed(0)} dB/dec</td></tr>
                <tr><td>Pendiente de rolloff</td><td>−${d.data.order * 6} dB/octava</td></tr>
            </tbody></table>
        </div>`;
    } else if (d.type === 'smps') {
        const core = (typeof coreDatabase !== 'undefined' && coreDatabase[d.data.coreType]) || {};
        const Pout = (d.data.outputs || []).reduce((s, o) => s + (o.Vout * o.Iout), 0);
        const Pin  = Pout / (d.data.efficiency || 0.85);
        const outRows = (d.data.outputs || []).map((o, j) => `
                <tr><td>Salida ${j+1} — Voltaje</td><td>${o.Vout} V</td></tr>
                <tr><td>Salida ${j+1} — Corriente</td><td>${o.Iout} A</td></tr>
                <tr><td>Salida ${j+1} — Potencia</td><td>${(o.Vout * o.Iout).toFixed(1)} W</td></tr>`).join('');
        sections = `
        <div class="section">
            <div class="section-title">Parámetros de la Fuente Conmutada</div>
            <table><tbody>
                <tr><td>Topología</td><td>${d.data.topology === 'flyback' ? 'Flyback' : 'Forward'}</td></tr>
                <tr><td>Tensión de entrada mínima</td><td>${d.data.VinMin} V</td></tr>
                <tr><td>Tensión de entrada máxima</td><td>${d.data.VinMax} V</td></tr>
                <tr><td>Frecuencia de conmutación</td><td>${d.data.freqKHz} kHz</td></tr>
                <tr><td>Duty cycle máximo</td><td>${(d.data.DutyMax * 100).toFixed(0)}%</td></tr>
                <tr><td>Material del núcleo</td><td>${d.data.coreType}${core.name ? ' — ' + core.name : ''}</td></tr>
                <tr><td>Sección efectiva (Ae)</td><td>${d.data.Ae_mm2} mm²</td></tr>
                <tr><td>Eficiencia estimada</td><td>${(d.data.efficiency * 100).toFixed(0)}%</td></tr>
                <tr><td>Ondulación de corriente</td><td>${(d.data.ripplePct * 100).toFixed(0)}%</td></tr>
            </tbody></table>
        </div>
        <div class="section">
            <div class="section-title">Salidas de Voltaje</div>
            <table><tbody>
                ${outRows}
                <tr class="total"><td>Potencia de salida total</td><td>${Pout.toFixed(1)} W</td></tr>
                <tr class="total"><td>Potencia de entrada estimada</td><td>${Pin.toFixed(1)} W</td></tr>
            </tbody></table>
        </div>
        <div class="section">
            <div class="section-title">Propiedades del Núcleo</div>
            <table><tbody>
                <tr><td>Permeabilidad relativa (μr)</td><td>${core.mu_r || '—'}</td></tr>
                <tr><td>Saturación (Bsat)</td><td>${core.bsat ? core.bsat + ' T' : '—'}</td></tr>
                <tr><td>Rango de frecuencia</td><td>${core.frequency_range ? (core.frequency_range[0]/1000).toFixed(0) + ' – ' + (core.frequency_range[1]/1000).toFixed(0) + ' kHz' : '—'}</td></tr>
            </tbody></table>
        </div>`;
    } else if (d.type === 'motor') {
        const mtype = d.data.motorType === 'three' ? 'Trifásico' : 'Monofásico';
        const conn  = d.data.motorType === 'three'
            ? (d.data.connection === 'star' ? 'Estrella (Y)' : 'Triángulo (Δ)') : '—';
        const ins_labels = { A: 'Clase A (105°C)', B: 'Clase B (130°C)', F: 'Clase F (155°C)', H: 'Clase H (180°C)' };
        const slotTypeNames = { rect: 'Rectangular', trap: 'Trapezoidal', semi: 'Semicircular' };
        const sd = d.data.slotDims || {};
        sections = `
        <div class="section">
            <div class="section-title">Datos de Placa</div>
            <table><tbody>
                <tr><td>Tipo de motor</td><td>${mtype}</td></tr>
                <tr><td>Tensión nominal</td><td>${d.data.voltage} V / ${d.data.freq} Hz</td></tr>
                <tr><td>Potencia</td><td>${parseFloat(d.data.powerKW || 0).toFixed(3)} kW (${parseFloat(d.data.powerHP || 0).toFixed(2)} HP)</td></tr>
                <tr><td>Velocidad nominal</td><td>${d.data.rpm} RPM</td></tr>
                <tr><td>Factor de potencia (cos φ)</td><td>${d.data.cosfi}</td></tr>
                <tr><td>Eficiencia (η)</td><td>${((d.data.eta || 1) * 100).toFixed(0)}%</td></tr>
                ${d.data.motorType === 'three' ? `<tr><td>Conexión</td><td>${conn}</td></tr>` : ''}
                ${d.data.motorType === 'single' ? `<tr><td>Método de arranque</td><td>${d.data.startMethod}</td></tr>` : ''}
            </tbody></table>
        </div>
        <div class="section">
            <div class="section-title">Geometría del Estátor</div>
            <table><tbody>
                <tr><td>Diámetro exterior OD</td><td>${d.data.extDiam || '—'} mm</td></tr>
                <tr><td>Diámetro interior ID (bore)</td><td>${d.data.boreDiam} mm</td></tr>
                <tr><td>Longitud del paquete L</td><td>${d.data.stackLength} mm</td></tr>
                <tr><td>Número de ranuras Q</td><td>${d.data.slots}</td></tr>
                <tr><td>Material del núcleo</td><td>${d.data.steelType || 'Acero silicio'}</td></tr>
                <tr><td>Inducción media Bav</td><td>${d.data.Bav} T</td></tr>
                <tr><td>Tipo de paso</td><td>${d.data.pitchType === 'full' ? 'Paso pleno' : `Paso corto (β = ${d.data.pitchRatio})`}</td></tr>
            </tbody></table>
        </div>
        <div class="section">
            <div class="section-title">Geometría de Ranura</div>
            <table><tbody>
                <tr><td>Tipo de ranura</td><td>${slotTypeNames[d.data.slotType] || d.data.slotType || 'Rectangular'}</td></tr>
                <tr><td>Ancho de boca (b1)</td><td>${sd.b1 || '—'} mm</td></tr>
                <tr><td>Alto de boca (h1)</td><td>${sd.h1 || '—'} mm</td></tr>
                <tr><td>Ancho del cuerpo (bw)</td><td>${sd.bw || sd.btop && sd.bbot ? `${sd.btop}–${sd.bbot}` : '—'} mm</td></tr>
                <tr><td>Alto del cuerpo (hw)</td><td>${sd.hw || '—'} mm</td></tr>
                ${sd.r ? `<tr><td>Radio del fondo (r)</td><td>${sd.r} mm</td></tr>` : ''}
            </tbody></table>
        </div>
        <div class="section">
            <div class="section-title">Aislamiento y Referencia</div>
            <table><tbody>
                <tr><td>Clase de aislamiento</td><td>${ins_labels[d.data.insClass] || d.data.insClass}</td></tr>
                ${d.data.existAWG   ? `<tr><td>Calibre original</td><td>AWG ${d.data.existAWG}</td></tr>` : ''}
                ${d.data.existTurns ? `<tr><td>Vueltas/bobina originales</td><td>${d.data.existTurns}</td></tr>` : ''}
            </tbody></table>
        </div>`;
    }

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Reporte — ${label}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; background: #f8fafc; color: #1e293b; padding: 40px 48px; max-width: 780px; margin: 0 auto; }

  /* Header */
  .report-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 32px; padding-bottom: 20px; border-bottom: 2px solid #e2e8f0; }
  .report-title-block {}
  .report-icon { font-size: 36px; margin-bottom: 6px; }
  .report-title { font-size: 22px; font-weight: 800; color: #0f172a; margin-bottom: 4px; }
  .report-subtitle { font-size: 13px; color: #64748b; }
  .report-meta { text-align: right; font-size: 12px; color: #94a3b8; line-height: 1.8; }
  .report-meta strong { color: #475569; }

  /* Sections */
  .section { margin-bottom: 24px; break-inside: avoid; }
  .section-title { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: #667eea; margin-bottom: 10px; padding-bottom: 6px; border-bottom: 1px solid #e2e8f0; }

  /* Tables */
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  tr { border-bottom: 1px solid #f1f5f9; }
  tr:last-child { border-bottom: none; }
  td { padding: 7px 10px; vertical-align: top; }
  td:first-child { color: #64748b; width: 55%; font-weight: 500; }
  td:last-child { font-weight: 700; color: #0f172a; }
  tr.total td { background: #f1f5f9; font-weight: 800; }
  tr.total td:last-child { color: #667eea; }

  /* Footer */
  .report-footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; }
  .footer-left { font-size: 11px; color: #94a3b8; }
  .footer-right { font-size: 11px; color: #94a3b8; }

  /* Print */
  @media print {
    body { padding: 24px 32px; }
    .section { break-inside: avoid; }
    @page { margin: 2cm; }
  }
</style>
</head>
<body>
<div class="report-header">
    <div class="report-title-block">
        <div class="report-icon">${icon}</div>
        <div class="report-title">${label}</div>
        <div class="report-subtitle">Reporte de Diseño Magnético</div>
    </div>
    <div class="report-meta">
        <strong>Fecha de diseño</strong><br>${date}<br><br>
        <strong>Ref. #${index + 1}</strong>
    </div>
</div>

${sections}

<div class="report-footer">
    <div class="footer-left">Suite de Diseño Magnético — Calculadoras offline</div>
    <div class="footer-right">Generado el ${new Date().toLocaleString('es-ES')}</div>
</div>
<script>window.onload = () => { window.print(); };<\/script>
</body>
</html>`;

    const win = window.open('', '_blank');
    if (win) {
        win.document.write(html);
        win.document.close();
    } else {
        showToast('Permite ventanas emergentes (pop-ups) para exportar PDF', 'error');
    }
};

function _download(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
}
