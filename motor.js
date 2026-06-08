// ============================================================================
// MOTOR.JS — Calculadora de Rebobinado de Motores de Inducción
// Monofásico / Trifásico · Hasta 50 HP · Geometría completa del estátor
// ============================================================================
(function () {
    'use strict';

    // ── Polyfill roundRect (pre-Chrome 99) ───────────────────────────────────
    if (!CanvasRenderingContext2D.prototype.roundRect) {
        CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
            r = Math.min(r || 0, Math.abs(w) / 2, Math.abs(h) / 2);
            this.moveTo(x + r, y);
            this.arcTo(x + w, y, x + w, y + h, r);
            this.arcTo(x + w, y + h, x, y + h, r);
            this.arcTo(x, y + h, x, y, r);
            this.arcTo(x, y, x + w, y, r);
            this.closePath();
        };
    }

    // ── Constantes físicas ────────────────────────────────────────────────────
    const RHO_CU  = 1.72e-8;   // Ω·m a 20°C (cobre recocido)
    const DEN_CU  = 8900;      // kg/m³
    const DEN_FE  = 7650;      // kg/m³ (acero al silicio laminado)

    // ── Densidad de corriente según potencia (PDF "Calculo bobinados trifasicos") ──
    // δ = 7 A/mm² para motores ≤ 10 HP; δ = 5.5 A/mm² para 10–50 HP.
    // La clase de aislamiento impone el límite térmico superior pero no baja δ.
    const J_MAX = { A: 4.0, B: 5.0, F: 5.5, H: 6.0 }; // límites térmicos por clase
    function _jMaxForPower(powerHP, insClass) {
        const j_pdf = powerHP <= 10 ? 7.0 : 5.5;   // criterio del PDF
        const j_ins = J_MAX[insClass] || 5.0;        // límite térmico de la clase
        return Math.min(j_pdf, j_ins * 1.20);        // no exceder 120% del límite térmico
    }

    // ── Propiedades de aceros laminados para motores ──────────────────────────
    // loss_wkg: pérdidas específicas en W/kg @ B_ref [T], 50 Hz
    const STEEL = {
        silicon_steel:  { name: 'Acero silicio M330-35A', loss_wkg: 2.0,  B_ref: 1.5, bsat: 1.8, dens: 7650 },
        grain_oriented: { name: 'Acero grano orientado M100-23S', loss_wkg: 0.95, B_ref: 1.7, bsat: 2.0, dens: 7650 },
        m19:            { name: 'Acero M19 (0.35 mm)',  loss_wkg: 1.65, B_ref: 1.5, bsat: 1.8, dens: 7650 },
        m45:            { name: 'Acero M45 (0.47 mm)',  loss_wkg: 2.8,  B_ref: 1.5, bsat: 1.75, dens: 7700 },
        custom_steel:   { name: 'Personalizado',        loss_wkg: 2.5,  B_ref: 1.5, bsat: 1.8, dens: 7650 },
    };

    // ── Colores de fase para canvas ───────────────────────────────────────────
    const PHASE_COLOR = {
        A:     { fill: 'rgba(239,68,68,0.60)',  stroke: '#ef4444', label: '#fca5a5' },
        B:     { fill: 'rgba(59,130,246,0.60)', stroke: '#3b82f6', label: '#93c5fd' },
        C:     { fill: 'rgba(16,185,129,0.60)', stroke: '#10b981', label: '#6ee7b7' },
        Aux:   { fill: 'rgba(245,158,11,0.60)', stroke: '#f59e0b', label: '#fcd34d' },
        empty: { fill: 'rgba(255,255,255,0.03)', stroke: 'rgba(255,255,255,0.07)', label: '#475569' },
    };

    let _lastResults = null;

    // ── Catálogo de carcasas (cargado desde motor_frames.json) ───────────────
    let _framesDB = null;

    function _loadFramesDB(cb) {
        if (_framesDB) { cb(_framesDB); return; }
        fetch('motor_frames.json')
            .then(function (r) { return r.json(); })
            .then(function (data) { _framesDB = data; cb(data); })
            .catch(function () {
                if (typeof showToast === 'function')
                    showToast('No se pudo cargar el catálogo de carcasas.', 'warning');
            });
    }

    // Filtra entradas del catálogo por marca y número de polos
    function _filterFrames(brand, poles) {
        if (!_framesDB || !_framesDB.frames[brand]) return [];
        const p = parseInt(poles);
        return _framesDB.frames[brand].filter(function (f) { return f.poles === p; })
            .sort(function (a, b) { return a.kW - b.kW; });
    }

    // Formatea una entrada del catálogo para el <option>
    function _frameLabel(f) {
        return f.frame + ' — ' + f.hp + ' HP / ' + f.kW + ' kW  (' + f.OD + '×' + f.ID + '×' + f.L + ' mm, Q=' + f.Q + ')';
    }

    window.motorBrandChanged = function () {
        const brand = _sv('motorBrand');
        const sel   = document.getElementById('motorFrameSelect');
        const info  = document.getElementById('motorFrameInfo');
        if (!brand) {
            sel.innerHTML = '<option value="">— Elija marca primero —</option>';
            sel.disabled = true;
            if (info) { info.style.display = 'none'; info.innerHTML = ''; }
            return;
        }
        _loadFramesDB(function () {
            const poles = _sv('motorFramePoles') || '4';
            const list  = _filterFrames(brand, poles);
            if (list.length === 0) {
                sel.innerHTML = '<option value="">Sin datos para este fabricante/polos</option>';
                sel.disabled = true;
                return;
            }
            sel.innerHTML = '<option value="">— Elegir potencia —</option>' +
                list.map(function (f, i) {
                    return '<option value="' + i + '">' + _frameLabel(f) + '</option>';
                }).join('');
            sel.disabled = false;
            sel.dataset.brand = brand;
            sel.dataset.poles = poles;
        });
    };

    window.motorFrameChanged = function () {
        // Solo reconstruye la lista cuando cambian los polos del selector
        const brand = _sv('motorBrand');
        if (brand) motorBrandChanged();
    };

    window.motorApplyFrame = function () {
        const sel   = document.getElementById('motorFrameSelect');
        const info  = document.getElementById('motorFrameInfo');
        const idx   = parseInt(sel.value);
        if (isNaN(idx) || !_framesDB) return;

        const brand = sel.dataset.brand;
        const poles = sel.dataset.poles;
        const list  = _filterFrames(brand, poles);
        const f     = list[idx];
        if (!f) return;

        // Elegir RPM según frecuencia seleccionada
        const freq  = _fv('motorFreq') || 50;
        const rpm   = freq >= 55 ? f.rpm_60 : f.rpm_50;

        // Aplicar todos los campos de geometría
        _v('motorExtDiam',    f.OD);
        _v('motorBoreDiam',   f.ID);
        _v('motorStackLength', f.L);
        _v('motorSlots',      f.Q);
        _v('motorRPM',        rpm);

        // Geometría de ranura desde catálogo — soporta rectangular y trapezoidal
        const slotT = f.slotType || 'rect';
        motorSetSlotType(slotT);
        if (slotT === 'trap') {
            _v('trapBtop', f.btop || f.bw);
            _v('trapBbot', f.bbot || f.bw);
            _v('trapHw',   f.hw);
            _v('trapB1',   f.b1);
            _v('trapH1',   f.h1 || 1.0);
        } else {
            _v('slotBw', f.bw);
            _v('slotHw', f.hw);
            _v('slotB1', f.b1);
            _v('slotH1', f.h1 || 1.0);
        }
        motorUpdateSlotDiagram();

        // Tensión y conexión si el motor es para esa tensión
        if (f.V && f.V > 0) _v('motorVoltage', f.V);
        if (f.conn) {
            const connSel = document.getElementById('motorConnection');
            if (connSel) connSel.value = f.conn;
        }

        // Limpiar badge Bav calculado (los datos nuevos lo invalidan)
        const badge = document.getElementById('bav_calc_badge');
        if (badge) badge.style.display = 'none';

        // Mostrar ficha del catálogo
        if (info) {
            const freqKey = freq >= 55 ? '60 Hz' : '50 Hz';
            info.innerHTML =
                '<strong style="color:#22d3ee;">' + (_framesDB.brands.find(function(b){return b.id===brand;})||{name:brand}).name +
                ' — Carcasa ' + f.frame + '</strong><br>' +
                'OD ' + f.OD + ' mm &nbsp;·&nbsp; ID ' + f.ID + ' mm &nbsp;·&nbsp; L ' + f.L + ' mm<br>' +
                'Q = ' + f.Q + ' ranuras &nbsp;·&nbsp; ' + (f.slotType === 'trap'
                    ? 'b1=' + f.b1 + ' btop=' + f.btop + ' bbot=' + f.bbot + ' hw=' + f.hw + ' mm (trap)'
                    : 'bw=' + f.bw + ' mm &nbsp;·&nbsp; hw=' + f.hw + ' mm') + '<br>' +
                'RPM (' + freqKey + '): ' + rpm + ' &nbsp;·&nbsp; ' + f.poles + ' polos<br>' +
                '<span style="color:#f59e0b;">&#9888; Datos de catálogo — verificar con el núcleo real.</span>';
            info.style.display = 'block';
        }

        // Auto-fill HP field from catalog
        const hpField = document.getElementById('motorPowerHP');
        if (hpField && f.hp) {
            hpField.value = f.hp;
            if (typeof motorHPtoKW === 'function') motorHPtoKW();
        }

        if (typeof showToast === 'function')
            showToast('Carcasa ' + f.frame + ' cargada (' + f.hp + ' HP, ' + f.poles + ' polos)', 'success');

        motorClearResults();
    };

    // =========================================================================
    // ── UI HELPERS ────────────────────────────────────────────────────────────
    // =========================================================================

    window.motorSetType = function (type) {
        _v('motorType', type);
        _tog('btnTypeThree',       type === 'three');
        _tog('btnTypeSingle',      type === 'single');
        _vis('motorThreePhaseSection',  type === 'three');
        _vis('motorSinglePhaseSection', type === 'single');
        const subs = {
            three:  'Trifásico · Hasta 50 HP · Geometría completa del estátor',
            single: 'Monofásico · Hasta 10 HP · Principal + auxiliar + capacitor',
        };
        const el = document.getElementById('motorPageSubtitle');
        if (el) el.textContent = subs[type] || '';
        motorClearResults();
    };

    window.motorSetInsClass = function (cls) {
        ['A','B','F','H'].forEach(c => _tog('ins'+c, c === cls));
        _v('motorInsClass', cls);
    };

    window.motorSetPitch = function (type) {
        _v('motorPitchType', type);
        _tog('pitchFull',  type === 'full');
        _tog('pitchShort', type === 'short');
        _vis('pitchRatioSection', type === 'short');
    };

    window.motorSetSlotType = function (type) {
        _v('motorSlotType', type);
        ['Rect','Trap','Semi'].forEach(t =>
            _tog('slotType' + t, t.toLowerCase() === type));
        _vis('slotFieldsRect', type === 'rect');
        _vis('slotFieldsTrap', type === 'trap');
        _vis('slotFieldsSemi', type === 'semi');
        motorUpdateSlotDiagram();
    };

    window.motorHPtoKW = function () {
        const hp = _fv('motorPowerHP');
        if (hp > 0) _v('motorPowerKW', (hp * 0.7457).toFixed(3));
    };

    window.motorKWtoHP = function () {
        const kw = _fv('motorPowerKW');
        if (kw > 0) _v('motorPowerHP', (kw / 0.7457).toFixed(2));
    };

    window.motorClearResults = function () {
        const r = document.getElementById('motorResults');
        const v = document.getElementById('motorValidation');
        const o = document.getElementById('motorOptimResult');
        if (r) r.innerHTML = '<p class="placeholder-text">Configure los parámetros del motor y presione "Calcular Devanado"</p>';
        if (v) v.innerHTML = '';
        if (o) { o.innerHTML = ''; o.style.display = 'none'; }
        _clrCanvas('motorStatorCanvas');
        _clrCanvas('motorSlotCanvas');
        _lastResults = null;
    };

    // ── Auto-calcular Bav desde geometría ────────────────────────────────────
    window.motorAutoBav = function () {
        const OD = _fv('motorExtDiam');
        const ID = _fv('motorBoreDiam');
        const L  = _fv('motorStackLength');
        const Q  = _iv('motorSlots');
        const f  = _fv('motorFreq');
        const rpm = _fv('motorRPM');
        if (!OD || !ID || !L || !Q || !f || !rpm) {
            if (typeof showToast === 'function') showToast('Complete OD, ID, L, Q, f y RPM antes de calcular Bav.', 'warning');
            return;
        }
        const { P } = _computePoles(f, rpm);
        // Bav = Φ / (τm × L); Φ estimado por flujo típico en la corona
        // Densidad de flujo en la corona: Bc = Φ / (Ac) donde Ac = (OD-ID)/2 × L
        // Aproximación: Bav ≈ 0.637 × Bt (Bt en el diente, típico 1.4–1.6 T)
        // Fórmula práctica: Bav ≈ (π × ID) / (2 × P × L) × 0.7  (ajuste empírico)
        // Método más preciso: resolver B del entrehierro para un Bt nominal de 1.5 T
        const Bt_nom = 1.50; // T en el diente — objetivo de diseño típico
        const dims = _readSlotDims();
        // Ancho del diente al bore (cuello, zona de máxima saturación):
        //   b_tooth_bore = τ_slot_bore − b1
        // Bav = Bt × b_tooth_bore × 0.97 / τ_slot_bore  (L se cancela)
        const tau_slot_bore_mm = Math.PI * ID / Q;
        const b1 = dims.b1 || 3;
        const b_tooth_mm = Math.max(0.5, tau_slot_bore_mm - b1);
        const Bav_calc = Bt_nom * b_tooth_mm * 0.97 / tau_slot_bore_mm;
        const Bav = Math.min(0.90, Math.max(0.40, parseFloat(Bav_calc.toFixed(3))));
        _v('motorBav', Bav);
        const badge = document.getElementById('bav_calc_badge');
        if (badge) badge.style.display = 'inline-block';
        if (typeof showToast === 'function') showToast(`Bav calculado: ${Bav} T (diente nominal ${Bt_nom} T)`, 'success');
    };

    // ── Diagrama SVG dinámico de ranura ──────────────────────────────────────
    window.motorUpdateSlotDiagram = function () {
        const wrap = document.getElementById('slotDiagramWrap');
        if (!wrap) return;
        const type = _sv('motorSlotType') || 'rect';
        const dims = _readSlotDims();
        wrap.innerHTML = _buildSlotSVG(type, dims) +
            `<div class="slot-diagram-label">A_ranura = <strong>${_slotArea(type, dims).toFixed(2)} mm²</strong></div>`;
    };

    function _buildSlotSVG(type, d) {
        const W = 120, H = 140, cx = W / 2;
        const scale = Math.min(50 / (d.bw || d.btop || 6), 8 / ((d.hw || 16) / 10));
        const sw = (d.bw || d.btop || 6) * scale;
        const sh = (d.hw || 16) * scale;
        const b1s = (d.b1 || 3) * scale;
        const h1s = (d.h1 || 1) * scale;
        const topY = H * 0.12;

        let path = '';
        if (type === 'rect') {
            const x0 = cx - sw / 2, x1 = cx + sw / 2;
            const y0 = topY + h1s, y1 = topY + h1s + sh;
            const bx0 = cx - b1s / 2, bx1 = cx + b1s / 2;
            path = `<rect x="${bx0}" y="${topY}" width="${b1s}" height="${h1s}" fill="rgba(34,211,238,0.25)" stroke="#22d3ee" stroke-width="1.5"/>
                    <rect x="${x0}" y="${y0}" width="${sw}" height="${sh}" fill="rgba(34,211,238,0.18)" stroke="#22d3ee" stroke-width="1.5"/>
                    <text x="${cx}" y="${y1+14}" text-anchor="middle" font-size="9" fill="#64748b">bw=${d.bw||5.5} b1=${d.b1||3}</text>
                    <line x1="${x0-6}" y1="${y0}" x2="${x0-6}" y2="${y1}" stroke="#64748b" stroke-width="0.8" stroke-dasharray="2,2"/>
                    <text x="${x0-14}" y="${(y0+y1)/2}" text-anchor="middle" font-size="8" fill="#64748b" transform="rotate(-90,${x0-14},${(y0+y1)/2})">${d.hw||18}</text>`;
        } else if (type === 'trap') {
            const bt = (d.btop || 4) * scale, bb = (d.bbot || 7) * scale;
            const y0 = topY + h1s, y1 = topY + h1s + sh;
            const bx0 = cx - b1s / 2, bx1 = cx + b1s / 2;
            path = `<rect x="${bx0}" y="${topY}" width="${b1s}" height="${h1s}" fill="rgba(34,211,238,0.25)" stroke="#22d3ee" stroke-width="1.5"/>
                    <polygon points="${cx-bt/2},${y0} ${cx+bt/2},${y0} ${cx+bb/2},${y1} ${cx-bb/2},${y1}"
                        fill="rgba(34,211,238,0.18)" stroke="#22d3ee" stroke-width="1.5"/>
                    <text x="${cx}" y="${y1+14}" text-anchor="middle" font-size="9" fill="#64748b">top=${d.btop||4} bot=${d.bbot||7}</text>`;
        } else { // semi
            const bw = (d.bw || 5) * scale;
            const hr = (d.hw || 16) * scale;
            const rs = (d.r || 3.5) * scale;
            const y0 = topY + h1s, y1 = topY + h1s + hr;
            const bx0 = cx - b1s / 2, bx1 = cx + b1s / 2;
            // El fondo semicircular se dibuja correctamente: rect hasta y1-rs,
            // luego dos arcos que forman el semicírculo (un arco por cada lado).
            const rClamp = Math.min(rs, bw / 2); // radio no puede superar bw/2
            path = `<rect x="${bx0}" y="${topY}" width="${b1s}" height="${h1s}" fill="rgba(34,211,238,0.25)" stroke="#22d3ee" stroke-width="1.5"/>
                    <path d="M${cx-bw/2},${y0} L${cx+bw/2},${y0} L${cx+bw/2},${y1-rClamp} A${rClamp},${rClamp},0,0,1,${cx},${y1} A${rClamp},${rClamp},0,0,1,${cx-bw/2},${y1-rClamp} Z"
                        fill="rgba(34,211,238,0.18)" stroke="#22d3ee" stroke-width="1.5"/>
                    <text x="${cx}" y="${y1+14}" text-anchor="middle" font-size="9" fill="#64748b">bw=${d.bw||5} r=${d.r||3.5}</text>`;
        }

        return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
            <rect width="${W}" height="${H}" fill="none"/>
            <line x1="0" y1="${topY}" x2="${W}" y2="${topY}" stroke="rgba(148,163,184,0.2)" stroke-width="0.8" stroke-dasharray="3,3"/>
            ${path}
        </svg>`;
    }

    // =========================================================================
    // ── LECTURA DE FORMULARIO ─────────────────────────────────────────────────
    // =========================================================================

    function _readInputs() {
        const slotType = _sv('motorSlotType') || 'rect';
        const slotDims = _readSlotDims();
        const steelType = _sv('motorSteelType') || 'silicon_steel';
        let steel = STEEL[steelType] ? { ...STEEL[steelType] } : { ...STEEL.silicon_steel };
        if (steelType === 'custom_steel') {
            steel.loss_wkg = _fv('motorSteelLoss') || 2.5;
            steel.dens     = (_fv('motorSteelDens') || 7.65) * 1000;
        }
        return {
            motorType:   _sv('motorType'),
            V:           _fv('motorVoltage'),
            powerKW:     _fv('motorPowerKW'),
            powerHP:     _fv('motorPowerHP'),
            rpm:         _fv('motorRPM'),
            freq:        _fv('motorFreq'),
            cosfi:       _fv('motorCosfi')  || 0.85,
            eta:         _fv('motorEta')    || 0.87,
            insClass:    _sv('motorInsClass'),
            connection:  _sv('motorConnection'),
            startMethod: _sv('motorStartMethod'),
            auxRatio:    _fv('motorAuxRatio') || 1.3,
            Q:           _iv('motorSlots'),
            D_ext_mm:    _fv('motorExtDiam'),
            D_bore_mm:   _fv('motorBoreDiam'),
            L_stack_mm:  _fv('motorStackLength'),
            Bav:         _fv('motorBav') || 0.70,
            pitchType:   _sv('motorPitchType'),
            pitchRatio:  _fv('motorPitchRatio') || 0.833,
            slotType, slotDims,
            steel,
            existAWG:    _iv('motorExistAWG')    || 0,
            existTurns:  _iv('motorExistTurns')  || 0,
        };
    }

    function _readSlotDims() {
        const t = _sv('motorSlotType') || 'rect';
        if (t === 'rect') return {
            b1: _fv('slotB1') || 3.0, h1: _fv('slotH1') || 1.0,
            bw: _fv('slotBw') || 5.5, hw: _fv('slotHw') || 18.0,
        };
        if (t === 'trap') return {
            b1: _fv('trapB1') || 3.0, h1: _fv('trapH1') || 1.0,
            btop: _fv('trapBtop') || 4.0, bbot: _fv('trapBbot') || 7.0,
            hw: _fv('trapHw') || 18.0,
            bw: (_fv('trapBtop') + _fv('trapBbot')) / 2 || 5.5, // bw efectivo (promedio)
        };
        // semi
        return {
            b1: _fv('semiB1') || 3.0, h1: _fv('semiH1') || 1.0,
            hw: _fv('semiHw') || 16.0, r: _fv('semiR')  || 3.5,
            bw: _fv('semiHw') || 16.0, // ancho = hw para calcular diente
        };
    }

    // ── Área real de ranura ───────────────────────────────────────────────────
    // Área geométrica total: boca (cuello estrecho) + cuerpo (zona conductora)
    function _slotArea(type, d) {
        if (type === 'rect') {
            // boca: b1 × h1 (cuello estrecho que no aloja conductores)
            // cuerpo: bw × hw (zona donde van los conductores)
            return (d.b1 * d.h1) + (d.bw * d.hw);
        }
        if (type === 'trap') {
            const boca = d.b1 * d.h1;
            const cuerpo = ((d.btop + d.bbot) / 2) * d.hw;
            return boca + cuerpo;
        }
        // semi: boca + rectángulo + semicírculo en el fondo
        const r = d.r || 3.5;
        const boca = d.b1 * d.h1;
        const rect = d.bw * (d.hw - r);
        const semi = Math.PI * r * r / 2;
        return boca + rect + semi;
    }

    // Área neta disponible para conductores (cuerpo de ranura menos aislantes)
    // Descuenta: aislante de ranura perimetral + separador inter-capas
    function _slotBodyArea(type, d, t_ins) {
        const t_wall  = t_ins || 0.30;  // Nomex de ranura por lado (mm)
        const t_layer = 0.25;           // Nomex inter-capas (mm)
        let bw, hw;
        if (type === 'rect') {
            bw = d.bw; hw = d.hw;
        } else if (type === 'trap') {
            bw = (d.btop + d.bbot) / 2; hw = d.hw;
        } else {
            bw = d.bw || d.hw; hw = d.hw;
        }
        const A_body      = bw * hw;
        // El Nomex de ranura recubre 3 lados del cuerpo: los 2 laterales (hw) y el fondo (bw).
        // La boca ya está protegida por el cuello b1×h1, que no aloja conductores.
        const A_iso_wall  = t_wall  * (2 * hw + bw);   // aislante perimetral (3 lados)
        const A_iso_layer = t_layer * bw;               // separador inter-capas
        return Math.max(1, A_body - A_iso_wall - A_iso_layer);
    }

    // ── Longitud media de vuelta (MTL) real ───────────────────────────────────
    // La cabeza de bobina sigue el paso de bobina (y ranuras), no el paso polar.
    // Cuerda = 2 × (D_bore/2 + h_slot/2) × sin(π × y / Q) — arco de círculo
    // Factor de extensión: 1.15 para paso pleno, 1.10 para paso corto.
    // tau_p = paso polar en ranuras (opcional; si se omite se asume paso pleno).
    function _computeMTL(D_bore_mm, L_stack_mm, h_slot_mm, Q, y, tau_p) {
        const R_mid_m = (D_bore_mm + h_slot_mm) / 2 / 1000;   // radio al centro de ranura
        const chord_m = 2 * R_mid_m * Math.sin(Math.PI * y / Q); // cuerda del paso de bobina
        const L_m = L_stack_mm / 1000;
        // Factor cabeza: interpolado entre 1.10 (paso corto) y 1.15 (paso pleno)
        const beta = (tau_p && tau_p > 0) ? Math.min(1, y / tau_p) : 1.0;
        const headFactor = 1.10 + 0.05 * beta;
        // 2 lados activos + 2 cabezas
        return 2 * L_m + 2 * chord_m * headFactor;
    }

    // =========================================================================
    // ── VALIDACIÓN ────────────────────────────────────────────────────────────
    // =========================================================================

    function _validate(p) {
        const errors = [], warnings = [];

        if (!p.V || p.V <= 0 || p.V > 15000) errors.push('Tensión fuera de rango (1–15000 V).');
        if (p.freq !== 50 && p.freq !== 60)   errors.push('Frecuencia debe ser 50 o 60 Hz.');
        if (!p.powerKW || p.powerKW <= 0)     errors.push('Potencia debe ser mayor que cero.');
        if (p.powerKW > 37.3)                 warnings.push('Potencia > 50 HP. El módulo está optimizado hasta 50 HP.');
        if (!p.rpm || p.rpm <= 0)             errors.push('RPM debe ser mayor que cero.');
        if (!p.Q || p.Q < 12 || p.Q > 144)   errors.push('Número de ranuras Q debe estar entre 12 y 144.');
        if (!p.D_ext_mm || p.D_ext_mm <= 0)   errors.push('Diámetro exterior debe ser positivo.');
        if (!p.D_bore_mm || p.D_bore_mm <= 0) errors.push('Diámetro interior debe ser positivo.');
        if (p.D_ext_mm && p.D_bore_mm && p.D_ext_mm <= p.D_bore_mm)
            errors.push('El diámetro exterior debe ser mayor que el interior.');
        if (!p.L_stack_mm || p.L_stack_mm <= 0) errors.push('Longitud del paquete debe ser positiva.');
        if (p.Bav < 0.3 || p.Bav > 1.1)      warnings.push(`Bav = ${p.Bav} T es inusual. Rango típico: 0.60–0.85 T.`);
        if (p.cosfi < 0.5 || p.cosfi > 1.0)  warnings.push('Factor de potencia fuera del rango normal.');
        if (p.eta   < 0.5 || p.eta   > 0.99) warnings.push('Eficiencia fuera del rango normal.');

        // Corona muy delgada
        if (p.D_ext_mm && p.D_bore_mm) {
            const corona_mm = (p.D_ext_mm - p.D_bore_mm) / 2;
            if (corona_mm < 8)  warnings.push(`Corona del estátor muy delgada (${corona_mm.toFixed(1)} mm). Puede haber saturación.`);
        }

        // Verificación geométrica de ranura vs estátor
        const hSlot = p.slotDims.hw || 18;
        if (p.D_bore_mm && hSlot > (p.D_ext_mm - p.D_bore_mm) / 2 * 0.9)
            warnings.push('La ranura es más profunda que la corona disponible.');

        // Verificación de polos
        if (errors.length === 0) {
            const poles = _computePoles(p.freq, p.rpm);
            if (poles.P < 2)     errors.push('No se puede determinar el número de polos. Verifique RPM y frecuencia.');
            if (poles.slip < 0)  errors.push('La velocidad nominal supera la sincrónica — imposible para motor de inducción.');
            if (poles.slip > 0.12) warnings.push(`Deslizamiento = ${(poles.slip*100).toFixed(1)}% (> 12%). Inusual para motor estándar.`);
            const m = p.motorType === 'three' ? 3 : 2;
            const q = p.Q / (poles.P * m);
            if (q < 0.5) errors.push(`Muy pocas ranuras para ${poles.P} polos y ${m} fases (q = ${q.toFixed(2)}).`);
            if (!Number.isInteger(Math.round(q * 6) / 6))
                warnings.push(`Bobinado fraccionario (q = ${q.toFixed(3)}). Válido pero poco común.`);
        }

        // Verificar compatibilidad potencia ↔ carcasa.
        // Heurística: ratio = (A_slot_net × Q) / (2 × I_line). Si este ratio es muy alto
        // (carcasa sobredimensionada) el cálculo de vueltas dará N_c imposible de bobinar.
        // Para motores IE2 trifásicos >2kW: ratio típico = 25–65. Arriba de 70 → desajuste.
        if (p.motorType === 'three' && p.slotDims && p.powerKW > 2.0 && p.V && p.eta && p.cosfi) {
            const A_sn = _slotBodyArea(p.slotType || 'rect', p.slotDims);
            const I_line_est = (p.powerKW * 1000) / (Math.sqrt(3) * p.V * p.eta * p.cosfi);
            const ratio = (A_sn * p.Q) / (2 * I_line_est);
            if (ratio > 70) {
                warnings.push(`Posible incompatibilidad carcasa/potencia: la ranura parece sobredimensionada para ${p.powerKW.toFixed(1)} kW (${I_line_est.toFixed(1)} A). Verifique que la carcasa seleccionada corresponde a la potencia del motor — puede estar usando datos de un motor más grande.`);
            }
        }

        return { ok: errors.length === 0, errors, warnings };
    }

    // =========================================================================
    // ── FÍSICA PURA ───────────────────────────────────────────────────────────
    // =========================================================================

    function _computePoles(f, rpm) {
        const candidates = [2, 4, 6, 8, 10, 12];
        let best = { P: 4, n_sync: 1500, slip: 1 };
        for (const P of candidates) {
            const n_s = 120 * f / P;
            if (n_s <= rpm) continue;
            const slip = (n_s - rpm) / n_s;
            if (slip < best.slip) best = { P, n_sync: n_s, slip };
        }
        return best;
    }

    function _computeKw(Q, P, q_int, y, tau_p) {
        const alpha = Math.PI * P / Q;
        const Kd = Math.sin(q_int * alpha / 2) / (q_int * Math.sin(alpha / 2));
        const Kp = Math.sin(Math.PI * y / (2 * tau_p));
        return { Kd, Kp, Kw: Kd * Kp };
    }

    function _selectWire(I, J_max_Amm2) {
        const reqArea = I / J_max_Amm2; // mm² — área total requerida
        const list = [10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,32,34,36,38,40];

        // Buscar el AWG más fino que, en un solo conductor, satisface J
        for (let i = list.length - 1; i >= 0; i--) {
            const awg = list[i];
            if (awgTable[awg] && awgTable[awg].area >= reqArea)
                return { awg, area: awgTable[awg].area, diameter: awgTable[awg].diameter, n_parallel: 1 };
        }

        // Si la corriente supera AWG 10, calcular hilos en paralelo.
        const PREFERRED_AWG = [14, 15, 16, 17, 18];
        let best = null;
        for (const awg of PREFERRED_AWG) {
            if (!awgTable[awg]) continue;
            const n = Math.ceil(reqArea / awgTable[awg].area);
            if (n <= 8) {
                best = { awg, area: awgTable[awg].area * n, diameter: awgTable[awg].diameter, n_parallel: n };
                break;
            }
        }
        if (!best) {
            const n = Math.ceil(reqArea / awgTable[10].area);
            best = { awg: 10, area: awgTable[10].area * n, diameter: awgTable[10].diameter, n_parallel: n };
        }
        return best;
    }

    // Selecciona el calibre óptimo considerando el llenado de ranura.
    // Dado N_c y A_slot_net, busca el hilo más grueso (mejor J) tal que Ku ≤ KU_MAX.
    // Si un solo hilo no cumple, prueba subdividir en 2, 3... hilos más finos en paralelo
    // (misma área de cobre total, menor diámetro por hilo → menor área esmaltada).
    function _selectWireForSlot(I, J_max, N_c, A_slot_net, KU_MAX) {
        const KU = KU_MAX || 0.55;
        // Ku = (2 × N_c × np × A_esm) / A_slot_net  ≤ KU_MAX
        // A_esm = π/4 × (d_cu + 0.05)²
        // Para cada np, el conductor más grueso que cabe en ranura sin exceder Ku
        // y que simultáneamente satisface J = I / (area × np) ≤ J_max.
        const A_cond_max = KU * A_slot_net;   // mm² esmaltados totales disponibles

        // Lista AWG de grueso (10) a fino (40) — orden correcto para buscar el mayor
        // diámetro que cabe y cumple J
        const list = [10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,32,34,36,38,40];
        const reqCuArea = I / J_max;           // mm² de cobre mínimos para J

        for (let np = 1; np <= 6; np++) {
            // Diámetro de cobre máximo permitido por restricción Ku:
            const A_esm_per_wire = A_cond_max / (2 * N_c * np);
            const d_esm_max = Math.sqrt(4 * A_esm_per_wire / Math.PI);
            const d_cu_max = d_esm_max - 0.05;
            if (d_cu_max <= 0) continue;

            // Buscar el AWG más GRUESO cuyo diámetro ≤ d_cu_max Y área×np ≥ reqCuArea
            // Iterar de AWG grueso (i=0) a fino (i=length-1):
            // el primer AWG que cabe y cumple J es el óptimo (mayor sección, menor J).
            for (let i = 0; i < list.length; i++) {
                const awg = list[i];
                const w = awgTable[awg];
                if (!w) continue;
                if (w.diameter > d_cu_max) continue;         // no cabe en la ranura
                if (w.area * np < reqCuArea * 0.98) continue; // J insuficiente
                return { awg, area: w.area * np, diameter: w.diameter, n_parallel: np };
            }
        }

        // Fallback: no existe combinación Ku≤KU_MAX + J≤J_max.
        // Devolver la combinación de menor Ku real posible que sí cumple J,
        // evaluando todas las combinaciones np×AWG y eligiendo la de menor Ku.
        let best = null;
        let bestKu = Infinity;
        for (let np = 1; np <= 6; np++) {
            const cu_min_per_wire = reqCuArea / np;
            // AWG más fino que cumple J con este np (menor diámetro → menor Ku)
            for (let i = list.length - 1; i >= 0; i--) {
                const awg = list[i];
                const w = awgTable[awg];
                if (!w) continue;
                if (w.area * np < reqCuArea * 0.98) continue;
                const d_esm = w.diameter + 0.05;
                const A_esm = Math.PI / 4 * d_esm * d_esm;
                const ku = (2 * N_c * np * A_esm) / A_slot_net;
                if (ku < bestKu) {
                    bestKu = ku;
                    best = { awg, area: w.area * np, diameter: w.diameter, n_parallel: np, kuExceeded: true };
                }
                break; // solo el más fino que cumple J para este np
            }
        }
        if (best) return best;
        return { awg: 10, area: awgTable[10].area, diameter: awgTable[10].diameter, n_parallel: 1, kuExceeded: true };
    }

    // Calcula el Ku real para una combinación dada (sin efectuar selección)
    function _computeKu(N_c, awg, n_parallel, A_slot_net) {
        const w = awgTable[awg];
        if (!w) return 999;
        const d_esm = w.diameter + 0.05;
        const A_esm = Math.PI / 4 * d_esm * d_esm;
        return (2 * N_c * n_parallel * A_esm) / A_slot_net;
    }

    // Busca el mejor wire que minimiza Ku para una corriente y N_c dados
    function _bestWireForDelta(I_delta, J_max, N_c, A_slot_net) {
        return _selectWireForSlot(I_delta, J_max, N_c, A_slot_net, 0.55);
    }

    // Calcula el N_c máximo para el que existe solución Ku ≤ KU_MAX con J ≤ J_max,
    // probando valores decrecientes desde N_c_max hasta 1.
    function _maxFeasibleNc(I, J_max, A_slot_net, N_c_start, KU_MAX) {
        for (let nc = N_c_start; nc >= 1; nc--) {
            const w = _selectWireForSlot(I, J_max, nc, A_slot_net, KU_MAX || 0.55);
            if (!w.kuExceeded) return { N_c: nc, wire: w };
        }
        return null;
    }

    function _computeSlotDistrib(Q, P, m, y) {
        const phases = m === 3 ? ['A','B','C'] : ['A','Aux'];
        return Array.from({ length: Q }, (_, s) => {
            const groupF = (s * P * m) / Q;
            const group  = Math.floor(groupF);
            const pole   = Math.floor(group / m);
            return { slot: s + 1, phase: phases[group % m], dir: pole % 2 === 0 ? '+' : '−' };
        });
    }

    // ── Volúmenes del núcleo ──────────────────────────────────────────────────
    function _coreVolumes(p) {
        const OD = p.D_ext_mm / 1000;
        const ID = p.D_bore_mm / 1000;
        const L  = p.L_stack_mm / 1000;
        const Q  = p.Q;
        const t  = p.slotType;
        const d  = p.slotDims;
        const hSlot = (d.hw + (d.h1 || 1)) / 1000; // m

        // Área de la sección transversal del anillo (corona + dientes)
        const A_ring = Math.PI / 4 * (OD * OD - ID * ID); // m²

        // Área real de una ranura en m²
        const A_slot_m2 = _slotArea(t, d) * 1e-6;

        // Volumen total del acero = volumen del anillo menos el volumen de las ranuras
        const Vol_total = A_ring * L; // m³
        const Vol_slots = Q * A_slot_m2 * L;
        const Vol_steel = (Vol_total - Vol_slots) * 0.97; // factor de apilado 0.97

        // Área de la corona (yoke): anillo exterior sin dientes
        const h_yoke = (OD - ID) / 2 - hSlot; // m
        const A_yoke = Math.PI * ((OD / 2) ** 2 - ((ID / 2 + hSlot)) ** 2);

        // Masa de acero
        const mass_steel_kg = Vol_steel * DEN_FE;

        return { A_ring, Vol_steel, A_yoke, h_yoke, mass_steel_kg, A_slot_m2 };
    }

    // ── Densidades de flujo en diente y corona ────────────────────────────────
    function _fluxDensities(p, Phi, cv) {
        const OD = p.D_ext_mm;
        const ID = p.D_bore_mm;
        const L  = p.L_stack_mm;
        const Q  = p.Q;
        const d  = p.slotDims;
        const { P } = _computePoles(p.freq, p.rpm);

        // Flujo del entrehierro entra al diente por la sección en el bore.
        // El ancho del diente al bore es el que limita la saturación:
        //   τ_slot_bore = π × ID / Q  (paso de ranura al bore)
        //   b_tooth_bore = τ_slot_bore − b1  (ancho de diente en la boca)
        // Para el camino magnético se usa el ancho mínimo (cuello en el bore).
        const tau_slot_bore_mm = Math.PI * ID / Q;
        const b_tooth_bore = Math.max(0.5, tau_slot_bore_mm - (d.b1 || 3));  // mm

        // Sección del diente al bore (zona de máxima saturación):
        //   A_tooth = b_tooth_bore × L_stack × kFe
        const A_tooth = b_tooth_bore * L * 1e-6 * 0.97;  // m²

        // Flujo por ranura = Bav × τ_slot_bore × L
        const Phi_tooth = p.Bav * (tau_slot_bore_mm / 1000) * (L / 1000);  // Wb
        const B_tooth = A_tooth > 0 ? Phi_tooth / A_tooth : 0;

        // b_tooth reportado al bore (cuello, el más crítico)
        const b_tooth = b_tooth_bore;
        const h_tooth_mm = (d.hw || 18) + (d.h1 || 1);

        // Densidad de flujo en la corona (flujo circula tangencialmente)
        const h_slot_total = (d.hw || 18) + (d.h1 || 1);
        const h_yoke = (OD - ID) / 2 - h_slot_total;  // mm
        const A_yoke = Math.max(1e-6, h_yoke * L * 1e-6 * 0.97);  // m²
        const B_yoke = Phi / (2 * A_yoke);

        return { B_tooth, b_tooth, A_tooth, B_yoke, h_yoke, A_yoke, h_tooth_mm };
    }

    // ── Pérdidas en el núcleo (Steinmetz simplificado para 50/60 Hz) ─────────
    function _coreLoss(p, B_tooth, B_yoke, cv) {
        const steel = p.steel;
        const freq_factor = Math.pow(p.freq / 50, 1.4);

        // Pérdidas específicas por zona (W/kg) — ley de Steinmetz
        const Pfe_tooth_wkg = steel.loss_wkg * Math.pow(Math.min(B_tooth / steel.B_ref, 2.0), 2) * freq_factor;
        const Pfe_yoke_wkg  = steel.loss_wkg * Math.pow(Math.min(B_yoke  / steel.B_ref, 2.0), 2) * freq_factor;

        // Masa de dientes y corona calculadas geométricamente
        const Q   = p.Q;
        const L   = p.L_stack_mm / 1000;    // m
        const d   = p.slotDims;
        const ID  = p.D_bore_mm / 1000;     // m
        const OD  = p.D_ext_mm  / 1000;     // m

        const h_tooth_m = ((d.hw || 18) + (d.h1 || 1)) / 1000;
        const h_mid_m   = (d.hw || 18) / 2 / 1000;
        const D_mid_m   = ID + 2 * h_mid_m;
        const tau_slot_mid_m = Math.PI * D_mid_m / Q;
        const b_tooth_m = Math.max(0.5e-3, tau_slot_mid_m - (d.bw || d.btop || 5.5) / 1000);

        const Vol_tooth = Q * b_tooth_m * h_tooth_m * L * 0.97;  // m³
        const mass_tooth_kg = Math.max(0, Vol_tooth) * steel.dens;

        const h_yoke_m  = (OD - ID) / 2 - h_tooth_m;
        const R_yoke_out = OD / 2;
        const R_yoke_in  = Math.max(0, OD / 2 - h_yoke_m);
        const Vol_yoke  = Math.PI * (R_yoke_out ** 2 - R_yoke_in ** 2) * L * 0.97;
        const mass_yoke_kg = Math.max(0, Vol_yoke) * steel.dens;

        const Pfe = Pfe_tooth_wkg * mass_tooth_kg + Pfe_yoke_wkg * mass_yoke_kg;
        return { Pfe, Pfe_tooth_wkg, Pfe_yoke_wkg };
    }

    // =========================================================================
    // ── CÁLCULO TRIFÁSICO ─────────────────────────────────────────────────────
    // =========================================================================

    function _calcThreePhase(p) {
        const { P, n_sync, slip } = _computePoles(p.freq, p.rpm);
        const m  = 3;
        const f  = p.freq;
        const V  = p.V;
        const ID = p.D_bore_mm;
        const L  = p.L_stack_mm;
        const d  = p.slotDims;

        const q     = p.Q / (P * m);
        const q_int = Math.max(1, Math.round(q));
        const tau_p = p.Q / P;
        const y     = p.pitchType === 'full'
            ? Math.round(tau_p)
            : Math.max(1, Math.round(tau_p * p.pitchRatio));

        const { Kd, Kp, Kw } = _computeKw(p.Q, P, q_int, y, tau_p);

        const V_phase = p.connection === 'star' ? V / Math.sqrt(3) : V;

        // Limitar Bav al máximo que no satura la corona (Bc ≤ 0.95 × Bsat)
        // Bc = Phi / (2 × h_yoke × L × 0.97)  donde Phi = Bav × tau_m × L
        // → Bc = Bav × tau_m / (2 × h_yoke × 0.97)
        // → Bav_max = Bc_max × 2 × h_yoke × 0.97 / tau_m
        const bsat     = p.steel ? p.steel.bsat : 1.8;
        const h_yoke_m = ((p.D_ext_mm - ID) / 2 - (d.hw || 18) - (d.h1 || 1)) / 1000; // m
        const tau_m_lim = Math.PI * (ID / 1000) / P;   // m
        const Bc_max   = bsat * 0.90;  // 90% de Bsat como límite seguro
        const Bav_max_byoke = h_yoke_m > 0
            ? (Bc_max * 2 * h_yoke_m * 0.97) / tau_m_lim
            : p.Bav;
        // También limitar por Bt: Bt = Bav × τ_bore / (b_tooth × 0.97)
        // b_tooth = τ_bore - b1 (mm)
        const tau_bore_mm  = Math.PI * ID / p.Q;
        const b_tooth_bore = Math.max(0.5, tau_bore_mm - (d.b1 || 3));
        const Bav_max_btooth = (bsat * 0.90 * b_tooth_bore * 0.97) / tau_bore_mm;
        // Bav efectivo: el menor entre el ingresado y los dos límites físicos
        const Bav_eff = Math.min(p.Bav, Bav_max_byoke, Bav_max_btooth);

        // Flujo por polo usando Bav efectivo
        const tau_m   = tau_m_lim;
        const tau_m_mm = tau_m * 1000;
        const Phi     = Bav_eff * tau_m * (L / 1000);  // Wb

        // Vueltas por fase
        // Método del PDF "Calculo bobinados trifasicos":
        //   Z (vueltas/bobina) = Zf × 3 / N  →  N_c = N_ph / (Q/3)
        // Con doble capa y k1=1 (todo en serie), hay Q/3 bobinas en serie por fase.
        // groups_per_phase = Q / (3 × k1) con k1=1 → Q/3
        const N_ph_raw = V_phase / (4.44 * f * Phi * Kw);
        const groups_per_phase = Math.round(p.Q / 3);   // bobinas en serie por fase (k1=1)
        const N_c  = Math.max(1, Math.round(N_ph_raw / groups_per_phase));
        const N_ph = N_c * groups_per_phase;

        // Verificación FEM
        const E_verify = 4.44 * f * Phi * Kw * N_ph;

        // Corriente
        const I_line  = (p.powerKW * 1000) / (Math.sqrt(3) * V * p.eta * p.cosfi);
        const I_phase = p.connection === 'star' ? I_line : I_line / Math.sqrt(3);

        // AWG — selección con verificación de llenado de ranura
        const J_max      = _jMaxForPower(p.powerHP || p.powerKW * 1.341, p.insClass);
        const A_slot_net_pre = _slotBodyArea(p.slotType, d);
        const wire   = _selectWireForSlot(I_phase, J_max, N_c, A_slot_net_pre, 0.55);
        const J_real = I_phase / wire.area;

        // Longitud media de vuelta real (basada en paso de bobina, no paso polar)
        const h_slot = d.hw + (d.h1 || 1);
        const MTL = _computeMTL(ID, L, h_slot, p.Q, y, tau_p);

        // Cable y cobre — masa calculada por conductor individual × n_parallel
        const l_total = N_ph * MTL;
        const area_single = wire.area / wire.n_parallel;   // área de un hilo individual
        const R_phase = RHO_CU * l_total / (area_single * 1e-6) / wire.n_parallel;
        const Pcu_phase = I_phase * I_phase * R_phase;
        const Pcu_total = m * Pcu_phase;
        const m_Cu_phase = l_total * (wire.area * 1e-6) * DEN_CU * 1000;  // g
        const m_Cu_total = m * m_Cu_phase;

        // Factor de llenado real
        const A_slot = _slotArea(p.slotType, d);  // mm² (total geométrico)
        const A_slot_net = _slotBodyArea(p.slotType, d);  // mm² (cuerpo neto sin aislantes)
        // Área física de un hilo esmaltado = π/4 × (d_cobre + Δesmalte)²
        // Δesmalte ≈ 0.05 mm por lado para grado 1 (single build, AWG 10–30)
        const d_esm = wire.diameter + 0.05;  // mm, diámetro esmaltado
        const A_wire_esm = Math.PI / 4 * d_esm * d_esm;  // mm²
        // En ranura de 2 capas: N_c conductores por capa × 2 capas
        const A_cond = 2 * N_c * A_wire_esm * wire.n_parallel;
        const Ku = A_cond / A_slot_net;

        // Volúmenes y masas del núcleo
        const cv = _coreVolumes(p);
        const { B_tooth, b_tooth, A_tooth, B_yoke, h_yoke, A_yoke } = _fluxDensities(p, Phi, cv);
        const { Pfe, Pfe_tooth_wkg, Pfe_yoke_wkg } = _coreLoss(p, B_tooth, B_yoke, cv);

        // Pérdidas mecánicas (fricción+ventilación) y pérdidas adicionales (dispersión):
        // Típicamente ~1.5% de Pn para pérdidas mec. y ~0.5% para adicionales en motores IE2
        const Pmec  = p.powerKW * 1000 * 0.015;   // W — fricción + ventilación
        const Padd  = p.powerKW * 1000 * 0.005;   // W — pérdidas adicionales (load losses)
        const eta_calc = p.powerKW * 1000 / (p.powerKW * 1000 + Pcu_total + Pfe + Pmec + Padd);

        // Distribución de ranuras
        const slotTable = _computeSlotDistrib(p.Q, P, m, y);

        // ── Datos de rebobinado ───────────────────────────────────────────────
        // Paso de bobina en notación taller: "1 - (y+1)"
        const winding_step = '1 – ' + (y + 1);

        // Inicio de cada fase en las ranuras (para 3 fases, desfase = Q/(P*m) ranuras)
        const slots_per_phase_group = Math.round(p.Q / (P * m));
        const phase_starts = {
            U: 1,
            V: 1 + slots_per_phase_group,
            W: 1 + 2 * slots_per_phase_group,
        };

        // Tipo de conexión de grupos dentro de cada fase.
        // Para I_phase > 15A con más de 2 polos conviene paralelo para reducir corriente por grupo.
        const groups_connection = (P > 2 && I_phase > 15) ? 'paralelo' : 'serie';

        // Advertencias
        const postWarnings = [];
        // Informar si Bav fue limitado automáticamente
        if (Bav_eff < p.Bav - 0.005) {
            postWarnings.push(
                `Bav reducido automáticamente de ${p.Bav.toFixed(3)} T a ${Bav_eff.toFixed(3)} T ` +
                `para evitar saturación (Bc_max=${Bc_max.toFixed(2)} T, h_yoke=${(h_yoke_m*1000).toFixed(1)} mm). ` +
                `Si necesita Bav más alto, aumente OD o reduzca hw.`
            );
        }
        if (J_real > J_max)              postWarnings.push(`J = ${J_real.toFixed(2)} A/mm² supera límite (${J_max.toFixed(1)} A/mm²). Use calibre mayor.`);
        else if (J_real > J_max * 0.92)  postWarnings.push(`J = ${J_real.toFixed(2)} A/mm² cercana al límite (${J_max.toFixed(1)} A/mm²).`);
        if (wire.n_parallel > 1 && !wire.kuExceeded)  postWarnings.push(`Corriente elevada: usar ${wire.n_parallel} hilos AWG ${wire.awg} en paralelo (en mano) por bobina.`);
        // Detectar si Ku alto es consecuencia de corona fina (By limita Bav, que dispara N_c)
        const h_yoke_check = (p.D_ext_mm - p.D_bore_mm) / 2 - (d.hw || 18) - (d.h1 || 1);
        const byLimitsKu = Ku > 0.55 && B_yoke > p.steel.bsat * 0.75;
        if (Ku > 0.55) {
            if (byLimitsKu) {
                postWarnings.push(`Llenado Ku = ${(Ku*100).toFixed(0)}% — CAUSA RAÍZ: corona demasiado delgada (h_yoke=${h_yoke_check.toFixed(1)} mm). `
                    + `La corona saturada (Bc=${B_yoke.toFixed(2)} T) obliga a bajar Bav, lo que dispara las vueltas. `
                    + `Solución: usar núcleo de mayor diámetro exterior (OD) o reducir la profundidad de ranura (hw).`);
            } else {
                // Analizar si cambiar a triángulo resuelve el problema de llenado
                const connActual = p.connection;
                const I_delta = I_line / Math.sqrt(3);   // corriente de fase en Δ
                const I_star  = I_line;                   // corriente de fase en Y
                const wireForDelta = _bestWireForDelta(I_delta, J_max, N_c, A_slot_net_pre);
                const Ku_delta = _computeKu(N_c, wireForDelta.awg, wireForDelta.n_parallel, A_slot_net_pre);
                const Ku_star  = Ku;   // ya calculado para conexión actual

                // Calcular N_c máximo factible para cada conexión
                const feasY = _maxFeasibleNc(I_star, J_max, A_slot_net_pre, N_c, 0.55);
                const feasD = _maxFeasibleNc(I_delta, J_max, A_slot_net_pre, N_c, 0.55);

                let diagMsg = `Llenado de ranura Ku = ${(Ku_star*100).toFixed(0)}% > 55% con conexión ${connActual === 'star' ? 'Estrella (Y)' : 'Triángulo (Δ)'}. `;
                if (connActual === 'star') {
                    const npTxt = wireForDelta.n_parallel > 1 ? ` ×${wireForDelta.n_parallel}` : '';
                    diagMsg += `Con Triángulo (Δ): I_fase=${I_delta.toFixed(2)} A → AWG ${wireForDelta.awg}${npTxt}, Ku=${(Ku_delta*100).toFixed(0)}%. `;
                    if (Ku_delta <= 0.55) {
                        diagMsg += `✓ Cambie a TRIÁNGULO (Δ) para que el bobinado sea factible.`;
                    } else {
                        // Indicar N_c máximo factible para cada conexión
                        if (feasY) {
                            const npy = feasY.wire.n_parallel > 1 ? ` ×${feasY.wire.n_parallel}` : '';
                            diagMsg += `Estrella (Y): N_c máximo factible = ${feasY.N_c} vueltas/bobina (AWG ${feasY.wire.awg}${npy}). `;
                        }
                        if (feasD) {
                            const npd = feasD.wire.n_parallel > 1 ? ` ×${feasD.wire.n_parallel}` : '';
                            diagMsg += `Triángulo (Δ): N_c máximo factible = ${feasD.N_c} vueltas/bobina (AWG ${feasD.wire.awg}${npd}). `;
                        }
                        if (!feasY && !feasD) {
                            diagMsg += `Ranura demasiado pequeña para esta corriente con cualquier N_c. Verifique dimensiones de ranura o use núcleo de mayor diámetro exterior.`;
                        } else {
                            diagMsg += `Para reducir N_c aumente Bav en los parámetros de entrada.`;
                        }
                    }
                } else {
                    const wireForStar = _bestWireForDelta(I_star, J_max, N_c, A_slot_net_pre);
                    const Ku_starAlt = _computeKu(N_c, wireForStar.awg, wireForStar.n_parallel, A_slot_net_pre);
                    diagMsg += `En Estrella (Y) sería peor: Ku=${(Ku_starAlt*100).toFixed(0)}%. `;
                    if (feasD) {
                        const npd = feasD.wire.n_parallel > 1 ? ` ×${feasD.wire.n_parallel}` : '';
                        diagMsg += `Triángulo (Δ): N_c máximo factible = ${feasD.N_c} vueltas/bobina (AWG ${feasD.wire.awg}${npd}). Para reducir N_c aumente Bav.`;
                    } else {
                        diagMsg += `Ranura demasiado pequeña. Verifique dimensiones o use núcleo mayor.`;
                    }
                }
                postWarnings.push(diagMsg);
            }
        } else if (Ku > 0.45) {
            postWarnings.push(`Llenado de ranura Ku = ${(Ku*100).toFixed(0)}% > 45%. Bobinado manual difícil.`);
        }
        if (N_c < 3)    postWarnings.push('Muy pocas vueltas por bobina (< 3). Revise Bav o dimensiones del estátor.');
        if (N_c > 400)  postWarnings.push('Muchas vueltas por bobina (> 400). Revise los parámetros.');
        if (B_tooth > p.steel.bsat * 0.95) postWarnings.push(`Densidad en el diente Bt = ${B_tooth.toFixed(3)} T se acerca a la saturación (${p.steel.bsat} T).`);
        if (B_yoke  > p.steel.bsat * 0.85) postWarnings.push(`Densidad en la corona Bc = ${B_yoke.toFixed(3)} T es elevada.`);
        const ratio = E_verify / V_phase;
        if (Math.abs(ratio - 1) > 0.07)  postWarnings.push(`FEM calculada E = ${E_verify.toFixed(1)} V vs V_fase = ${V_phase.toFixed(1)} V (${((ratio-1)*100).toFixed(1)}%). Ajuste Bav.`);

        // Escenario alternativo: si Ku > 55%, calcular cómo quedaría en la conexión opuesta
        let deltaScenario = null;
        if (Ku > 0.55) {
            const I_alt = p.connection === 'star' ? I_line / Math.sqrt(3) : I_line;
            const connAlt = p.connection === 'star' ? 'delta' : 'star';
            const wireAlt = _bestWireForDelta(I_alt, J_max, N_c, A_slot_net_pre);
            const Ku_alt  = _computeKu(N_c, wireAlt.awg, wireAlt.n_parallel, A_slot_net_pre);
            const feasCurr = _maxFeasibleNc(I_phase, J_max, A_slot_net_pre, N_c, 0.55);
            const feasAlt  = _maxFeasibleNc(I_alt,   J_max, A_slot_net_pre, N_c, 0.55);
            deltaScenario = { connection: connAlt, I_phase: I_alt, wire: wireAlt, Ku: Ku_alt, feasCurr, feasAlt };
        }

        return {
            motorType: 'three', P, n_sync, slip, m,
            q, q_int, tau_p, y, Kd, Kp, Kw,
            V_phase, tau_m, tau_m_mm, Phi,
            N_ph_raw, N_c, N_ph, E_verify,
            I_line, I_phase, J_max, J_real,
            wire, MTL, l_total, R_phase,
            Pcu_phase, Pcu_total,
            m_Cu_phase, m_Cu_total,
            Ku, A_slot, A_slot_net, A_cond,
            B_tooth, b_tooth, B_yoke, h_yoke,
            Pfe, Pfe_tooth_wkg, Pfe_yoke_wkg,
            eta_calc, cv,
            slotTable, postWarnings,
            deltaScenario,
            groups_per_phase, connection: p.connection,
            winding_step, phase_starts, groups_connection,
            insClass: p.insClass, Q: p.Q, f, V,
            D_ext_mm: p.D_ext_mm, D_mm: p.D_bore_mm, L_mm: p.L_stack_mm,
            Bav: Bav_eff, pitchType: p.pitchType,
            slotType: p.slotType, slotDims: p.slotDims,
            steel: p.steel, powerKW: p.powerKW,
            existAWG: p.existAWG, existTurns: p.existTurns,
        };
    }

    // =========================================================================
    // ── CÁLCULO MONOFÁSICO ────────────────────────────────────────────────────
    // =========================================================================

    function _calcSinglePhase(p) {
        const { P, n_sync, slip } = _computePoles(p.freq, p.rpm);
        const f  = p.freq;
        const V  = p.V;
        const ID = p.D_bore_mm;
        const L  = p.L_stack_mm;
        const d  = p.slotDims;

        // Devanado principal: ~2/3 ranuras
        const Q_main = Math.round((2 / 3) * p.Q);
        const q_main = Math.max(1, Math.round(Q_main / P));
        const tau_p  = p.Q / P;
        const y_main = p.pitchType === 'full'
            ? Math.round(tau_p) : Math.max(1, Math.round(tau_p * p.pitchRatio));

        const { Kd: Kd_m, Kp: Kp_m, Kw: Kw_m } = _computeKw(Q_main, P, q_main, y_main, tau_p);

        const tau_m    = Math.PI * (ID / 1000) / P;
        const tau_m_mm = tau_m * 1000;
        const Phi      = p.Bav * tau_m * (L / 1000);

        const N_ph_raw_m = V / (4.44 * f * Phi * Kw_m);
        const grp_m      = (P / 2) * q_main;
        const N_c_m      = Math.max(1, Math.round(N_ph_raw_m / grp_m));
        const N_ph_m     = N_c_m * grp_m;
        const E_verify_m = 4.44 * f * Phi * Kw_m * N_ph_m;

        const I_main  = (p.powerKW * 1000) / (V * p.eta * p.cosfi);
        const J_max   = _jMaxForPower(p.powerHP || p.powerKW * 1.341, p.insClass);
        const wire_m  = _selectWire(I_main, J_max);
        const J_real_m = I_main / wire_m.area;

        const h_slot = d.hw + (d.h1 || 1);
        const MTL    = _computeMTL(ID, L, h_slot, p.Q, y_main, tau_p);

        const l_m   = N_ph_m * MTL;
        const area_single_m = wire_m.area / wire_m.n_parallel;
        const R_m   = RHO_CU * l_m / (area_single_m * 1e-6) / wire_m.n_parallel;
        const Pcu_m = I_main * I_main * R_m;
        const cu_m  = l_m * (wire_m.area * 1e-6) * DEN_CU * 1000;

        // Devanado auxiliar
        const Q_aux = p.Q - Q_main;
        const q_aux = Math.max(1, Math.round(Q_aux / P));
        const y_aux = Math.round(tau_p);
        const { Kd: Kd_a, Kp: Kp_a, Kw: Kw_a } = _computeKw(Q_aux, P, q_aux, y_aux, tau_p);

        const grp_a        = Math.max(1, (P / 2) * q_aux);
        const N_c_a        = Math.max(1, Math.round(N_ph_m * p.auxRatio / grp_a));
        const N_ph_a       = N_c_a * grp_a;
        const isContinuous = p.startMethod === 'cap_run';
        const J_aux_max    = isContinuous ? J_max : Math.min(8.0, J_max * 1.6);
        const I_aux        = I_main * (isContinuous ? 0.40 : 0.55);
        const wire_a       = _selectWire(I_aux, J_aux_max);
        const J_real_a     = I_aux / wire_a.area;

        const l_a  = N_ph_a * MTL;
        const R_a  = RHO_CU * l_a / (wire_a.area * 1e-6);
        const Pcu_a = I_aux * I_aux * R_a;
        const cu_a = l_a * (wire_a.area * 1e-6) * DEN_CU * 1000;

        let C_uF = null;
        if (p.startMethod === 'cap_start' || p.startMethod === 'cap_run') {
            const X_C = V / I_aux;
            C_uF = 1e6 / (2 * Math.PI * f * X_C);
        }

        // Factor de llenado (área esmaltada real del conductor)
        const A_slot     = _slotArea(p.slotType, d);
        const A_slot_net = _slotBodyArea(p.slotType, d);
        const d_esm_m = wire_m.diameter + 0.05;
        const A_wire_esm_m = Math.PI / 4 * d_esm_m * d_esm_m;
        const d_esm_a = wire_a.diameter + 0.05;
        const A_wire_esm_a = Math.PI / 4 * d_esm_a * d_esm_a;
        const Ku_m = (2 * N_c_m * A_wire_esm_m * wire_m.n_parallel) / A_slot_net;
        const Ku_a = (2 * N_c_a * A_wire_esm_a * wire_a.n_parallel) / A_slot_net;

        // Núcleo
        const cv = _coreVolumes(p);
        const { B_tooth, b_tooth, B_yoke, h_yoke } = _fluxDensities(p, Phi, cv);
        const Pcu_total = Pcu_m + Pcu_a;
        const { Pfe, Pfe_tooth_wkg, Pfe_yoke_wkg } = _coreLoss(p, B_tooth, B_yoke, cv);
        const eta_calc = p.powerKW * 1000 / (p.powerKW * 1000 + Pcu_total + Pfe);

        const slotTable = _computeSlotDistrib(p.Q, P, 2, y_main);

        const postWarnings = [];
        if (J_real_m > J_max)           postWarnings.push(`Principal: J = ${J_real_m.toFixed(2)} A/mm² supera límite clase ${p.insClass}.`);
        if (J_real_a > J_aux_max)       postWarnings.push(`Auxiliar: J = ${J_real_a.toFixed(2)} A/mm² supera límite.`);
        if (Ku_m > 0.55)                postWarnings.push(`Llenado principal Ku = ${(Ku_m*100).toFixed(0)}% > 55%.`);
        if (Ku_a > 0.55)                postWarnings.push(`Llenado auxiliar Ku = ${(Ku_a*100).toFixed(0)}% > 55%.`);
        if (N_c_m < 3)                  postWarnings.push('Muy pocas vueltas por bobina en devanado principal.');
        if (B_tooth > p.steel.bsat * 0.95) postWarnings.push(`Densidad en el diente Bt = ${B_tooth.toFixed(3)} T se acerca a saturación.`);
        const ratio = E_verify_m / V;
        if (Math.abs(ratio - 1) > 0.07) postWarnings.push(`FEM E = ${E_verify_m.toFixed(1)} V vs V = ${V.toFixed(1)} V. Ajuste Bav.`);

        return {
            motorType: 'single', P, n_sync, slip, m: 1,
            q: q_main, q_int: q_main, tau_p, y: y_main,
            Kd: Kd_m, Kp: Kp_m, Kw: Kw_m,
            V_phase: V, tau_m, tau_m_mm, Phi,
            N_c: N_c_m, N_ph: N_ph_m, E_verify: E_verify_m,
            I_line: I_main, I_phase: I_main, J_max, J_real: J_real_m,
            wire: wire_m, MTL, l_total: l_m, R_phase: R_m,
            Pcu_phase: Pcu_m, Pcu_total,
            m_Cu_phase: cu_m, m_Cu_total: cu_m + cu_a,
            Ku: Ku_m, A_slot, A_slot_net,
            B_tooth, b_tooth, B_yoke, h_yoke,
            Pfe, Pfe_tooth_wkg, Pfe_yoke_wkg, eta_calc, cv,
            aux: {
                Q_aux, q_aux, y_aux, Kd: Kd_a, Kp: Kp_a, Kw: Kw_a,
                N_c: N_c_a, N_ph: N_ph_a,
                I: I_aux, J_max: J_aux_max, J_real: J_real_a,
                wire: wire_a, l_total: l_a, R: R_a, Pcu: Pcu_a,
                cu: cu_a, Ku: Ku_a, isContinuous, C_uF,
            },
            slotTable, postWarnings,
            insClass: p.insClass, Q: p.Q, f, V,
            D_ext_mm: p.D_ext_mm, D_mm: p.D_bore_mm, L_mm: p.L_stack_mm,
            Bav: p.Bav, pitchType: p.pitchType,
            slotType: p.slotType, slotDims: p.slotDims,
            steel: p.steel, startMethod: p.startMethod, powerKW: p.powerKW,
            existAWG: p.existAWG, existTurns: p.existTurns,
        };
    }

    // =========================================================================
    // ── OPTIMIZADOR AUTOMÁTICO ────────────────────────────────────────────────
    // =========================================================================

    // Evalúa si los resultados de un parámetro p son aceptables
    function _evalFitness(p) {
        const r = p.motorType === 'three' ? _calcThreePhase(p) : _calcSinglePhase(p);
        const bsat = p.steel.bsat;
        const score = {
            Ku_ok:     r.Ku <= 0.52,
            Bt_ok:     r.B_tooth <= bsat * 0.90,
            By_ok:     r.B_yoke  <= bsat * 0.82,
            J_ok:      r.J_real  <= r.J_max,
            FEM_ok:    Math.abs(r.E_verify / r.V_phase - 1) <= 0.07,
        };
        score.all_ok = Object.values(score).every(Boolean);
        score.violations = Object.entries(score).filter(([k,v]) => k !== 'all_ok' && !v).map(([k]) => k);
        return { r, score };
    }

    window.motorAutoCorrect = function () {
        if (!_lastResults) {
            if (typeof showToast === 'function') showToast('Calcule primero antes de corregir.', 'warning');
            return;
        }

        const btnEl = document.getElementById('btnAutoCorrect');
        if (btnEl) { btnEl.disabled = true; btnEl.textContent = '⏳ Optimizando…'; }

        // Lanzar en el siguiente tick para permitir que el UI se actualice
        setTimeout(function () {
            try {
                _runOptimizer();
            } finally {
                if (btnEl) { btnEl.disabled = false; btnEl.textContent = '🔧 Corregir Cálculo'; }
            }
        }, 20);
    };

    function _runOptimizer() {
        const p0   = _readInputs();
        const bsat = p0.steel.bsat;
        const d0   = p0.slotDims;

        // Evaluacion inicial
        const { score: s0 } = _evalFitness(p0);
        if (s0.all_ok) {
            if (typeof showToast === "function") showToast("El diseño ya es correcto. No se requieren ajustes.", "success");
            return;
        }

        // Rango de Bav ordenado del más alto al más bajo.
        // Motores estándar operan entre 0.60 y 0.80 T; valores bajos generan exceso de vueltas y Ku alto.
        const BavRange  = [0.80, 0.76, 0.72, 0.68, 0.64, 0.60, 0.56, 0.52, 0.48, 0.44, 0.40];
        const pitchOpts = [
            { type: "full",  ratio: 1.000 },
            { type: "short", ratio: 0.889 },
            { type: "short", ratio: 0.833 },
            { type: "short", ratio: 0.778 },
        ];
        const insClasses = ["A", "B", "F", "H"];

        function _sweep(pBase) {
            let best = null, bestNv = 99, bestR = null, bestScore = null;
            for (const Bav of BavRange) {
                for (const pitch of pitchOpts) {
                    for (const ins of insClasses) {
                        const pTry = { ...pBase, Bav, pitchType: pitch.type, pitchRatio: pitch.ratio, insClass: ins };
                        try {
                            const { r, score } = _evalFitness(pTry);
                            const nv = score.violations.length;
                            if (nv < bestNv || (nv === bestNv && _scoreIsBetter(r, bestR, pTry, bsat))) {
                                bestNv = nv; best = pTry; bestR = r; bestScore = score;
                                if (nv === 0) return { p: best, r: bestR, score: bestScore };
                            }
                        } catch (_) {}
                    }
                }
            }
            return best ? { p: best, r: bestR, score: bestScore } : null;
        }

        // FASE 1: solo parametros electricos
        let result = _sweep(p0);
        if (result && result.score.all_ok) {
            _applyOptimized(result.p, result.r, result.score, p0, { geomChanged: false });
            return;
        }

        // FASE 2: ajuste geometrico minimo de ranura
        const violations0    = result ? result.score.violations : s0.violations;
        const geomCandidates = _buildGeomCandidates(d0, p0, violations0);
        let bestGeom = result, geomLabel = null;

        for (const { dims, label } of geomCandidates) {
            const pGeom = { ...p0, slotDims: { ...d0, ...dims } };
            if (p0.slotType === "trap" && dims.btop && dims.bbot)
                pGeom.slotDims.bw = (pGeom.slotDims.btop + pGeom.slotDims.bbot) / 2;
            const sw = _sweep(pGeom);
            if (!sw) continue;
            const nv     = sw.score.violations.length;
            const prevNv = bestGeom ? bestGeom.score.violations.length : 99;
            if (nv < prevNv || (nv === prevNv && _scoreIsBetter(sw.r, bestGeom && bestGeom.r, sw.p, bsat))) {
                bestGeom = sw; geomLabel = label;
                if (nv === 0) break;
            }
        }
        if (bestGeom && bestGeom.score.all_ok) {
            bestGeom.geomChanged = !!geomLabel;
            bestGeom.geomLabel   = geomLabel;
            _applyOptimized(bestGeom.p, bestGeom.r, bestGeom.score, p0, bestGeom);
            return;
        }

        // FASE 3: potencia maxima admisible para este estator
        // I_linea es proporcional a P_kW; reducir P reduce I, AWG, y Ku.
        // Bt y By no dependen de P: se resuelven solo via sweep electrico (Bav + paso).
        // Busqueda binaria: P_max tal que el sweep no tenga violaciones de Ku/J.
        const P_nom = p0.powerKW;
        const P_min = P_nom * 0.10;
        let P_lo = P_min, P_hi = P_nom;
        let bestPow = null;

        // Si a 10% la corriente sigue siendo un problema, solo el hierro falla
        const pAt10    = { ...p0, powerKW: P_min, powerHP: P_min / 0.7457 };
        const swAt10   = _sweep(pAt10);
        const onlyIron = swAt10 && swAt10.score.violations.every(v => v === "Bt_ok" || v === "By_ok");

        if (!onlyIron) {
            for (let iter = 0; iter < 8; iter++) {
                const P_mid = (P_lo + P_hi) / 2;
                const pTry  = { ...p0, powerKW: P_mid, powerHP: P_mid / 0.7457 };
                const sw    = _sweep(pTry);
                if (!sw) { P_hi = P_mid; continue; }
                const kuJ_ok = !sw.score.violations.includes("Ku_ok") &&
                               !sw.score.violations.includes("J_ok");
                if (kuJ_ok) { P_lo = P_mid; bestPow = { ...sw, powerKW: P_mid }; }
                else          { P_hi = P_mid; }
            }
        }

        // Seleccionar el mejor resultado entre las 3 fases
        const phaseResult = bestPow || bestGeom || result;
        if (!phaseResult) {
            _showImpossibleDiagnosis(p0, violations0, d0);
            return;
        }
        phaseResult.geomChanged  = !!(bestGeom && bestGeom.geomLabel);
        phaseResult.geomLabel    = bestGeom ? bestGeom.geomLabel : null;
        phaseResult.powerReduced = !!bestPow;
        phaseResult.powerKW_orig = P_nom;
        phaseResult.powerKW_new  = bestPow ? bestPow.powerKW : null;
        _applyOptimized(phaseResult.p, phaseResult.r, phaseResult.score, p0, phaseResult);
    }

    // ── Generador de candidatos geométricos mínimamente invasivos ─────────────
    function _buildGeomCandidates(d0, p0, violations) {
        const needBt = violations.includes('Bt_ok');  // diente saturado → reducir bw
        const needBy = violations.includes('By_ok');  // corona saturada → reducir hw
        const needKu = violations.includes('Ku_ok');  // llenado excesivo → aumentar hw o reducir bw

        const candidates = [];

        // El diente se mide al bore (b1 = cuello, zona de máxima saturación).
        // b_tooth_bore = τ_slot_bore − b1
        // Bt = Bav × τ_slot_bore / (b_tooth_bore × 0.97)
        // Para reducir Bt: b1_max tal que b_tooth_bore = τ_slot_bore × Bav / (Bt_target × 0.97)
        const { P } = _computePoles(p0.freq, p0.rpm);
        const Q  = p0.Q;
        const ID = p0.D_bore_mm;
        const tau_slot_bore = Math.PI * ID / Q;
        const Bav0  = p0.Bav;
        const bsat  = p0.steel.bsat;
        const h_tooth = (d0.hw || 18) + (d0.h1 || 1);

        // b_tooth mínimo para que Bt ≤ 82% bsat
        const Bt_target   = bsat * 0.82;
        // Bt = Bav × τ_bore / (b_tooth × 0.97)  → b_tooth_min = Bav × τ_bore / (Bt_target × 0.97)
        const b_tooth_min = Bav0 * tau_slot_bore / (Bt_target * 0.97);
        // b1_max = τ_bore − b_tooth_min  (máximo ancho de boca que aún permite el diente)
        const b1_max      = Math.max(0.5, tau_slot_bore - b_tooth_min);
        // Para candidatos geométricos usamos bw_max como el máximo b1 practicable
        const bw_max      = b1_max;

        // hw mínimo para corona: Bc = Phi/(2 × h_yoke × L × 0.97) ≤ bsat × 0.80
        // h_yoke = (OD−ID)/2 − h_tooth; h_tooth = hw + h1
        // Phi / (2 × h_yoke_m × L_m × 0.97) = By_target
        // → h_yoke_min = Phi / (2 × By_target × L_m × 0.97)
        const By_target   = bsat * 0.80;
        const Phi_polo    = Bav0 * (Math.PI * (ID / 1000) / P) * (p0.L_stack_mm / 1000);
        const h_yoke_min  = Phi_polo / (2 * By_target * (p0.L_stack_mm / 1000) * 0.97) * 1000; // mm
        const h_slot_max  = (p0.D_ext_mm - ID) / 2 - h_yoke_min - (d0.h1 || 1);  // hw máximo

        // hw mínimo para Ku: A_cond = 2 × N_c × area × 1.05; A_slot_net = bw × hw_new − perim × 0.3
        // Ku_target = 0.48; → A_slot_net_needed = A_cond / Ku_target
        // hw_for_ku: profundidad mínima para que A_slot_net admita los conductores actuales a Ku=0.48
        // Pero N_c depende del nuevo Bav (que optimizará el sweep), así que estimamos con N_c actual
        const { r: r0 } = _evalFitness(p0);
        const bw_curr = d0.bw || d0.btop || 5.5;
        const A_iso_fix = 0.30 * (2 * (d0.hw || 18) + bw_curr);
        const d_esm_curr = r0.wire.diameter + 0.05;
        const A_wire_esm_curr = Math.PI / 4 * d_esm_curr * d_esm_curr;
        const A_cond_curr = 2 * r0.N_c * A_wire_esm_curr * (r0.wire.n_parallel || 1);
        const A_net_needed = A_cond_curr / 0.48;
        const hw_for_ku   = Math.ceil((A_net_needed + A_iso_fix) / bw_curr);

        // ── Candidatos por reducción de b1 (boca) → mejora Bt ────────────────
        // El Bt se controla ampliando el diente al bore: b_tooth = τ_bore − b1
        // Aumentar b1 estrecha el diente; reducir b1 lo amplía.
        // bw_max aquí es b1_max (reutilizado para compat. con el label)
        if (needBt && (d0.b1 || 3) > bw_max) {
            const b1_curr  = d0.b1 || 3;
            const b1_start = parseFloat((b1_curr).toFixed(1));
            const b1_min   = Math.max(0.5, parseFloat(bw_max.toFixed(1)));
            for (let b1 = b1_start; b1 >= b1_min; b1 = parseFloat((b1 - 0.5).toFixed(1))) {
                const delta = b1_curr - b1;
                candidates.push({
                    dims:  _buildDims(d0, p0.slotType, { b1 }),
                    label: `Reducir b1 (boca): ${b1_curr.toFixed(1)} → ${b1.toFixed(1)} mm (−${delta.toFixed(1)} mm, amplía diente al bore)`,
                    priority: delta,
                });
            }
        }

        // ── Candidatos por aumento de hw (mejora Ku) ──────────────────────────
        if (needKu && !needBy) {
            for (let hw = Math.ceil(hw_for_ku); hw <= Math.min((d0.hw||18) + 8, h_slot_max); hw++) {
                const delta = hw - (d0.hw || 18);
                if (delta <= 0) continue;
                candidates.push({
                    dims:  _buildDims(d0, p0.slotType, { hw }),
                    label: `Aumentar hw: ${(d0.hw||18).toFixed(1)} → ${hw} mm (+${delta} mm, ranura más profunda)`,
                    priority: delta,
                });
            }
        }

        // ── Candidatos combinados b1↓ + hw↑ (mejora Bt + Ku simultáneamente) ──
        if (needBt && needKu) {
            const b1_curr = d0.b1 || 3;
            const b1_try  = parseFloat(Math.max(0.5, bw_max).toFixed(1));
            for (let hw = Math.ceil(hw_for_ku); hw <= Math.min((d0.hw||18) + 10, h_slot_max); hw++) {
                const dB1 = b1_curr - b1_try;
                const dHw = hw - (d0.hw||18);
                if (dB1 <= 0 && dHw <= 0) continue;
                candidates.push({
                    dims:  _buildDims(d0, p0.slotType, { b1: b1_try, hw }),
                    label: `b1 ${b1_curr.toFixed(1)}→${b1_try} mm + hw ${d0.hw||18}→${hw} mm (amplía diente + profundidad)`,
                    priority: dB1 + dHw * 0.5,
                });
            }
        }

        // ── Candidatos solo corona (By): reducir hw para dar más espesor ──────
        if (needBy && !needKu) {
            const hw_max_for_by = Math.floor(h_slot_max);
            if (hw_max_for_by < (d0.hw || 18)) {
                for (let hw = hw_max_for_by; hw >= Math.max(8, hw_max_for_by - 4); hw--) {
                    const delta = (d0.hw||18) - hw;
                    candidates.push({
                        dims:  _buildDims(d0, p0.slotType, { hw }),
                        label: `Reducir hw: ${d0.hw||18} → ${hw} mm (−${delta} mm, más corona)`,
                        priority: delta,
                    });
                }
            }
        }

        // Ordenar por menor impacto geométrico primero
        candidates.sort((a, b) => a.priority - b.priority);
        return candidates;
    }

    // ── Diagnóstico con correcciones aplicables desde el panel ───────────────
    function _showImpossibleDiagnosis(p0, violations, d0) {
        const { P } = _computePoles(p0.freq, p0.rpm);
        const Q   = p0.Q;
        const ID  = p0.D_bore_mm;
        const OD  = p0.D_ext_mm;
        const L   = p0.L_stack_mm;
        const Bav = p0.Bav;
        const bsat = p0.steel.bsat;
        const bw0  = d0.bw || d0.btop || 5.5;
        const hw0  = d0.hw || 18;
        const h1   = d0.h1 || 1;
        const h_tooth0 = hw0 + h1;
        const m = p0.motorType === 'three' ? 3 : 2;

        // ── Geometría actual ─────────────────────────────────────────
        const tau_slot_bore  = Math.PI * ID / Q;
        // Diente se mide al bore (b1 es el cuello, zona de máxima saturación)
        const b_tooth_curr   = Math.max(0.5, tau_slot_bore - (d0.b1 || 3));
        const A_tooth_curr   = b_tooth_curr * L * 1e-6 * 0.97;   // m²
        const Phi_tooth      = Bav * (tau_slot_bore / 1000) * (L / 1000);
        const Bt_curr        = Phi_tooth / A_tooth_curr;

        const h_yoke0        = (OD - ID) / 2 - h_tooth0;
        const Phi_polo       = Bav * (Math.PI * (ID / 1000) / P) * (L / 1000);
        const By_curr        = h_yoke0 > 0 ? Phi_polo / (2 * (h_yoke0 / 1000) * (L / 1000) * 0.97) : 999;

        // ── Correcciones calculadas ──────────────────────────────────────────────────────
        const Bt_target = bsat * 0.85;
        const By_target = bsat * 0.80;

        // 1) Bav máximo para la corona
        const Bav_for_By = h_yoke0 > 0
            ? By_target * 2 * (h_yoke0 / 1000) * 0.97 / (Math.PI * (ID / 1000) / P)
            : 0;

        // 2) Bav máximo para el diente con la geometría actual
        const Bav_for_Bt = Bt_target * A_tooth_curr / (tau_slot_bore / 1000 * (L / 1000));

        // 3) Q máximo que satisface Bt (múltiplo de P×m)
        // b_tooth al bore = τ_bore − b1 (se mantiene b1 fijo)
        const b1_curr = d0.b1 || 3;
        let Q_ok = null;
        for (let q = Q - 1; q >= 6; q--) {
            if (q % (P * m) !== 0) continue;
            const tau_b = Math.PI * ID / q;
            const b_t   = Math.max(0.5, tau_b - b1_curr);
            const A_t   = b_t * L * 1e-6 * 0.97;
            const phi_t = Bav * (tau_b / 1000) * (L / 1000);
            if (phi_t / A_t <= Bt_target) { Q_ok = q; break; }
        }

        // 4) ID mínimo para el Q actual (iterativo)
        let ID_ok = null;
        for (let id = ID + 5; id <= OD - 20; id += 5) {
            const tau_b = Math.PI * id / Q;
            const b_t   = Math.max(0.5, tau_b - b1_curr);
            const A_t   = b_t * L * 1e-6 * 0.97;
            const phi_t = Bav * (tau_b / 1000) * (L / 1000);
            if (phi_t / A_t <= Bt_target) { ID_ok = id; break; }
        }

        // 5) hw máximo que deja corona suficiente
        const h_yoke_min_m = Phi_polo / (2 * By_target * (L / 1000) * 0.97);
        const h_yoke_min   = h_yoke_min_m * 1000;
        const hw_max_for_corona = (OD - ID) / 2 - h_yoke_min - (d0.h1 || 1);

        // 6) Estimación de potencia máxima para Ku=0.50
        const { r: r_est } = _evalFitness(p0);
        const A_slot_net   = _slotBodyArea(p0.slotType, d0);
        const A_cond_max   = A_slot_net * 0.50;
        const d_esm_est = (r_est.wire.diameter + 0.05);
        const area_wire_esm_est = Math.PI / 4 * d_esm_est * d_esm_est;
        const area_wire_max = A_cond_max / (2 * r_est.N_c * (r_est.wire.n_parallel || 1)) * (r_est.wire.area / area_wire_esm_est);
        const I_max_admisible = area_wire_max * 6.0;
        const P_kW_max = p0.motorType === 'three'
            ? I_max_admisible * p0.V * Math.sqrt(3) * p0.eta * p0.cosfi / 1000
            : I_max_admisible * p0.V * p0.eta * p0.cosfi / 1000;
        const P_HP_max = P_kW_max / 0.7457;

        // ── Construir tarjetas de corrección ──────────────────────────────────────────────────────
        const cards = [];

        if (violations.includes('Bt_ok') || violations.includes('By_ok')) {
            const Bav_safe = Math.max(0.30, Math.min(Bav_for_Bt, Bav_for_By)).toFixed(3);
            const bav_note = parseFloat(Bav_safe) < 0.40
                ? '&#9888;&#65039; Bav muy bajo — el motor operaría con par reducido.'
                : '';
            cards.push({
                icon: '&#127917;', color: '#22d3ee', border: 'rgba(34,211,238,0.3)',
                bg: 'rgba(34,211,238,0.06)',
                title: 'Reducir Bav (flujo promedio)',
                impact: 'Ajuste inmediato sin modificar el hierro',
                desc: 'Reducir Bav disminuye la inducción en dientes y corona proporcionalmente.',
                value: 'Bav = ' + Bav_safe + ' T',
                note: bav_note,
                actionFn: 'motorApplyFix("bav",' + Bav_safe + ')',
                actionLabel: 'Aplicar Bav = ' + Bav_safe + ' T',
            });
        }

        if (violations.includes('Bt_ok') && Q_ok) {
            const q_ppf = (Q_ok / (P * m)).toFixed(1);
            cards.push({
                icon: '&#128290;', color: '#f59e0b', border: 'rgba(245,158,11,0.3)',
                bg: 'rgba(245,158,11,0.06)',
                title: 'Reducir número de ranuras Q',
                impact: 'Requiere núcleo físico con ese Q',
                desc: 'Menos ranuras amplian el paso de ranura, el diente se hace más ancho y Bt baja.',
                value: 'Q = ' + Q_ok + '  (q = ' + q_ppf + ' ranuras/polo/fase)',
                note: 'Verificar que el núcleo tenga exactamente ' + Q_ok + ' ranuras.',
                actionFn: 'motorApplyFix("Q",' + Q_ok + ')',
                actionLabel: 'Aplicar Q = ' + Q_ok,
            });
        }

        if (violations.includes('Bt_ok') && ID_ok && ID_ok < OD - 20) {
            cards.push({
                icon: '&#128207;', color: '#a78bfa', border: 'rgba(167,139,250,0.3)',
                bg: 'rgba(167,139,250,0.06)',
                title: 'Usar núcleo con mayor bore ID',
                impact: 'Solo informativo — requiere núcleo diferente',
                desc: 'Mayor ID amplía el paso de ranura al bore, el diente se hace más ancho. No aplicable directamente.',
                value: 'ID ≥ ' + ID_ok + ' mm  (actual: ' + ID + ' mm)',
                note: 'La corona disponible (OD−ID)/2 se reduce. Verificar By con el nuevo ID.',
                actionFn: null,
                actionLabel: null,
            });
        }

        if (violations.includes('By_ok') && hw_max_for_corona < hw0 && hw_max_for_corona >= 6) {
            const hw_safe = Math.floor(hw_max_for_corona);
            cards.push({
                icon: '&#128295;', color: '#f87171', border: 'rgba(248,113,113,0.3)',
                bg: 'rgba(248,113,113,0.06)',
                title: 'Reducir profundidad de ranura hw',
                impact: 'Aumenta corona — puede empeorar Ku',
                desc: 'Ranura más corta deja más material en la corona. Verificar Ku después del ajuste.',
                value: 'hw = ' + hw_safe + ' mm  (actual: ' + hw0 + ' mm)',
                note: 'Reducir hw disminuye el área de ranura disponible para conductores.',
                actionFn: 'motorApplyFix("hw",' + hw_safe + ')',
                actionLabel: 'Aplicar hw = ' + hw_safe + ' mm',
            });
        }

        if (violations.includes('Ku_ok') && P_kW_max > 0.1 && P_kW_max < p0.powerKW * 0.98) {
            cards.push({
                icon: '&#9889;', color: '#34d399', border: 'rgba(52,211,153,0.3)',
                bg: 'rgba(52,211,153,0.06)',
                title: 'Reducir la potencia nominal',
                impact: 'Resuelve Ku/J sin modificar el hierro',
                desc: 'Menos potencia → menos corriente → AWG menor → conductores entran en la ranura. No afecta Bt ni By.',
                value: 'P_max = ' + P_HP_max.toFixed(2) + ' HP  (' + P_kW_max.toFixed(3) + ' kW)',
                note: 'El motor operaría correctamente a esta potencia con el estátor actual.',
                actionFn: 'motorApplyFix("power",' + P_kW_max.toFixed(4) + ')',
                actionLabel: 'Aplicar ' + P_HP_max.toFixed(2) + ' HP',
            });
        }

        // ── Render del panel de diagnóstico ─────────────────────────────────────────────────────
        const _cardHTML = cards.map(function(c) {
            const btn = c.actionFn
                ? '<div style="display:flex;gap:6px;margin-top:8px;">'
                    + '<button onclick="' + c.actionFn + '"'
                    + ' style="padding:5px 14px;font-size:11px;font-weight:700;'
                    + 'background:' + c.bg + ';border:1px solid ' + c.border + ';'
                    + 'color:' + c.color + ';border-radius:6px;cursor:pointer;">'
                    + '&#10003; ' + c.actionLabel
                    + '</button></div>'
                : '<div style="font-size:10px;color:#475569;font-style:italic;margin-top:6px;">Solo informativo.</div>';
            const noteHTML = c.note
                ? '<div style="font-size:10px;color:#78716c;margin-top:4px;">' + c.note + '</div>'
                : '';
            return '<div style="background:' + c.bg + ';border:1px solid ' + c.border + ';'
                + 'border-radius:9px;padding:12px 14px;margin-bottom:10px;">'
                + '<div style="display:flex;align-items:baseline;gap:8px;margin-bottom:6px;">'
                    + '<span style="font-size:16px;">' + c.icon + '</span>'
                    + '<span style="font-weight:700;color:' + c.color + ';font-size:12px;">' + c.title + '</span>'
                    + '<span style="font-size:10px;color:#475569;margin-left:auto;">' + c.impact + '</span>'
                + '</div>'
                + '<div style="font-size:11px;color:#94a3b8;margin-bottom:6px;">' + c.desc + '</div>'
                + '<div style="font-size:13px;font-weight:700;color:' + c.color + ';margin-bottom:4px;">'
                    + '&#8594; ' + c.value
                + '</div>'
                + noteHTML
                + btn
                + '</div>';
        }).join('');

        const wrap = document.getElementById('motorOptimResult');
        if (!wrap) return;
        wrap.innerHTML =
            '<div style="background:rgba(239,68,68,0.04);border:1px solid rgba(239,68,68,0.30);'
            + 'border-radius:10px;padding:14px 16px;margin-bottom:16px;">'
            + '<div style="font-weight:700;color:#f87171;font-size:13px;margin-bottom:4px;">'
                + '&#10060; Sin solución eléctrica para la geometría actual'
            + '</div>'
            + '<div style="font-size:11px;color:#64748b;margin-bottom:14px;">'
                + 'Bt=' + Bt_curr.toFixed(2) + ' T &middot; By=' + By_curr.toFixed(2) + ' T &middot; Bsat=' + bsat + ' T &mdash; '
                + 'Las siguientes correcciones están ordenadas por invasividad.'
            + '</div>'
            + _cardHTML
            + '</div>';
        wrap.style.display = 'block';
        if (typeof showToast === 'function')
            showToast('Geometría insuficiente — ver correcciones sugeridas.', 'error');
    }

    // ── Aplicar una corrección sugerida desde el panel de diagnóstico ─────────────────────
    window.motorApplyFix = function (field, value) {
        switch (field) {
            case 'bav':
                _v('motorBav', parseFloat(value).toFixed(3));
                break;
            case 'Q':
                _v('motorSlots', parseInt(value));
                break;
            case 'hw': {
                const st = _sv('motorSlotType') || 'rect';
                if (st === 'rect')  _v('slotHw',  parseFloat(value).toFixed(1));
                if (st === 'trap')  _v('trapHw',  parseFloat(value).toFixed(1));
                if (st === 'semi')  _v('semiHw',  parseFloat(value).toFixed(1));
                if (typeof motorUpdateSlotDiagram === 'function') motorUpdateSlotDiagram();
                break;
            }
            case 'power': {
                const kw = parseFloat(value);
                _v('motorPowerKW', kw.toFixed(3));
                _v('motorPowerHP', (kw / 0.7457).toFixed(2));
                break;
            }
        }
        const wrap = document.getElementById('motorOptimResult');
        if (wrap) { wrap.innerHTML = ''; wrap.style.display = 'none'; }
        if (typeof calculateMotor === 'function') calculateMotor();
        if (typeof showToast === 'function')
            showToast('Corrección aplicada — resultado actualizado.', 'success');
    };

    // Construye dims para el slotType dado, sobreescribiendo solo los campos indicados
    function _buildDims(d0, slotType, overrides) {
        if (slotType === 'rect') {
            return { b1: d0.b1||3, h1: d0.h1||1, bw: d0.bw||5.5, hw: d0.hw||18, ...overrides };
        }
        if (slotType === 'trap') {
            const base = { b1: d0.b1||3, h1: d0.h1||1, btop: d0.btop||4, bbot: d0.bbot||7, hw: d0.hw||18 };
            const merged = { ...base, ...overrides };
            if (overrides.bw) { merged.btop = overrides.bw * 0.7; merged.bbot = overrides.bw * 1.3; }
            merged.bw = (merged.btop + merged.bbot) / 2;
            return merged;
        }
        // semi
        return { b1: d0.b1||3, h1: d0.h1||1, hw: d0.hw||16, r: d0.r||3.5, bw: d0.bw||5, ...overrides };
    }

    // Función de comparación para desempate (menor Ku, menor violaciones, menor J)
    function _scoreIsBetter(r, rBest, p, bsat) {
        if (!rBest) return true;
        const v1  = r.Ku + r.B_tooth/bsat * 0.5 + r.B_yoke/bsat * 0.3 + r.J_real/(p.steel.bsat*3) * 0.2;
        const v2  = rBest.Ku + rBest.B_tooth/bsat * 0.5 + rBest.B_yoke/bsat * 0.3;
        return v1 < v2;
    }

    function _applyOptimized(p, r, score, p0, geomInfo) {
        const d  = p.slotDims;
        const d0 = p0 ? p0.slotDims : d;

        // ── Actualizar campos eléctricos ──────────────────────────────────────
        _v('motorBav',        p.Bav.toFixed(3));
        _v('motorInsClass',   p.insClass);
        _v('motorPitchType',  p.pitchType);
        _v('motorPitchRatio', p.pitchRatio.toFixed(3));
        motorSetInsClass(p.insClass);
        motorSetPitch(p.pitchType);

        // ── Si la potencia fue reducida, actualizar los campos HP/kW ─────────
        if (geomInfo && geomInfo.powerReduced && geomInfo.powerKW_new != null) {
            const kw = geomInfo.powerKW_new;
            _v('motorPowerKW', kw.toFixed(3));
            _v('motorPowerHP', (kw / 0.7457).toFixed(2));
        }

        // ── Actualizar campos geométricos si cambiaron ────────────────────────
        const geomChanged = geomInfo && geomInfo.geomChanged;
        if (geomChanged) {
            const st = p.slotType;
            if (st === 'rect') {
                _v('slotBw', d.bw.toFixed(1));
                _v('slotHw', d.hw.toFixed(1));
                _v('slotB1', d.b1.toFixed(1));
                _v('slotH1', d.h1.toFixed(1));
            } else if (st === 'trap') {
                _v('trapBtop', d.btop.toFixed(1));
                _v('trapBbot', d.bbot.toFixed(1));
                _v('trapHw',   d.hw.toFixed(1));
            } else {
                _v('semiHw', d.hw.toFixed(1));
                if (d.bw) _v('semiBw', d.bw.toFixed(1));
            }
            motorUpdateSlotDiagram();
        }

        // ── Mostrar resultados ────────────────────────────────────────────────
        _lastResults = r;
        _displayResults(r);
        _drawStator(r);
        _drawSlotLinear(r);
        _drawConnDiagram(r);
        const badge = document.getElementById('bav_calc_badge');
        if (badge) badge.style.display = 'inline-block';

        // ── Resumen de cambios ────────────────────────────────────────────────
        const cambiosElec  = [];
        const cambiosGeom  = [];

        if (p0 && Math.abs(p.Bav - p0.Bav) > 0.005)
            cambiosElec.push(`Bav: ${p0.Bav.toFixed(3)} → ${p.Bav.toFixed(3)} T`);
        if (p0 && p.insClass !== p0.insClass)
            cambiosElec.push(`Clase aislamiento: ${p0.insClass} → ${p.insClass}`);
        if (p0 && (p.pitchType !== p0.pitchType || Math.abs(p.pitchRatio - p0.pitchRatio) > 0.01))
            cambiosElec.push(p.pitchType === 'short'
                ? `Paso corto β=${p.pitchRatio.toFixed(3)}`
                : 'Paso pleno');

        if (geomChanged && d0) {
            if (Math.abs((d.bw||0) - (d0.bw||0)) > 0.05)
                cambiosGeom.push(`bw: ${(d0.bw||5.5).toFixed(1)} → ${(d.bw).toFixed(1)} mm`);
            if (Math.abs((d.hw||0) - (d0.hw||0)) > 0.05)
                cambiosGeom.push(`hw: ${(d0.hw||18).toFixed(1)} → ${(d.hw).toFixed(1)} mm`);
            if (d.btop && d0.btop && Math.abs(d.btop - d0.btop) > 0.05)
                cambiosGeom.push(`btop: ${d0.btop.toFixed(1)} → ${d.btop.toFixed(1)} mm`);
        }

        // ── Bloque de reducción de potencia ──────────────────────────────────
        let powerInfo = null;
        if (geomInfo && geomInfo.powerReduced && geomInfo.powerKW_new != null) {
            const kw_new = geomInfo.powerKW_new;
            const kw_orig = geomInfo.powerKW_orig;
            const hp_new  = kw_new / 0.7457;
            const hp_orig = kw_orig / 0.7457;
            powerInfo = {
                kw_orig, kw_new, hp_orig, hp_new,
                pct: ((1 - kw_new / kw_orig) * 100).toFixed(0),
            };
            cambiosElec.push(`Potencia: ${hp_orig.toFixed(2)} → ${hp_new.toFixed(2)} HP (${kw_new.toFixed(3)} kW)`);
        }

        if (cambiosElec.length === 0 && cambiosGeom.length === 0)
            cambiosElec.push('Sin cambios posibles — geometría del estátor es la causa raíz');

        const vNames = { Ku_ok: 'Llenado Ku', Bt_ok: 'Bt diente', By_ok: 'Bc corona', J_ok: 'Densidad J', FEM_ok: 'FEM' };
        if (score.all_ok) {
            _showOptimResult('success', '✅ Diseño corregido automáticamente',
                cambiosElec, cambiosGeom, r, geomInfo && geomInfo.geomLabel, [], powerInfo);
            if (typeof showToast === 'function') showToast('Diseño optimizado sin advertencias.', 'success');
        } else {
            const restantes = score.violations.map(v => vNames[v] || v);
            _showOptimResult('warning',
                `⚠️ Mejor configuración encontrada`,
                cambiosElec, cambiosGeom, r, geomInfo && geomInfo.geomLabel, restantes, powerInfo);
            if (typeof showToast === 'function')
                showToast(`Mejorado. Aún fuera de rango: ${restantes.join(', ')}`, 'warning');
        }
    }

    function _showOptimResult(type, title, cambiosElec, cambiosGeom, r, geomLabel, restantes, powerInfo) {
        const colors = { success: '#10b981', warning: '#f59e0b', error: '#ef4444' };
        const bg     = { success: 'rgba(16,185,129,0.06)', warning: 'rgba(245,158,11,0.06)', error: 'rgba(239,68,68,0.06)' };
        const border = { success: 'rgba(16,185,129,0.30)', warning: 'rgba(245,158,11,0.30)', error: 'rgba(239,68,68,0.30)' };
        const wrap = document.getElementById('motorOptimResult');
        if (!wrap) return;

        const kpiColor = (ok, val, fmt) =>
            '<span style="color:' + (ok ? '#10b981' : '#f87171') + ';font-weight:700;">' + fmt(val) + '</span>';

        const hp = n => n.toFixed(2) + ' HP';
        const kw = n => n.toFixed(3) + ' kW';

        const powerBlock = powerInfo ? (
            '<div style="margin-top:10px;padding:10px 12px;background:rgba(139,92,246,0.08);' +
            'border:1px solid rgba(139,92,246,0.28);border-radius:8px;">' +
            '<div style="font-size:11px;font-weight:700;color:#a78bfa;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px;">' +
            '⚡ Potencia máxima admisible para este estátor</div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;font-size:12px;">' +
            '<div style="text-align:center;"><div style="color:#64748b;font-size:10px;margin-bottom:2px;">Potencia original</div>' +
            '<div style="color:#94a3b8;font-weight:700;">' + hp(powerInfo.hp_orig) + '</div>' +
            '<div style="color:#64748b;font-size:10px;">' + kw(powerInfo.kw_orig) + '</div></div>' +
            '<div style="text-align:center;"><div style="color:#64748b;font-size:10px;margin-bottom:2px;">Potencia máxima</div>' +
            '<div style="color:#a78bfa;font-weight:700;font-size:14px;">' + hp(powerInfo.hp_new) + '</div>' +
            '<div style="color:#7c3aed;font-size:10px;">' + kw(powerInfo.kw_new) + '</div></div>' +
            '<div style="text-align:center;"><div style="color:#64748b;font-size:10px;margin-bottom:2px;">Reducción</div>' +
            '<div style="color:#f87171;font-weight:700;">−' + powerInfo.pct + '%</div>' +
            '<div style="color:#64748b;font-size:10px;">del rating original</div></div></div>' +
            '<div style="font-size:10px;color:#6d28d9;margin-top:8px;line-height:1.5;">' +
            'Potencia máxima que este estátor puede manejar sin superar Ku 52%. ' +
            'Para recuperar la potencia original se requiere ampliar la ranura o usar un núcleo de mayor diámetro.' +
            '</div></div>'
        ) : '';

        const geomBlock = cambiosGeom.length > 0 ? (
            '<div style="margin-top:10px;padding:10px 12px;background:rgba(245,158,11,0.08);' +
            'border:1px solid rgba(245,158,11,0.25);border-radius:8px;">' +
            '<div style="font-size:11px;font-weight:700;color:#f59e0b;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px;">' +
            '🔩 Modificación geométrica requerida</div>' +
            (geomLabel ? '<div style="font-size:11px;color:#fcd34d;margin-bottom:6px;">' + geomLabel + '</div>' : '') +
            '<div style="display:flex;flex-wrap:wrap;gap:6px;">' +
            cambiosGeom.map(c =>
                '<div style="background:rgba(245,158,11,0.12);border:1px solid rgba(245,158,11,0.2);' +
                'border-radius:6px;padding:4px 10px;font-size:11px;color:#fcd34d;">' + c + '</div>'
            ).join('') +
            '</div><div style="font-size:10px;color:#78716c;margin-top:6px;">' +
            '⚠️ Implica fresado o mecanizado de ranuras. Verificar con técnico antes de proceder.' +
            '</div></div>'
        ) : '';

        const elecBlock = cambiosElec.length > 0 ? (
            '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;">' +
            cambiosElec.map(c =>
                '<div style="background:rgba(8,145,178,0.10);border:1px solid rgba(8,145,178,0.2);' +
                'border-radius:6px;padding:4px 10px;font-size:11px;color:#67e8f9;">' + c + '</div>'
            ).join('') +
            '</div>'
        ) : '';

        const restBlock = restantes && restantes.length > 0 ? (
            '<div style="margin-top:8px;font-size:11px;color:#94a3b8;">' +
            '<span style="color:#f87171;font-weight:600;">Restricciones aún activas:</span>' +
            restantes.map(v =>
                '<span style="margin-left:6px;background:rgba(239,68,68,0.1);border-radius:4px;padding:2px 7px;color:#fca5a5;">' + v + '</span>'
            ).join('') +
            '</div>'
        ) : '';

        wrap.innerHTML =
            '<div style="background:' + bg[type] + ';border:1px solid ' + border[type] + ';border-radius:10px;padding:14px 16px;margin-bottom:16px;">' +
            '<div style="font-weight:700;color:' + colors[type] + ';font-size:13px;margin-bottom:12px;">' + title + '</div>' +
            elecBlock + powerBlock + geomBlock +
            '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:12px;font-size:11px;">' +
            '<div style="background:rgba(0,0,0,0.2);border-radius:6px;padding:6px 8px;text-align:center;"><div style="color:#64748b;margin-bottom:3px;font-size:10px;">Factor Ku</div>' +
            kpiColor(r.Ku<=0.52, r.Ku, v=>(v*100).toFixed(1)+'%') + '</div>' +
            '<div style="background:rgba(0,0,0,0.2);border-radius:6px;padding:6px 8px;text-align:center;"><div style="color:#64748b;margin-bottom:3px;font-size:10px;">Bt diente</div>' +
            kpiColor(r.B_tooth<=r.steel.bsat*0.90, r.B_tooth, v=>v.toFixed(2)+' T') + '</div>' +
            '<div style="background:rgba(0,0,0,0.2);border-radius:6px;padding:6px 8px;text-align:center;"><div style="color:#64748b;margin-bottom:3px;font-size:10px;">Bc corona</div>' +
            kpiColor(r.B_yoke<=r.steel.bsat*0.82, r.B_yoke, v=>v.toFixed(2)+' T') + '</div>' +
            '<div style="background:rgba(0,0,0,0.2);border-radius:6px;padding:6px 8px;text-align:center;"><div style="color:#64748b;margin-bottom:3px;font-size:10px;">J / J_max</div>' +
            kpiColor(r.J_real<=r.J_max, r.J_real/r.J_max, v=>(v*100).toFixed(0)+'%') + '</div>' +
            '</div>' + restBlock + '</div>';
        wrap.style.display = 'block';
    }

    // =========================================================================
    // ── CÁLCULO PRINCIPAL ─────────────────────────────────────────────────────
    // =========================================================================

    window.calculateMotor = function () {
        const p   = _readInputs();
        const val = _validate(p);
        _showValidation(val.errors, val.warnings);
        if (!val.ok) return;

        let results;
        try {
            results = p.motorType === 'three' ? _calcThreePhase(p) : _calcSinglePhase(p);
        } catch (err) {
            console.error('Error en cálculo de motor:', err);
            document.getElementById('motorResults').innerHTML =
                `<div class="result-item error"><div class="result-label">❌ Error de cálculo</div><div class="result-value">${err.message}</div></div>`;
            return;
        }

        _lastResults = results;
        _displayResults(results);
        _drawStator(results);
        _drawSlotLinear(results);
        _drawConnDiagram(results);
        // Ocultar resultado de optimización anterior al recalcular manualmente
        const optEl = document.getElementById('motorOptimResult');
        if (optEl) { optEl.innerHTML = ''; optEl.style.display = 'none'; }
    };

    // =========================================================================
    // ── VISUALIZACIÓN DE RESULTADOS ───────────────────────────────────────────
    // =========================================================================

    function _hdr(text) {
        return `<div style="grid-column:1/-1;background:linear-gradient(135deg,#0891b2,#0e7490);
            color:#fff;padding:10px 14px;border-radius:8px;font-weight:700;
            font-size:12px;text-transform:uppercase;letter-spacing:1px;
            text-align:center;margin-top:12px">${text}</div>`;
    }
    function _itm(label, value, unit, type) {
        return createResultItem(label, value, unit, type || '');
    }

    function _displayResults(r) {
        const container = document.getElementById('motorResults');
        let html = '<div class="result-grid">';

        // ── 1. GEOMETRÍA DEL ESTÁTOR ──────────────────────────────────────────
        html += _hdr('Geometría del estátor');
        html += _itm('Diámetro exterior OD', r.D_ext_mm, 'mm');
        html += _itm('Diámetro interior ID (bore)', r.D_mm, 'mm');
        html += _itm('Longitud del paquete L', r.L_mm, 'mm');
        html += _itm('Paso polar τm (al bore)', r.tau_m_mm.toFixed(2), 'mm');
        const corona_mm = (r.D_ext_mm - r.D_mm) / 2;
        html += _itm('Altura de la corona (h_yoke)', r.h_yoke !== undefined ? r.h_yoke.toFixed(2) : (corona_mm - (r.slotDims.hw||18) - (r.slotDims.h1||1)).toFixed(2), 'mm',
            r.h_yoke < 8 ? 'warning' : 'success');
        html += _itm('Área ranura (geométrica)', r.A_slot.toFixed(2), 'mm²');
        html += _itm('Área ranura neta (sin aislante)', r.A_slot_net.toFixed(2), 'mm²');
        html += _itm('Volumen acero del núcleo', (r.cv.Vol_steel * 1e6).toFixed(1), 'cm³');
        html += _itm('Masa acero del núcleo', r.cv.mass_steel_kg.toFixed(3), 'kg');

        // ── 2. POLOS Y FACTORES DE BOBINADO ──────────────────────────────────
        html += _hdr('Polos y factor de bobinado');
        html += _itm('Número de polos P', r.P, '');
        html += _itm('Velocidad sincrónica', r.n_sync.toFixed(0), 'RPM');
        html += _itm('Deslizamiento (slip)', (r.slip * 100).toFixed(2), '%',
            r.slip > 0.08 ? 'warning' : 'success');
        html += _itm('Ranuras / polo / fase (q)', r.q.toFixed(Number.isInteger(r.q) ? 0 : 3), '');
        html += _itm('Paso polar (τp en ranuras)', r.tau_p.toFixed(1), 'ranuras');
        html += _itm('Paso de bobina (y)', r.y, 'ranuras');
        html += _itm('Tipo de paso', r.y === Math.round(r.tau_p)
            ? 'Pleno (full-pitch)' : `Corto (β = ${(r.y / r.tau_p).toFixed(3)})`, '');
        html += `<div class="kw-breakdown" style="grid-column:1/-1;">
            <div><div class="kw-value">${r.Kd.toFixed(4)}</div><div class="kw-label">Kd — Distribución</div></div>
            <div><div class="kw-value">${r.Kp.toFixed(4)}</div><div class="kw-label">Kp — Paso corto</div></div>
            <div><div class="kw-value" style="color:#22d3ee">${r.Kw.toFixed(4)}</div><div class="kw-label">Kw = Kd × Kp</div></div>
        </div>
        <div style="grid-column:1/-1;font-size:11px;color:#64748b;padding:2px 0 6px;">
            Kd calculado para q=${r.q_int} ranuras/polo/fase · α=${(180*r.P/r.Q).toFixed(1)}° · Kp para y/τp=${r.y}/${r.tau_p.toFixed(1)}
        </div>`;
        html += _itm('Flujo por polo (Φ)', (r.Phi * 1000).toFixed(4), 'mWb');
        html += _itm('FEM calculada (verificación)', r.E_verify.toFixed(2), 'V',
            Math.abs(r.E_verify / r.V_phase - 1) > 0.07 ? 'warning' : 'success');
        html += _itm('Tensión de fase', r.V_phase.toFixed(2), 'V');

        // ── 3. DENSIDADES DE FLUJO EN EL NÚCLEO ──────────────────────────────
        html += _hdr('Densidades de flujo en el núcleo');
        html += _itm('Bav — inducción media (aire)', r.Bav.toFixed(3), 'T');
        const btClass = r.B_tooth > r.steel.bsat * 0.95 ? 'error'
                      : r.B_tooth > r.steel.bsat * 0.80 ? 'warning' : 'success';
        html += _itm('Bt — inducción en el diente', r.B_tooth.toFixed(3), 'T', btClass);
        html += _itm('Ancho del diente (b_tooth)', r.b_tooth.toFixed(2), 'mm');
        const byClass = r.B_yoke > r.steel.bsat * 0.85 ? 'warning' : 'success';
        html += _itm('Bc — inducción en la corona', r.B_yoke.toFixed(3), 'T', byClass);
        html += _itm('Bsat del material (' + r.steel.name + ')', r.steel.bsat.toFixed(2), 'T');

        // ── 4. DEVANADO PRINCIPAL / TRIFÁSICO ────────────────────────────────
        const mainLabel = r.motorType === 'three' ? 'Devanado trifásico' : 'Devanado principal';
        html += _hdr(mainLabel);
        html += _itm('Vueltas por fase (N_ph)', r.N_ph, '');
        html += _itm('Vueltas por bobina (N_c)', r.N_c, '');
        html += _itm('Bobinas por fase', r.groups_per_phase || (r.P * (r.q_int||1)), `bobinas en serie (Q/3 = ${r.Q}/3, k₁=1 rama, doble capa)`);
        if (r.motorType === 'three') {
            html += _itm('Corriente de línea', r.I_line.toFixed(3), 'A');
            html += _itm('Corriente de fase', r.I_phase.toFixed(3), 'A');
            html += _itm('Conexión', r.connection === 'star' ? 'Estrella (Y)' : 'Triángulo (Δ)', '');
        } else {
            html += _itm('Corriente principal', r.I_phase.toFixed(3), 'A');
        }
        const jClass = r.J_real > r.J_max ? 'error' : r.J_real > r.J_max * 0.92 ? 'warning' : 'success';
        // AWG con hilos en paralelo
        const n_par = r.wire.n_parallel || 1;
        const awgLabel = n_par > 1
            ? `AWG ${r.wire.awg} × ${n_par} hilos en paralelo`
            : `AWG ${r.wire.awg}`;
        const areaLabel = n_par > 1
            ? `${(r.wire.area / n_par).toFixed(3)} mm² c/u → ${r.wire.area.toFixed(3)} mm² total`
            : r.wire.area.toFixed(3);
        html += _itm('Calibre seleccionado', awgLabel, '', n_par > 1 ? 'warning' : '');
        html += _itm('Diámetro del conductor', r.wire.diameter.toFixed(3), 'mm');
        html += _itm('Sección conductora total', areaLabel, 'mm²');
        html += _itm('Densidad de corriente J', r.J_real.toFixed(2), 'A/mm²', jClass);
        html += _itm('J máxima clase ' + r.insClass, r.J_max, 'A/mm²');
        html += _itm('MTL — longitud media de vuelta', (r.MTL * 100).toFixed(1), 'cm');
        html += _itm('Longitud total cable / fase', r.l_total.toFixed(2), 'm');
        html += _itm('Resistencia DC / fase (20°C)', r.R_phase.toFixed(4), 'Ω');
        html += _itm('Pérdidas Cu (total)', r.Pcu_total.toFixed(2), 'W',
            r.Pcu_total > r.powerKW * 1000 * 0.06 ? 'warning' : 'success');
        html += _itm('Peso cobre / fase', r.m_Cu_phase.toFixed(1), 'g');
        html += _itm('Peso cobre total', r.m_Cu_total.toFixed(1), 'g');

        // ── 5. FACTOR DE LLENADO DE RANURA ────────────────────────────────────
        html += _hdr('Factor de llenado de ranura');
        const slotTypeNames = { rect: 'Rectangular', trap: 'Trapezoidal', semi: 'Semicircular' };
        html += _itm('Tipo de ranura', slotTypeNames[r.slotType] || r.slotType, '');
        html += _itm('Área bruta de ranura', r.A_slot.toFixed(2), 'mm²');
        html += _itm('Área neta (sin aislante)', r.A_slot_net.toFixed(2), 'mm²');
        html += _itm('Área conductores (2 capas)', r.A_cond ? r.A_cond.toFixed(2) : (2*r.N_c*(Math.PI/4*Math.pow(r.wire.diameter+0.05,2))*(r.wire.n_parallel||1)).toFixed(2), 'mm²');
        const kuClass = r.Ku > 0.55 ? 'error' : r.Ku > 0.45 ? 'warning' : 'success';
        html += _itm('Factor de llenado Ku', (r.Ku * 100).toFixed(1), '%', kuClass);
        if (r.motorType === 'single' && r.aux) {
            const kuaClass = r.aux.Ku > 0.55 ? 'error' : r.aux.Ku > 0.45 ? 'warning' : 'success';
            html += _itm('Ku auxiliar', (r.aux.Ku * 100).toFixed(1), '%', kuaClass);
        }
        // Cuadro comparativo estrella vs delta cuando Ku > 55%
        if (r.deltaScenario) {
            const ds = r.deltaScenario;
            const connNameCurr = r.connection === 'star' ? 'Estrella (Y)' : 'Triángulo (Δ)';
            const connNameAlt  = ds.connection === 'star' ? 'Estrella (Y)' : 'Triángulo (Δ)';
            const npAlt = ds.wire.n_parallel > 1 ? ` ×${ds.wire.n_parallel} hilos` : '';
            const kuAltClass = ds.Ku > 0.55 ? 'error' : ds.Ku > 0.45 ? 'warning' : 'success';
            html += `<div style="margin:8px 0 4px;padding:10px 14px;border-left:4px solid #f59e0b;background:#fffbeb;border-radius:4px;">
                <div style="font-weight:600;color:#92400e;margin-bottom:6px;">Comparación de conexiones (mismas vueltas N_c=${r.N_c})</div>
                <table style="width:100%;font-size:0.88em;border-collapse:collapse;">
                    <tr style="border-bottom:1px solid #fde68a;">
                        <th style="text-align:left;padding:3px 8px;color:#78350f;">Conexión</th>
                        <th style="text-align:right;padding:3px 8px;color:#78350f;">I_fase</th>
                        <th style="text-align:right;padding:3px 8px;color:#78350f;">Conductor</th>
                        <th style="text-align:right;padding:3px 8px;color:#78350f;">Ku</th>
                    </tr>
                    <tr style="background:#fef3c7;">
                        <td style="padding:3px 8px;font-weight:600;">${connNameCurr} ← actual</td>
                        <td style="text-align:right;padding:3px 8px;">${r.I_phase.toFixed(2)} A</td>
                        <td style="text-align:right;padding:3px 8px;">AWG ${r.wire.awg}${r.wire.n_parallel > 1 ? ' ×' + r.wire.n_parallel : ''}</td>
                        <td style="text-align:right;padding:3px 8px;font-weight:700;color:${r.Ku>0.55?'#dc2626':r.Ku>0.45?'#d97706':'#16a34a'};">${(r.Ku*100).toFixed(0)}%</td>
                    </tr>
                    <tr>
                        <td style="padding:3px 8px;">${connNameAlt}</td>
                        <td style="text-align:right;padding:3px 8px;">${ds.I_phase.toFixed(2)} A</td>
                        <td style="text-align:right;padding:3px 8px;">AWG ${ds.wire.awg}${npAlt}</td>
                        <td style="text-align:right;padding:3px 8px;font-weight:700;color:${ds.Ku>0.55?'#dc2626':ds.Ku>0.45?'#d97706':'#16a34a'};">${(ds.Ku*100).toFixed(0)}%</td>
                    </tr>
                </table>
                ${ds.Ku <= 0.55
                    ? `<div style="margin-top:6px;color:#065f46;font-weight:600;">✓ Use conexión ${connNameAlt} para Ku aceptable.</div>`
                    : (() => {
                        let extra = '';
                        if (ds.feasCurr) {
                            const np = ds.feasCurr.wire.n_parallel > 1 ? ` ×${ds.feasCurr.wire.n_parallel}` : '';
                            extra += `<br>${connNameCurr}: N_c máx = <b>${ds.feasCurr.N_c}</b> vueltas → AWG ${ds.feasCurr.wire.awg}${np}, Ku≤55%. `;
                        }
                        if (ds.feasAlt) {
                            const np = ds.feasAlt.wire.n_parallel > 1 ? ` ×${ds.feasAlt.wire.n_parallel}` : '';
                            extra += `<br>${connNameAlt}: N_c máx = <b>${ds.feasAlt.N_c}</b> vueltas → AWG ${ds.feasAlt.wire.awg}${np}, Ku≤55%. `;
                        }
                        return `<div style="margin-top:6px;color:#92400e;">Ninguna conexión logra Ku ≤ 55% con N_c=${r.N_c} vueltas.${extra}${extra ? '<br>Para reducir N_c aumente Bav.' : ' Verifique el área de ranura o los datos del motor original.'}</div>`;
                    })()}
            </div>`;
        }

        // ── 6. PÉRDIDAS EN EL NÚCLEO ──────────────────────────────────────────
        html += _hdr('Pérdidas en el núcleo (Pfe)');
        html += _itm('Material del núcleo', r.steel.name, '');
        html += _itm('Pérdidas específicas en diente', r.Pfe_tooth_wkg.toFixed(3), 'W/kg');
        html += _itm('Pérdidas específicas en corona', r.Pfe_yoke_wkg.toFixed(3), 'W/kg');
        html += _itm('Pérdidas totales en núcleo', r.Pfe.toFixed(2), 'W',
            r.Pfe > r.powerKW * 1000 * 0.04 ? 'warning' : 'success');
        html += _itm('Eficiencia estimada (η_calc)', (r.eta_calc * 100).toFixed(2), '%',
            r.eta_calc < 0.80 ? 'warning' : 'success');
        html += _itm('Balance de pérdidas Pcu/Pfe', r.Pcu_total.toFixed(1) + ' W / ' + r.Pfe.toFixed(1) + ' W', '');

        // ── 7. DEVANADO AUXILIAR (monofásico) ────────────────────────────────
        if (r.motorType === 'single' && r.aux) {
            const a = r.aux;
            html += _hdr('Devanado auxiliar');
            html += _itm('Ranuras auxiliares', a.Q_aux, '');
            html += _itm('q auxiliar', a.q_aux, '');
            html += _itm('Kw auxiliar', a.Kw.toFixed(4), '');
            html += _itm('Vueltas / bobina auxiliar', a.N_c, '');
            html += _itm('Vueltas totales auxiliar', a.N_ph, '');
            html += _itm('Corriente auxiliar', a.I.toFixed(3), 'A');
            html += _itm('Calibre auxiliar', `AWG ${a.wire.awg}`, '');
            html += _itm('Sección conductor auxiliar', a.wire.area.toFixed(3), 'mm²');
            const jaClass = a.J_real > a.J_max ? 'error' : 'success';
            html += _itm('Densidad J auxiliar', a.J_real.toFixed(2), 'A/mm²', jaClass);
            html += _itm('Longitud cable auxiliar', a.l_total.toFixed(2), 'm');
            html += _itm('Resistencia auxiliar', a.R.toFixed(4), 'Ω');
            html += _itm('Pérdidas Cu auxiliar', a.Pcu.toFixed(2), 'W');
            html += _itm('Peso cobre auxiliar', a.cu.toFixed(1), 'g');
            if (a.C_uF !== null) {
                html += _itm('Capacitor estimado', a.C_uF.toFixed(1), 'µF',
                    r.startMethod === 'cap_start' ? 'warning' : 'success');
                html += `<div style="grid-column:1/-1;font-size:11px;color:#94a3b8;padding:4px 0 8px;">
                    ⚠️ Valor del capacitor es estimativo. Verificar con amperímetro en vacío.
                </div>`;
            }
        }

        // ── 8. DATOS DE TALLER PARA REBOBINADO ───────────────────────────────
        if (r.motorType === 'three' && r.winding_step) {
            html += _hdr('Datos de taller para rebobinado');
            html += _itm('Paso de bobina (notación)', r.winding_step, '');
            const ps = r.phase_starts;
            html += _itm('Inicio Fase U (L1)', 'Ranura ' + ps.U, '');
            html += _itm('Inicio Fase V (L2)', 'Ranura ' + ps.V, '');
            html += _itm('Inicio Fase W (L3)', 'Ranura ' + ps.W, '');
            html += _itm('Conexión de grupos', r.groups_connection === 'paralelo'
                ? 'Paralelo (F-F / I-I) — corriente alta'
                : 'Serie (F-I / F-I) — configuración estándar', '',
                r.groups_connection === 'paralelo' ? 'warning' : 'success');
            html += _itm('Bobinas por fase', r.groups_per_phase, `bobinas en serie (Q/3 = ${r.Q}/3, k₁=1 rama, doble capa)`);
            const n_par_t = r.wire.n_parallel || 1;
            if (n_par_t > 1) {
                html += `<div style="grid-column:1/-1;background:rgba(245,158,11,0.08);
                    border:1px solid rgba(245,158,11,0.3);border-radius:7px;
                    padding:10px 12px;margin:4px 0;font-size:11px;color:#fcd34d;line-height:1.7;">
                    <strong>&#9888;&#65039; Bobinado en mano:</strong> Usar <strong>${n_par_t} hilos AWG ${r.wire.awg}</strong>
                    simultáneamente en la bobinadora. Tratar los ${n_par_t} hilos como si fueran uno solo
                    (misma cantidad de vueltas). Al terminar cada bobina, los hilos se conectan en paralelo
                    en la bornera, no en los finales de bobina.
                </div>`;
            }
        }

        // ── 9. COMPARACIÓN CON DEVANADO ORIGINAL ─────────────────────────────
        if (r.existAWG > 0 || r.existTurns > 0) {
            html += _hdr('Comparación con devanado original');
            if (r.existAWG > 0)   html += _itm('AWG original', r.existAWG, '', r.existAWG === r.wire.awg ? 'success' : 'warning');
            if (r.existTurns > 0) html += _itm('Vueltas/bobina original', r.existTurns, '', r.existTurns === r.N_c ? 'success' : 'warning');
            if (r.existAWG > 0 && r.existAWG !== r.wire.awg)
                html += `<div style="grid-column:1/-1;font-size:11px;color:#fcd34d;padding:4px 0;">
                    Original AWG ${r.existAWG} vs calculado AWG ${r.wire.awg}. Verifique si el motor original estaba subdimensionado o si los parámetros son distintos.</div>`;
        }

        html += '</div>'; // cierre result-grid

        // Tabla de distribución + instrucciones
        html += _buildSlotTable(r);
        html += _buildWindingSteps(r);

        // Secciones adicionales
        html += _buildThreePhaseConnDiagram(r);
        html += _buildCapacitorTable(r);
        html += _buildSinglePhaseWiring(r);

        // Advertencias post-cálculo
        if (r.postWarnings.length > 0) {
            html += r.postWarnings.map(w =>
                `<div class="result-item warning" style="margin-top:8px;">
                    <div class="result-label">⚠️ Atención</div>
                    <div class="result-value">${w}</div>
                </div>`).join('');
        }

        container.innerHTML = html;
    }

    // ── Tabla de distribución de ranuras ─────────────────────────────────────
    function _buildSlotTable(r) {
        if (!r.slotTable || r.slotTable.length === 0) return '';
        const phLabel = {
            A: r.motorType === 'three' ? 'Fase A' : 'Principal',
            B: 'Fase B', C: 'Fase C', Aux: 'Auxiliar',
        };

        let html = `<div style="margin-top:20px;">
            <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;
                color:#0891b2;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid rgba(8,145,178,0.25);">
                Distribución de ranuras
            </div>`;

        if (r.Q <= 144) {
            const perCol = Math.ceil(r.Q / 3);
            html += '<div style="overflow-x:auto;"><table class="slot-distribution-table">';
            html += `<thead><tr>
                <th>#</th><th>Fase</th><th>Dir</th>
                <th>#</th><th>Fase</th><th>Dir</th>
                <th>#</th><th>Fase</th><th>Dir</th>
            </tr></thead><tbody>`;
            for (let row = 0; row < perCol; row++) {
                let tr = '<tr>';
                for (let col = 0; col < 3; col++) {
                    const idx = col * perCol + row;
                    if (idx < r.Q) {
                        const s = r.slotTable[idx];
                        const cls = `wt-phase${s.phase}`;
                        tr += `<td class="${cls}">${s.slot}</td>
                               <td class="${cls}"><span class="motor-phase-badge ph-${s.phase}">${phLabel[s.phase]||s.phase}</span></td>
                               <td class="${cls}" style="font-weight:700;">${s.dir}</td>`;
                    } else { tr += '<td></td><td></td><td></td>'; }
                }
                html += tr + '</tr>';
            }
            html += '</tbody></table></div>';
        }
        html += '</div>';
        return html;
    }

    // ── Instrucciones de bobinado ─────────────────────────────────────────────
    function _buildWindingSteps(r) {
        const isThree = r.motorType === 'three';
        const conn    = isThree ? (r.connection === 'star' ? 'Estrella (Y)' : 'Triángulo (Δ)') : 'Monofásico';
        const h_slot  = (r.slotDims.hw || 18) + (r.slotDims.h1 || 1);

        const steps = [
            `Verificar y registrar el estado del devanado original: fotografiar la distribución, anotar AWG original (${r.existAWG > 0 ? 'AWG ' + r.existAWG : 'no registrado'}) y vueltas/bobina (${r.existTurns > 0 ? r.existTurns : 'no registrado'}).`,
            `Retirar el bobinado quemado con cuidado de no dañar las ranuras. Limpiar las ranuras con cepillo metálico y soplete de aire a baja presión. Verificar que no haya chapas dañadas o deformadas.`,
            `Preparar el aislante de ranura clase <strong>${r.insClass}</strong>: usar Nomex ${r.insClass==='A'?'410 (105°C)':r.insClass==='B'?'410 (130°C)':r.insClass==='F'?'410 (155°C) o Nomex 411':'461 (220°C)'} de <strong>0.3–0.5 mm</strong>. Longitud = <strong>${(r.L_mm + 20).toFixed(0)} mm</strong> (paquete + 10 mm por cada lado). Insertar una lámina en cada una de las <strong>${r.Q} ranuras</strong>. Doblar los bordes para proteger la boca. Todo el sistema de aislamiento (Nomex, alambre, espagueti y barniz) debe ser uniformemente clase <strong>${r.insClass} o superior</strong>.`,
            `Confeccionar las bobinas con los siguientes parámetros:
             <ul style="margin:6px 0 0 16px;color:#cbd5e1;">
               <li>Vueltas por bobina: <strong>${r.N_c}</strong></li>
               <li>Paso de bobina: <strong>${r.winding_step || ('1 – ' + (r.y + 1))}</strong> — y = ${r.y} ranuras ${r.y === Math.round(r.tau_p) ? '(paso pleno)' : `(paso corto, β = ${(r.y/r.tau_p).toFixed(3)})`}</li>
               ${(r.wire.n_parallel||1) > 1
                   ? `<li>Conductor: <strong>${r.wire.n_parallel} hilos AWG ${r.wire.awg}</strong> en paralelo (en mano) — Ø ${r.wire.diameter.toFixed(3)} mm c/u — sección total ${r.wire.area.toFixed(3)} mm²</li>`
                   : `<li>Calibre del conductor: <strong>AWG ${r.wire.awg}</strong> — Ø ${r.wire.diameter.toFixed(3)} mm, sección ${r.wire.area.toFixed(3)} mm²</li>`}
               <li>Longitud media de vuelta (MTL): <strong>${(r.MTL*100).toFixed(1)} cm</strong></li>
               <li>Longitud total cable por fase: <strong>${r.l_total.toFixed(2)} m</strong></li>
             </ul>`,
            ...(isThree && r.phase_starts ? [
                `Insertar bobinas comenzando por <strong>Fase U (L1) en ranura ${r.phase_starts.U}</strong>, luego <strong>Fase V (L2) en ranura ${r.phase_starts.V}</strong>, luego <strong>Fase W (L3) en ranura ${r.phase_starts.W}</strong>. Seguir la tabla de distribución para el sentido (+/−) en cada ranura. Dejar cabeza de bobina de aprox. <strong>${(r.tau_m_mm * 1.2).toFixed(0)} mm</strong> por lado.`,
            ] : [
                `Insertar bobinas de <strong>${isThree ? 'Fase A' : 'devanado principal'}</strong> en ranuras según la tabla de distribución. Dejar cabeza de bobina de aprox. <strong>${(r.tau_m_mm * 1.2).toFixed(0)} mm</strong> por cada lado.`,
                ...(!isThree ? [
                    `Insertar devanado auxiliar en ranuras desplazadas <strong>${Math.round(r.tau_p/2)} ranuras</strong> respecto al principal (90° eléctricos). Calibre: AWG ${r.aux ? r.aux.wire.awg : '—'}, ${r.aux ? r.aux.N_c : '—'} vueltas/bobina.`,
                ] : []),
            ]),
            ...(isThree && r.phase_starts ? [] : (!isThree ? [] : [
                `Insertar bobinas de <strong>Fase B</strong> desplazadas <strong>${Math.round(r.tau_p * 2/3)} ranuras</strong> respecto a Fase A (120° eléctricos).`,
                `Insertar bobinas de <strong>Fase C</strong> desplazadas <strong>${Math.round(r.tau_p * 4/3)} ranuras</strong> respecto a Fase A (240° eléctricos).`,
            ])),
            `Colocar aislante inter-capas (Nomex 0.25 mm) entre la capa inferior y superior en cada ranura.`,
            `Conectar los extremos en configuración <strong>${conn}</strong>. Verificar inicio y final de cada bobina con ohmímetro antes de soldar o crimpar.`,
            ...(r.motorType === 'single' && r.aux && r.aux.C_uF !== null
                ? [`Conectar capacitor de <strong>${r.aux.C_uF.toFixed(0)} µF</strong> (valor estimado) en serie con devanado auxiliar. Ajustar midiendo corriente en vacío — el valor correcto minimiza la corriente de línea.`]
                : []
            ),
            `Impregnar con barniz de impregnación clase <strong>${r.insClass}</strong>. Método recomendado: inmersión total o goteo. Curar en horno: <strong>${r.insClass==='A'?120:r.insClass==='B'?135:r.insClass==='F'?155:180}°C durante 2–4 horas</strong> según fabricante.`,
            `Verificar resistencias DC entre terminales. Valores calculados:
             <ul style="margin:6px 0 0 16px;color:#cbd5e1;">
               <li>${isThree?'Fase A':r.motorType==='single'?'Principal':''}: <strong>${r.R_phase.toFixed(3)} Ω</strong> (tolerancia ±15%)</li>
               ${r.motorType === 'three' ? `<li>Fases B y C: deben ser iguales a Fase A (±2%)</li>` : ''}
               ${r.motorType === 'single' && r.aux ? `<li>Auxiliar: <strong>${r.aux.R.toFixed(3)} Ω</strong></li>` : ''}
             </ul>`,
            `Prueba de aislamiento: medir con megóhmetro a 500 V DC entre cada devanado y la carcasa. Resistencia mínima aceptable: <strong>1 MΩ</strong> (nuevo: > 100 MΩ).`,
            `Prueba en vacío: energizar a tensión nominal. Corriente en vacío esperada: <strong>${(r.I_line * 0.40).toFixed(2)} – ${(r.I_line * 0.60).toFixed(2)} A</strong>. Verificar ausencia de ruidos anormales y vibración.`,
            `Prueba con carga nominal: medir corriente, temperatura y RPM. La temperatura máxima del bobinado en régimen permanente no debe superar el límite de clase <strong>${r.insClass}</strong> (${r.insClass==='A'?105:r.insClass==='B'?130:r.insClass==='F'?155:180}°C).`,
        ];

        return `<div style="margin-top:20px;">
            <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;
                color:#0891b2;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid rgba(8,145,178,0.25);">
                Instrucciones de rebobinado
            </div>
            <ol class="winding-steps">
                ${steps.map(s => `<li>${s}</li>`).join('')}
            </ol>
        </div>`;
    }

    // ── Tabla de capacitores para motores monofásicos ────────────────────────
    function _buildCapacitorTable(r) {
        if (r.motorType !== 'single') return '';
        const a = r.aux;
        if (!a || a.C_uF === null) return '';

        // Tabla de referencia: [hp, C_marcha_min, C_marcha_max, C_arranque_min, C_arranque_max]
        const capRef = [
            [0.25,  8, 10,  40,  60],
            [0.33, 12, 16,  60,  80],
            [0.50, 16, 20,  80, 110],
            [0.75, 20, 25, 110, 140],
            [1.0,  30, 35, 140, 180],
            [1.5,  40, 45, 200, 250],
            [2.0,  50, 60, 270, 320],
            [3.0,  70, 80, 400, 450],
            [5.0,  90,100, 550, 600],
        ];

        const hp = r.powerKW / 0.7457;
        const row = capRef.reduce((best, cur) =>
            Math.abs(cur[0] - hp) < Math.abs(best[0] - hp) ? cur : best, capRef[0]);

        const isCapRun = r.startMethod === 'cap_run';

        return `<div style="margin-top:20px;">
            <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;
                color:#0891b2;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid rgba(8,145,178,0.25);">
                Capacitores (220 V / ${r.f} Hz)
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;">
                <div style="background:rgba(34,211,238,0.06);border:1px solid rgba(34,211,238,0.25);border-radius:8px;padding:12px;">
                    <div style="font-size:10px;font-weight:700;color:#22d3ee;text-transform:uppercase;margin-bottom:6px;">Capacitor de marcha (blanco)</div>
                    <div style="font-size:18px;font-weight:700;color:#f1f5f9;">${row[1]}–${row[2]} µF</div>
                    <div style="font-size:10px;color:#64748b;margin-top:4px;">400/450 VAC · Polipropileno · Permanente</div>
                    <div style="font-size:10px;color:#94a3b8;margin-top:6px;">Cálculo: ~${Math.round(r.powerKW / 0.7457 * 35)} µF estimado</div>
                </div>
                <div style="background:rgba(245,158,11,0.06);border:1px solid rgba(245,158,11,0.25);border-radius:8px;padding:12px;${isCapRun ? 'opacity:0.45;' : ''}">
                    <div style="font-size:10px;font-weight:700;color:#f59e0b;text-transform:uppercase;margin-bottom:6px;">Capacitor de arranque (negro)</div>
                    <div style="font-size:18px;font-weight:700;color:#f1f5f9;">${row[3]}–${row[4]} µF</div>
                    <div style="font-size:10px;color:#64748b;margin-top:4px;">110/220 VAC · Electrolítico · Solo arranque</div>
                    ${isCapRun ? '<div style="font-size:10px;color:#f87171;margin-top:6px;">No aplica — motor de capacitor permanente</div>' : '<div style="font-size:10px;color:#94a3b8;margin-top:6px;">Se desconecta al 75% RPM vía centrífugo</div>'}
                </div>
            </div>
            <div style="font-size:11px;color:#64748b;line-height:1.6;background:rgba(0,0,0,0.15);border-radius:6px;padding:8px 10px;">
                ⚠️ Valores de referencia para ${row[0]} HP / 220 V. Ajustar midiendo corriente en vacío — el valor correcto minimiza la corriente de línea.<br>
                Si el motor zumba sin arrancar: revisar centrífugo o aumentar capacitor de arranque.<br>
                Si calienta rápido en vacío: reducir capacitor de marcha 5 µF y re-medir.
            </div>
        </div>`;
    }

    // ── Diagrama de conexión llave inversora monofásica ───────────────────────
    function _buildSinglePhaseWiring(r) {
        if (r.motorType !== 'single') return '';
        const isCapRun = r.startMethod === 'cap_run';

        return `<div style="margin-top:20px;">
            <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;
                color:#0891b2;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid rgba(8,145,178,0.25);">
                Diagrama de conexión — Inversión de giro
            </div>
            <div style="font-size:11px;color:#94a3b8;margin-bottom:10px;">
                Para invertir el giro se cruzan las puntas del devanado auxiliar (U1-U2 = trabajo, V1-V2 = arranque con capacitores).
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">
                <div style="background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.3);border-radius:8px;padding:10px;">
                    <div style="font-size:11px;font-weight:700;color:#10b981;margin-bottom:6px;">🟢 Giro Horario (Derecha)</div>
                    <div style="font-family:monospace;font-size:11px;color:#cbd5e1;line-height:1.8;">
                        Fase (L) → U1 + V1<br>
                        Neutro (N) → U2 + V2
                    </div>
                    <div style="font-size:10px;color:#64748b;margin-top:6px;">Chapitas: U1-V1 | U2-V2</div>
                </div>
                <div style="background:rgba(59,130,246,0.08);border:1px solid rgba(59,130,246,0.3);border-radius:8px;padding:10px;">
                    <div style="font-size:11px;font-weight:700;color:#3b82f6;margin-bottom:6px;">🔵 Giro Antihorario (Izquierda)</div>
                    <div style="font-family:monospace;font-size:11px;color:#cbd5e1;line-height:1.8;">
                        Fase (L) → U1 + V2<br>
                        Neutro (N) → U2 + V1
                    </div>
                    <div style="font-size:10px;color:#64748b;margin-top:6px;">Chapitas: U1-V2 | U2-V1</div>
                </div>
            </div>
            <div style="background:rgba(139,92,246,0.06);border:1px solid rgba(139,92,246,0.2);border-radius:8px;padding:10px;margin-bottom:10px;">
                <div style="font-size:11px;font-weight:700;color:#a78bfa;margin-bottom:6px;">🎛️ Llave inversora de 3 posiciones (1-0-2)</div>
                <div style="font-family:monospace;font-size:10px;color:#cbd5e1;line-height:1.9;">
                    Borne 1 ← Fase (L) de red<br>
                    Borne 2 ← Neutro (N) de red<br>
                    Borne 3 ← V1 del motor<br>
                    Borne 4 ← V2 del motor<br>
                    Puente: borne 3 ↔ borne 6<br>
                    Puente: borne 4 ↔ borne 5<br>
                    U1 puenteado con borne 1 · U2 puenteado con borne 2
                </div>
            </div>
            ${!isCapRun ? `<div style="font-size:10px;color:#f87171;background:rgba(239,68,68,0.05);border:1px solid rgba(239,68,68,0.2);border-radius:6px;padding:8px;">
                ⚠️ Nunca pasar de posición 1 a 2 directamente. Llevar a 0 y esperar el "clic" del centrífugo antes de invertir.
            </div>` : ''}
        </div>`;
    }

    // ── Diagrama de conexión trifásica (por fase) ─────────────────────────────
    function _buildThreePhaseConnDiagram(r) {
        if (r.motorType !== 'three') return '';
        const gpf = r.groups_per_phase;
        const conn = r.connection === 'star' ? 'Estrella (Y)' : 'Triángulo (Δ)';
        const ps = r.phase_starts;
        if (!ps) return '';

        // Genera la lista de grupos por fase
        const phaseNames = ['U (L1)', 'V (L2)', 'W (L3)'];
        const starts = [ps.U, ps.V, ps.W];
        const slotStep = Math.round(r.Q / (r.P * 3));  // ranuras por grupo

        // gpf = P × q_int bobinas en serie. Para visualización en taller, agrupar
        // las bobinas en P grupos de q bobinas cada uno (un grupo por polo por fase).
        const P_groups = r.P;           // grupos físicos de polo = P
        const q_per_group = r.q_int;   // bobinas por grupo = q
        return `<div style="margin-top:20px;">
            <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;
                color:#0891b2;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid rgba(8,145,178,0.25);">
                Diagrama de grupos y conexión — ${r.P} polos / ${conn}
            </div>
            <div style="font-size:11px;color:#94a3b8;margin-bottom:8px;">
                ${P_groups} grupos de polo × ${q_per_group} bob/grupo = ${gpf} bobinas en serie · Conexión: ${r.groups_connection === 'paralelo' ? 'Paralelo (F-F / I-I)' : 'Serie (F-I / F-I — polos alternados)'}
            </div>
            ${phaseNames.map((ph, pi) => {
                const col = ['#ef4444','#3b82f6','#10b981'][pi];
                // Ranuras de inicio de cada GRUPO (P grupos por fase)
                const groupSlots = Array.from({length: P_groups}, (_, gi) =>
                    ((starts[pi] - 1 + gi * slotStep * 2) % r.Q) + 1
                );
                const label = ph.split(' ')[0];
                const connSteps = r.groups_connection === 'paralelo'
                    ? `<li>Terminal entrada (${label}1): Inicio del Grupo 1</li>
                       <li>Unir <strong>todos los Inicios</strong> juntos → terminal de línea ${label}1</li>
                       <li>Unir <strong>todos los Finales</strong> juntos → terminal de salida ${label}2</li>`
                    : Array.from({length: P_groups}, (_, i) => {
                        if (i === 0) return `<li>Terminal entrada (${label}1): Inicio Grupo 1</li>`;
                        if (i % 2 === 1) return `<li>Unir Fin Grupo ${i} con Fin Grupo ${i+1}</li>`;
                        return `<li>Unir Inicio Grupo ${i} con Inicio Grupo ${i+1}</li>`;
                      }).filter(Boolean).join('') + `<li>Terminal salida (${label}2): Fin Grupo ${P_groups}</li>`;
                return `<div style="background:rgba(0,0,0,0.15);border-left:3px solid ${col};border-radius:0 8px 8px 0;padding:10px 12px;margin-bottom:8px;">
                    <div style="font-size:11px;font-weight:700;color:${col};margin-bottom:6px;">Fase ${ph}</div>
                    <div style="font-size:10px;color:#64748b;margin-bottom:4px;">Ranuras de inicio de cada grupo: ${groupSlots.join(', ')}</div>
                    <ol style="font-size:10px;color:#94a3b8;margin:0;padding-left:16px;line-height:1.8;">${connSteps}</ol>
                </div>`;
            }).join('')}
            <div style="font-size:11px;color:#64748b;background:rgba(0,0,0,0.15);border-radius:6px;padding:8px 10px;margin-top:4px;">
                <strong style="color:#22d3ee;">Centro de estrella (Y):</strong> Unir firmemente U2 + V2 + W2 en cortocircuito.
                Los terminales U2, V2, W2 son el <strong>Fin del Grupo ${P_groups}</strong> de cada fase.<br>
                <strong style="color:#22d3ee;">Triángulo (Δ):</strong> U1-W2 · V1-U2 · W1-V2.
            </div>
        </div>`;
    }

    // =========================================================================
    // ── CANVAS: SECCIÓN TRANSVERSAL DEL ESTÁTOR ──────────────────────────────
    // =========================================================================

    function _drawStator(r) {
        const canvas = document.getElementById('motorStatorCanvas');
        if (!canvas) return;

        const W = Math.max(260, (canvas.parentElement?.clientWidth || 380) - 32);
        canvas.width = canvas.height = W;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, W, W);

        const cx = W / 2, cy = W / 2;
        const OD = r.D_ext_mm, ID = r.D_mm;
        const Q  = r.Q;
        const d  = r.slotDims;
        const h_slot = (d.hw || 18) + (d.h1 || 1);

        // OD ocupa 88% del canvas — sin margen para arcos
        const scale   = (W * 0.44) / (OD / 2);
        const R_ext   = (OD / 2) * scale;
        const R_bore  = (ID / 2) * scale;
        const R_rotor = Math.max(4, R_bore - 2 * scale);

        const PH_COL = {
            A:    { fill: 'rgba(239,68,68,0.62)',   stroke: '#ef4444', label: '#fca5a5' },
            B:    { fill: 'rgba(59,130,246,0.62)',  stroke: '#3b82f6', label: '#93c5fd' },
            C:    { fill: 'rgba(16,185,129,0.62)',  stroke: '#10b981', label: '#6ee7b7' },
            Aux:  { fill: 'rgba(245,158,11,0.62)',  stroke: '#f59e0b', label: '#fcd34d' },
            empty:{ fill: 'rgba(255,255,255,0.03)', stroke: 'rgba(255,255,255,0.07)', label: '#475569' },
        };

        // 1. Fondo del estátor
        ctx.beginPath();
        ctx.arc(cx, cy, R_ext, 0, 2 * Math.PI);
        ctx.fillStyle = 'rgba(30,41,59,0.80)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(148,163,184,0.25)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // 2. Ranuras con color de fase
        const slotAngSpan = (2 * Math.PI / Q);
        for (let i = 0; i < Q; i++) {
            const slot  = r.slotTable ? r.slotTable[i] : null;
            const phase = slot ? slot.phase : 'empty';
            const col   = PH_COL[phase] || PH_COL.empty;
            const ang   = slotAngSpan * i - Math.PI / 2;
            const h1_px = (d.h1 || 1) * scale;
            const hw_px = (d.hw || 18) * scale;
            const r_in  = R_bore;
            const r_mid = R_bore + h1_px;
            const r_out = R_bore + h1_px + hw_px;
            const b1_ang = Math.min(slotAngSpan * 0.40,
                ((d.b1 || 3) / (Math.PI * ID / Q)) * slotAngSpan);
            const bw_ang = Math.min(slotAngSpan * 0.76,
                ((d.bw || 5.5) / (Math.PI * ID / Q)) * slotAngSpan);

            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(ang);

            // Boca (oscura)
            ctx.beginPath();
            ctx.arc(0, 0, r_in,  -b1_ang/2, b1_ang/2);
            ctx.arc(0, 0, r_mid,  b1_ang/2, -b1_ang/2, true);
            ctx.closePath();
            ctx.fillStyle = 'rgba(8,6,24,0.90)';
            ctx.fill();

            // Cuerpo de ranura
            ctx.beginPath();
            ctx.arc(0, 0, r_mid, -bw_ang/2, bw_ang/2);
            ctx.arc(0, 0, r_out,  bw_ang/2, -bw_ang/2, true);
            ctx.closePath();
            ctx.fillStyle = col.fill;
            ctx.fill();
            ctx.strokeStyle = col.stroke;
            ctx.lineWidth = 0.6;
            ctx.stroke();

            // Símbolo dirección
            if (Q <= 60 && slot) {
                const rm  = (r_mid + r_out) / 2;
                const fsz = Math.max(6, Math.min(11, W * 0.025));
                ctx.fillStyle = 'rgba(255,255,255,0.90)';
                ctx.font = `bold ${fsz}px monospace`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(slot.dir === '+' ? '•' : '×', rm, 0);
            }

            // Número de ranura (cada 3 ranuras si Q≤48)
            if (Q <= 48 && i % 3 === 0) {
                const rn = r_out + 8;
                ctx.fillStyle = 'rgba(148,163,184,0.70)';
                ctx.font = `${Math.max(5, W * 0.018)}px sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(i + 1, rn, 0);
            }

            ctx.restore();
        }

        // 3. Bore y rotor
        ctx.beginPath();
        ctx.arc(cx, cy, R_bore, 0, 2 * Math.PI);
        ctx.fillStyle = 'rgba(6,4,20,0.97)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(34,211,238,0.40)';
        ctx.lineWidth = 1.2;
        ctx.stroke();

        if (R_rotor > 8) {
            ctx.beginPath();
            ctx.arc(cx, cy, R_rotor, 0, 2 * Math.PI);
            ctx.strokeStyle = 'rgba(148,163,184,0.15)';
            ctx.lineWidth = 1;
            ctx.setLineDash([2, 4]);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // 4. Etiqueta central
        ctx.fillStyle = '#94a3b8';
        ctx.font = `bold ${Math.max(9, W * 0.034)}px Segoe UI, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${r.P}P / Q${r.Q}`, cx, cy);

        // 5. Leyenda
        const phases = r.motorType === 'three' ? ['A','B','C'] : ['A','Aux'];
        const labels = r.motorType === 'three'
            ? ['Fase U (L1)', 'Fase V (L2)', 'Fase W (L3)']
            : ['Principal', 'Auxiliar'];
        const LH = 17, LX = 8, LY0 = W - phases.length * LH - 6;
        ctx.font = `${Math.max(8, W * 0.026)}px Segoe UI, sans-serif`;
        phases.forEach((ph, i) => {
            const col = PH_COL[ph];
            ctx.fillStyle = col.fill;
            ctx.fillRect(LX, LY0 + i * LH, 10, 10);
            ctx.strokeStyle = col.stroke;
            ctx.lineWidth = 0.8;
            ctx.strokeRect(LX, LY0 + i * LH, 10, 10);
            ctx.fillStyle = col.label;
            ctx.textAlign = 'left';
            ctx.fillText(labels[i], LX + 14, LY0 + i * LH + 6);
        });
    }

    // =========================================================================
    // ── CANVAS: DIAGRAMA DE CONEXIONES (desarrollo lineal tipo arpa) ──────────
    // =========================================================================
    function _drawConnDiagram(r) {
        const container = document.getElementById('motorConnContainer');
        const canvas    = document.getElementById('motorConnCanvas');
        if (!canvas || !container) return;

        // Solo mostrar para trifásico con datos de grupos
        if (r.motorType !== 'three' || !r.phase_starts || !r.groups_per_phase) {
            container.style.display = 'none';
            return;
        }
        container.style.display = '';

        const Q   = r.Q;
        const gpf = r.groups_per_phase;   // grupos por fase
        const spg = r.q_int || Math.round(r.q);  // ranuras por grupo (q ranuras/polo/fase)
        const isP = r.groups_connection === 'paralelo';

        // Paso entre inicios de grupo consecutivo de la MISMA fase = 2 × groupStep
        const groupStep = Math.round(Q / (r.P * 3));  // ranuras entre grupos de la misma fase / 2
        const phaseStarts = [r.phase_starts.U - 1, r.phase_starts.V - 1, r.phase_starts.W - 1];

        // Construir lista de grupos por fase: [{init, fin, label}, ...]
        // init y fin son índices 0-based de ranura
        const phGroups = [[], [], []];
        for (let pi = 0; pi < 3; pi++) {
            for (let g = 0; g < gpf; g++) {
                const s0 = (phaseStarts[pi] + g * groupStep * 2) % Q;
                const s1 = (s0 + spg - 1 + Q) % Q;
                phGroups[pi].push({ init: s0, fin: s1 });
            }
        }

        // ── Dimensiones del canvas ───────────────────────────────────────────
        const pW = Math.max(500, (canvas.parentElement?.clientWidth || 640) - 32);
        // Altura: zona superior (arcos para capas 0→arriba) + línea base + zona inferior (terminales)
        const PAD_X = 36;          // margen horizontal
        const PAD_TOP = 16;        // margen superior
        const BASE_Y_FRAC = 0.48;  // línea base como fracción de la altura del canvas
        // Altura total: necesitamos acomodar arcos cuya altura máx es Q/2 ranuras de distancia
        // Usamos 3 capas por fase (una por fase), más terminales abajo
        const ARC_ZONE  = Math.round(pW * 0.22);   // px disponibles para arcos encima
        const TERM_ZONE = Math.round(pW * 0.10);   // px para terminales debajo
        const cH = PAD_TOP + ARC_ZONE + 24 + TERM_ZONE + 8;
        canvas.width  = pW;
        canvas.height = cH;

        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, pW, cH);

        // Fondo
        ctx.fillStyle = 'rgba(15,23,42,0.85)';
        ctx.fillRect(0, 0, pW, cH);

        const BASE_Y = PAD_TOP + ARC_ZONE;  // y de la línea de ranuras

        // ── Posición X de cada ranura ────────────────────────────────────────
        const usableW = pW - 2 * PAD_X;
        const slotX = i => PAD_X + (i / (Q - 1)) * usableW;

        // ── Colores ──────────────────────────────────────────────────────────
        const phColors = ['#ef4444', '#3b82f6', '#10b981'];
        const phFill   = ['rgba(239,68,68,0.15)', 'rgba(59,130,246,0.15)', 'rgba(16,185,129,0.15)'];
        const phNames  = ['U', 'V', 'W'];

        // ── Línea base de ranuras ─────────────────────────────────────────────
        ctx.strokeStyle = 'rgba(148,163,184,0.20)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(PAD_X - 10, BASE_Y);
        ctx.lineTo(pW - PAD_X + 10, BASE_Y);
        ctx.stroke();

        // ── Bloques de grupo (rectángulos coloreados bajo la línea base) ─────
        const BLOCK_H = 18;
        for (let pi = 0; pi < 3; pi++) {
            phGroups[pi].forEach((grp, gi) => {
                const x0 = slotX(grp.init);
                const x1 = slotX(grp.fin);
                // Fondo del bloque
                ctx.fillStyle = phFill[pi];
                ctx.fillRect(x0 - 2, BASE_Y + 2, (x1 - x0) + 4, BLOCK_H);
                ctx.strokeStyle = phColors[pi];
                ctx.lineWidth = 1;
                ctx.strokeRect(x0 - 2, BASE_Y + 2, (x1 - x0) + 4, BLOCK_H);
                // Etiqueta grupo
                const lbl = `${phNames[pi]}${gi + 1}`;
                const midX = (x0 + x1) / 2;
                ctx.fillStyle = phColors[pi];
                ctx.font = `bold ${Math.max(7, pW * 0.013)}px sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(lbl, midX, BASE_Y + 2 + BLOCK_H / 2);
            });
        }

        // ── Pins de inicio (I) y fin (F) de cada grupo ───────────────────────
        const PIN_R = Math.max(3.5, pW * 0.006);
        for (let pi = 0; pi < 3; pi++) {
            phGroups[pi].forEach(grp => {
                // Pin Inicio (relleno sólido)
                ctx.beginPath();
                ctx.arc(slotX(grp.init), BASE_Y, PIN_R, 0, 2 * Math.PI);
                ctx.fillStyle = phColors[pi];
                ctx.fill();
                // Pin Fin (hueco)
                ctx.beginPath();
                ctx.arc(slotX(grp.fin), BASE_Y, PIN_R, 0, 2 * Math.PI);
                ctx.fillStyle = 'rgba(15,23,42,0.95)';
                ctx.fill();
                ctx.strokeStyle = phColors[pi];
                ctx.lineWidth = 1.5;
                ctx.stroke();
            });
        }

        // ── Arcos de puente entre grupos (encima de la línea base) ───────────
        // Cada fase usa una capa vertical diferente para no solaparse.
        // La capa de la fase i ocupa una banda vertical del espacio ARC_ZONE.
        // Dentro de esa banda, la altura del arco es proporcional a la distancia.
        // Las capas se apilan: capa 0=W (verde, más cercana a base), 1=V (azul), 2=U (roja, más alta)
        const layerOrder = [2, 1, 0];  // orden de capas (U arriba, W abajo)
        const arcBandH   = ARC_ZONE / 3;  // px por capa

        // Dibujar arco Bezier entre dos puntos, curvando hacia arriba
        function drawArcBridge(x1, x2, maxH, color, lw, dashed) {
            const midX = (x1 + x2) / 2;
            const dist = Math.abs(x2 - x1);
            // Altura del arco proporcional a la distancia, máximo maxH
            const arcH = Math.min(maxH * 0.92, dist * 0.55);
            ctx.beginPath();
            ctx.moveTo(x1, BASE_Y);
            ctx.bezierCurveTo(x1, BASE_Y - arcH, x2, BASE_Y - arcH, x2, BASE_Y);
            ctx.strokeStyle = color;
            ctx.lineWidth = lw;
            if (dashed) ctx.setLineDash([4, 3]);
            else        ctx.setLineDash([]);
            ctx.stroke();
            ctx.setLineDash([]);
            // Flecha en el destino (x2)
            const arrLen = Math.max(4, pW * 0.008);
            const dx = x2 - x1;
            // Tangente al bezier en t=1: dirección es (x2-ctrlX2, 0+arcH) normalizada
            const tx = dx > 0 ? 1 : -1;
            ctx.beginPath();
            ctx.moveTo(x2, BASE_Y);
            ctx.lineTo(x2 - tx * arrLen * 0.7, BASE_Y - arrLen);
            ctx.moveTo(x2, BASE_Y);
            ctx.lineTo(x2 + tx * arrLen * 0.5, BASE_Y - arrLen);
            ctx.stroke();
        }

        layerOrder.forEach(pi => {
            const col  = phColors[pi];
            const lw   = Math.max(1.5, pW * 0.004);
            // Banda disponible para esta capa (0=más cerca de base, 2=más lejos)
            const layer = layerOrder.indexOf(pi);  // posición en el stack
            const bandTop = BASE_Y - (layer + 1) * arcBandH;
            const maxH    = arcBandH * 0.88;

            const grps = phGroups[pi];
            if (isP) {
                // PARALELO: todos los I al mismo nodo (U1), todos los F al neutro/triángulo
                // Dibujar arcos I[0]—I[1], I[1]—I[2], … (barra de entrada)
                for (let g = 0; g < gpf - 1; g++) {
                    drawArcBridge(slotX(grps[g].init), slotX(grps[g+1].init),
                        maxH, col, lw, false);
                }
                // Arcos F[0]—F[1], … (barra de salida) — línea de puntos
                for (let g = 0; g < gpf - 1; g++) {
                    drawArcBridge(slotX(grps[g].fin), slotX(grps[g+1].fin),
                        maxH * 0.75, col, lw, true);
                }
            } else {
                // SERIE: patrón F[g]—I[g+1] (fin del grupo g → inicio del grupo g+1)
                // para devanado en cadena
                for (let g = 0; g < gpf - 1; g++) {
                    const xA = slotX(grps[g].fin);
                    const xB = slotX(grps[g+1].init);
                    drawArcBridge(xA, xB, maxH, col, lw, false);
                }
            }
        });

        // ── Números de ranura — encima de la línea base, justo debajo de los arcos
        ctx.fillStyle = 'rgba(148,163,184,0.60)';
        ctx.font      = `${Math.max(7, pW * 0.012)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        for (let i = 0; i < Q; i++) {
            if (Q <= 36 || i % 2 === 0) {
                ctx.fillText(i + 1, slotX(i), BASE_Y - 2);
            }
        }

        // ── Terminales de línea U1, V1, W1 y neutro ──────────────────────────
        // Empiezan debajo del bloque de grupo + separación para que no tapen nada
        const TERM_R = Math.max(9, pW * 0.016);
        const termY = BASE_Y + BLOCK_H + TERM_R + 8;
        const termNames  = ['U1', 'V1', 'W1'];
        const neutNames  = ['U2', 'V2', 'W2'];
        const isStarConn = r.connection === 'star';

        for (let pi = 0; pi < 3; pi++) {
            const col   = phColors[pi];
            const grps  = phGroups[pi];
            // Terminal de línea → primer Inicio del grupo 1
            const txIn  = slotX(grps[0].init);
            // Terminal de salida → último Fin del último grupo
            const txOut = slotX(grps[gpf - 1].fin);

            // Línea vertical desde la base al terminal
            ctx.strokeStyle = col;
            ctx.lineWidth = Math.max(1.5, pW * 0.003);
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.moveTo(txIn, BASE_Y);
            ctx.lineTo(txIn, termY - TERM_R);
            ctx.stroke();

            // Círculo terminal entrada
            ctx.beginPath();
            ctx.arc(txIn, termY, TERM_R, 0, 2 * Math.PI);
            ctx.fillStyle = col;
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.font = `bold ${Math.max(7, pW * 0.013)}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(termNames[pi], txIn, termY);

            // Terminal de salida (U2/V2/W2 o neutro)
            ctx.strokeStyle = col + 'aa';
            ctx.lineWidth = Math.max(1, pW * 0.002);
            ctx.setLineDash([3, 3]);
            ctx.beginPath();
            ctx.moveTo(txOut, BASE_Y);
            ctx.lineTo(txOut, termY - TERM_R);
            ctx.stroke();
            ctx.setLineDash([]);

            ctx.beginPath();
            ctx.arc(txOut, termY, TERM_R, 0, 2 * Math.PI);
            ctx.fillStyle = isStarConn ? 'rgba(15,23,42,0.95)' : col;
            ctx.fill();
            ctx.strokeStyle = col;
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.fillStyle = isStarConn ? col : '#fff';
            ctx.font = `bold ${Math.max(6, pW * 0.012)}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(isStarConn ? neutNames[pi] : neutNames[pi], txOut, termY);
        }

        // Si estrella: barra de neutro uniendo los 3 terminales de salida (U2, V2, W2)
        if (isStarConn) {
            // Los tres terminales de salida son el último FIN de cada fase
            const neutXs = [
                slotX(phGroups[0][gpf-1].fin),   // U2
                slotX(phGroups[1][gpf-1].fin),   // V2
                slotX(phGroups[2][gpf-1].fin),   // W2
            ];
            const neutBarY = termY + TERM_R + 10;
            const xMin = Math.min(...neutXs);
            const xMax = Math.max(...neutXs);

            // Bajada vertical desde cada terminal hasta la barra horizontal
            neutXs.forEach((nx, pi) => {
                ctx.strokeStyle = phColors[pi];
                ctx.lineWidth = Math.max(1.5, pW * 0.003);
                ctx.setLineDash([]);
                ctx.beginPath();
                ctx.moveTo(nx, termY + TERM_R);
                ctx.lineTo(nx, neutBarY);
                ctx.stroke();
            });

            // Barra horizontal de neutro (los 3 puntos)
            ctx.strokeStyle = '#94a3b8';
            ctx.lineWidth = Math.max(3, pW * 0.005);
            ctx.lineCap = 'round';
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.moveTo(xMin, neutBarY);
            ctx.lineTo(xMax, neutBarY);
            ctx.stroke();
            ctx.lineCap = 'butt';

            // Punto de unión en los tres cruces
            neutXs.forEach(nx => {
                ctx.beginPath();
                ctx.arc(nx, neutBarY, Math.max(3, pW * 0.005), 0, 2 * Math.PI);
                ctx.fillStyle = '#94a3b8';
                ctx.fill();
            });

            // Etiqueta N al lado del último punto
            ctx.fillStyle = '#cbd5e1';
            ctx.font = `bold ${Math.max(8, pW * 0.013)}px sans-serif`;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText('N', xMax + 6, neutBarY);
        }

        // ── Título / leyenda inferior ─────────────────────────────────────────
        ctx.fillStyle = 'rgba(100,116,139,0.80)';
        ctx.font = `${Math.max(8, pW * 0.013)}px Segoe UI, sans-serif`;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        ctx.fillText(
            `${gpf} grupos/fase · ${isP ? 'Paralelo' : 'Serie'} · ${r.connection === 'star' ? 'Estrella Y' : 'Triángulo Δ'} · Q=${Q} P=${r.P}`,
            pW - 8, 4
        );

        _drawTerminalDiagram(r);
    }

    // =========================================================================
    // ── CANVAS: BORNERAS ESTRELLA / TRIÁNGULO ────────────────────────────────
    // Disposición IEC estándar (igual que imagen de referencia):
    //   Fila superior: U1  V1  W1
    //   Fila inferior: W2  U2  V2
    // Bobinas (IDÉNTICAS en ambas conexiones):
    //   U1 (sup col0) ──cable U── U2 (inf col1)   → cable diagonal der
    //   V1 (sup col1) ──cable V── V2 (inf col2)   → cable diagonal der
    //   W1 (sup col2) ──cable W── W2 (inf col0)   → cable diagonal izq (cruza)
    // Chapas:
    //   ESTRELLA: una barra larga horizontal en fila inf uniendo W2–U2–V2
    //   TRIÁNGULO: tres chapas verticales W2↔U1, U2↔V1, V2↔W1
    // =========================================================================
    function _drawTerminalDiagram(r) {
        const canvas = document.getElementById('motorTermCanvas');
        if (!canvas) return;

        const pW = Math.max(440, (canvas.parentElement?.clientWidth || 660) - 16);
        const pH = Math.round(pW * 0.44);
        canvas.width  = pW;
        canvas.height = pH;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, pW, pH);

        const panW = Math.floor(pW / 2) - 6;
        const panH = pH - 4;

        // ── Helpers ──────────────────────────────────────────────────────────

        // Bornera: cuadrado con tornillo y label dentro
        function drawBornera(x, y, label, col, BR) {
            const s = BR * 2.0;
            ctx.fillStyle = 'rgba(20,30,52,0.97)';
            ctx.strokeStyle = col;
            ctx.lineWidth = 2;
            ctx.beginPath();
            if (ctx.roundRect) ctx.roundRect(x - s/2, y - s/2, s, s, 4);
            else ctx.rect(x - s/2, y - s/2, s, s);
            ctx.fill(); ctx.stroke();
            // Cruz tornillo
            const t = BR * 0.42;
            ctx.strokeStyle = col + '99';
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(x-t, y); ctx.lineTo(x+t, y);
            ctx.moveTo(x, y-t); ctx.lineTo(x, y+t);
            ctx.stroke();
            // Label
            ctx.fillStyle = '#e2e8f0';
            ctx.font = `bold ${Math.max(7, pW * 0.013)}px Segoe UI, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, x, y);
        }

        // Chapa horizontal: barra gruesa color cobre entre dos puntos
        function drawJumperH(x0, x1, y, col, thick) {
            ctx.fillStyle = col + 'dd';
            ctx.strokeStyle = col;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.rect(x0, y - thick/2, x1 - x0, thick);
            ctx.fill(); ctx.stroke();
            // Agujeros (círculos) sobre cada bornera que toca
            // (se dibujan en drawBornera, aquí solo la barra)
        }

        // Chapa vertical: barra gruesa color cobre entre dos puntos
        function drawJumperV(x, y0, y1, col, thick) {
            ctx.fillStyle = col + 'dd';
            ctx.strokeStyle = col;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.rect(x - thick/2, y0, thick, y1 - y0);
            ctx.fill(); ctx.stroke();
        }

        // Bobina: cable oblicuo con espiral dibujada en el centro
        function drawCoil(x1, y1, x2, y2, col, BR) {
            const lw = Math.max(1.5, pW * 0.003);
            ctx.strokeStyle = col;
            ctx.lineWidth = lw;
            ctx.setLineDash([]);

            const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
            const coilH = Math.min(28, Math.abs(y2 - y1) * 0.35);
            const coilW = BR * 1.4;

            // Cable tramo superior: desde bornera hasta inicio espiral
            ctx.beginPath();
            ctx.moveTo(x1, y1 + BR);
            ctx.lineTo(mx, my - coilH * 1.1);
            ctx.stroke();

            // Cable tramo inferior: desde fin espiral hasta bornera
            ctx.beginPath();
            ctx.moveTo(mx, my + coilH * 1.1);
            ctx.lineTo(x2, y2 - BR);
            ctx.stroke();

            // Espiral (serie de arcos semicirculares)
            const nLoops = 4;
            const loopH  = coilH * 2 / nLoops;
            ctx.beginPath();
            for (let i = 0; i < nLoops; i++) {
                const cy = (my - coilH) + i * loopH + loopH / 2;
                const startA = -Math.PI;
                const endA   = 0;
                ctx.arc(mx, cy, loopH / 2, startA, endA, i % 2 !== 0);
            }
            ctx.stroke();
        }

        // Flecha de alimentación de red
        function drawFeed(x, yTop, label, col) {
            const arrowLen = 18;
            ctx.strokeStyle = col;
            ctx.lineWidth = Math.max(1.5, pW * 0.003);
            ctx.setLineDash([]);
            // Línea
            ctx.beginPath();
            ctx.moveTo(x, yTop);
            ctx.lineTo(x, yTop - arrowLen);
            ctx.stroke();
            // Punta (triángulo sólido apuntando hacia abajo = entrante)
            ctx.beginPath();
            ctx.moveTo(x,   yTop);
            ctx.lineTo(x-5, yTop - 10);
            ctx.lineTo(x+5, yTop - 10);
            ctx.closePath();
            ctx.fillStyle = col;
            ctx.fill();
            // Label
            ctx.fillStyle = col;
            ctx.font = `bold ${Math.max(8, pW * 0.013)}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText(label, x, yTop - arrowLen - 1);
        }

        // ═════════════════════════════════════════════════════════════════════
        // Dos paneles: estrella (izq) y triángulo (der)
        // ═════════════════════════════════════════════════════════════════════
        ['star', 'delta'].forEach((type, idx) => {
            const ox       = idx === 0 ? 2 : panW + 14;
            const oy       = 2;
            const isActive = r.connection === type;

            // Fondo y borde del panel
            ctx.fillStyle = 'rgba(15,23,42,0.90)';
            ctx.beginPath();
            if (ctx.roundRect) ctx.roundRect(ox, oy, panW, panH, 8);
            else ctx.rect(ox, oy, panW, panH);
            ctx.fill();
            ctx.strokeStyle = isActive ? '#22d3ee' : 'rgba(255,255,255,0.08)';
            ctx.lineWidth   = isActive ? 2.5 : 1;
            ctx.beginPath();
            if (ctx.roundRect) ctx.roundRect(ox, oy, panW, panH, 8);
            else ctx.rect(ox, oy, panW, panH);
            ctx.stroke();

            // Título
            const fsz = Math.max(11, pW * 0.021);
            ctx.fillStyle = isActive ? '#22d3ee' : '#475569';
            ctx.font = `bold ${fsz}px Segoe UI, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText(
                type === 'star' ? 'Estrella  (Y)' : 'Triángulo  (Δ)',
                ox + panW / 2, oy + 6
            );
            if (isActive) {
                ctx.fillStyle = 'rgba(34,211,238,0.60)';
                ctx.font = `${Math.max(7, pW * 0.011)}px sans-serif`;
                ctx.fillText('▲ ACTIVO', ox + panW / 2, oy + 6 + fsz + 2);
            }

            // ── Layout de borneras ────────────────────────────────────────────
            const BR    = Math.max(10, pW * 0.018);
            const titleH = isActive ? fsz * 2 + 14 : fsz + 14;
            // Área de trabajo dentro del panel
            const areaTop = oy + titleH;
            const areaBot = oy + panH - 10;
            const areaH   = areaBot - areaTop;

            // Filas: sup a 30% del área, inf a 78%
            const rowY = [
                areaTop + areaH * 0.22,   // fila superior
                areaTop + areaH * 0.74,   // fila inferior
            ];

            // Columnas: 3 borneras equidistantes
            const colX = [
                ox + panW * 0.18,
                ox + panW * 0.50,
                ox + panW * 0.82,
            ];

            // Posiciones fijas IEC:
            //   Fila sup:  U1(col0)  V1(col1)  W1(col2)
            //   Fila inf:  W2(col0)  U2(col1)  V2(col2)
            const bPos = {
                U1: { x: colX[0], y: rowY[0] },
                V1: { x: colX[1], y: rowY[0] },
                W1: { x: colX[2], y: rowY[0] },
                W2: { x: colX[0], y: rowY[1] },
                U2: { x: colX[1], y: rowY[1] },
                V2: { x: colX[2], y: rowY[1] },
            };
            const bCol = {
                U1:'#ef4444', U2:'#ef4444',
                V1:'#3b82f6', V2:'#3b82f6',
                W1:'#10b981', W2:'#10b981',
            };

            const thick = Math.max(6, BR * 0.60);  // grosor de chapa

            // ── 1. Cables de bobinas (IDÉNTICOS en ambas conexiones) ──────────
            // Bobina U: U1(sup col0) → U2(inf col1)   diagonal derecha
            // Bobina V: V1(sup col1) → V2(inf col2)   diagonal derecha
            // Bobina W: W1(sup col2) → W2(inf col0)   diagonal izquierda (cruza)
            drawCoil(bPos.U1.x, bPos.U1.y, bPos.U2.x, bPos.U2.y, '#ef4444', BR);
            drawCoil(bPos.V1.x, bPos.V1.y, bPos.V2.x, bPos.V2.y, '#3b82f6', BR);
            drawCoil(bPos.W1.x, bPos.W1.y, bPos.W2.x, bPos.W2.y, '#10b981', BR);

            // ── 2. Borneras (encima de cables, debajo de chapas) ──────────────
            Object.entries(bPos).forEach(([lbl, p]) => drawBornera(p.x, p.y, lbl, bCol[lbl], BR));

            // ── 3. Chapas de cortocircuito ────────────────────────────────────
            if (type === 'star') {
                // ESTRELLA: una chapa horizontal larga en fila inferior
                // une W2 – U2 – V2  (los tres terminales de fin de bobina)
                const chapY  = rowY[1];                  // a la altura de la fila inferior
                const xLeft  = bPos.W2.x - BR * 0.5;
                const xRight = bPos.V2.x + BR * 0.5;
                drawJumperH(xLeft, xRight, chapY, '#b0b8c8', thick);
                // Punto de unión sobre cada bornera
                [bPos.W2, bPos.U2, bPos.V2].forEach(p => {
                    ctx.beginPath();
                    ctx.arc(p.x, chapY, thick * 0.45, 0, 2 * Math.PI);
                    ctx.fillStyle = '#b0b8c8';
                    ctx.fill();
                });
                // Etiqueta N al extremo derecho
                ctx.fillStyle = '#94a3b8';
                ctx.font = `bold ${Math.max(8, pW * 0.014)}px sans-serif`;
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';
                ctx.fillText('N', xRight + 5, chapY);

                // Alimentación L1 L2 L3 desde fila superior
                drawFeed(bPos.U1.x, bPos.U1.y - BR, 'L1', '#ef4444');
                drawFeed(bPos.V1.x, bPos.V1.y - BR, 'L2', '#3b82f6');
                drawFeed(bPos.W1.x, bPos.W1.y - BR, 'L3', '#10b981');

            } else {
                // TRIÁNGULO: tres chapas VERTICALES que unen fila sup con fila inf
                //   Chapa 1: W2(inf col0) ↔ U1(sup col0)   → nodo L1
                //   Chapa 2: U2(inf col1) ↔ V1(sup col1)   → nodo L2
                //   Chapa 3: V2(inf col2) ↔ W1(sup col2)   → nodo L3
                const chapas = [
                    { top: bPos.U1, bot: bPos.W2, col: '#ef4444',  line: 'L1' },
                    { top: bPos.V1, bot: bPos.U2, col: '#3b82f6',  line: 'L2' },
                    { top: bPos.W1, bot: bPos.V2, col: '#10b981',  line: 'L3' },
                ];
                chapas.forEach(ch => {
                    drawJumperV(ch.top.x, ch.top.y + BR * 0.5, ch.bot.y - BR * 0.5, ch.col, thick);
                    // Puntos de unión
                    [ch.top, ch.bot].forEach(p => {
                        ctx.beginPath();
                        ctx.arc(p.x, p.y, thick * 0.45, 0, 2 * Math.PI);
                        ctx.fillStyle = ch.col;
                        ctx.fill();
                    });
                    // Flecha de alimentación sobre la fila superior
                    drawFeed(ch.top.x, ch.top.y - BR, ch.line, ch.col);
                });
            }

            // ── 4. Redibujar borneras encima de chapas ────────────────────────
            Object.entries(bPos).forEach(([lbl, p]) => drawBornera(p.x, p.y, lbl, bCol[lbl], BR));
        });
    }

    // =========================================================================
    // ── CANVAS: DISTRIBUCIÓN LINEAL DE RANURAS ────────────────────────────────
    // =========================================================================

    function _drawSlotLinear(r) {
        const canvas = document.getElementById('motorSlotCanvas');
        if (!canvas || !r.slotTable) return;
        const Q  = r.Q;
        const W  = Math.max(220, (canvas.parentElement?.clientWidth || 360) - 32);
        const cW = Math.max(6, Math.floor((W - 24) / Math.min(Q, 36)));
        const rows = Math.ceil(Q / 36);
        const cH = 28, padX = 12, padY = 12;
        canvas.width  = W;
        canvas.height = rows * (cH + 4) + padY * 2 + 40;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const perRow = Math.ceil(Q / rows);

        for (let i = 0; i < Q; i++) {
            const s   = r.slotTable[i];
            const col = PHASE_COLOR[s ? s.phase : 'empty'] || PHASE_COLOR.empty;
            const row = Math.floor(i / perRow);
            const ci  = i % perRow;
            const x   = padX + ci * (cW + 2);
            const y   = padY + row * (cH + 4);

            ctx.fillStyle = col.fill;
            ctx.beginPath();
            ctx.roundRect(x, y, cW, cH, 3);
            ctx.fill();
            ctx.strokeStyle = col.stroke;
            ctx.lineWidth = 0.8;
            ctx.stroke();

            if (cW >= 12) {
                ctx.fillStyle = '#ffffff';
                ctx.font = `bold ${Math.min(9, cW * 0.7)}px monospace`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(i + 1, x + cW / 2, y + cH / 2);
            }
        }

        // Leyenda
        const phases = r.motorType === 'three' ? ['A','B','C'] : ['A','Aux'];
        const labels = r.motorType === 'three' ? ['Fase A','Fase B','Fase C'] : ['Principal','Auxiliar'];
        let lx = padX;
        const ly = canvas.height - 22;
        ctx.font = '11px Segoe UI, sans-serif';
        phases.forEach((ph, i) => {
            const col = PHASE_COLOR[ph];
            ctx.fillStyle = col.fill;
            ctx.beginPath();
            ctx.roundRect(lx, ly, 12, 12, 2);
            ctx.fill();
            ctx.strokeStyle = col.stroke;
            ctx.lineWidth = 0.8;
            ctx.stroke();
            ctx.fillStyle = col.label;
            ctx.textAlign = 'left';
            ctx.fillText(labels[i], lx + 15, ly + 9);
            lx += ctx.measureText(labels[i]).width + 30;
        });
    }

    // =========================================================================
    // ── VALIDACIÓN — DOM ──────────────────────────────────────────────────────
    // =========================================================================

    function _showValidation(errors, warnings) {
        const el = document.getElementById('motorValidation');
        if (!el) return;
        let html = '';
        if (errors.length)
            html += `<div class="validation-errors"><div class="validation-title error">❌ Errores — no se puede calcular</div>
                ${errors.map(e => `<div class="validation-message error">• ${e}</div>`).join('')}</div>`;
        if (warnings.length)
            html += `<div class="validation-warnings"><div class="validation-title warning">⚠️ Advertencias</div>
                ${warnings.map(w => `<div class="validation-message warning">• ${w}</div>`).join('')}</div>`;
        if (!errors.length && !warnings.length)
            html = '<div class="validation-success">✅ Parámetros válidos</div>';
        el.innerHTML = html;
    }

    // =========================================================================
    // ── GUARDAR / RESTAURAR DISEÑO ────────────────────────────────────────────
    // =========================================================================

    window.motorSaveDesign = function () {
        if (!_lastResults) {
            if (typeof showToast === 'function') showToast('Realice un cálculo primero.', 'warning');
            return;
        }
        const p = _readInputs();
        const design = {
            timestamp: new Date().toISOString(),
            type: 'motor',
            data: {
                motorType: p.motorType,
                voltage: p.V, freq: p.freq,
                powerHP: p.powerHP, powerKW: p.powerKW,
                rpm: p.rpm, cosfi: p.cosfi, eta: p.eta,
                insClass: p.insClass,
                connection: p.connection,
                startMethod: p.startMethod, auxRatio: p.auxRatio,
                slots: p.Q,
                extDiam: p.D_ext_mm, boreDiam: p.D_bore_mm,
                stackLength: p.L_stack_mm,
                Bav: p.Bav,
                pitchType: p.pitchType, pitchRatio: p.pitchRatio,
                slotType: p.slotType, slotDims: p.slotDims,
                steelType: p.steel.name,
                existAWG: p.existAWG, existTurns: p.existTurns,
            }
        };
        if (typeof savedDesigns !== 'undefined') {
            savedDesigns.push(design);
            try {
                localStorage.setItem('inductorDesigns', JSON.stringify(savedDesigns));
                if (typeof showToast === 'function') showToast('Diseño de motor guardado.', 'success');
                if (typeof updateSavedDesignsList === 'function') updateSavedDesignsList();
            } catch (e) {
                if (typeof showToast === 'function') showToast('Error al guardar.', 'error');
            }
        }
    };

    window.motorRestoreDesign = function (d) {
        _v('motorVoltage', d.voltage);
        _v('motorFreq',    d.freq);
        _v('motorPowerHP', d.powerHP);
        _v('motorPowerKW', d.powerKW);
        _v('motorRPM',     d.rpm);
        _v('motorCosfi',   d.cosfi);
        _v('motorEta',     d.eta);
        _v('motorConnection', d.connection);
        _v('motorStartMethod', d.startMethod);
        _v('motorAuxRatio', d.auxRatio);
        _v('motorSlots', d.slots);
        _v('motorExtDiam', d.extDiam);
        _v('motorBoreDiam', d.boreDiam);
        _v('motorStackLength', d.stackLength);
        _v('motorBav', d.Bav);
        _v('motorPitchRatio', d.pitchRatio);
        if (d.existAWG)   _v('motorExistAWG', d.existAWG);
        if (d.existTurns) _v('motorExistTurns', d.existTurns);
        if (d.motorType) motorSetType(d.motorType);
        if (d.insClass)  motorSetInsClass(d.insClass);
        if (d.pitchType) motorSetPitch(d.pitchType);
        if (d.slotType)  motorSetSlotType(d.slotType);
        if (d.slotDims) {
            const sd = d.slotDims;
            _v('slotB1', sd.b1); _v('slotH1', sd.h1); _v('slotBw', sd.bw); _v('slotHw', sd.hw);
            _v('trapB1', sd.b1); _v('trapH1', sd.h1); _v('trapBtop', sd.btop); _v('trapBbot', sd.bbot); _v('trapHw', sd.hw);
            _v('semiB1', sd.b1); _v('semiH1', sd.h1); _v('semiHw', sd.hw); _v('semiR', sd.r);
        }
        setTimeout(calculateMotor, 150);
    };

    // =========================================================================
    // ── UTILIDADES INTERNAS ───────────────────────────────────────────────────
    // =========================================================================

    function _v(id, val)    { const el = document.getElementById(id); if (el && val != null) el.value = val; }
    function _sv(id)        { const el = document.getElementById(id); return el ? el.value : ''; }
    function _fv(id)        { const el = document.getElementById(id); return el ? parseFloat(el.value) || 0 : 0; }
    function _iv(id)        { const el = document.getElementById(id); return el ? parseInt(el.value) || 0 : 0; }
    function _tog(id, on)   { const el = document.getElementById(id); if (el) el.classList.toggle('active', on); }
    function _vis(id, show) { const el = document.getElementById(id); if (el) el.style.display = show ? 'block' : 'none'; }
    function _clrCanvas(id) { const c = document.getElementById(id); if (!c) return; const ctx = c.getContext('2d'); ctx.clearRect(0,0,c.width,c.height); }

    // ── Inicialización ────────────────────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', function () {
        // Activar sección de acero personalizado
        const steelSel = document.getElementById('motorSteelType');
        if (steelSel) {
            steelSel.addEventListener('change', function () {
                _vis('customSteelSection', this.value === 'custom_steel');
            });
        }
        // Renderizar diagrama SVG inicial
        motorUpdateSlotDiagram();
    });

})();