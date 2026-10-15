/* ═══════════════════════════════════════════════════════════
   api/lead.js — envio do lead ao CRM Chroma
   Arck1Pro · Ativo de Renda Imobiliária
═══════════════════════════════════════════════════════════

   Função serverless da Vercel: responde em POST /api/lead. O formulário da
   LP (js/main.js) manda os dados para cá, e daqui eles seguem para a
   webhook "LP ARI" do Chroma — funil ARCK1PRO, etapa "LP - ari".

   Por que existe: o segredo da webhook vai na URL. Chamada do navegador, a
   URL ficaria à vista de quem abrisse a página, e com ela qualquer um põe
   lead falso no funil — que tem IA atendendo e manda WhatsApp de verdade.
   Aqui ela não sai do servidor.

   A URL fica escrita no código de propósito, sem .env nem variável de
   ambiente: o deploy não leva o .env, e o envio pararia sem ninguém ver. */

const CRM_WEBHOOK_URL = "https://chromacrm.vercel.app/api/webhooks/typebot-lp-ari-950a3a?secret=e9bbfc9a993b1724ecf1f07dad82997f5a9613986ae88866100573b1fb40cca0";

/* ─── CAMPOS ACEITOS PELO CRM ───────────────────────────── */
/* Os nomes exatos que a webhook conhece. Chave que a webhook não declara
   o CRM descarta em silêncio — acento, hífen e maiúscula importam. Só as
   chaves destas duas listas saem daqui, mesmo que o navegador mande outras. */
const CAMPOS = [
  'nome',                 // Contato · Nome
  'telefone',             // Contato · WhatsApp
  'email',                // Contato · E-mail
  'capital_disponivel',   // Contato · campo "valor_inicial"
  'ja_investe',           // Contato · campo "ja_investe"
  'pronto_para_investir', // Contato · campo "pronto_para_investir"
  'pixel',                // Contato · campo "pixel_id" — o CRM usa para devolver eventos à Meta
];

/* Atribuição: ia para o SprintHub, que saiu em 15/10/2026. Na webhook "LP
   ARI" as utm_* estão declaradas (15/10/2026) e viram campos do contato;
   landing_page, cta_origem, fbclid, fbc e fbp ainda NÃO, e o Chroma as
   descarta. Seguem mesmo assim: declaradas lá com estes mesmos nomes,
   passam a ser gravadas sem novo deploy. Os nomes são os que o Chroma já
   lê — utm_* nos relatórios por campanha, fbc/fbp/fbclid nos eventos à Meta. */
const CAMPOS_ATRIBUICAO = [
  'landing_page', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content',
  'utm_term', 'utm_id', 'cta_origem', 'fbclid', 'fbc', 'fbp',
];

/* ─── TENTATIVAS ────────────────────────────────────────── */
/* Só falha temporária do CRM (5xx, rede, sem resposta) é repetida, com
   espera progressiva. 401, 404 e 422 voltariam iguais: não repete.
   Repetir é seguro — o CRM reaproveita contato e card do mesmo WhatsApp.

   TIMEOUT_ENVIO_MS folgado de propósito: o Chroma "frio" levou ~6 s para
   responder em 14/10/2026, e com 5 s a função desistia de um envio que ia
   dar certo e mandava o lead de novo. Tudo cabe em PRAZO_TOTAL_MS, abaixo
   do maxDuration de 30 s (vercel.json), para a falha ser registrada antes
   de a Vercel encerrar a função. */
const PRAZO_TOTAL_MS     = 25000;
const TIMEOUT_ENVIO_MS   = 12000;
const ESPERAS_MS         = [1000, 3000]; // antes da 2ª e da 3ª tentativa
const FOLGA_ULTIMA_MS    = 3000;         // tempo mínimo que vale uma nova tentativa
const TIMEOUT_AQUECER_MS = 8000;
const TAMANHO_MAX_CAMPO  = 1000;        // landing_page com fbclid e UTMs passa de 300

/* ─── LOG ───────────────────────────────────────────────── */
/* Prefixo único para achar a jornada nos Runtime Logs da Vercel.
   Lead que não entrou no CRM sai inteiro no log: procure por
   "[lead-chroma] FALHA". O navegador também guarda o lead e reenvia
   sozinho até o CRM confirmar (js/main.js, LEADS PENDENTES); o log é a
   última rede, para quando o aparelho nunca mais voltar ao site. */
function log(nivel, etapa, dados) {
  console[nivel]('[lead-chroma] ' + etapa + ' ' + JSON.stringify(dados));
}

/* ─── NORMALIZAÇÃO ──────────────────────────────────────── */
function texto(valor) {
  if (valor === null || valor === undefined) return '';
  return String(valor).trim().slice(0, TAMANHO_MAX_CAMPO);
}

/* WhatsApp só com dígitos, com DDI e DDD: 5547999346074. O formulário
   manda o DDI, mas número de 10/11 dígitos (sem DDI) ainda é aceito. */
function telefoneComDdi(valor) {
  const digitos = texto(valor).replace(/\D/g, '');
  if (digitos.length === 10 || digitos.length === 11) return '55' + digitos;
  if (/^55\d{10,11}$/.test(digitos)) return digitos;
  return '';
}

