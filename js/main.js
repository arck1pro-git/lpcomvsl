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

/* ═══════════════════════════════════════════════════════════
   RASTREAMENTO DE CONVERSÃO (META) — FONTE ÚNICA
   ═══════════════════════════════════════════════════════════
   Tudo que diz respeito ao evento Lead mora nesta seção, e só aqui.
   Fluxo único: o formulário vai ao webhook do SprintHub; respondeu OK,
   o Lead dispara e o formulário trava no aparelho por 24 h. Sem filtro
   de robô. */

/* ─── ARMAZENAMENTO ─────────────────────────────────────── */
/* Guarda a atribuição entre visitas e a hora do último envio do aparelho.
   localStorage falha em aba anônima, com storage bloqueado ou cota cheia:
   aí os dois valem só para a visita atual, e o envio segue normal. */
var STORE_ATRIBUICAO = 'ari.atribuicao.v1';
var STORE_ENVIO      = 'ari.envio.v1';

function storeLer(chave) {
  try {
    var bruto = localStorage.getItem(chave);
    return bruto ? JSON.parse(bruto) : null;
  } catch (e) {
    return null;
  }
}

function storeGravar(chave, valor) {
  try {
    localStorage.setItem(chave, JSON.stringify(valor));
    return true;
  } catch (e) {
    return false;
  }
}

/* ─── LOG DO CICLO DE VIDA ──────────────────────────────── */
/* Prefixo único para filtrar a jornada inteira da conversão no console. */
function logConv(etapa, dados) {
  console.info('[ARI][conversao] ' + etapa, dados === undefined ? '' : dados);
}

/* ─── ATRIBUIÇÃO ────────────────────────────────────────── */
/* Capturada na ENTRADA da landing page e preservada até o envio, para o
   lead não perder a origem se recarregar sem os parâmetros ou voltar
   depois por outro caminho.

   Regras de sobrescrita, explícitas de propósito:
   - utm_* e landing_page: PRIMEIRO toque vence. Uma visita posterior não
     apaga a campanha que trouxe a pessoa.
   - fbclid: ÚLTIMO toque vence. É o clique que a Meta usa para atribuir a
     conversão, então precisa ser o mais recente.
   - primeira_visita: gravado uma vez, nunca sobrescrito. */
var PARAMS_UTM = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'utm_id'];

function capturarAtribuicao() {
  var p     = new URLSearchParams(window.location.search);
  var salvo = storeLer(STORE_ATRIBUICAO) || {};
  var temOrigem = false;
  var i, k, v;

  for (i = 0; i < PARAMS_UTM.length; i++) {
    if (salvo[PARAMS_UTM[i]]) { temOrigem = true; break; }
  }

  if (!temOrigem) {
    for (i = 0; i < PARAMS_UTM.length; i++) {
      k = PARAMS_UTM[i];
      v = p.get(k);
      if (v) salvo[k] = v;
    }
  }

  v = p.get('fbclid');
  if (v) salvo.fbclid = v;

  if (!salvo.landing_page)    salvo.landing_page    = window.location.href;
  if (!salvo.primeira_visita) salvo.primeira_visita = new Date().toISOString();

  storeGravar(STORE_ATRIBUICAO, salvo);
  return salvo;
}

var atribuicao = capturarAtribuicao();

/* Cookies que a Meta usa para casar a conversão com o clique no anúncio.
   Seguem junto do lead: sem eles a Conversions API, quando existir, perde
   boa parte da atribuição. _fbc só existe se o pixel tiver carregado — por
   isso o fbclid cru também vai, como plano B. */
function lerCookie(nome) {
  var partes = document.cookie ? document.cookie.split(';') : [];
  for (var i = 0; i < partes.length; i++) {
    var par = partes[i].split('=');
    if (par[0].trim() === nome) return par.slice(1).join('=').trim();
  }
  return '';
}

