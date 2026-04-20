/* ═══════════════════════════════════════════════════════════
   main.js — ARI Landing Page
   Arck1Pro · Ativo de Renda Imobiliária
═══════════════════════════════════════════════════════════ */

/* ─── RASTREAMENTO DE CTA ───────────────────────────────── */
// NOVO: armazena qual botão de CTA foi clicado por último antes do envio do formulário
var ctaOrigem = '';

document.querySelectorAll('a[data-cta]').forEach(function (btn) {
  btn.addEventListener('click', function () {
    ctaOrigem = this.dataset.cta;
  });
});

/* ─── CAPTURA DE UTMs ───────────────────────────────────── */
/* NOVO: lê utm_source, utm_medium, utm_campaign, utm_term e utm_content da URL */
function getUTMs() {
  var p = new URLSearchParams(window.location.search);
  return {
    utm_source:   p.get('utm_source')   || '',
    utm_medium:   p.get('utm_medium')   || '',
    utm_campaign: p.get('utm_campaign') || '',
    utm_term:     p.get('utm_term')     || '',
    utm_content:  p.get('utm_content')  || '',
  };
}

/* ─── SIMULADOR ─────────────────────────────────────────── */
// ALTERADO: lógica de cálculo migrada do simulador oficial (arisimulador-main/script.js)

// Taxas base mensais por prazo (igual ao simulador oficial)
var TAXAS_BASE = {
  18: { mensal: 0.015, bullet: 0.015 },
  24: { mensal: 0.016, bullet: 0.016 },
  36: { mensal: 0.018, bullet: 0.018 },
};

// Taxa adicional aplicada ao modo bullet em qualquer faixa
var TAXA_ADICIONAL_BULLET = 0.005;

// Bônus de taxa por faixa de capital investido
var TAXAS_EXTRA = [
  { min: 20000,  max: 99999.99,  extra: 0.000 }, // sem bônus
  { min: 100000, max: 199999.99, extra: 0.003 }, // +0,3%
  { min: 200000, max: 399999.99, extra: 0.005 }, // +0,5%
  { min: 400000, max: Infinity,  extra: 0.007 }, // +0,7%
];

// Retorna o bônus de taxa correspondente ao capital informado
function obterTaxaExtra(capital) {
  for (var i = 0; i < TAXAS_EXTRA.length; i++) {
    if (capital >= TAXAS_EXTRA[i].min && capital <= TAXAS_EXTRA[i].max) {
      return TAXAS_EXTRA[i].extra;
    }
  }
  return 0.007; // acima do teto da tabela: máximo bônus
}

// Calcula a taxa efetiva mensal conforme modo e capital
// - Mensal: taxa base + bônus de faixa (somente se capital >= R$100k)
// - Bullet:  taxa base + taxa adicional bullet + bônus de faixa (sempre)
function calcularTaxa(capital, prazo, modo) {
  var base  = TAXAS_BASE[prazo][modo];
  var extra = obterTaxaExtra(capital);
  if (modo === 'mensal') {
    return base + (capital >= 100000 ? extra : 0);
  }
  return base + TAXA_ADICIONAL_BULLET + extra;
}

var MODO_DESC = {
  mensal: 'Você recebe o rendimento todo mês durante o período.',
  bullet: 'Capital e rendimento pagos integralmente no vencimento.',
};

var simPrazo = 24;
var simModo  = 'mensal';

function fmt(v) {
  return 'R$\u00A0' + Math.round(v).toLocaleString('pt-BR'); /* ALTERADO: adicionado $ após o R */
}

function parseMask(str) {
  return parseFloat((str || '0').replace(/\./g, '').replace(',', '.')) || 0;
}

