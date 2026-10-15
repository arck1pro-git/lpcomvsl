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
   Fluxo único: o formulário vai ao CRM Chroma; quando ele confirma — ou,
   se demorar ou estiver fora, depois de 8 s, com o lead pendente no
   aparelho para reenvio —, o Lead dispara e o formulário trava no aparelho
   por 24 h. Sem filtro de robô. */

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
   Seguem junto do lead: sem eles os eventos que o Chroma devolve à Meta
   perdem boa parte da atribuição. _fbc só existe se o pixel tiver carregado — por
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
   enviar: o dado em texto puro não sai para a Meta. Para o pixel, nada
   disso é gravado no localStorage — só passa por aqui na hora do disparo.
   (O lead pendente, em LEADS PENDENTES, guarda o formulário só até o CRM
   confirmar.)
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
   Só é invocada no envio do formulário válido, depois da confirmação do
   CRM ou do prazo dela — e o formulário trava logo em seguida, então roda
   uma vez por aparelho. */
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

/* ─── FORMULÁRIO → CRM CHROMA ───────────────────────────── */
/* O lead vai só para o Chroma; o SprintHub saiu em 15/10/2026.
   O Chroma recebe pelo SERVIDOR: a URL da webhook dele leva o segredo e não
   pode estar neste arquivo, que qualquer visitante lê. O navegador chama
   a função api/lead.js, no mesmo domínio, e ela repassa ao CRM, com
   novas tentativas. O formulário não depende do CRM estar de pé: sem
   confirmação em ESPERA_CONFIRMACAO_MS, a pessoa vê a confirmação do mesmo
   jeito e o lead fica pendente no aparelho, com reenvio automático. A
   lista oficial de chaves está em api/lead.js. */
var CHROMA_ENDPOINT        = '/api/lead';
var ESPERA_CONFIRMACAO_MS  = 8000; // Chroma frio + função fria ≈ 7 s

/* Resolve quando o CRM confirma o recebimento; rejeita no resto.
   Uma nova tentativa do navegador quando a falha é no caminho até a
   função — rede do celular caindo, plataforma respondendo 404/5xx. Não
   repete o 502, que é a função dizendo que o CRM falhou mesmo depois das
   tentativas dela, nem o 422, dado inválido: voltariam iguais. Repetir é
   seguro: o CRM reaproveita o contato do mesmo WhatsApp. */
var ESPERA_REENVIO_MS = 1500;

function esperar(ms) {
  return new Promise(function (r) { setTimeout(r, ms); });
}

async function enviarChroma(dados) {
  var falha;
  for (var tentativa = 1; tentativa <= 2; tentativa++) {
    if (tentativa > 1) await esperar(ESPERA_REENVIO_MS);
    var response;
    try {
      response = await fetch(CHROMA_ENDPOINT, {
        method:    'POST',
        headers:   { 'Content-Type': 'application/json' },
        body:      JSON.stringify(dados),
        keepalive: true, // segue mesmo se a pessoa fechar a aba logo após a confirmação
      });
    } catch (err) {
      falha = err; // rede: vale tentar de novo
      continue;
    }
    if (response.ok) return;
    falha = new Error('HTTP ' + response.status);
    if (response.status === 502 || response.status === 422) break;
  }
  throw falha;
}

/* ─── LEADS PENDENTES ───────────────────────────────────── */
/* O lead entra aqui ANTES de ir ao CRM e só sai quando o Chroma confirma.
   Com o Chroma fora do ar, a pessoa vê a confirmação normal e o navegador
   dela reenvia sozinho: em segundo plano enquanto a página está aberta, e
   de novo a cada volta ao site, por até 7 dias. É o único lugar onde os
   dados do formulário ficam gravados no aparelho, e só até a entrega.
   Sem localStorage (aba anônima, storage bloqueado), o reenvio vale só
   enquanto a página estiver aberta. */
var STORE_PENDENTES      = 'ari.pendentes.v1';
var VALIDADE_PENDENTE_MS = 7 * 24 * 60 * 60 * 1000;
var ESPERAS_PENDENTES_MS = [30000, 60000, 120000, 300000, 600000]; // com a página aberta
var ATRASO_AO_ABRIR_MS   = 5000; // ao abrir a página, depois do pixel carregar
var pendentesMemoria     = [];   // espelho para quando o localStorage falha

function lerPendentes() {
  var lista = storeLer(STORE_PENDENTES);
  if (!Array.isArray(lista)) lista = pendentesMemoria;
  var agora = Date.now();
  return lista.filter(function (p) {
    return p && p.dados && agora - p.criado >= 0 && agora - p.criado < VALIDADE_PENDENTE_MS;
  });
}

function gravarPendentes(lista) {
  pendentesMemoria = lista;
  if (lista.length) { storeGravar(STORE_PENDENTES, lista); return; }
  try { localStorage.removeItem(STORE_PENDENTES); } catch (e) { /* sem storage */ }
}

function guardarPendente(id, dados) {
  gravarPendentes(lerPendentes().concat([{ id: id, dados: dados, criado: Date.now() }]));
}

function tirarPendente(id) {
  gravarPendentes(lerPendentes().filter(function (p) { return p.id !== id; }));
}

var reenvioAgendado = null;
var proximaEspera   = 0;