/* ─── EVENT_ID ──────────────────────────────────────────── */
/* Um id novo a cada envio. Não serve para barrar envio repetido: é o que
   faz a Meta reconhecer o Lead do navegador e a cópia que o gateway manda
   pelo servidor como um evento só. */
function novoEventId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'lead-' + Date.now() + '-' + Math.random().toString(16).slice(2);
}

/* ─── CORRESPONDÊNCIA AVANÇADA ──────────────────────────── */
/* Nome, e-mail e telefone seguem com o Lead para a Meta casar o evento com
   a conta de quem converteu. O pixel aplica SHA-256 no navegador antes de
   enviar: o dado em texto puro não sai para a Meta. Também não é gravado
   no localStorage — só passa por aqui na hora do disparo.
   Formato pedido pela Meta: tudo minúsculo; nome sem pontuação, primeiro
   nome em fn e último sobrenome em ln; telefone com DDI 55 + DDD + número,
   só dígitos. O telefone também vai como external_id: é a mesma chave que
   o CRM usa para reconhecer o contato. */
var PIXEL_ID = '2102101857297540'; // o mesmo do fbq('init') no index.html

function dadosCorrespondencia(nome, email, whatsapp) {
  var dados  = { country: 'br' };
  var em     = String(email || '').trim().toLowerCase();
  var partes = String(nome || '').toLowerCase()
    .replace(/[^\p{L}\s]/gu, '').trim().split(/\s+/).filter(Boolean);

  if (em)                dados.em = em;
  if (partes.length)     dados.fn = partes[0];
  if (partes.length > 1) dados.ln = partes[partes.length - 1];
  if (whatsapp) {
    dados.ph          = '55' + whatsapp;
    dados.external_id = '55' + whatsapp;
  }
  return dados;
}

/* ─── PARÂMETROS DO LEAD: NENHUM ────────────────────────── */
/* Este pixel está no modo de dados protegidos da Meta (ProtectedDataMode,
   visto na config do pixel em 05/10/2026): o próprio fbevents.js descarta
   todo parâmetro fora de uma lista fixa — UTMs, content_name e qualquer
   campo personalizado — e reduz a URL ao domínio. Mandar não adianta, por
   isso o Lead sai sem parâmetros. A atribuição da Meta vem do clique no
   anúncio (fbclid/_fbc), que passa; as UTMs ficam no CRM. */

/* ─── TRAVA POR APARELHO ────────────────────────────────── */
/* Depois de um envio aceito pelo CRM, o aparelho fica 24 h sem poder
   enviar de novo: o botão vira "Dados enviados" e o formulário trava —
   inclusive se a pessoa voltar à página. Com isso sai um Lead só por
   aparelho. Era a origem dos Leads a mais na Meta: a mesma pessoa
   reenviando 2 a 4 vezes na mesma hora, às vezes com outro número, e o CRM
   juntando tudo num contato só.
   Custo aceito: uma segunda pessoa no mesmo aparelho, no mesmo dia, fala
   pelo WhatsApp. O espelho em memória segura a trava enquanto a página
   está aberta, mesmo sem localStorage. */
var JANELA_ENVIO_MS = 24 * 60 * 60 * 1000;
var envioMemoria    = 0;

function envioRecente() {
  var ultimo    = Math.max(Number(storeLer(STORE_ENVIO)) || 0, envioMemoria);
  var decorrido = Date.now() - ultimo;
  // decorrido negativo = relógio do aparelho voltou; não trava para sempre
  return decorrido >= 0 && decorrido < JANELA_ENVIO_MS;
}

function marcarEnvio() {
  envioMemoria = Date.now();
  storeGravar(STORE_ENVIO, envioMemoria);
}

/* ─── ÚNICO PONTO DE DISPARO DO LEAD ────────────────────── */
/* Nenhum outro lugar do projeto pode chamar fbq('track', 'Lead').
   Só é invocada depois que o webhook do SprintHub responde OK — e o
   formulário trava logo em seguida, então roda uma vez por aparelho. */