function montarLead(corpo) {
  const lead = {};
  CAMPOS.concat(CAMPOS_ATRIBUICAO).forEach(function (campo) {
    const valor = campo === 'telefone' ? telefoneComDdi(corpo[campo]) : texto(corpo[campo]);
    if (valor) lead[campo] = valor;
  });
  return lead;
}

/* O helper da Vercel já entrega req.body parseado quando o Content-Type é
   JSON — mas o getter estoura com JSON malformado. Sem o helper, lê o
   stream. Qualquer coisa que não seja um objeto vira null. */
async function lerCorpo(req) {
  let corpo;
  try {
    corpo = req.body;
    if (corpo === undefined) {
      let cru = '';
      for await (const parte of req) cru += parte;
      corpo = cru;
    }
    if (Buffer.isBuffer(corpo)) corpo = corpo.toString('utf8');
    if (typeof corpo === 'string') corpo = corpo ? JSON.parse(corpo) : null;
  } catch (e) {
    return null;
  }
  return corpo && typeof corpo === 'object' && !Array.isArray(corpo) ? corpo : null;
}

/* ─── ENVIO AO CRM ──────────────────────────────────────── */
function esperar(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

async function enviarAoCrm(lead) {
  const limite = Date.now() + PRAZO_TOTAL_MS;
  let falha    = { status: 0, motivo: '' };

  for (let tentativa = 1; ; tentativa++) {
    try {
      const resposta = await fetch(CRM_WEBHOOK_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(lead),
        signal:  AbortSignal.timeout(Math.min(TIMEOUT_ENVIO_MS, limite - Date.now())),
      });
      const corpo = await resposta.text().catch(function () { return ''; });

      // 200: lead recebido. Não reenvia.
      if (resposta.ok) {
        let contatoId = '';
        try { contatoId = JSON.parse(corpo).contato_id || ''; } catch (e) { /* corpo sem JSON */ }
        return { ok: true, tentativas: tentativa, contato_id: contatoId };
      }

      falha = { status: resposta.status, motivo: corpo.slice(0, 500) };
      // 401 segredo errado · 404 webhook desativada · 422 payload inválido:
      // reenviar igual falha de novo.
      if (resposta.status < 500) return Object.assign({ ok: false, tentativas: tentativa }, falha);

    } catch (err) {
      // Nunca loga a URL: o segredo vai nela.
      falha = {
        status: 0,
        motivo: err && err.name === 'TimeoutError' ? 'CRM sem resposta' : 'falha de rede: ' + (err && err.name),
      };
    }

    const espera = ESPERAS_MS[tentativa - 1];
    if (espera === undefined || Date.now() + espera + FOLGA_ULTIMA_MS > limite) {
      return Object.assign({ ok: false, tentativas: tentativa }, falha);
    }
    await esperar(espera);
  }
}

/* ─── AQUECIMENTO ───────────────────────────────────────── */
/* GET /api/lead: o navegador chama quando a pessoa começa a preencher o
   formulário. Acorda esta função e a rota da webhook no Chroma (o GET de
   lá só responde 405, sem gravar nada), para o envio de verdade, segundos
   depois, não pagar a partida a frio — é a confirmação do CRM que libera o
   Lead do pixel, e quem espera demais fecha a página antes. Vai sem o
   segredo: só o caminho da URL. Falhar aqui não atrapalha nada. */
async function aquecerCrm() {
  try {
    await fetch(CRM_WEBHOOK_URL.split('?')[0], {
      method: 'GET',
      signal: AbortSignal.timeout(TIMEOUT_AQUECER_MS),
    });
  } catch (e) { /* aquecimento é só otimização */ }
}

/* ─── HANDLER ───────────────────────────────────────────── */
module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    await aquecerCrm();
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ok: true });
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ ok: false, erro: 'use POST' });
  }

  const corpo = await lerCorpo(req);
  if (!corpo) {
    log('warn', 'recusado: corpo não é JSON', {});
    return res.status(422).json({ ok: false, erro: 'corpo precisa ser JSON' });
  }

  const lead = montarLead(corpo);

  // Sem nome e sem como responder, o lead entra no CRM sem utilidade —
  // e não vem do formulário, que exige os dois.
  if (!lead.nome || !(lead.telefone || lead.email)) {
    log('warn', 'recusado: falta nome ou contato', { lead: lead });
    return res.status(422).json({ ok: false, erro: 'nome e telefone ou e-mail são obrigatórios' });
  }

  const resultado = await enviarAoCrm(lead);

  if (resultado.ok) {
    log('info', 'ok', { contato_id: resultado.contato_id, tentativas: resultado.tentativas });
    return res.status(200).json({ ok: true });
  }

  // Não descarta em silêncio: o lead inteiro fica no log para reenvio
  // manual, junto com o motivo que o CRM deu.
  log('error', 'FALHA — reenviar manualmente', {
    quando:     new Date().toISOString(),
    status:     resultado.status,
    motivo:     resultado.motivo,
    tentativas: resultado.tentativas,
    lead:       lead,
  });
  return res.status(502).json({ ok: false, erro: 'CRM não confirmou o recebimento' });
};
