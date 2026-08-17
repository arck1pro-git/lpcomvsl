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

/* ─── ID DE EVENTO (PIXEL DA META) ──────────────────────── */
/* NOVO: gera um id único por conversão. Serve para deduplicar o evento caso
   a Conversions API passe a enviar o mesmo Lead pelo servidor. */
function novoEventId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'lead-' + Date.now() + '-' + Math.random().toString(16).slice(2);
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

/* ─── FORMULÁRIO → SPRINTHUB WEBHOOK ────────────────────── */
/* ALTERADO: destino migrado do webhook n8n para o hook do SprintHub.
   Os nomes dos parâmetros seguem os campos esperados pelo SprintHub. */

const WEBHOOK_URL = 'https://sprinthub-api-master.sprinthub.app/api/hook/lparck1pro?i=arck1pro&access_token=s9matowcwH_jRUIuiRu3XgEJQJWhfim2dTVxlKSxLP_A-wg6fQ';

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

  // ALTERADO: os nomes abaixo são os slugs reais dos campos no SprintHub
  // (confirmados pelo schema que a própria API devolve em caso de erro 400).
  // Não renomear sem conferir no CRM — nome errado = campo chega vazio.
  var utms = getUTMs();

  var params = {
    firstname:                  document.getElementById('nome').value.trim(),
    email:                      document.getElementById('email').value.trim(),
    whatsapp:                   document.getElementById('tel').value.trim(),
    profissao:                  document.getElementById('profissao').value.trim(),
    qual_o_valor_inicial_do_s:  document.getElementById('capital-form').value,
    voce_ja_investe_em_alguma:  document.getElementById('modalidade').value,
    voce_esta_pronto_para_inv:  document.getElementById('prazo-decisao').value,

    // Atribuição
    site_de_origem:  window.location.href,
    utm_source:      utms.utm_source,
    utm_medium:      utms.utm_medium,
    utm_term:        utms.utm_term,
    utm_content:     utms.utm_content,
    utm_campaing:    utms.utm_campaign, // (sic) o campo no SprintHub está grafado "campaing"
    cta_origem:      ctaOrigem || 'direto', // ainda sem campo correspondente no CRM
  };

  // ALTERADO: o hook do SprintHub lê os dados da QUERY STRING e ignora o corpo
  // da requisição. Por isso os campos vão na URL, e não como JSON no body.
  var query = new URLSearchParams();
  Object.keys(params).forEach(function (k) {
    if (params[k]) query.append(k, params[k]);
  });

  // A URL base já possui "?", então os campos são anexados com "&"
  var url = WEBHOOK_URL + '&' + query.toString();

  try {
    // Sem headers e sem body: assim a requisição é "simples" para o CORS
    // e o navegador nem dispara o preflight OPTIONS.
    const response = await fetch(url, { method: 'POST' });

    // ALTERADO: 409 (lead já existente no CRM) segue o mesmo caminho do sucesso —
    // do ponto de vista do usuário a conversão aconteceu do mesmo jeito.
    if (!response.ok && response.status !== 409) {
      // A API do SprintHub detalha o motivo no corpo da resposta (campo "msg")
      var erro = await response.text().catch(function () { return ''; });
      throw new Error('HTTP ' + response.status + ' — ' + erro);
    }

    // NOVO: evento Lead do Pixel da Meta (id 2102101857297540)
    if (typeof fbq === 'function') {
      fbq('track', 'Lead', { content_name: 'Formulário ARI' }, { eventID: novoEventId() });
    } else {
      // Bloqueador de anúncios ou pixel não carregado — não impede o redirect
      console.warn('[ARI] fbq indisponível: evento Lead não foi enviado.');
    }

    feedback.textContent = 'Recebemos seu contato! Redirecionando…';
    feedback.classList.add('form-feedback--ok');
    feedback.hidden = false;
    this.reset(); // evita que o navegador restaure os valores ao voltar

    // NOVO: redireciona para a página de confirmação.
    // Caminho até o arquivo (e não até a pasta) para funcionar em qualquer
    // ambiente — inclusive abrindo por file:// ou em servidor que não resolve
    // o index.html de um diretório automaticamente.
    // O atraso curto dá tempo do beacon do pixel sair antes da navegação —
    // sem ele, o navegador pode cancelar a requisição do evento Lead.
    setTimeout(function () {
      window.location.assign('obrigado/index.html');
    }, 600);

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