function dispararLead(eventId, correspondencia) {
  if (typeof fbq !== 'function') {
    logConv('pixel indisponível: Lead não enviado', eventId);
    return;
  }

  // Um novo init do MESMO pixel só anexa os dados de correspondência ao
  // pixel já carregado; não dispara evento. O Lead logo abaixo sai com eles.
  fbq('init', PIXEL_ID, correspondencia);
  fbq('track', 'Lead', {}, { eventID: eventId });
  logConv('Lead enviado à Meta', eventId);
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

/* ─── WHATSAPP: máscara (XX) XXXXX-XXXX + validação dos 11 dígitos ── */
/* ALTERADO: o campo agora aceita só celular com 11 dígitos (DDD + 9 dígitos).
   O fixo de 10 dígitos saiu de propósito: o lead é contatado por WhatsApp —
   número curto ou incompleto virava lead impossível de atender. */

var telEl     = document.getElementById('tel');
var telErroEl = document.getElementById('tel-erro');

/* DDDs realmente em uso no Brasil (ANATEL). Fora dessa lista o número não
   existe — erro de digitação ou campo preenchido no automatico. */
var DDDS_VALIDOS = [
  '11','12','13','14','15','16','17','18','19',
  '21','22','24','27','28',
  '31','32','33','34','35','37','38',
  '41','42','43','44','45','46','47','48','49',
  '51','53','54','55',
  '61','62','63','64','65','66','67','68','69',
  '71','73','74','75','77','79',
  '81','82','83','84','85','86','87','88','89',
  '91','92','93','94','95','96','97','98','99'
];

/* Formata os dígitos no padrão (XX) XXXXX-XXXX, parando onde o usuário parou */
function mascararTel(digits) {
  if (!digits) return '';
  if (digits.length <= 2) return '(' + digits;
  if (digits.length <= 7) return '(' + digits.slice(0, 2) + ') ' + digits.slice(2);
  return '(' + digits.slice(0, 2) + ') ' + digits.slice(2, 7) + '-' + digits.slice(7);
}

/* Posição do cursor logo depois do n-ésimo dígito do texto mascarado —
   sem isso o cursor pula para o fim a cada edição no meio do número. */
function posAposDigito(masked, n) {
  if (n <= 0) return 0;
  var vistos = 0;
  for (var i = 0; i < masked.length; i++) {
    if (masked.charCodeAt(i) >= 48 && masked.charCodeAt(i) <= 57) {
      vistos++;
      if (vistos === n) return i + 1;
    }
  }
  return masked.length;
}

/* Devolve o motivo da recusa, ou '' quando o número está válido */
function erroTel(digits) {
  if (!digits)                                    return 'Informe seu telefone/WhatsApp.';
  if (digits.length !== 11)                       return 'O número precisa ter 11 dígitos: DDD + 9 dígitos. Ex.: (11) 99999-9999';
  if (DDDS_VALIDOS.indexOf(digits.slice(0, 2)) === -1) return 'DDD inválido. Confira os dois primeiros dígitos.';
  if (digits.charAt(2) !== '9')                   return 'Informe um celular com WhatsApp: após o DDD o número começa com 9.';
  if (/^(\d)\1+$/.test(digits.slice(2)))          return 'Número inválido. Digite seu celular com WhatsApp.';
  return '';
}

function mostrarErroTel(msg) {
  telErroEl.textContent = msg;
  telErroEl.hidden      = false;
  telEl.classList.add('form-input--err');
  telEl.setAttribute('aria-invalid', 'true');
}

function limparErroTel() {
  telErroEl.textContent = '';
  telErroEl.hidden      = true;
  telEl.classList.remove('form-input--err');
  telEl.removeAttribute('aria-invalid');
}

/* Valida e sincroniza com a validação nativa — assim o reportValidity() do
   submit também barra o envio e leva o foco para este campo.
   `mostrar` controla apenas se a mensagem aparece embaixo do campo. */
function validarTel(mostrar) {
  var erro = erroTel(telEl.value.replace(/\D/g, ''));
  telEl.setCustomValidity(erro);
  if (mostrar) {
    if (erro) mostrarErroTel(erro);
    else      limparErroTel();
  }
  return erro === '';
}

telEl.addEventListener('input', function () {
  var digitosAntes = this.value.slice(0, this.selectionStart || 0).replace(/\D/g, '').length;
  var masked = mascararTel(this.value.replace(/\D/g, '').slice(0, 11));

  this.value = masked;
  try {
    var pos = posAposDigito(masked, digitosAntes);
    this.setSelectionRange(pos, pos);
  } catch (e) { /* navegador sem suporte a seleção em input tel */ }

  // Enquanto digita, o erro antigo sai de cena; a checagem volta no blur.
  limparErroTel();
  validarTel(false);
});

// Cola e autofill não disparam 'input' em todo navegador
telEl.addEventListener('change', function () { validarTel(true); });
telEl.addEventListener('blur',   function () { validarTel(true); });

/* ─── FORMULÁRIO → SPRINTHUB WEBHOOK ────────────────────── */
/* ALTERADO: destino migrado do webhook n8n para o hook do SprintHub.
   Os nomes dos parâmetros seguem os campos esperados pelo SprintHub. */

const WEBHOOK_URL = 'https://sprinthub-api-master.sprinthub.app/api/hook/lparck1pro?i=arck1pro&access_token=s9matowcwH_jRUIuiRu3XgEJQJWhfim2dTVxlKSxLP_A-wg6fQ';

/* NOVO: ao limpar o formulário (sucesso do envio) o erro do telefone sai junto */
document.getElementById('formulario').addEventListener('reset', function () {
  telEl.setCustomValidity('');
  limparErroTel();
});

/* ─── FORMULÁRIO TRAVADO APÓS O ENVIO ───────────────────── */
/* No lugar dos campos fica a mensagem de confirmação, com o botão
   "Dados enviados" travado embaixo. Vale logo após o envio e em toda
   volta à página dentro da janela da trava. `rolar` só no envio: ao abrir
   a página, levar a pessoa até o formulário seria um salto sem motivo. */
var MSG_ENVIADO = 'Recebemos seus dados! Um especialista da Arck1Pro vai falar com você pelo WhatsApp em até 24 horas úteis.';

function travarFormulario(rolar) {
  var form     = document.getElementById('formulario');
  var btn      = form.querySelector('[type="submit"]');
  var feedback = document.getElementById('form-feedback');

  form.classList.add('form--enviado');
  Array.prototype.forEach.call(form.elements, function (el) { el.disabled = true; });
  btn.textContent = 'Dados enviados ✓';
  btn.classList.add('form-submit--enviado');

  feedback.textContent = MSG_ENVIADO;
  feedback.className   = 'form-feedback form-feedback--ok';
  feedback.hidden      = false;

  if (rolar) form.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// Ao abrir a página e ao voltar a ela pelo botão "voltar" — que pode
// restaurar a página da memória sem rodar este script de novo.
if (envioRecente()) travarFormulario(false);
window.addEventListener('pageshow', function (e) {
  if (e.persisted && envioRecente()) travarFormulario(false);
});

document.getElementById('formulario').addEventListener('submit', async function (e) {
  e.preventDefault();

  // Já enviou neste aparelho: nada vai ao CRM nem à Meta.
  if (envioRecente()) { travarFormulario(true); return; }

  // NOVO: portão do telefone. Marca a mensagem embaixo do campo e deixa o
  // número inválido para a validação nativa — nada é enviado sem os
  // 11 dígitos no formato (XX) XXXXX-XXXX.
  var telOk = validarTel(true);

  // Aciona a validação nativa (required, type, etc.) em todos os campos.
  // Com o setCustomValidity acima, ela já reprova e foca o telefone também.
  if (!this.reportValidity()) return;
  if (!telOk) { telEl.focus(); return; }

  var submitBtn = this.querySelector('[type="submit"]');
  var feedback  = document.getElementById('form-feedback');

  // Estado de carregamento
  submitBtn.disabled    = true;
  submitBtn.textContent = 'Enviando…';
  feedback.hidden       = true;
  feedback.className    = 'form-feedback';

  var whatsapp = document.getElementById('tel').value.replace(/\D/g, '');
  var email    = document.getElementById('email').value.trim();
  var eventId  = novoEventId();
  logConv('formulario recebido', eventId);

  // ALTERADO: os nomes abaixo são os slugs reais dos campos no SprintHub
  // (confirmados pelo schema que a própria API devolve em caso de erro 400).
  // Não renomear sem conferir no CRM — nome errado = campo chega vazio.
  // "nome" e "whatsapp" são obrigatórios: a API responde 400 sem eles.
  var params = {
    // ALTERADO: era "firstname", que a API rejeita com
    // 400 "nome deve ser string, e é obrigatório" — nenhum lead entrava.
    nome:                       document.getElementById('nome').value.trim(),
    email:                      email,
    // ALTERADO: envia só os dígitos (11999999999); a máscara é só visual
    whatsapp:                   whatsapp,
    qual_o_valor_inicial_do_s:  document.getElementById('capital-form').value,
    voce_ja_investe_em_alguma:  document.getElementById('modalidade').value,
    voce_esta_pronto_para_inv:  document.getElementById('prazo-decisao').value,

    // Atribuicao preservada desde a ENTRADA na landing page. Nao e relida da
    // URL no envio: quem recarrega sem os parametros nao perde a origem.
    site_de_origem:  window.location.href,
    landing_page:    atribuicao.landing_page || '',
    utm_source:      atribuicao.utm_source   || '',
    utm_medium:      atribuicao.utm_medium   || '',
    utm_term:        atribuicao.utm_term     || '',
    utm_content:     atribuicao.utm_content  || '',
    utm_campaing:    atribuicao.utm_campaign || '', // (sic) o campo no SprintHub esta grafado "campaing"
    utm_id:          atribuicao.utm_id       || '',
    cta_origem:      ctaOrigem || 'direto',

    // Sinais de clique da Meta, para a Conversions API casar a conversao com
    // o anuncio quando for ligada. _fbc so existe se o pixel tiver carregado,
    // por isso o fbclid cru vai junto como plano B.
    fbclid:          atribuicao.fbclid || '',
    fbc:             lerCookie('_fbc'),
    fbp:             lerCookie('_fbp'),

    // Auditoria: e o que permite cruzar lead no CRM x evento na Meta.
    // Campos ainda sem slug correspondente no SprintHub somem em silencio
    // ate serem criados la.
    event_id:        eventId,
    primeira_visita: atribuicao.primeira_visita || '',
    convertido_em:   new Date().toISOString(),
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

    // O SprintHub responde 200 quando recebe e 400 quando falta campo
    // obrigatório. Sem OK, cai no catch e o Lead não dispara.
    if (!response.ok) {
      throw new Error('HTTP ' + response.status + ' — ' + await response.text().catch(function () { return ''; }));
    }

    logConv('SprintHub recebeu o lead', eventId);
    marcarEnvio();
    dispararLead(eventId, dadosCorrespondencia(params.nome, email, whatsapp));

    // Sem redirect para o /obrigado: a confirmação aparece no lugar do
    // formulário, e o beacon do pixel sai sem risco de a navegação cortá-lo.
    this.reset(); // evita que o navegador restaure os valores ao voltar
    travarFormulario(true);

  } catch (err) {
    console.error('[ARI] Erro ao enviar formulario:', err);
    feedback.textContent = 'Ocorreu um erro ao enviar. Por favor, tente novamente.';
    feedback.classList.add('form-feedback--err');
    feedback.hidden = false;

    // O botão só volta no erro. No sucesso ele vira "Dados enviados" e
    // fica travado.
    submitBtn.disabled    = false;
    submitBtn.textContent = 'Quero investir no ARI';
  }
});