async function reenviarPendentes() {
  reenvioAgendado = null;
  var lista = lerPendentes();
  gravarPendentes(lista); // descarta os vencidos
  for (var i = 0; i < lista.length; i++) {
    try {
      await enviarChroma(lista[i].dados);
      tirarPendente(lista[i].id);
      logConv('lead pendente entregue ao Chroma', lista[i].id);
    } catch (err) { /* fica para a próxima rodada */ }
  }
  agendarReenvio();
}

function agendarReenvio() {
  if (reenvioAgendado || !lerPendentes().length) return;
  if (proximaEspera >= ESPERAS_PENDENTES_MS.length) return; // segue na próxima visita
  reenvioAgendado = setTimeout(reenviarPendentes, ESPERAS_PENDENTES_MS[proximaEspera++]);
}

if (lerPendentes().length) setTimeout(reenviarPendentes, ATRASO_AO_ABRIR_MS);

/* Acorda a função e o CRM quando a pessoa vai para o formulário — clique
   num botão que leva a ele, ou foco no primeiro campo. Até ela terminar de
   preencher, os dois já responderam uma vez, e o envio de verdade não paga
   a partida a frio (~6 s no Chroma), que atrasaria o Lead do pixel. Uma
   vez por página; falhar não atrapalha o envio. */
var crmAquecido = false;

function aquecerCrm() {
  if (crmAquecido || envioRecente()) return;
  crmAquecido = true;
  fetch(CHROMA_ENDPOINT, { method: 'GET' }).catch(function () {});
}

document.querySelectorAll('a[data-cta]').forEach(function (btn) {
  btn.addEventListener('click', aquecerCrm);
});
document.getElementById('formulario').addEventListener('focusin', aquecerCrm);

/* No CRM a resposta aparece como o texto que a pessoa escolheu
   ("R$100.000 a R$300.000"), não como o value interno ("100k-300k"). */
function textoOpcao(id) {
  var sel = document.getElementById(id);
  var opt = sel.options[sel.selectedIndex];
  return opt && opt.value ? opt.text.trim() : '';
}

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

  var nome     = document.getElementById('nome').value.trim();
  var whatsapp = document.getElementById('tel').value.replace(/\D/g, '');
  var email    = document.getElementById('email').value.trim();
  var eventId  = novoEventId();
  logConv('formulario recebido', eventId);

  // Chaves exatas da webhook do Chroma. Telefone só com dígitos e com o
  // DDI: 5547999346074.
  var dados = {
    nome:                 nome,
    telefone:             '55' + whatsapp,
    email:                email,
    capital_disponivel:   textoOpcao('capital-form'),
    ja_investe:           textoOpcao('modalidade'),
    pronto_para_investir: textoOpcao('prazo-decisao'),
    pixel:                PIXEL_ID,

    // Atribuição preservada desde a ENTRADA na landing page. Não é relida da
    // URL no envio: quem recarrega sem os parâmetros não perde a origem.
    // O CRM só grava a chave declarada na webhook "LP ARI" do Chroma, com
    // este mesmo nome: as utm_* estão; landing_page, cta_origem e os sinais
    // da Meta abaixo ainda são descartados em silêncio.
    landing_page: atribuicao.landing_page || '',
    utm_source:   atribuicao.utm_source   || '',
    utm_medium:   atribuicao.utm_medium   || '',
    utm_campaign: atribuicao.utm_campaign || '',
    utm_content:  atribuicao.utm_content  || '',
    utm_term:     atribuicao.utm_term     || '',
    utm_id:       atribuicao.utm_id       || '',
    cta_origem:   ctaOrigem || 'direto',

    // Sinais de clique da Meta: o Chroma usa fbc/fbp — ou monta o fbc a
    // partir do fbclid — nos eventos que devolve à Meta. _fbc só existe se
    // o pixel tiver carregado, por isso o fbclid cru vai junto como plano B.
    fbclid:       atribuicao.fbclid || '',
    fbc:          lerCookie('_fbc'),
    fbp:          lerCookie('_fbp'),
  };

  // Guardado ANTES de enviar: se a aba fechar no meio, ou o Chroma estiver
  // fora, o lead não se perde — ver LEADS PENDENTES.
  guardarPendente(eventId, dados);

  // O envio corre contra um prazo. Confirmou antes, ótimo. Falhou ou passou
  // do prazo, a pessoa vê a confirmação do mesmo jeito: o formulário nunca
  // trava por causa do CRM. O envio em andamento segue (keepalive) e, se
  // não der certo, o reenvio automático assume.
  var envio = enviarChroma(dados).then(
    function () {
      tirarPendente(eventId);
      logConv('Chroma recebeu o lead', eventId);
      return true;
    },
    function (err) {
      console.error('[ARI] Chroma não confirmou; lead pendente, reenvio automático:', err);
      agendarReenvio();
      return false;
    }
  );
  var confirmado = await Promise.race([
    envio,
    esperar(ESPERA_CONFIRMACAO_MS).then(function () { return false; }),
  ]);
  if (!confirmado) logConv('sem confirmação do Chroma a tempo: lead pendente', eventId);

  // O Lead sai mesmo sem a confirmação: a pessoa converteu de verdade e o
  // lead está guardado. Segurar o evento esperando o CRM é o que fazia
  // quem fechava a página virar clique sem Lead.
  marcarEnvio();
  dispararLead(eventId, dadosCorrespondencia(nome, email, whatsapp));

  // Sem redirect para o /obrigado: a confirmação aparece no lugar do
  // formulário, e o beacon do pixel sai sem risco de a navegação cortá-lo.
  this.reset(); // evita que o navegador restaure os valores ao voltar
  travarFormulario(true);
});
