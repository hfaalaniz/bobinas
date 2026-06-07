// ============================================================================
// LCFILTER.JS — Módulo B: Diseño de Filtros LC/EMI
// ============================================================================

(function () {

    // Coeficientes Butterworth normalizados (Lowpass, para orden 1-3, L-section base)
    // Normalizados para Ω=1 rad/s, Z=1Ω. Escalar: L→L×Z/ω, C→C/(Z×ω)
    const BUTTERWORTH = {
        1: { g: [1.0000] },
        2: { g: [1.4142, 1.4142] },
        3: { g: [1.0000, 2.0000, 1.0000] }
    };

    // -------------------------------------------------------------------------
    // CÁLCULO PRINCIPAL
    // -------------------------------------------------------------------------
    window.calculateLCFilter = function () {
        const filterType = document.getElementById('lfType').value;
        const topology   = document.getElementById('lfTopology').value;
        const order      = parseInt(document.getElementById('lfOrder').value) || 1;
        const fc         = parseFloat(document.getElementById('lfFreqCut').value) || 1000;
        const Z          = parseFloat(document.getElementById('lfLoad').value) || 50;
        const Imax       = parseFloat(document.getElementById('lfCurrent').value) || 1;

        if (fc <= 0 || Z <= 0 || Imax <= 0) {
            _lfShowError('Todos los valores deben ser positivos');
            return;
        }

        const params = { filterType, topology, order, fc, Z, Imax };
        let results;

        try {
            results = calculateFilterCore(params);
        } catch (e) {
            _lfShowError(e.message);
            return;
        }

        displayFilterResults(results);
        drawFilterSchematic(results);
        drawFrequencyResponse(results);

        // Guardar diseño
        savedDesigns.push({
            timestamp: new Date().toISOString(),
            type: 'lcfilter',
            data: { filterType, topology, order, fc, Z, Imax }
        });
        try { localStorage.setItem('inductorDesigns', JSON.stringify(savedDesigns)); } catch (_) {}
    };

    // -------------------------------------------------------------------------
    // NÚCLEO DE CÁLCULO
    // -------------------------------------------------------------------------
    function calculateFilterCore(p) {
        const { filterType, topology, order, fc, Z, Imax } = p;
        const wc = 2 * Math.PI * fc;
        const g  = BUTTERWORTH[order]?.g || BUTTERWORTH[1].g;

        // Componentes Butterworth normalizados → desnormalizados
        // Para lowpass L-ladder: L_k = g_k × Z / wc, C_k = g_k / (Z × wc)
        let rawL = [], rawC = [];

        if (filterType === 'lowpass' || filterType === 'highpass') {
            // Alternar L y C según el índice (L-ladder)
            let li = 0, ci = 0;
            for (let k = 0; k < order; k++) {
                if (k % 2 === 0) {
                    rawL.push(g[k] * Z / wc);
                    li++;
                } else {
                    rawC.push(g[k] / (Z * wc));
                    ci++;
                }
            }
            // Si orden par y falta C de cierre
            if (order === 2) {
                rawL = [g[0] * Z / wc];
                rawC = [g[1] / (Z * wc)];
            }
            if (order === 3) {
                rawL = [g[0] * Z / wc, g[2] * Z / wc];
                rawC = [g[1] / (Z * wc)];
            }

            if (filterType === 'highpass') {
                // Dualidad: L_hp = 1/(wc²×C_lp), C_hp = 1/(wc²×L_lp)
                rawL = rawC.map(c => 1 / (wc * wc * c));
                rawC = rawL.map(l => 1 / (wc * wc * l));
                // Recalcular correctamente
                const gArr = g;
                rawL = []; rawC = [];
                for (let k = 0; k < order; k++) {
                    if (k % 2 === 0) rawC.push(1 / (gArr[k] * Z * wc));
                    else             rawL.push(Z / (gArr[k] * wc));
                }
            }
        } else if (filterType === 'bandpass' || filterType === 'notch') {
            // Para bandpass/notch necesitamos ancho de banda
            const BW  = fc / (order + 1); // Q estimado
            const w0  = wc;
            rawL = [Z / (2 * Math.PI * BW)];
            rawC = [1 / (4 * Math.PI * Math.PI * fc * fc * rawL[0])];
        }

        // Adaptar a topología
        let components = _applyTopology(rawL, rawC, topology);

        // AWG inductor (corriente máxima)
        const awg  = selectWireGaugeOptimal(Imax, 3);
        const wire = awgTable[awg];

        // Atenuación en puntos clave
        const attenuation = _calcAttenuation(filterType, order, fc);

        return {
            filterType, topology, order, fc, Z, Imax,
            components,         // [{type:'L'|'C', value, position:'series'|'shunt', label}]
            rawL, rawC,
            awg, wire,
            attenuation,        // [{f, A_dB}]
            wc
        };
    }

    function _applyTopology(rawL, rawC, topology) {
        const comps = [];
        const L0 = rawL[0] || 0;
        const L1 = rawL[1] || 0;
        const C0 = rawC[0] || 0;

        if (topology === 'L') {
            if (L0) comps.push({ type: 'L', value: L0, position: 'series', label: _fmtL(L0) });
            if (C0) comps.push({ type: 'C', value: C0, position: 'shunt',  label: _fmtC(C0) });
        } else if (topology === 'T') {
            const Ls = L0 / 2;
            comps.push({ type: 'L', value: Ls, position: 'series', label: _fmtL(Ls) });
            if (C0) comps.push({ type: 'C', value: C0, position: 'shunt', label: _fmtC(C0) });
            comps.push({ type: 'L', value: Ls, position: 'series', label: _fmtL(Ls) });
        } else if (topology === 'Pi') {
            const Cs = C0 / 2;
            comps.push({ type: 'C', value: Cs, position: 'shunt',  label: _fmtC(Cs) });
            if (L0) comps.push({ type: 'L', value: L0, position: 'series', label: _fmtL(L0) });
            comps.push({ type: 'C', value: Cs, position: 'shunt',  label: _fmtC(Cs) });
        }
        return comps;
    }

    function _calcAttenuation(filterType, order, fc) {
        const points = [0.1, 0.5, 1, 2, 5, 10, 20, 50, 100];
        return points.map(mult => {
            const f = fc * mult;
            let A_dB = 0;
            if (filterType === 'lowpass') {
                if (f > fc) A_dB = 20 * order * Math.log10(f / fc);
            } else if (filterType === 'highpass') {
                if (f < fc) A_dB = 20 * order * Math.log10(fc / f);
            } else if (filterType === 'bandpass') {
                const BW = fc / (order + 1);
                A_dB = (f < fc * 0.5 || f > fc * 2) ? 20 * order * Math.log10(Math.abs(f - fc) / BW) : 0;
            } else if (filterType === 'notch') {
                A_dB = (Math.abs(f - fc) < fc * 0.1) ? 40 : 0;
            }
            return { f, mult, A_dB: Math.max(0, A_dB) };
        });
    }

    // -------------------------------------------------------------------------
    // VISUALIZAR RESULTADOS
    // -------------------------------------------------------------------------
    function displayFilterResults(r) {
        const container = document.getElementById('lfResults');
        if (!container) return;

        const typeNames = { lowpass: 'Paso Bajo', highpass: 'Paso Alto', bandpass: 'Paso Banda', notch: 'Trampa (Notch)' };
        const topoNames = { L: 'L-Network', T: 'T-Network', Pi: 'Pi-Network' };

        let html = '<div class="result-grid">';
        html += _lfHeader('CONFIGURACIÓN DEL FILTRO');
        html += createResultItem('Tipo', typeNames[r.filterType] || r.filterType, '');
        html += createResultItem('Topología', topoNames[r.topology] || r.topology, '');
        html += createResultItem('Orden', r.order, '');
        html += createResultItem('Frecuencia de Corte', _fmtFreq(r.fc), '');
        html += createResultItem('Impedancia de Carga', r.Z.toFixed(1), 'Ω');

        html += _lfHeader('COMPONENTES');
        let lCount = 1, cCount = 1;
        r.components.forEach(comp => {
            if (comp.type === 'L') {
                html += createResultItem(`Inductor L${lCount++} (${comp.position === 'series' ? 'serie' : 'paralelo'})`, comp.label, '');
            } else {
                html += createResultItem(`Capacitor C${cCount++} (${comp.position === 'series' ? 'serie' : 'paralelo'})`, comp.label, '');
            }
        });

        html += _lfHeader('INDUCTOR (BOBINA)');
        html += createResultItem('Corriente Máxima', r.Imax.toFixed(2), 'A');
        html += createResultItem('Calibre Recomendado', `AWG ${r.awg}`, '');
        html += createResultItem('Diámetro Cable', r.wire.diameter.toFixed(3), 'mm');

        html += '</div>';

        // Tabla de atenuación
        html += '<h3 style="margin-top:20px">Atenuación por Frecuencia</h3>';
        html += '<table class="attenuation-table"><thead><tr>';
        html += '<th>Frecuencia</th><th>Relación f/fc</th><th>Atenuación (dB)</th><th>Zona</th>';
        html += '</tr></thead><tbody>';

        r.attenuation.forEach(pt => {
            const inPassband = (r.filterType === 'lowpass' && pt.f <= r.fc) ||
                               (r.filterType === 'highpass' && pt.f >= r.fc);
            const cls = pt.A_dB === 0 ? 'at-passband' : (pt.A_dB > 20 ? 'at-stopband' : '');
            html += `<tr class="${cls}">
                <td>${_fmtFreq(pt.f)}</td>
                <td>${pt.mult}×</td>
                <td>${pt.A_dB.toFixed(1)} dB</td>
                <td>${inPassband ? '✅ Paso' : (pt.A_dB > 3 ? '🚫 Rechazo' : '⚠️ Transición')}</td>
            </tr>`;
        });
        html += '</tbody></table>';

        container.innerHTML = html;
    }

    function _lfHeader(text) {
        return `<div style="grid-column:1/-1;background:linear-gradient(135deg,#11998e,#38ef7d);color:white;padding:10px;border-radius:8px;font-weight:bold;text-align:center;margin-top:10px">${text}</div>`;
    }

    function _lfShowError(msg) {
        const c = document.getElementById('lfResults');
        if (c) c.innerHTML = `<div class="result-item error"><div class="result-label">❌ Error</div><div class="result-value">${msg}</div></div>`;
    }

    // -------------------------------------------------------------------------
    // CANVAS: ESQUEMÁTICO
    // -------------------------------------------------------------------------
    function drawFilterSchematic(r) {
        const canvas = document.getElementById('lfSchematic');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const W = canvas.offsetWidth || 500;
        if (canvas.width !== W) canvas.width = W;
        if (canvas.height !== 200) canvas.height = 200;
        ctx.clearRect(0, 0, W, 200);

        const cy    = 80;
        const startX = 30;
        const endX   = W - 30;
        const comps  = r.components;
        const step   = (endX - startX) / (comps.length + 1);

        ctx.strokeStyle = '#333';
        ctx.lineWidth   = 2;

        // Línea horizontal principal
        ctx.beginPath();
        ctx.moveTo(startX, cy);
        ctx.lineTo(endX, cy);
        ctx.stroke();

        // Tierra
        const groundY = cy + 70;
        ctx.beginPath();
        ctx.moveTo(startX, cy);
        ctx.lineTo(startX, groundY);
        ctx.moveTo(endX, cy);
        ctx.lineTo(endX, groundY);
        // Símbolo de tierra
        [startX, endX].forEach(gx => {
            ctx.moveTo(gx - 15, groundY);
            ctx.lineTo(gx + 15, groundY);
            ctx.moveTo(gx - 10, groundY + 5);
            ctx.lineTo(gx + 10, groundY + 5);
            ctx.moveTo(gx - 5, groundY + 10);
            ctx.lineTo(gx + 5, groundY + 10);
        });
        ctx.stroke();

        // Etiquetas entrada/salida
        ctx.fillStyle = '#333';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Vin', startX, cy - 14);
        ctx.fillText('Vout', endX, cy - 14);

        // Componentes
        comps.forEach((comp, i) => {
            const x = startX + step * (i + 1);
            if (comp.position === 'series') {
                _drawSeriesComponent(ctx, comp.type, x, cy, comp.label);
            } else {
                _drawShuntComponent(ctx, comp.type, x, cy, groundY, comp.label);
            }
        });
    }

    function _drawSeriesComponent(ctx, type, x, cy, label) {
        ctx.fillStyle = type === 'L' ? '#667eea' : '#10b981';
        ctx.strokeStyle = type === 'L' ? '#667eea' : '#10b981';
        ctx.lineWidth = 2;

        if (type === 'L') {
            // Símbolo inductor: arcos
            ctx.beginPath();
            for (let a = 0; a < 3; a++) {
                ctx.arc(x - 15 + a * 10, cy, 5, Math.PI, 0);
            }
            ctx.stroke();
            ctx.strokeStyle = '#333';
            ctx.beginPath();
            ctx.moveTo(x - 20, cy); ctx.lineTo(x - 20, cy);
            ctx.stroke();
        } else {
            // Símbolo capacitor: dos líneas verticales
            ctx.beginPath();
            ctx.moveTo(x - 5, cy - 12); ctx.lineTo(x - 5, cy + 12);
            ctx.moveTo(x + 5, cy - 12); ctx.lineTo(x + 5, cy + 12);
            ctx.stroke();
        }

        ctx.fillStyle = '#333';
        ctx.font = '11px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(label, x, cy - 20);
        ctx.fillText(type, x, cy + 22);
    }

    function _drawShuntComponent(ctx, type, x, cy, groundY, label) {
        const midY = (cy + groundY) / 2;
        ctx.strokeStyle = '#333';
        ctx.lineWidth   = 2;
        ctx.beginPath();
        ctx.moveTo(x, cy);
        ctx.lineTo(x, midY - 15);
        ctx.stroke();

        ctx.strokeStyle = type === 'L' ? '#667eea' : '#10b981';

        if (type === 'L') {
            for (let a = 0; a < 3; a++) {
                ctx.beginPath();
                ctx.arc(x, midY - 15 + a * 10, 5, -Math.PI / 2, Math.PI / 2);
                ctx.stroke();
            }
        } else {
            ctx.beginPath();
            ctx.moveTo(x - 12, midY - 5); ctx.lineTo(x + 12, midY - 5);
            ctx.moveTo(x - 12, midY + 5); ctx.lineTo(x + 12, midY + 5);
            ctx.stroke();
        }

        ctx.strokeStyle = '#333';
        ctx.beginPath();
        ctx.moveTo(x, midY + 15);
        ctx.lineTo(x, groundY);
        ctx.stroke();

        ctx.fillStyle = '#333';
        ctx.font = '11px Arial';
        ctx.textAlign = 'left';
        ctx.fillText(label, x + 14, midY);
        ctx.fillText(type, x + 14, midY + 14);
    }

    // -------------------------------------------------------------------------
    // CHART.JS: RESPUESTA EN FRECUENCIA
    // -------------------------------------------------------------------------
    function drawFrequencyResponse(r) {
        const canvas = document.getElementById('lfChart');
        if (!canvas || typeof Chart === 'undefined') return;

        if (window.lfChartInstance) {
            window.lfChartInstance.destroy();
            window.lfChartInstance = null;
        }

        // Generar 80 puntos log entre fc/100 y fc×100
        const freqs = [];
        const attenuations = [];
        const fcLow  = r.fc / 100;
        const fcHigh = r.fc * 100;

        for (let i = 0; i <= 80; i++) {
            const f = fcLow * Math.pow(fcHigh / fcLow, i / 80);
            freqs.push(f);
            const pt = _calcAttenuationAt(r.filterType, r.order, r.fc, f);
            attenuations.push(-pt); // negativo = atenuación en dB
        }

        window.lfChartInstance = new Chart(canvas.getContext('2d'), {
            type: 'line',
            data: {
                labels: freqs.map(_fmtFreq),
                datasets: [{
                    label: 'Atenuación (dB)',
                    data: attenuations,
                    borderColor: '#667eea',
                    backgroundColor: 'rgba(102,126,234,0.1)',
                    borderWidth: 2,
                    pointRadius: 0,
                    fill: true,
                    tension: 0.3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: { display: true, text: 'Respuesta en Frecuencia', font: { size: 16, weight: 'bold' } },
                    legend: { display: false }
                },
                scales: {
                    x: {
                        title: { display: true, text: 'Frecuencia' },
                        ticks: { maxTicksLimit: 10, maxRotation: 45 }
                    },
                    y: {
                        title: { display: true, text: 'Atenuación (dB)' },
                        min: -80, max: 5
                    }
                }
            }
        });
    }

    function _calcAttenuationAt(filterType, order, fc, f) {
        if (filterType === 'lowpass')  return f > fc ? -20 * order * Math.log10(f / fc) : 0;
        if (filterType === 'highpass') return f < fc ? -20 * order * Math.log10(fc / f) : 0;
        if (filterType === 'bandpass') {
            const BW = fc / (order + 1);
            return (Math.abs(f - fc) > BW) ? -20 * order * Math.log10(Math.abs(f - fc) / BW) : 0;
        }
        if (filterType === 'notch') return (Math.abs(f - fc) < fc * 0.05) ? -40 : 0;
        return 0;
    }

    // -------------------------------------------------------------------------
    // UTILIDADES
    // -------------------------------------------------------------------------
    function _fmtL(H) {
        if (H >= 1)     return `${H.toFixed(3)} H`;
        if (H >= 1e-3)  return `${(H * 1e3).toFixed(3)} mH`;
        if (H >= 1e-6)  return `${(H * 1e6).toFixed(3)} µH`;
        return `${(H * 1e9).toFixed(3)} nH`;
    }

    function _fmtC(F) {
        if (F >= 1e-3)  return `${(F * 1e3).toFixed(3)} mF`;
        if (F >= 1e-6)  return `${(F * 1e6).toFixed(3)} µF`;
        if (F >= 1e-9)  return `${(F * 1e9).toFixed(3)} nF`;
        return `${(F * 1e12).toFixed(3)} pF`;
    }

    function _fmtFreq(f) {
        if (f >= 1e6) return `${(f / 1e6).toFixed(2)} MHz`;
        if (f >= 1e3) return `${(f / 1e3).toFixed(2)} kHz`;
        return `${f.toFixed(1)} Hz`;
    }

})(); // fin IIFE
