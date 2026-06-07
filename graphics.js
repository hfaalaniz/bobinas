// Rellena el canvas con fondo oscuro para tema oscuro
function _canvasBg(ctx, w, h) {
    ctx.fillStyle = 'rgba(15,12,41,0.6)';
    ctx.fillRect(0, 0, w, h);
}

// Dibujar bobina en canvas
function drawCoil(results, coreType) {
    const canvas = document.getElementById('coilCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const newWidth = canvas.offsetWidth;
    if (canvas.width !== newWidth) canvas.width = newWidth;
    if (canvas.height !== 400) canvas.height = 400;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    _canvasBg(ctx, canvas.width, canvas.height);
    
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const core = coreDatabase[coreType];
    
    if (coreType === 'air') {
        drawAirCore(ctx, centerX, centerY, results);
    } else {
        drawToroidCore(ctx, centerX, centerY, results, core);
    }
}

// Dibujar núcleo de aire
function drawAirCore(ctx, centerX, centerY, results) {
    const coilRadius = 80;
    const coilHeight = 120;
    const turns = Math.min(results.turns, 20);
    
    // Dibujar bobina
    ctx.strokeStyle = '#ff6b35';
    ctx.lineWidth = 2;
    
    for (let i = 0; i < turns; i++) {
        const y = centerY - coilHeight/2 + (i * coilHeight / turns);
        ctx.beginPath();
        ctx.arc(centerX, y, coilRadius, 0, Math.PI * 2);
        ctx.stroke();
    }
    
    // Líneas de conexión
    ctx.beginPath();
    ctx.moveTo(centerX - coilRadius, centerY - coilHeight/2);
    ctx.lineTo(centerX - coilRadius, centerY + coilHeight/2);
    ctx.moveTo(centerX + coilRadius, centerY - coilHeight/2);
    ctx.lineTo(centerX + coilRadius, centerY + coilHeight/2);
    ctx.stroke();
    
    // Etiquetas
    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`${results.turns} vueltas`, centerX, centerY + coilHeight/2 + 40);
    ctx.fillText(`Núcleo de Aire`, centerX, centerY - coilHeight/2 - 20);
}

// Dibujar núcleo toroidal
function drawToroidCore(ctx, centerX, centerY, results, core) {
    const outerRadius = 100;
    const innerRadius = 50;
    const turns = Math.min(results.turns, 40);
    
    // Dibujar núcleo
    ctx.fillStyle = core.color;
    ctx.beginPath();
    ctx.arc(centerX, centerY, outerRadius, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = '#1e1b4b';
    ctx.beginPath();
    ctx.arc(centerX, centerY, innerRadius, 0, Math.PI * 2);
    ctx.fill();
    
    // Dibujar devanados
    ctx.strokeStyle = '#ff6b35';
    ctx.lineWidth = 3;
    
    const angleStep = (Math.PI * 2) / turns;
    
    for (let i = 0; i < turns; i++) {
        const angle = i * angleStep;
        const x1 = centerX + Math.cos(angle) * innerRadius;
        const y1 = centerY + Math.sin(angle) * innerRadius;
        const x2 = centerX + Math.cos(angle) * outerRadius;
        const y2 = centerY + Math.sin(angle) * outerRadius;
        
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
    }
    
    // Información
    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`${results.turns} vueltas`, centerX, centerY + outerRadius + 40);
    ctx.fillText(core.name, centerX, centerY - outerRadius - 20);
    
    // Indicador de saturación
    if (results.saturation) {
        ctx.fillStyle = '#ef4444';
        ctx.font = 'bold 20px Arial';
        ctx.fillText('⚠️ SATURADO', centerX, centerY);
    }
}