function applyMask(str) {
  var digits = str.replace(/\D/g, '');
  if (!digits) return '';
  var num = parseInt(digits, 10) / 100;
  return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function simCalc() {
  var inputEl  = document.getElementById('inp-capital');
  var sliderEl = document.getElementById('sl-capital');
  var capital  = Math.max(50000, parseMask(inputEl.value) || 50000);

  sliderEl.value = Math.min(capital, 1000000);

  var taxa      = calcularTaxa(capital, simPrazo, simModo);
  var taxaLabel = (taxa * 100).toFixed(2).replace('.', ',') + '% a.m.';
  var totalRet  = capital * taxa * simPrazo;
  var acumulado = capital + totalRet;
  var pct       = (totalRet / capital * 100).toFixed(1).replace('.', ',');

  document.getElementById('res-taxa').textContent = taxaLabel;

  if (simModo === 'mensal') {
    document.getElementById('res-main-label').textContent = 'Renda mensal';
    document.getElementById('res-main-value').textContent = fmt(capital * taxa);
  } else {
    document.getElementById('res-main-label').textContent = 'Você recebe no vencimento';
    document.getElementById('res-main-value').textContent = fmt(acumulado);
  }

  document.getElementById('res-total').textContent     = fmt(totalRet);
  document.getElementById('res-acumulado').textContent = fmt(acumulado);
  document.getElementById('res-pct').textContent       = '+' + pct + '%';
}

// ALTERADO: substituídos os atributos oninput/onclick inline por addEventListener
// Capital: input ↔ slider
document.getElementById('inp-capital').addEventListener('input', function () {
  var cursor = this.selectionStart;
  var prevLen = this.value.length;
  this.value = applyMask(this.value);
  var diff = this.value.length - prevLen;
  this.setSelectionRange(cursor + diff, cursor + diff);

  var val = parseMask(this.value);
  var warning = document.getElementById('sim-min-warning');
  warning.hidden = !(this.value !== '' && val < 50000);
  document.getElementById('sl-capital').value = Math.min(val || 50000, 1000000);
  simCalc();
});

document.getElementById('sl-capital').addEventListener('input', function () {
  var num = parseFloat(this.value);
  document.getElementById('inp-capital').value = num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  simCalc();
});

// Botões de prazo
document.querySelectorAll('#tg-prazo .sim-toggle').forEach(function (btn) {
  btn.addEventListener('click', function () {
    document.querySelectorAll('#tg-prazo .sim-toggle').forEach(function (b) {
      b.classList.remove('active');
      b.setAttribute('aria-pressed', 'false');
    });
    this.classList.add('active');
    this.setAttribute('aria-pressed', 'true');
    simPrazo = +this.dataset.val;
    simCalc();
  });
});

// Botões de modalidade
document.querySelectorAll('#tg-modo .sim-toggle').forEach(function (btn) {
  btn.addEventListener('click', function () {
    document.querySelectorAll('#tg-modo .sim-toggle').forEach(function (b) {
      b.classList.remove('active');
      b.setAttribute('aria-pressed', 'false');
    });
    this.classList.add('active');
    this.setAttribute('aria-pressed', 'true');
    simModo = this.dataset.val;
    document.getElementById('modo-desc').textContent = MODO_DESC[simModo];
    simCalc();
  });
});

// Cálculo inicial
simCalc();

/* ─── FAQ ───────────────────────────────────────────────── */
/* ALTERADO: substituído toggleFaq(this) inline por addEventListener + aria-expanded */
document.querySelectorAll('.faq-btn').forEach(function (btn) {
  btn.addEventListener('click', function () {
    var item   = this.closest('.faq-item');
    var isOpen = item.classList.contains('open');

    // Fecha todos os itens abertos
    document.querySelectorAll('.faq-item.open').forEach(function (i) {
      i.classList.remove('open');
      i.querySelector('.faq-btn').setAttribute('aria-expanded', 'false');
    });

    // Abre o item clicado, se estava fechado
    if (!isOpen) {
      item.classList.add('open');
      this.setAttribute('aria-expanded', 'true');
    }
  });
});

/* ─── MÁSCARA WHATSAPP: (XX) XXXXXXXXX, sem letras, sem espaços manuais ─ */
document.getElementById('tel').addEventListener('input', function () {
  // Extrai apenas dígitos e limita a 11 (2 DDD + 9 número)
  var digits = this.value.replace(/\D/g, '').slice(0, 11);

  // Reconstrói com máscara: (XX) XXXXXXXXX
  var masked = '';
  if (digits.length > 0) {
    masked = '(' + digits.slice(0, 2);
    if (digits.length > 2) {
      masked += ') ' + digits.slice(2);
    }
  }
  this.value = masked;
});

/* ─── FORMULÁRIO → n8n WEBHOOK ──────────────────────────── */
/* ALTERADO: substituída a função enviar() inline (que redirecionava para WhatsApp)
   por envio via fetch para webhook n8n com todos os campos + UTMs */

// ⚠️ Defina abaixo a URL do webhook do n8n antes de ir ao ar.
// Para obter a URL: no n8n, crie um nó "Webhook", copie a URL gerada
// e substitua a string abaixo.
const WEBHOOK_URL = 'https://hostinger-n8n.fe8diu.easypanel.host/webhook/lp-lead-direto';

document.getElementById('form-contato').addEventListener('submit', async function (e) {
  e.preventDefault();

  // Aciona a validação nativa (required, type, etc.) em todos os campos
  if (!this.reportValidity()) return;

  var submitBtn = this.querySelector('[type="submit"]');
  var feedback  = document.getElementById('form-feedback');

  // Estado de carregamento
  submitBtn.disabled    = true;
  submitBtn.textContent = 'Enviando…';
  feedback.hidden       = true;
  feedback.className    = 'form-feedback';

  // NOVO: payload inclui todos os campos do formulário + UTMs + URL da página + timestamp + CTA de origem
  var payload = Object.assign(
    {
      nome:           document.getElementById('nome').value.trim(),
      telefone:       document.getElementById('tel').value.trim(),
      email:          document.getElementById('email').value.trim(),
      capital:        document.getElementById('capital-form').value,
      modalidade:     document.getElementById('modalidade').value,
      prazo_decisao:  document.getElementById('prazo-decisao').value,
      profissao:      document.getElementById('profissao').value.trim(),
      cta_origem:     ctaOrigem || 'direto', // seção do botão clicado antes de chegar ao formulário
      pagina:         window.location.href,
      timestamp:      new Date().toISOString(),
    },
    getUTMs()
  );

  try {
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (response.status === 409) {
      // Lead já cadastrado no Google Sheets — o n8n retornou 409
      feedback.textContent = 'Seu contato já está em nossa base.';
      feedback.classList.add('form-feedback--ok');
      feedback.hidden = false;
    } else if (!response.ok) {
      throw new Error('HTTP ' + response.status);
    } else {
      // Sucesso — novo lead criado
      feedback.textContent = 'Recebemos seu contato! Nossa equipe entra em contato em até 24h.';
      feedback.classList.add('form-feedback--ok');
      feedback.hidden = false;
      this.reset();
    }

  } catch (err) {
    console.error('[ARI] Erro ao enviar formulário:', err);
    feedback.textContent = 'Ocorreu um erro ao enviar. Por favor, tente novamente.';
    feedback.classList.add('form-feedback--err');
    feedback.hidden = false;

  } finally {
    submitBtn.disabled    = false;
    submitBtn.textContent = 'Quero investir no ARI';
  }
});
