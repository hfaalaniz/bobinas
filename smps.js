// ============================================================================
// SMPS.JS — Módulo A: Fuentes Conmutadas SMPS (Flyback / Forward)
// ============================================================================

(function () {

    const SM_MAX_OUTPUTS = 4;
    let smOutputCount = 1;

    // -------------------------------------------------------------------------
    // GESTIÓN DINÁMICA DE SALIDAS
    // -------------------------------------------------------------------------
    window.smAddOutput = function () {
        if (smOutputCount >= SM_MAX_OUTPUTS) return;
        smOutputCount++;
        const row = document.getElementById(`smOut${smOutputCount}`);
        if (row) row.style.display = 'block';
        document.getElementById('smAddOutBtn').disabled = smOutputCount >= SM_MAX_OUTPUTS;
    };

    window.smRemoveOutput = function (n) {
        if (n <= 1) return;
        // Compactar filas superiores
        for (let i = n; i < smOutputCount; i++) {
            const cur  = document.getElementById(`smOut${i}`);
            const next = document.getElementById(`smOut${i + 1}`);
            if (cur && next) {
                cur.querySelector(`#smVout${i}`).value = next.querySelector(`#smVout${i + 1}`).value;
                cur.querySelector(`#smIout${i}`).value = next.querySelector(`#smIout${i + 1}`).value;
            }
        }
        const lastRow = document.getElementById(`smOut${smOutputCount}`);
        if (lastRow) {
            lastRow.style.display = 'none';
            lastRow.querySelectorAll('input').forEach(i => { i.value = ''; });
        }
        smOutputCount--;
        document.getElementById('smAddOutBtn').disabled = smOutputCount >= SM_MAX_OUTPUTS;
    };

    // -------------------------------------------------------------------------
    // CÁLCULO PRINCIPAL
    // -------------------------------------------------------------------------
    window.calculateSMPS = function () {
        const topology   = document.getElementById('smTopology').value;
        const VinMin     = parseFloat(document.getElementById('smVinMin').value) || 100;
        const VinMax     = parseFloat(document.getElementById('smVinMax').value) || 400;
        const freqKHz    = parseFloat(document.getElementById('smFreq').value) || 100;
        const DutyMax    = parseFloat(document.getElementById('smDutyMax').value) / 100 || 0.4;
        const coreType   = document.getElementById('smCoreType').value;
        const Ae_mm2     = parseFloat(document.getElementById('smAe').value) || 100;
        const efficiency = parseFloat(document.getElementById('smEfficiency').value) / 100 || 0.85;
        const ripplePct  = parseFloat(document.getElementById('smRipplePct').value) / 100 || 0.30;

        // Recoger salidas
        const outputs = [];
        for (let i = 1; i <= SM_MAX_OUTPUTS; i++) {
            const row = document.getElementById(`smOut${i}`);
            if (!row || row.style.display === 'none') continue;
            const Vout = parseFloat(document.getElementById(`smVout${i}`).value);
            const Iout = parseFloat(document.getElementById(`smIout${i}`).value);
            if (Vout > 0 && Iout > 0) outputs.push({ Vout, Iout, index: i });
        }

        if (outputs.length === 0) {
            _smShowError('Agrega al menos una salida con voltaje y corriente');
            return;
        }

        const core = coreDatabase[coreType];
        if (!core) { _smShowError('Tipo de núcleo no válido'); return; }

        const params = { topology, VinMin, VinMax, freqKHz, DutyMax, coreType, core, Ae_mm2, efficiency, ripplePct, outputs };

        let results;
        try {
            results = topology === 'flyback' ? calculateFlyback(params) : calculateForward(params);
        } catch (e) {
            _smShowError(e.message);
            return;
        }

        displaySMPSResults(results);
        drawSMPSTransformer(results);
        drawSMPSBHCurve(results);

        // Guardar diseño
        savedDesigns.push({
            timestamp: new Date().toISOString(),
            type: 'smps',
            data: { topology, VinMin, VinMax, freqKHz, DutyMax, coreType, Ae_mm2, efficiency, ripplePct, outputs }
        });
        try { localStorage.setItem('inductorDesigns', JSON.stringify(savedDesigns)); } catch (_) {}
    };

    // -------------------------------------------------------------------------
    // FLYBACK
    // -------------------------------------------------------------------------
    function calculateFlyback(p) {
        const { VinMin, VinMax, freqKHz, DutyMax, core, Ae_mm2, efficiency, ripplePct, outputs } = p;
        const fs   = freqKHz * 1e3;       // Hz
        const Ae   = Ae_mm2 * 1e-6;       // m²
        const Bmax = core.bsat * 0.25;    // 25% Bsat para flyback (margen generoso)
        const Vf   = 0.7;                 // caída diodo rectificador

        // Potencia
        const Pout = outputs.reduce((s, o) => s + o.Vout * o.Iout, 0);
        const Pin  = Pout / efficiency;

        // Corriente primaria pico
        const Ip_peak = (2 * Pin) / (VinMin * DutyMax);

        // Inductancia primaria
        const Lp = (VinMin * DutyMax) / (Ip_peak * ripplePct * fs);

        // Vueltas primarias (volt-seconds)
        const Np = Math.max(1, Math.ceil((VinMin * DutyMax) / (Bmax * Ae * fs)));

        // Entrehierro
        const mu_r = core.mu_r;
        const le   = 2 * Math.sqrt(Ae_mm2 / 100) * 4 / 100; // estimación en metros
        const lg_raw = (CONSTANTS.mu0 * Np * Np * Ae) / Lp - le / mu_r;
        const lg = Math.max(0, lg_raw) * 1000; // en mm

        // Salidas
        const outputCalc = outputs.map(o => {
            const Ns = Math.max(1, Math.ceil(Np * (o.Vout + Vf) / (VinMin * DutyMax / (1 - DutyMax))));
            const Is_rms = o.Iout * Math.sqrt(1 - DutyMax);
            const awg    = selectWireGaugeOptimal(Is_rms, 4);
            const wire   = awgTable[awg];
            return { ...o, Ns, Is_rms, awg, wire };
        });

        // Corrientes RMS primario
        const Ip_rms = Ip_peak * Math.sqrt(DutyMax / 3);
        const awgP   = selectWireGaugeOptimal(Ip_rms, 4);
        const wireP  = awgTable[awgP];

        // Skin depth a fs
        const skinDepth = calcSkinDepth(fs); // mm
        const needsLitz = wireP.diameter / 2 > skinDepth * 2;

        // Pérdidas en cobre
        let Pcu = 0;
        const Rp = (CONSTANTS.copperResistivity * Np * le) / (wireP.area * 1e-6);
        Pcu += Ip_rms * Ip_rms * Rp * _acResistanceFactor(wireP.diameter, skinDepth);
        outputCalc.forEach(o => {
            const Rs = (CONSTANTS.copperResistivity * o.Ns * le) / (o.wire.area * 1e-6);
            Pcu += o.Is_rms * o.Is_rms * Rs * _acResistanceFactor(o.wire.diameter, skinDepth);
        });

        // Pérdidas en núcleo (Steinmetz modificado)
        const volume = Ae * le;
        const Pfe = core.loss * Math.pow(freqKHz / 1e3 * 1e3, 1.3) / Math.pow(1e3, 1.3) * Math.pow(Bmax, 2) * volume * 1e6;

        const efficiency_real = Pout / (Pout + Pcu + Pfe);
        const surfaceArea = 6 * Math.pow(Math.sqrt(Ae_mm2 / 1e6), 2);
        const deltaT = (Pcu + Pfe) / (Math.max(surfaceArea, 1e-4) * 8);

        return {
            topology: 'flyback', Np, outputCalc, awgP, wireP, Ip_peak, Ip_rms,
            Lp, lg, Bmax, Ae_mm2, Pout, Pin, Pcu, Pfe, efficiency_real, deltaT,
            core, coreType: p.coreType, freqKHz, VinMin, VinMax, DutyMax,
            skinDepth, needsLitz, le
        };
    }

    // -------------------------------------------------------------------------
    // FORWARD
    // -------------------------------------------------------------------------
    function calculateForward(p) {
        const { VinMin, VinMax, freqKHz, DutyMax, core, Ae_mm2, efficiency, ripplePct, outputs } = p;
        const fs   = freqKHz * 1e3;
        const Ae   = Ae_mm2 * 1e-6;
        const Bmax = core.bsat * 0.5;    // 50% Bsat para forward

        const Pout = outputs.reduce((s, o) => s + o.Vout * o.Iout, 0);
        const Pin  = Pout / efficiency;

        const Np = Math.max(1, Math.ceil((VinMin * DutyMax) / (Bmax * Ae * fs)));

        const outputCalc = outputs.map(o => {
            const Ns = Math.max(1, Math.ceil(Np * o.Vout / (VinMin * DutyMax * efficiency)));
            const Is_rms = o.Iout * Math.sqrt(DutyMax);
            const awg    = selectWireGaugeOptimal(Is_rms, 4);
            const wire   = awgTable[awg];
            // Inductor de salida
            const Lout   = (o.Vout * (1 - DutyMax)) / (o.Iout * ripplePct * fs);
            return { ...o, Ns, Is_rms, awg, wire, Lout };
        });

        const Ip_rms  = (Pin / VinMin) * Math.sqrt(DutyMax);
        const awgP    = selectWireGaugeOptimal(Ip_rms, 4);
        const wireP   = awgTable[awgP];
        const skinDepth = calcSkinDepth(fs);
        const needsLitz = wireP.diameter / 2 > skinDepth * 2;

        const le = 2 * Math.sqrt(Ae_mm2 / 100) * 4 / 100;
        let Pcu = 0;
        const Rp = (CONSTANTS.copperResistivity * Np * le) / (wireP.area * 1e-6);
        Pcu += Ip_rms * Ip_rms * Rp * _acResistanceFactor(wireP.diameter, skinDepth);
        outputCalc.forEach(o => {
            const Rs = (CONSTANTS.copperResistivity * o.Ns * le) / (o.wire.area * 1e-6);
            Pcu += o.Is_rms * o.Is_rms * Rs * _acResistanceFactor(o.wire.diameter, skinDepth);
        });

        const volume = Ae * le;
        const Pfe = core.loss * Math.pow(freqKHz / 1e3, 1.3) * Math.pow(Bmax, 2) * volume * 1e6;
        const efficiency_real = Pout / (Pout + Pcu + Pfe);
        const surfaceArea = 6 * Math.pow(Math.sqrt(Ae_mm2 / 1e6), 2);
        const deltaT = (Pcu + Pfe) / (Math.max(surfaceArea, 1e-4) * 8);

        return {
            topology: 'forward', Np, outputCalc, awgP, wireP, Ip_rms, Ip_peak: Ip_rms * 1.5,
            Lp: null, lg: 0, Bmax, Ae_mm2, Pout, Pin, Pcu, Pfe, efficiency_real, deltaT,
            core, coreType: p.coreType, freqKHz, VinMin, VinMax, DutyMax,
            skinDepth, needsLitz, le
        };
    }

    // -------------------------------------------------------------------------
    // MOSTRAR RESULTADOS
    // -------------------------------------------------------------------------
    function displaySMPSResults(r) {
        const container = document.getElementById('smResults');
        if (!container) return;

        let html = '<div class="result-grid">';

        html += _smHeader('DISEÑO DEL TRANSFORMADOR');
        html += createResultItem('Topología', r.topology === 'flyback' ? 'Flyback' : 'Forward', '');
        html += createResultItem('Núcleo', r.core.name, '');
        html += createResultItem('Sección Ae', r.Ae_mm2.toFixed(0), 'mm²');
        html += createResultItem('Bmax operación', (r.Bmax * 1000).toFixed(1), 'mT',
            r.Bmax > r.core.bsat * 0.8 ? 'error' : 'success');
        html += createResultItem('Frecuencia', r.freqKHz.toFixed(0), 'kHz');
        html += createResultItem('Duty Cycle Máx', (r.DutyMax * 100).toFixed(0), '%');

        html += _smHeader('DEVANADO PRIMARIO');
        html += createResultItem('Vueltas Primario (Np)', r.Np, 'N');
        html += createResultItem('Corriente Pico', r.Ip_peak.toFixed(3), 'A');
        html += createResultItem('Corriente RMS', r.Ip_rms.toFixed(3), 'A');
        html += createResultItem('Calibre Primario', `AWG ${r.awgP}`, '');
        html += createResultItem('Diámetro Cable', r.wireP.diameter.toFixed(3), 'mm');
        html += createResultItem('Skin Depth a fs', r.skinDepth.toFixed(3), 'mm');
        if (r.topology === 'flyback' && r.Lp) {
            html += createResultItem('Inductancia Primaria', (r.Lp * 1e6).toFixed(2), 'µH');
            html += createResultItem('Entrehierro (gap)', r.lg.toFixed(3), 'mm',
                r.lg > 0 ? 'warning' : 'success');
        }

        html += _smHeader('DEVANADOS SECUNDARIOS');
        r.outputCalc.forEach((o, i) => {
            html += createResultItem(`Vueltas Sec. ${i + 1} (Ns)`, o.Ns, 'N');
            html += createResultItem(`I_rms Sec. ${i + 1}`, o.Is_rms.toFixed(3), 'A');
            html += createResultItem(`AWG Sec. ${i + 1}`, `AWG ${o.awg}`, '');
            if (r.topology === 'forward' && o.Lout) {
                html += createResultItem(`Inductor salida ${i + 1}`, (o.Lout * 1e6).toFixed(2), 'µH');
            }
        });

        html += _smHeader('PÉRDIDAS Y EFICIENCIA');
        html += createResultItem('Potencia Salida', r.Pout.toFixed(2), 'W');
        html += createResultItem('Potencia Entrada', r.Pin.toFixed(2), 'W');
        html += createResultItem('Pérdidas Cobre', r.Pcu.toFixed(3), 'W');
        html += createResultItem('Pérdidas Núcleo', r.Pfe.toFixed(3), 'W');
        html += createResultItem('Eficiencia Real', (r.efficiency_real * 100).toFixed(1), '%',
            r.efficiency_real >= 0.85 ? 'success' : r.efficiency_real >= 0.75 ? 'warning' : 'error');
        html += createResultItem('Elevación Temperatura', r.deltaT.toFixed(1), '°C',
            r.deltaT > 50 ? 'error' : r.deltaT > 30 ? 'warning' : 'success');

        html += '</div>';

        // Warning Litz wire
        if (r.needsLitz) {
            html += `<div class="smps-warning-litz">
                <span class="litz-icon">⚡</span>
                <div class="litz-text">
                    <strong>Se recomienda Litz Wire en el primario</strong>
                    El diámetro del cable AWG ${r.awgP} (${r.wireP.diameter.toFixed(3)} mm) supera 2× la profundidad de penetración (δ = ${r.skinDepth.toFixed(3)} mm) a ${r.freqKHz} kHz.
                    Use Litz wire o cable trenzado para reducir pérdidas AC.
                </div>
            </div>`;
        }

        if (r.lg > 0.5) {
            html += `<div class="result-item warning" style="margin-top:12px">
                <div class="result-label">⚠️ ENTREHIERRO SIGNIFICATIVO</div>
                <div class="result-value">Gap de ${r.lg.toFixed(2)} mm. Usar cinta de mylar o lija el núcleo calibradamente. Verificar con inductímetro.</div>
            </div>`;
        }

        container.innerHTML = html;
    }

    function _smHeader(text) {
        return `<div style="grid-column:1/-1;background:linear-gradient(135deg,#f093fb,#f5576c);color:white;padding:10px;border-radius:8px;font-weight:bold;text-align:center;margin-top:10px">${text}</div>`;
    }

    function _smShowError(msg) {
        const c = document.getElementById('smResults');
        if (c) c.innerHTML = `<div class="result-item error"><div class="result-label">❌ Error</div><div class="result-value">${msg}</div></div>`;
    }

    // -------------------------------------------------------------------------
    // CANVAS: TRANSFORMADOR CON GAP
    // -------------------------------------------------------------------------
    function drawSMPSTransformer(r) {
        const canvas = document.getElementById('smCanvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const W = canvas.offsetWidth || 500;
        if (canvas.width !== W) canvas.width = W;
        if (canvas.height !== 320) canvas.height = 320;
        ctx.clearRect(0, 0, W, 320);

        const cx     = W / 2;
        const cy     = 160;
        const coreW  = 40;
        const coreH  = 180;
        const coilW  = 55;
        const gapPx  = Math.min(r.lg * 8, 20); // escalar gap visualmente

        // Núcleo izquierdo
        ctx.fillStyle = r.core.color || '#8B4513';
        ctx.fillRect(cx - coreW / 2, cy - coreH / 2, coreW, coreH / 2 - gapPx / 2);
        ctx.fillRect(cx - coreW / 2, cy + gapPx / 2, coreW, coreH / 2 - gapPx / 2);

        // Gap (línea roja)
        if (r.lg > 0) {
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = 2;
            ctx.setLineDash([4, 3]);
            ctx.beginPath();
            ctx.moveTo(cx - coreW / 2 - 5, cy);
            ctx.lineTo(cx + coreW / 2 + 5, cy);
            ctx.stroke();
            ctx.setLineDash([]);

            ctx.fillStyle = '#ef4444';
            ctx.font = 'bold 11px Arial';
            ctx.textAlign = 'left';
            ctx.fillText(`gap ${r.lg.toFixed(2)} mm`, cx + coreW / 2 + 8, cy + 4);
        }

        // Devanado primario (izquierda del núcleo)
        ctx.strokeStyle = '#ff6b35';
        ctx.lineWidth = 3;
        const primaryTurns = Math.min(Math.ceil(r.Np / 5), 20);
        for (let i = 0; i < primaryTurns; i++) {
            const y = cy - coreH / 2 + 15 + i * (coreH - 30) / primaryTurns;
            ctx.beginPath();
            ctx.arc(cx - coreW / 2 - coilW / 2, y, coilW / 2, -Math.PI / 2, Math.PI / 2);
            ctx.stroke();
        }

        // Devanados secundarios (derecha)
        const secColors = ['#667eea', '#10b981', '#f59e0b', '#8b5cf6'];
        r.outputCalc.forEach((o, idx) => {
            ctx.strokeStyle = secColors[idx] || '#aaa';
            ctx.lineWidth = 3;
            const secTurns = Math.min(Math.ceil(o.Ns / 5), 20);
            const offset = idx * (coilW + 4);
            for (let i = 0; i < secTurns; i++) {
                const y = cy - coreH / 2 + 15 + i * (coreH - 30) / secTurns;
                ctx.beginPath();
                ctx.arc(cx + coreW / 2 + coilW / 2 + offset, y, coilW / 2, Math.PI / 2, -Math.PI / 2);
                ctx.stroke();
            }
        });

        // Etiquetas
        ctx.fillStyle = '#333';
        ctx.font = 'bold 13px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`Np = ${r.Np}`, cx - coreW / 2 - coilW / 2, cy - coreH / 2 - 8);
        ctx.fillText(`AWG ${r.awgP}`, cx - coreW / 2 - coilW / 2, cy + coreH / 2 + 18);

        r.outputCalc.forEach((o, idx) => {
            const offset = idx * (coilW + 4);
            ctx.fillStyle = secColors[idx] || '#aaa';
            ctx.textAlign = 'center';
            ctx.fillText(`Ns${idx + 1}=${o.Ns}`, cx + coreW / 2 + coilW / 2 + offset, cy - coreH / 2 - 8);
            ctx.fillText(`AWG ${o.awg}`, cx + coreW / 2 + coilW / 2 + offset, cy + coreH / 2 + 18);
        });

        // Título topología
        ctx.fillStyle = '#555';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`${r.topology.toUpperCase()} — ${r.freqKHz} kHz — ${r.core.name}`, cx, 16);
    }

    // -------------------------------------------------------------------------
    // CANVAS: CURVA B-H (reutiliza lógica de graphics.js)
    // -------------------------------------------------------------------------
    function drawSMPSBHCurve(r) {
        const canvas = document.getElementById('smBHChart');
        if (!canvas) return;
        if (typeof drawBHCurve === 'function') {
            const origId = canvas.id;
            // Temporalmente apuntar drawBHCurve al canvas correcto
            // drawBHCurve usa document.getElementById('bhChart') internamente,
            // así que dibujamos manualmente aquí
        }

        const ctx = canvas.getContext('2d');
        const W = canvas.offsetWidth || 500;
        if (canvas.width !== W) canvas.width = W;
        if (canvas.height !== 300) canvas.height = 300;
        ctx.clearRect(0, 0, W, 300);

        const margin = 50;
        const w = W - 2 * margin;
        const h = 300 - 2 * margin;
        const core = r.core;
        const Hmax = 2000;

        // Ejes
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(margin, margin);
        ctx.lineTo(margin, h + margin);
        ctx.lineTo(w + margin, h + margin);
        ctx.stroke();

        // Curva B-H
        ctx.strokeStyle = '#f5576c';
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (let i = 0; i <= 100; i++) {
            const H = (i / 100) * Hmax;
            const mu = CONSTANTS.mu0 * core.mu_r;
            let B = mu * H;
            if (B > core.bsat * 0.7) B = core.bsat * 0.7 + (B - core.bsat * 0.7) * 0.2;
            B = Math.min(B, core.bsat);
            const x = margin + (H / Hmax) * w;
            const y = h + margin - (B / core.bsat) * h;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();

        // Punto de operación
        const H_op = r.Bmax / (CONSTANTS.mu0 * core.mu_r);
        const x_op = margin + Math.min(H_op / Hmax, 1) * w;
        const y_op = h + margin - (r.Bmax / core.bsat) * h;
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(x_op, y_op, 7, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#333';
        ctx.font = '11px Arial';
        ctx.textAlign = 'left';
        ctx.fillText(`B_op = ${(r.Bmax * 1000).toFixed(0)} mT`, x_op + 10, y_op - 5);

        // Línea Bsat
        const ySat = h + margin - h;
        ctx.strokeStyle = '#ef4444';
        ctx.setLineDash([5, 5]);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(margin, ySat);
        ctx.lineTo(w + margin, ySat);
        ctx.stroke();
        ctx.setLineDash([]);

        // Etiquetas
        ctx.fillStyle = '#333';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('H (A/m)', w / 2 + margin, h + margin + 36);
        ctx.save();
        ctx.translate(16, h / 2 + margin);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText('B (T)', 0, 0);
        ctx.restore();
        ctx.textAlign = 'right';
        ctx.fillText(`Bsat = ${core.bsat} T`, w + margin, margin + 14);
    }

    // -------------------------------------------------------------------------
    // UTILIDADES
    // -------------------------------------------------------------------------
    function calcSkinDepth(freq_Hz) {
        // δ en mm
        return Math.sqrt(CONSTANTS.copperResistivity / (Math.PI * freq_Hz * CONSTANTS.mu0)) * 1000;
    }
    window.calcSkinDepth = calcSkinDepth;

    function _acResistanceFactor(diameter_mm, skinDepth_mm) {
        // Factor de incremento de resistencia por skin effect
        // Aproximación: R_ac/R_dc ≈ 1 + (d/(2δ))⁴/48 para d/δ < 3
        const ratio = diameter_mm / (2 * skinDepth_mm);
        if (ratio <= 1) return 1;
        return 1 + Math.pow(ratio, 4) / 48;
    }

})(); // fin IIFE