// Dibujar curva B-H
function drawBHCurve(coreType, currentB) {
    const canvas = document.getElementById('bhChart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const newWidth = canvas.offsetWidth;
    if (canvas.width !== newWidth) canvas.width = newWidth;
    if (canvas.height !== 400) canvas.height = 400;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    _canvasBg(ctx, canvas.width, canvas.height);

    const core = coreDatabase[coreType];
    if (coreType === 'air') {
        drawLinearBH(ctx, canvas.width, canvas.height);
        return;
    }
    
    const margin = 60;
    const width = canvas.width - 2 * margin;
    const height = canvas.height - 2 * margin;
    
    // Ejes
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(margin, margin);
    ctx.lineTo(margin, height + margin);
    ctx.lineTo(width + margin, height + margin);
    ctx.stroke();
    
    // Curva B-H (simplificada)
    const Hmax = 1000;
    const points = [];
    
    for (let i = 0; i <= 100; i++) {
        const H = (i / 100) * Hmax;
        const B = calculateBH(H, core);
        points.push({ H, B });
    }
    
    // Dibujar curva
    ctx.strokeStyle = '#667eea';
    ctx.lineWidth = 3;
    ctx.beginPath();
    
    points.forEach((point, i) => {
        const x = margin + (point.H / Hmax) * width;
        const y = height + margin - (point.B / core.bsat) * height;
        
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });
    
    ctx.stroke();
    
    // Punto actual
    if (currentB > 0) {
        const x = margin + width / 2;
        const y = height + margin - (currentB / core.bsat) * height;
        
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(x, y, 8, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = '#e2e8f0';
        ctx.font = '12px Arial';
        ctx.fillText(`B = ${(currentB * 1000).toFixed(1)} mT`, x + 15, y);
    }
    
    // Línea de saturación
    const satY = height + margin - 0.9 * height;
    ctx.strokeStyle = '#ef4444';
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(margin, satY);
    ctx.lineTo(width + margin, satY);
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Etiquetas
    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('H (A/m)', width/2 + margin, height + margin + 40);
    
    ctx.save();
    ctx.translate(20, height/2 + margin);
    ctx.rotate(-Math.PI/2);
    ctx.fillText('B (T)', 0, 0);
    ctx.restore();
    
    ctx.textAlign = 'right';
    ctx.fillText(`Bsat = ${core.bsat} T`, width + margin - 10, margin + 20);
}

// Calcular B-H (curva de magnetización simplificada)
function calculateBH(H, core) {
    const mu = CONSTANTS.mu0 * core.mu_r;
    let B = mu * H;
    
    // Saturación suave
    if (B > core.bsat * 0.7) {
        const excess = B - core.bsat * 0.7;
        B = core.bsat * 0.7 + excess * 0.3;
    }
    
    return Math.min(B, core.bsat);
}

// Dibujar curva B-H lineal (aire)
function drawLinearBH(ctx, width, height) {
    const margin = 60;
    const w = width - 2 * margin;
    const h = height - 2 * margin;
    
    // Ejes
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(margin, margin);
    ctx.lineTo(margin, h + margin);
    ctx.lineTo(w + margin, h + margin);
    ctx.stroke();
    
    // Línea recta
    ctx.strokeStyle = '#667eea';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(margin, h + margin);
    ctx.lineTo(w + margin, margin);
    ctx.stroke();
    
    // Etiquetas
    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('H (A/m)', w/2 + margin, h + margin + 40);
    ctx.fillText('Relación Lineal - Sin Saturación', w/2 + margin, margin - 20);
}

// Dibujar transformador
function drawTransformer(results) {
    const canvas = document.getElementById('transformerCanvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const newWidth = canvas.offsetWidth;
    if (canvas.width !== newWidth) canvas.width = newWidth;
    if (canvas.height !== 400) canvas.height = 400;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    _canvasBg(ctx, canvas.width, canvas.height);

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const coreWidth = 40;
    const coreHeight = 200;
    const coilWidth = 60;
    
    const core = coreDatabase[results.coreType];
    
    // Dibujar núcleo E-I
    ctx.fillStyle = core.color;
    ctx.fillRect(centerX - coreWidth/2, centerY - coreHeight/2, coreWidth, coreHeight);
    
    // Primario (izquierda)
    ctx.strokeStyle = '#ff6b35';
    ctx.lineWidth = 3;
    const primaryTurns = Math.min(results.nPrimary / 5, 30);
    
    for (let i = 0; i < primaryTurns; i++) {
        const y = centerY - coreHeight/2 + 20 + (i * (coreHeight - 40) / primaryTurns);
        ctx.beginPath();
        ctx.arc(centerX - coreWidth/2 - coilWidth/2, y, coilWidth/2, -Math.PI/2, Math.PI/2);
        ctx.stroke();
    }
    
    // Secundario (derecha)
    ctx.strokeStyle = '#4ecdc4';
    const secondaryTurns = Math.min(results.nSecondary / 5, 30);
    
    for (let i = 0; i < secondaryTurns; i++) {
        const y = centerY - coreHeight/2 + 20 + (i * (coreHeight - 40) / secondaryTurns);
        ctx.beginPath();
        ctx.arc(centerX + coreWidth/2 + coilWidth/2, y, coilWidth/2, Math.PI/2, -Math.PI/2);
        ctx.stroke();
    }
    
    // Etiquetas
    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('PRIMARIO', centerX - coreWidth/2 - coilWidth/2, centerY - coreHeight/2 - 20);
    ctx.fillText(`${results.nPrimary} vueltas`, centerX - coreWidth/2 - coilWidth/2, centerY + coreHeight/2 + 40);
    
    ctx.fillText('SECUNDARIO', centerX + coreWidth/2 + coilWidth/2, centerY - coreHeight/2 - 20);
    ctx.fillText(`${results.nSecondary} vueltas`, centerX + coreWidth/2 + coilWidth/2, centerY + coreHeight/2 + 40);
    
    ctx.fillText(core.name, centerX, centerY);
}

// Dibujar gráfico de comparación
function drawComparisonChart(results) {
    const canvas = document.getElementById('comparisonChart');
    if (!canvas || !canvas.getContext) return;
    
    const ctx = canvas.getContext('2d');
    
    // Destruir gráfico anterior si existe
    if (window.comparisonChartInstance) {
        window.comparisonChartInstance.destroy();
    }
    
    const labels = results.map(r => r.name);
    const losses = results.map(r => r.totalLoss);
    const weights = results.map(r => r.weight);
    const costs = results.map(r => r.cost);
    
    window.comparisonChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Pérdidas Totales (W)',
                    data: losses,
                    backgroundColor: 'rgba(239, 68, 68, 0.6)',
                    borderColor: 'rgba(239, 68, 68, 1)',
                    borderWidth: 2,
                    yAxisID: 'y'
                },
                {
                    label: 'Peso (g)',
                    data: weights,
                    backgroundColor: 'rgba(59, 130, 246, 0.6)',
                    borderColor: 'rgba(59, 130, 246, 1)',
                    borderWidth: 2,
                    yAxisID: 'y1'
                },
                {
                    label: 'Costo ($)',
                    data: costs,
                    backgroundColor: 'rgba(16, 185, 129, 0.6)',
                    borderColor: 'rgba(16, 185, 129, 1)',
                    borderWidth: 2,
                    yAxisID: 'y2'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                title: {
                    display: true,
                    text: 'Comparación de Materiales de Núcleo',
                    font: { size: 18, weight: 'bold' }
                },
                legend: {
                    display: true,
                    position: 'top'
                }
            },
            scales: {
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    title: {
                        display: true,
                        text: 'Pérdidas (W)'
                    }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    title: {
                        display: true,
                        text: 'Peso (g)'
                    },
                    grid: {
                        drawOnChartArea: false
                    }
                },
                y2: {
                    type: 'linear',
                    display: false,
                    position: 'right'
                }
            }
        }
    });
}