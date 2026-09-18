/* ============================================================================
   SCRIPT.JS
   ----------------------------------------------------------------------------
   Arquitetura do arquivo (nessa ordem):

     1. Utils            — funções auxiliares genéricas (easing, clamp, etc.)
     2. Validator         — validação de config.js e regras de elegibilidade
     3. WeightedRandom     — LÓGICA: sorteio ponderado dos prêmios
     4. WheelRenderer      — RENDERIZAÇÃO: desenha os segmentos no <canvas>
     5. WheelAnimator      — ANIMAÇÃO: controla a rotação da roleta
     6. AudioManager       — ÁUDIO: efeitos sonoros (com fallback silencioso)
     7. HistoryManager     — histórico de sorteios (localStorage)
     8. AdminPanel         — INTERFACE: painel administrativo discreto
     9. App                — INTERFACE: orquestra tudo (estado + eventos)

   Nenhum módulo depende de bibliotecas externas. Tudo roda 100% no navegador,
   sem necessidade de servidor/backend — basta abrir index.html.
   ============================================================================ */

'use strict';

(function () {

  /* ==========================================================================
     ESTADO GLOBAL DA APLICAÇÃO (compartilhado entre os módulos abaixo)
     ========================================================================== */
  let prizesState = [];   // cópia editável de CONFIG.prizes (permite ajustes no painel admin sem tocar no arquivo original)
  let isSpinning = false; // trava usada para impedir cliques/giros simultâneos


  /* ==========================================================================
     1. UTILS
     ========================================================================== */
  const Utils = {
    clamp(value, min, max) {
      return Math.min(max, Math.max(min, value));
    },

    toRad(deg) {
      return (deg * Math.PI) / 180;
    },

    // Copia os prêmios da configuração para que possamos alterá-los em tempo
    // de execução (painel admin) sem modificar o objeto original CONFIG.
    clonePrizes(prizes) {
      return (prizes || []).map((p) => ({ ...p }));
    },

    // Decide se o texto sobre um segmento deve ser claro ou escuro, com base
    // no brilho da cor de fundo. Garante contraste legível mesmo se o usuário
    // escolher cores claras (ex.: amarelo) para um prêmio no config.js.
    contrastColor(hexColor) {
      const hex = String(hexColor || '').replace('#', '');
      if (hex.length !== 3 && hex.length !== 6) return '#ffffff';

      const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
      const r = parseInt(full.slice(0, 2), 16);
      const g = parseInt(full.slice(2, 4), 16);
      const b = parseInt(full.slice(4, 6), 16);
      if ([r, g, b].some((v) => isNaN(v))) return '#ffffff';

      // luminância relativa aproximada (fórmula YIQ)
      const luminance = (r * 299 + g * 587 + b * 114) / 1000;
      return luminance > 150 ? '#1a1030' : '#ffffff';
    },

    // Funções de easing do tipo "ease-out": começam rápidas e desaceleram.
    // Quanto maior o expoente, mais "peso" a roleta parece ter no final.
    easings: {
      cubic: (t) => 1 - Math.pow(1 - t, 3),
      quart: (t) => 1 - Math.pow(1 - t, 4),
      expo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
    },
  };


  /* ==========================================================================
     2. VALIDATOR
     ========================================================================== */
  const Validator = {
    // Um prêmio só participa do sorteio/roleta se: estiver ativo, tiver nome,
    // tiver peso numérico > 0 e (se houver controle de estoque) estoque > 0.
    isPrizeEligible(p) {
      if (!p) return false;
      if (p.active === false) return false;
      if (typeof p.name !== 'string' || p.name.trim() === '') return false;
      if (typeof p.weight !== 'number' || !isFinite(p.weight) || p.weight <= 0) return false;
      if (p.stock !== null && p.stock !== undefined && p.stock <= 0) return false;
      return true;
    },

    // Verifica CONFIG.prizes e retorna uma lista de avisos (não fatais) mais
    // uma flag indicando se existe ao menos um prêmio elegível para sortear.
    validateConfig(config) {
      const issues = [];

      if (!config) {
        issues.push('CONFIG não foi encontrado. Verifique se config.js foi carregado antes de script.js.');
        return { issues, hasEligible: false };
      }

      if (!Array.isArray(config.prizes) || config.prizes.length === 0) {
        issues.push('CONFIG.prizes está vazio. Adicione ao menos um prêmio no array "prizes".');
        return { issues, hasEligible: false };
      }

      config.prizes.forEach((p, i) => {
        const label = p && p.name ? `"${p.name}"` : `índice ${i}`;
        if (!p || typeof p.name !== 'string' || p.name.trim() === '') {
          issues.push(`Prêmio no índice ${i} não possui um nome válido.`);
        }
        if (!p || typeof p.weight !== 'number' || !isFinite(p.weight)) {
          issues.push(`Prêmio ${label} possui peso inválido (deve ser um número).`);
        } else if (p.weight < 0) {
          issues.push(`Prêmio ${label} possui peso negativo (${p.weight}) e será ignorado no sorteio.`);
        } else if (p.weight === 0) {
          issues.push(`Prêmio ${label} possui peso 0 e nunca será sorteado.`);
        }
      });

      const hasEligible = config.prizes.some((p) => Validator.isPrizeEligible(p));
      if (!hasEligible) {
        issues.push('Nenhum prêmio elegível (ativo, com nome e peso > 0). A roleta ficará desabilitada.');
      }

      return { issues, hasEligible };
    },
  };


  /* ==========================================================================
     3. WEIGHTED RANDOM — sorteio ponderado
     ==========================================================================
     Como funciona selectWeightedPrize():

       1. Filtra apenas os prêmios elegíveis (ativos, com peso > 0, com
          estoque disponível).
       2. Soma todos os pesos elegíveis (peso total).
       3. Sorteia um número aleatório entre 0 e o peso total.
       4. Percorre os prêmios subtraindo o peso de cada um desse número
          sorteado. O prêmio em que o número "zera" é o vencedor.

     Isso é equivalente a dividir uma régua de 0 até o peso total em blocos
     proporcionais ao peso de cada prêmio e sortear um ponto aleatório nela —
     blocos maiores (pesos maiores) têm mais chance de conter o ponto.
     ========================================================================== */
  const WeightedRandom = {
    select(prizes) {
      const eligible = prizes.filter(Validator.isPrizeEligible);
      if (eligible.length === 0) return null;

      const totalWeight = eligible.reduce((sum, p) => sum + p.weight, 0);
      if (!(totalWeight > 0)) return null;

      let random = Math.random() * totalWeight;

      for (const prize of eligible) {
        random -= prize.weight;
        if (random <= 0) {
          return prize;
        }
      }

      // Rede de segurança para erros de ponto flutuante (não deveria ser
      // atingido na prática, mas garante que a função sempre retorne algo).
      return eligible[eligible.length - 1];
    },
  };


  /* ==========================================================================
     4. WHEEL RENDERER — desenha a roleta no <canvas>
     ==========================================================================
     Os segmentos são desenhados com o MESMO tamanho visual entre si,
     independentemente do peso configurado. Isso é proposital: o convidado
     não deve conseguir "advinhar" a probabilidade apenas olhando para o
     tamanho das fatias. Quem decide o resultado é sempre o sorteio ponderado
     (WeightedRandom), não a geometria da roleta.
     ========================================================================== */
  const WheelRenderer = {
    canvas: null,
    ctx: null,
    segments: [], // prêmios atualmente desenhados, na mesma ordem dos segmentos

    init(canvasEl) {
      this.canvas = canvasEl;
      this.ctx = canvasEl.getContext('2d');
    },

    render(prizes) {
      const eligible = prizes.filter(Validator.isPrizeEligible);
      this.segments = eligible;

      const canvas = this.canvas;
      const ctx = this.ctx;
      if (!canvas || !ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const displaySize = Math.max(canvas.clientWidth || 0, 240);

      canvas.width = displaySize * dpr;
      canvas.height = displaySize * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, displaySize, displaySize);

      if (eligible.length === 0) return; // App exibe o estado vazio por cima

      const radius = displaySize / 2;
      const center = radius;
      const segAngleDeg = 360 / eligible.length;
      const palette = (window.CONFIG && CONFIG.palette) || ['#6D4AFF', '#1B1F4B', '#FBA83C'];
      const showGap = !!(window.CONFIG && CONFIG.wheel && CONFIG.wheel.segmentGap);

      eligible.forEach((prize, i) => {
        // -90° = topo da roleta (onde fica o ponteiro); avança em sentido horário.
        const startDeg = -90 + i * segAngleDeg;
        const endDeg = startDeg + segAngleDeg;
        const startRad = Utils.toRad(startDeg);
        const endRad = Utils.toRad(endDeg);
        const midRad = Utils.toRad(startDeg + segAngleDeg / 2);

        // fatia colorida
        ctx.beginPath();
        ctx.moveTo(center, center);
        ctx.arc(center, center, radius, startRad, endRad);
        ctx.closePath();
        const segmentColor = prize.color || palette[i % palette.length];
        ctx.fillStyle = segmentColor;
        ctx.fill();

        if (showGap) {
          ctx.strokeStyle = 'rgba(255,255,255,0.14)';
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        // texto do prêmio, desenhado ao longo do raio
        this._drawLabel(ctx, prize.name, midRad, center, radius, segmentColor);
      });
    },

    // Desenha o texto do prêmio alinhado radialmente. Na metade esquerda da
    // roleta o texto é invertido (+180°) para não ficar de cabeça para baixo.
    _drawLabel(ctx, text, midRad, center, radius, segmentColor) {
      // O tamanho da fonte acompanha o raio da roleta (telas menores => texto
      // menor, cabendo mais caracteres) e também a quantidade de segmentos.
      const count = this.segments.length;
      const ratio = count > 10 ? 0.05 : count > 6 ? 0.056 : 0.064;
      const fontSize = Math.round(Utils.clamp(radius * ratio, 10, 20));
      ctx.save();
      ctx.translate(center, center);

      const normalized = ((midRad % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      const pointsLeft = normalized > Math.PI / 2 && normalized < (3 * Math.PI) / 2;

      let rotation = midRad;
      let align = 'right';
      let xPos = radius - 18;
      if (pointsLeft) {
        rotation = midRad + Math.PI;
        align = 'left';
        xPos = -(radius - 18);
      }

      ctx.rotate(rotation);
      ctx.textAlign = align;
      ctx.textBaseline = 'middle';
      ctx.fillStyle = Utils.contrastColor(segmentColor);
      ctx.font = `600 ${fontSize}px Inter, system-ui, sans-serif`;

      const maxWidth = radius * 0.72;
      ctx.fillText(this._fitText(ctx, String(text || ''), maxWidth), xPos, 0);
      ctx.restore();
    },

    // Trunca o texto com reticências caso não caiba no espaço do segmento.
    _fitText(ctx, text, maxWidth) {
      if (ctx.measureText(text).width <= maxWidth) return text;
      let truncated = text;
      while (truncated.length > 1 && ctx.measureText(truncated + '…').width > maxWidth) {
        truncated = truncated.slice(0, -1);
      }
      return truncated + '…';
    },

    indexOf(prize) {
      return this.segments.indexOf(prize);
    },
  };


  /* ==========================================================================
     5. WHEEL ANIMATOR — controla a rotação/animação da roleta
     ==========================================================================
     A rotação NUNCA é usada para decidir o prêmio — o vencedor já foi
     definido por WeightedRandom.select() antes desta função ser chamada.
     Aqui só calculamos o ângulo necessário para a roleta parar exatamente
     sobre o segmento correspondente ao vencedor.
     ========================================================================== */
  const WheelAnimator = {
    currentRotation: 0, // graus (mantido normalizado entre 0 e 360)
    animating: false,

    // Normaliza qualquer ângulo para a faixa 0–360.
    _norm(deg) {
      return ((deg % 360) + 360) % 360;
    },

    // Usado pelo arrasto: move a roleta imediatamente, sem animação.
    setRotation(deg) {
      this.currentRotation = deg;
      const canvas = WheelRenderer.canvas;
      if (canvas) canvas.style.transform = `rotate(${deg}deg)`;
    },

    /**
     * Anima até o segmento vencedor.
     * options: { direction: 1 | -1, spins, duration }
     *   direction  1 = horário, -1 = anti-horário (segue o sentido do gesto)
     */
    spinTo(targetIndex, segmentCount, onTick, onComplete, options) {
      if (this.animating || !segmentCount) return;
      this.animating = true;

      const opts = options || {};
      const direction = opts.direction === -1 ? -1 : 1;
      const canvas = WheelRenderer.canvas;
      const segAngle = 360 / segmentCount;
      const targetMid = targetIndex * segAngle + segAngle / 2; // ângulo "custom": 0° = topo, sentido horário

      // Pequena variação aleatória dentro do próprio segmento, para o ponteiro
      // não parar sempre exatamente no centro da fatia (efeito mais orgânico).
      const maxJitter = Math.max(segAngle * 0.32 - 3, 0);
      const jitter = (Math.random() * 2 - 1) * maxJitter;

      const desiredFinalMod = this._norm(-(targetMid + jitter));
      const currentMod = this._norm(this.currentRotation);

      const spins = Math.max(1, opts.spins || (window.CONFIG && CONFIG.wheel && CONFIG.wheel.spins) || 6);

      // O quanto falta girar até o alvo depende do sentido escolhido.
      const totalDelta = direction === 1
        ? spins * 360 + this._norm(desiredFinalMod - currentMod)
        : -(spins * 360 + this._norm(currentMod - desiredFinalMod));

      const startRotation = this.currentRotation;
      const finalRotation = startRotation + totalDelta;

      const duration = Math.max(800, opts.duration || (window.CONFIG && CONFIG.wheel && CONFIG.wheel.duration) || 5000);
      const easingKey = (window.CONFIG && CONFIG.wheel && CONFIG.wheel.easing) || 'quart';
      const easingFn = Utils.easings[easingKey] || Utils.easings.quart;

      let lastSeg = Math.floor(startRotation / segAngle);
      const startTime = performance.now();

      const frame = (now) => {
        const elapsed = now - startTime;
        const t = Utils.clamp(elapsed / duration, 0, 1);
        const eased = easingFn(t);
        const rotation = startRotation + totalDelta * eased;

        if (canvas) canvas.style.transform = `rotate(${rotation}deg)`;

        // dispara o som de "tick" a cada segmento cruzado, nos dois sentidos
        const currentSeg = Math.floor(rotation / segAngle);
        if (currentSeg !== lastSeg) {
          lastSeg = currentSeg;
          if (onTick) onTick();
        }

        if (t < 1) {
          requestAnimationFrame(frame);
        } else {
          if (canvas) canvas.style.transform = `rotate(${finalRotation}deg)`;
          this.currentRotation = this._norm(finalRotation); // evita acumular números gigantes
          this.animating = false;
          if (onComplete) onComplete();
        }
      };

      requestAnimationFrame(frame);
    },
  };


  /* ==========================================================================
     5b. DRAG CONTROLLER — gesto de arrastar/deslizar para girar
     ==========================================================================
     Enquanto o dedo/cursor está pressionado, a roleta acompanha o movimento
     em tempo real. Ao soltar, medimos a velocidade angular dos últimos
     milissegundos: se o gesto teve força suficiente, ele vira um giro de
     verdade — no sentido em que foi arrastado.

     Importante: o gesto só DISPARA o giro. Quem escolhe o prêmio continua
     sendo o sorteio ponderado, exatamente como antes.
     ========================================================================== */
  const DragController = {
    frame: null,
    enabled: false,
    active: false,
    pointerId: null,
    lastAngle: 0,
    rotation: 0,
    lastSeg: 0,
    samples: [],
    onFlick: null,
    onTick: null,

    init(frameEl, onFlick, onTick) {
      this.frame = frameEl;
      this.onFlick = onFlick;
      this.onTick = onTick;
      if (!this.frame) return;

      this.frame.addEventListener('pointerdown', (e) => this._down(e));
      this.frame.addEventListener('pointermove', (e) => this._move(e));
      this.frame.addEventListener('pointerup', (e) => this._up(e));
      this.frame.addEventListener('pointercancel', (e) => this._up(e));
      // evita que o navegador interprete o gesto como rolagem da página
      this.frame.addEventListener('dragstart', (e) => e.preventDefault());
    },

    setEnabled(value) {
      this.enabled = !!value;
      if (this.frame) this.frame.classList.toggle('is-draggable', this.enabled);
    },

    // Ângulo do ponteiro em relação ao centro da roleta, em graus.
    _angle(e) {
      const r = this.frame.getBoundingClientRect();
      return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180 / Math.PI;
    },

    _down(e) {
      if (!this.enabled || isSpinning || WheelAnimator.animating) return;
      this.active = true;
      this.pointerId = e.pointerId;
      try { this.frame.setPointerCapture(e.pointerId); } catch (err) { /* navegadores antigos */ }

      this.lastAngle = this._angle(e);
      this.rotation = WheelAnimator.currentRotation;
      this.samples = [{ t: performance.now(), r: this.rotation }];
      this.lastSeg = this._segIndex(this.rotation);
      this.frame.classList.add('is-grabbing');
    },

    _move(e) {
      if (!this.active || e.pointerId !== this.pointerId) return;
      e.preventDefault();

      const angle = this._angle(e);
      let delta = angle - this.lastAngle;
      // caminho mais curto: evita um salto de 360° ao cruzar a linha dos 180°
      if (delta > 180) delta -= 360;
      else if (delta < -180) delta += 360;

      this.lastAngle = angle;
      this.rotation += delta;
      WheelAnimator.setRotation(this.rotation);

      // feedback sonoro também durante o arrasto
      const seg = this._segIndex(this.rotation);
      if (seg !== this.lastSeg) {
        this.lastSeg = seg;
        if (this.onTick) this.onTick();
      }

      this.samples.push({ t: performance.now(), r: this.rotation });
      if (this.samples.length > 12) this.samples.shift();
    },

    _up(e) {
      if (!this.active || (e.pointerId !== undefined && e.pointerId !== this.pointerId)) return;
      this.active = false;
      this.frame.classList.remove('is-grabbing');
      try { this.frame.releasePointerCapture(this.pointerId); } catch (err) { /* ignora */ }

      // velocidade angular (graus por milissegundo) dos últimos ~160 ms
      const now = performance.now();
      const recent = this.samples.filter((s) => now - s.t <= 160);
      let velocity = 0;
      if (recent.length >= 2) {
        const first = recent[0];
        const last = recent[recent.length - 1];
        const dt = last.t - first.t;
        if (dt > 0) velocity = (last.r - first.r) / dt;
      }

      this.samples = [];
      if (this.onFlick) this.onFlick(velocity);
    },

    _segIndex(rotation) {
      const count = WheelRenderer.segments.length;
      if (!count) return 0;
      return Math.floor(rotation / (360 / count));
    },
  };


  /* ==========================================================================
     6. AUDIO MANAGER
     ==========================================================================
     Se um arquivo de som não existir ou não puder ser carregado, o erro é
     apenas registrado no console — a aplicação continua funcionando
     normalmente, apenas sem aquele som.
     ========================================================================== */
  const AudioManager = {
    elements: {},
    enabled: true,
    volume: 0.6,
    _lastTick: 0,
    _fadeTimer: null,

    init() {
      const soundsConfig = (window.CONFIG && CONFIG.sounds) || {};
      this.enabled = soundsConfig.enabled !== false;

      this.elements.spin = document.getElementById('audioSpin');
      this.elements.tick = document.getElementById('audioTick');
      this.elements.win = document.getElementById('audioWin');

      this.volume = typeof soundsConfig.volume === 'number' ? Utils.clamp(soundsConfig.volume, 0, 1) : 0.6;
      Object.values(this.elements).forEach((el) => { if (el) el.volume = this.volume; });

      const files = soundsConfig.files || {};
      this._setSrc(this.elements.spin, files.spin);
      this._setSrc(this.elements.tick, files.tick);
      this._setSrc(this.elements.win, files.win);
    },

    _setSrc(el, src) {
      if (!el || !src) return;
      el.addEventListener('error', () => {
        console.warn(`[Áudio] Não foi possível carregar "${src}". Esse efeito sonoro será ignorado.`);
      }, { once: true });
      el.src = src;
    },

    _play(el) {
      if (!this.enabled || !el || !el.getAttribute('src')) return;
      try {
        el.currentTime = 0;
        const playPromise = el.play();
        if (playPromise && typeof playPromise.catch === 'function') {
          playPromise.catch(() => { /* autoplay bloqueado pelo navegador ou arquivo ausente — ignora */ });
        }
      } catch (e) {
        /* nunca deixa um erro de áudio interromper a roleta */
      }
    },

    playSpin() {
      const el = this.elements.spin;
      if (!this.enabled || !el || !el.getAttribute('src')) return;
      clearInterval(this._fadeTimer);
      el.volume = 0;
      this._play(el);
      this._fadeTo(el, this.volume, 300);
    },

    // O tick pode ser disparado dezenas de vezes por segundo no início do giro.
    // Sem um limite mínimo entre repetições, o som vira um zumbido.
    playTick() {
      const now = performance.now();
      if (now - this._lastTick < 45) return;
      this._lastTick = now;
      this._play(this.elements.tick);
    },

    playWin() { this._play(this.elements.win); },

    stopSpin() {
      const el = this.elements.spin;
      if (!el) return;
      clearInterval(this._fadeTimer);
      // some suavemente em vez de cortar o áudio de uma vez
      this._fadeTo(el, 0, 350, () => {
        try { el.pause(); el.currentTime = 0; el.volume = this.volume; } catch (e) { /* ignora */ }
      });
    },

    // Rampa de volume simples, sem depender da Web Audio API.
    _fadeTo(el, target, ms, onDone) {
      const steps = Math.max(1, Math.round(ms / 40));
      const start = el.volume;
      let i = 0;
      clearInterval(this._fadeTimer);
      this._fadeTimer = setInterval(() => {
        i += 1;
        try {
          el.volume = Utils.clamp(start + (target - start) * (i / steps), 0, 1);
        } catch (e) { /* ignora */ }
        if (i >= steps) {
          clearInterval(this._fadeTimer);
          if (onDone) onDone();
        }
      }, 40);
    },
  };


  /* ==========================================================================
     7. HISTORY MANAGER — histórico de sorteios (localStorage)
     ========================================================================== */
  const HistoryManager = {
    key: 'roleta_historico',
    enabled: true,

    init() {
      const historyConfig = (window.CONFIG && CONFIG.history) || {};
      this.enabled = historyConfig.enabled !== false;
      this.key = historyConfig.storageKey || this.key;
    },

    _read() {
      if (!this.enabled) return [];
      try {
        const raw = localStorage.getItem(this.key);
        return raw ? JSON.parse(raw) : [];
      } catch (e) {
        console.warn('[Histórico] Não foi possível ler o localStorage.', e);
        return [];
      }
    },

    add(prizeName) {
      if (!this.enabled) return;
      try {
        const list = this._read();
        list.unshift({ name: prizeName, time: Date.now() });
        localStorage.setItem(this.key, JSON.stringify(list.slice(0, 500)));
      } catch (e) {
        console.warn('[Histórico] Não foi possível salvar no localStorage.', e);
      }
    },

    getAll() {
      return this._read();
    },

    clear() {
      try { localStorage.removeItem(this.key); } catch (e) { /* ignora */ }
    },
  };


  /* ==========================================================================
     8. ADMIN PANEL — painel administrativo discreto (INTERFACE)
     ========================================================================== */
  const AdminPanel = {
    unlocked: false,

    init() {
      document.getElementById('adminToggle').addEventListener('click', () => this.open());
      document.getElementById('adminClose').addEventListener('click', () => this.close());
      document.getElementById('adminBackdrop').addEventListener('click', () => this.close());
      document.getElementById('adminPinSubmit').addEventListener('click', () => this.checkPin());
      document.getElementById('adminPinInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') this.checkPin();
      });
      document.getElementById('clearHistoryButton').addEventListener('click', () => {
        HistoryManager.clear();
        this.renderStats();
        this.renderHistory();
      });

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { this.close(); return; }

        const sc = window.CONFIG && CONFIG.admin && CONFIG.admin.shortcut;
        if (!sc || !sc.key) return;
        const keyMatches = e.key && e.key.toLowerCase() === sc.key.toLowerCase();
        if (
          keyMatches &&
          !!e.ctrlKey === !!sc.ctrlKey &&
          !!e.altKey === !!sc.altKey &&
          !!e.shiftKey === !!sc.shiftKey
        ) {
          e.preventDefault();
          this.open();
        }
      });
    },

    open() {
      const adminConfig = (window.CONFIG && CONFIG.admin) || {};
      if (adminConfig.enabled === false) return;

      document.getElementById('adminPanel').hidden = false;

      const needsPin = !!adminConfig.pin && !this.unlocked;
      document.getElementById('adminPinGate').hidden = !needsPin;
      document.getElementById('adminContent').style.display = needsPin ? 'none' : '';

      if (needsPin) {
        const input = document.getElementById('adminPinInput');
        input.value = '';
        document.getElementById('adminPinError').hidden = true;
        setTimeout(() => input.focus(), 30);
      } else {
        this.renderAll();
      }
    },

    close() {
      document.getElementById('adminPanel').hidden = true;
    },

    checkPin() {
      const input = document.getElementById('adminPinInput');
      const adminConfig = (window.CONFIG && CONFIG.admin) || {};
      if (input.value === adminConfig.pin) {
        this.unlocked = true;
        document.getElementById('adminPinGate').hidden = true;
        document.getElementById('adminContent').style.display = '';
        this.renderAll();
      } else {
        document.getElementById('adminPinError').hidden = false;
      }
    },

    renderAll() {
      this.renderPrizeTable();
      this.renderStats();
      this.renderHistory();
    },

    renderPrizeTable() {
      const tbody = document.getElementById('prizeTableBody');
      tbody.innerHTML = '';

      const totalWeight = prizesState.reduce(
        (sum, p) => sum + (Validator.isPrizeEligible(p) ? p.weight : 0), 0
      );

      prizesState.forEach((prize, index) => {
        const tr = document.createElement('tr');
        if (!Validator.isPrizeEligible(prize)) tr.classList.add('is-inactive');

        const probability = totalWeight > 0 && Validator.isPrizeEligible(prize)
          ? ((prize.weight / totalWeight) * 100).toFixed(1) + '%'
          : '—';

        const stockLabel = prize.stock === null || prize.stock === undefined ? '∞' : prize.stock;
        const safeName = escapeHtml(prize.name || '(sem nome)');

        tr.innerHTML =
          '<td>' + safeName + '</td>' +
          '<td><input type="number" min="0" step="1" value="' + Number(prize.weight || 0) +
            '" data-role="weight" data-index="' + index + '" aria-label="Peso de ' + safeName + '"></td>' +
          '<td>' + probability + '</td>' +
          '<td>' + stockLabel + '</td>' +
          '<td><input type="checkbox" data-role="active" data-index="' + index + '" ' +
            (prize.active !== false ? 'checked' : '') + ' aria-label="Ativar ou desativar ' + safeName + '"></td>';

        tbody.appendChild(tr);
      });

      tbody.querySelectorAll('[data-role="weight"]').forEach((input) => {
        input.addEventListener('change', (e) => {
          const idx = Number(e.target.dataset.index);
          const val = Number(e.target.value);
          prizesState[idx].weight = isFinite(val) && val >= 0 ? val : 0;
          this.renderPrizeTable();
          if (!isSpinning) renderWheelSafely();
        });
      });

      tbody.querySelectorAll('[data-role="active"]').forEach((input) => {
        input.addEventListener('change', (e) => {
          const idx = Number(e.target.dataset.index);
          prizesState[idx].active = e.target.checked;
          this.renderPrizeTable();
          if (!isSpinning) renderWheelSafely();
        });
      });
    },

    renderStats() {
      const history = HistoryManager.getAll();
      const counts = {};
      history.forEach((h) => { counts[h.name] = (counts[h.name] || 0) + 1; });
      const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];

      document.getElementById('adminStats').innerHTML =
        '<div class="admin-stat"><strong>' + history.length + '</strong><span>Total de giros</span></div>' +
        '<div class="admin-stat"><strong>' + (top ? escapeHtml(top[0]) : '—') + '</strong><span>Mais sorteado</span></div>';
    },

    renderHistory() {
      const list = document.getElementById('adminHistory');
      const history = HistoryManager.getAll();

      if (history.length === 0) {
        list.innerHTML = '<li class="admin-history__empty">Nenhum giro registrado ainda.</li>';
        return;
      }

      list.innerHTML = history.slice(0, 100).map((entry) => {
        const time = new Date(entry.time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        return '<li><span>' + escapeHtml(entry.name) + '</span><span class="admin-history__time">' + time + '</span></li>';
      }).join('');
    },
  };

  function refreshAdminPanelIfOpen() {
    const panel = document.getElementById('adminPanel');
    if (!panel || panel.hidden) return;
    const pinRequired = !!(window.CONFIG && CONFIG.admin && CONFIG.admin.pin);
    if (!pinRequired || AdminPanel.unlocked) AdminPanel.renderAll();
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }


  /* ==========================================================================
     9. APP — orquestração geral (estado, eventos, INTERFACE)
     ========================================================================== */

  function applyStaticContent() {
    const company = (window.CONFIG && CONFIG.company) || {};
    const event = (window.CONFIG && CONFIG.event) || {};
    const texts = (window.CONFIG && CONFIG.texts) || {};

    document.title = company.name ? `${company.name} — Roleta de Brindes` : 'Roleta de Brindes';

    const logo = document.getElementById('companyLogo');
    if (company.showLogo !== false && company.logo) {
      logo.alt = company.name ? `Logo ${company.name}` : 'Logo da empresa';
      logo.style.height = (company.logoHeight || 44) + 'px';
      logo.onerror = () => { logo.hidden = true; };
      logo.src = company.logo;
      logo.hidden = false;
    } else {
      logo.hidden = true;
    }

    // Logo no centro da roleta (miolo). Usa a mesma imagem do cabeçalho; se
    // ela não existir/carregar, o miolo simplesmente fica liso — não quebra.
    const hubLogo = document.getElementById('wheelHubLogo');
    if (company.showLogoInWheel !== false && company.logo) {
      hubLogo.alt = company.name ? `Logo ${company.name}` : '';
      hubLogo.onerror = () => { hubLogo.hidden = true; };
      hubLogo.src = company.logo;
      hubLogo.hidden = false;
    } else {
      hubLogo.hidden = true;
    }

    const eventNameEl = document.getElementById('eventName');
    if (event.showName !== false && event.name) {
      eventNameEl.textContent = event.name;
      eventNameEl.hidden = false;
    } else {
      eventNameEl.hidden = true;
    }

    const mode = ((window.CONFIG && CONFIG.interaction && CONFIG.interaction.mode) || 'drag').toLowerCase();
    const mostraBotao = mode === 'button' || mode === 'both';
    const mostraDica = mode === 'drag' || mode === 'both';

    document.getElementById('spinButton').hidden = !mostraBotao;
    document.getElementById('dragHint').hidden = !mostraDica;
    setHint(texts.dragHint || 'Arraste a roleta para girar');

    setText('spinButtonLabel', texts.spinButton || 'GIRAR');
    setText('resultSubtitle', texts.resultSubtitle || 'Você ganhou:');
    setText('resultTitle', texts.resultTitle || 'PARABÉNS!');
    setText('closeResultButton', texts.closeResultLabel || 'Fechar');
    setText('emptyStateTitle', texts.emptyStateTitle || 'Roleta indisponível');
    setText('emptyStateMessage', texts.emptyStateMessage || 'Nenhum prêmio disponível no momento.');
    setText('footerNote', texts.footerNote || '');
  }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function preloadPrizeImages(prizes) {
    prizes.forEach((p) => {
      if (!p || !p.image) return;
      const img = new Image();
      img.onerror = () => console.warn(`[Prêmios] Imagem não encontrada para "${p.name}": ${p.image}`);
      img.src = p.image;
    });
  }

  function renderWheelSafely() {
    const eligible = prizesState.filter(Validator.isPrizeEligible);
    if (eligible.length === 0) {
      showEmptyState();
      return;
    }
    hideEmptyState();
    if (!isSpinning) {
      document.getElementById('spinButton').disabled = false;
      DragController.setEnabled(interactionAllowsDrag());
    }
    WheelRenderer.render(prizesState);
  }

  function showEmptyState() {
    document.getElementById('emptyState').hidden = false;
    document.getElementById('spinButton').disabled = true;
    DragController.setEnabled(false);
    const hint = document.getElementById('dragHint');
    if (hint) hint.hidden = true;
  }

  // O arrasto vale nos modos "drag" (padrão) e "both".
  function interactionAllowsDrag() {
    const mode = ((window.CONFIG && CONFIG.interaction && CONFIG.interaction.mode) || 'drag').toLowerCase();
    return mode === 'drag' || mode === 'both';
  }

  function hideEmptyState() {
    document.getElementById('emptyState').hidden = true;
  }

  function setSpinButtonState(spinning) {
    const btn = document.getElementById('spinButton');
    const label = document.getElementById('spinButtonLabel');
    const texts = (window.CONFIG && CONFIG.texts) || {};
    btn.disabled = spinning;
    btn.classList.toggle('is-spinning', spinning);
    btn.setAttribute('aria-busy', spinning ? 'true' : 'false');
    label.textContent = spinning ? (texts.spinningButton || 'GIRANDO...') : (texts.spinButton || 'GIRAR');
  }

  /**
   * Ponto único de partida de qualquer giro — venha ele do gesto, do teclado
   * ou do botão. options: { direction, velocity }
   */
  function startSpin(options) {
    // Proteções: nada de dois giros ao mesmo tempo.
    if (isSpinning || WheelAnimator.animating) return;

    const eligible = prizesState.filter(Validator.isPrizeEligible);
    if (eligible.length === 0) {
      showEmptyState();
      return;
    }

    // 1) o prêmio é decidido AQUI, pelo sorteio ponderado
    const winner = WeightedRandom.select(prizesState);
    if (!winner) {
      showEmptyState();
      return;
    }

    // 2) descobrimos em qual segmento ele está desenhado
    const targetIndex = WheelRenderer.indexOf(winner);
    if (targetIndex === -1) {
      console.error('[Roleta] O prêmio sorteado não corresponde a nenhum segmento desenhado.');
      return;
    }

    const opts = options || {};
    const interaction = (window.CONFIG && CONFIG.interaction) || {};
    const velocity = Math.abs(opts.velocity || 0);

    // 3) gestos mais fortes rendem mais voltas (e um giro um pouco mais longo)
    let extraSpins = 0;
    if (interaction.spinsFromFlick !== false && velocity > 0) {
      const teto = typeof interaction.maxExtraSpins === 'number' ? interaction.maxExtraSpins : 5;
      extraSpins = Math.round(Utils.clamp(velocity * 1.6, 0, teto));
    }

    const baseSpins = (window.CONFIG && CONFIG.wheel && CONFIG.wheel.spins) || 6;
    const baseDuration = (window.CONFIG && CONFIG.wheel && CONFIG.wheel.duration) || 5000;

    isSpinning = true;
    DragController.setEnabled(false);
    setSpinButtonState(true);
    setHint(((window.CONFIG && CONFIG.texts) || {}).spinningHint || 'Boa sorte...');
    AudioManager.playSpin();

    // 4) a animação apenas leva a roleta até o resultado que já foi definido
    WheelAnimator.spinTo(
      targetIndex,
      WheelRenderer.segments.length,
      () => AudioManager.playTick(),
      () => onSpinComplete(winner),
      {
        direction: opts.direction === -1 ? -1 : 1,
        spins: baseSpins + extraSpins,
        duration: Math.min(baseDuration + extraSpins * 260, baseDuration + 1600),
      }
    );
  }

  /** Chamado quando o usuário solta a roleta após arrastá-la. */
  function handleFlick(velocity) {
    const interaction = (window.CONFIG && CONFIG.interaction) || {};
    const texts = (window.CONFIG && CONFIG.texts) || {};
    const minimo = typeof interaction.minFlickSpeed === 'number' ? interaction.minFlickSpeed : 0.3;

    // Gesto fraco (ou só um toque): a roleta fica onde parou e nada é sorteado.
    // Isso evita giros acidentais quando alguém apenas encosta na tela.
    if (Math.abs(velocity) < minimo) {
      flashHint(texts.dragHintWeak || 'Deslize com um pouco mais de força');
      return;
    }

    startSpin({ direction: velocity < 0 ? -1 : 1, velocity });
  }

  function setHint(texto) {
    const el = document.getElementById('dragHintText');
    if (el) el.textContent = texto;
  }

  // Mostra uma mensagem passageira e volta para a dica padrão.
  let hintTimer = null;
  function flashHint(texto) {
    const hint = document.getElementById('dragHint');
    const texts = (window.CONFIG && CONFIG.texts) || {};
    setHint(texto);
    if (hint) {
      hint.classList.add('is-flash');
      clearTimeout(hintTimer);
      hintTimer = setTimeout(() => {
        hint.classList.remove('is-flash');
        setHint(texts.dragHint || 'Arraste a roleta para girar');
      }, 1800);
    }
  }

  function onSpinComplete(winner) {
    isSpinning = false;
    AudioManager.stopSpin();
    AudioManager.playWin();
    setSpinButtonState(false);
    setHint(((window.CONFIG && CONFIG.texts) || {}).dragHint || 'Arraste a roleta para girar');

    // Controle de estoque (preparado para uso futuro): decrementa e, ao
    // chegar a zero, remove o prêmio automaticamente do sorteio.
    if (typeof winner.stock === 'number') {
      winner.stock = Math.max(0, winner.stock - 1);
      if (winner.stock <= 0) winner.active = false;
    }

    HistoryManager.add(winner.name);
    showResult(winner);
    renderWheelSafely();
    refreshAdminPanelIfOpen();
  }

  function showResult(winner) {
    const nameEl = document.getElementById('resultPrizeName');
    const imgEl = document.getElementById('resultPrizeImage');

    nameEl.textContent = winner.name;

    if (winner.image) {
      imgEl.onerror = () => { imgEl.hidden = true; };
      imgEl.alt = winner.name;
      imgEl.src = winner.image;
      imgEl.hidden = false;
    } else {
      imgEl.hidden = true;
      imgEl.removeAttribute('src');
    }

    spawnConfetti();

    const overlay = document.getElementById('resultOverlay');
    overlay.hidden = false;
    document.getElementById('closeResultButton').focus();
  }

  function hideResult() {
    document.getElementById('resultOverlay').hidden = true;
    document.getElementById('confettiLayer').innerHTML = '';

    // devolve o foco para o elemento que aciona o próximo giro
    const botao = document.getElementById('spinButton');
    const alvo = botao && !botao.hidden ? botao : document.getElementById('wheelFrame');
    if (alvo) alvo.focus();
  }

  function spawnConfetti() {
    const layer = document.getElementById('confettiLayer');
    layer.innerHTML = '';

    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) return;

    // Cores do confete: tons claros da marca. Não usamos a paleta dos
    // segmentos porque ela contém tons escuros, que sumiriam sobre o modal.
    const colors = ['#fcb238', '#ffd08a', '#ffffff', '#e8861a'];
    const count = 26;

    for (let i = 0; i < count; i++) {
      const piece = document.createElement('span');
      piece.className = 'confetti-piece';
      piece.style.left = Math.random() * 100 + '%';
      piece.style.background = colors[i % colors.length];
      piece.style.animationDuration = 900 + Math.random() * 700 + 'ms';
      piece.style.animationDelay = Math.random() * 250 + 'ms';
      piece.style.transform = `rotate(${Math.random() * 360}deg)`;
      layer.appendChild(piece);
    }
  }

  function initFullscreen() {
    const btn = document.getElementById('fullscreenButton');
    const texts = (window.CONFIG && CONFIG.texts) || {};

    btn.addEventListener('click', async () => {
      try {
        if (!document.fullscreenElement) {
          await document.documentElement.requestFullscreen();
        } else {
          await document.exitFullscreen();
        }
      } catch (e) {
        console.warn('[Tela cheia] Não foi possível alternar o modo de tela cheia neste navegador.', e);
      }
    });

    document.addEventListener('fullscreenchange', () => {
      const active = !!document.fullscreenElement;
      btn.setAttribute('aria-label', active
        ? (texts.fullscreenExit || 'Sair da tela cheia')
        : (texts.fullscreenEnter || 'Tela cheia'));
    });
  }

  function initApp() {
    const validation = Validator.validateConfig(window.CONFIG);
    validation.issues.forEach((msg) => console.warn('[Config] ' + msg));

    prizesState = Utils.clonePrizes(window.CONFIG && CONFIG.prizes);

    applyStaticContent();
    preloadPrizeImages(prizesState);

    WheelRenderer.init(document.getElementById('wheelCanvas'));
    AudioManager.init();
    HistoryManager.init();
    AdminPanel.init();
    initFullscreen();

    renderWheelSafely();

    // Gesto de arrastar/deslizar (mouse, dedo ou caneta)
    const wheelFrame = document.getElementById('wheelFrame');
    DragController.init(wheelFrame, handleFlick, () => AudioManager.playTick());

    // Teclado: a roleta é focável e responde a Enter/Espaço em qualquer modo
    wheelFrame.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        startSpin({ direction: 1 });
      }
    });

    // Botão clássico, usado apenas se interaction.mode for "button" ou "both"
    document.getElementById('spinButton').addEventListener('click', () => startSpin({ direction: 1 }));
    document.getElementById('closeResultButton').addEventListener('click', hideResult);
    document.getElementById('resultOverlay').addEventListener('click', (e) => {
      if (e.target.id === 'resultOverlay') hideResult();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const overlay = document.getElementById('resultOverlay');
        if (!overlay.hidden) hideResult();
      }
    });

    // Redesenha a roleta ao redimensionar a janela (com debounce) e após o
    // carregamento completo da página, garantindo que o <canvas> tenha o
    // tamanho correto mesmo se a fonte/CSS ainda estiver sendo aplicada.
    let resizeTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => { if (!isSpinning) renderWheelSafely(); }, 150);
    });
    window.addEventListener('load', () => { if (!isSpinning) renderWheelSafely(); });
  }

  document.addEventListener('DOMContentLoaded', () => {
    try {
      initApp();
    } catch (err) {
      // Rede de segurança final: qualquer erro inesperado na inicialização
      // exibe uma mensagem amigável em vez de deixar a tela em branco.
      console.error('[Roleta] Erro ao iniciar a aplicação:', err);
      const empty = document.getElementById('emptyState');
      if (empty) {
        empty.hidden = false;
        setText('emptyStateMessage', 'Ocorreu um erro ao carregar a configuração. Verifique o console (F12).');
      }
      const btn = document.getElementById('spinButton');
      if (btn) btn.disabled = true;
    }
  });

})();
