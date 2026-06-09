const MODEL_CHEAP = process.env.MODEL_CHEAP || "claude-haiku-4-5-20251001";
const MODEL_NORMAL = process.env.MODEL_NORMAL || "claude-sonnet-4-6";
const MODEL_REVIEW = process.env.MODEL_REVIEW || "claude-opus-4-8";

const AGENT_REGISTRY = {
  coordinator: {
    name: "Agente Coordenador",
    model: MODEL_NORMAL,
    useWhen: "Sempre. Interpreta o pedido e consolida o trabalho dos outros agentes.",
  },
  content: {
    name: "Agente Conteúdo/Calendário",
    model: MODEL_CHEAP,
    useWhen: "Ideias, calendário, categorias, temas, formatos e campanhas.",
  },
  copy: {
    name: "Agente Copywriting",
    model: MODEL_NORMAL,
    useWhen: "Legendas, CTAs, hashtags, roteiros de reels e respostas em rascunho.",
  },
  reports: {
    name: "Agente Relatórios Excel",
    model: MODEL_CHEAP,
    useWhen: "Tabelas, organização, status, aprovações, relatórios e métricas.",
  },
  review: {
    name: "Agente Revisão Final",
    model: MODEL_REVIEW,
    useWhen: "Revisão estratégica ou decisões importantes. Usar pouco por custo.",
  },
  visual: {
    name: "Agente Criativo Visual",
    model: MODEL_NORMAL,
    useWhen: "Direção visual, prompts de imagem e critérios para revisão visual.",
  },
  community: {
    name: "Agente Comunidade/Atendimento",
    model: MODEL_NORMAL,
    useWhen: "Comentários, mensagens, triagem de clientes e respostas em rascunho.",
  },
};

function inferAgents(text, objective) {
  const clean = `${objective} ${text}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const selected = ["coordinator"];

  if (/conteudo|post|posts|calendario|ideia|semana|mes|campanha|gere|gerir|gestao/.test(clean)) selected.push("content");
  if (/legenda|copy|hashtags|reels|comentario|mensagem|dm|resposta|texto/.test(clean)) selected.push("copy");
  if (/excel|relatorio|tabela|organizar|aprovacao|status|metrica/.test(clean)) selected.push("reports");
  if (/imagem|visual|design|criativo|post visual/.test(clean)) selected.push("visual");
  if (/comentario|mensagem|dm|cliente|responder|comunidade/.test(clean)) selected.push("community");
  if (/rever|revisao|final|estrategia|decisao importante/.test(clean)) selected.push("review");
  if (selected.length === 1) selected.push("content", "copy", "reports");

  return [...new Set(selected)];
}

function systemPrompt(selectedAgents) {
  const agentList = selectedAgents
    .map((key) => {
      const agent = AGENT_REGISTRY[key];
      return `- ${key}: ${agent.name}. Modelo previsto: ${agent.model}. Uso: ${agent.useWhen}`;
    })
    .join("\n");

  return `És o Agente Coordenador principal do sistema de gestão de redes sociais da Proxiassistant.

A tua função não é apenas responder ao pedido. A tua função é agir como gestor completo de redes sociais:
- interpretar pedidos amplos como "gere o Instagram este mês";
- criar um plano profissional mesmo quando o utilizador dá pouca instrução;
- decidir que agentes especialistas devem trabalhar;
- consolidar resultados;
- criar próximos passos claros;
- manter tudo pendente de aprovação humana.

Contexto da marca:
- A Proxiassistant é uma empresa de consultoria local para empresas e empreendedores.
- O Instagram é o canal principal.
- A consultoria pode abranger várias áreas, não apenas uma área específica.
- O tom de voz é profissional, claro e direto.
- A linha editorial deve misturar conteúdo educativo, autoridade, relacionamento e comercial.

Comportamento esperado:
- Se o pedido for amplo, cria um plano mensal completo.
- Se o pedido for semanal, cria um plano semanal.
- Se o pedido não disser quantidade, assume um plano mensal inicial com 12 conteúdos: 3 por semana.
- Alterna formatos: carrossel, reels, post estático e stories/ideias de stories.
- Para cada conteúdo, cria objetivo, legenda/roteiro quando fizer sentido, CTA, hashtags e status.
- Cria também tarefas para imagem, mas não assumes que a imagem foi gerada.
- Cria critérios de revisão visual quando houver tarefa visual.
- Quando houver comentários ou mensagens, cria apenas respostas em rascunho.
- Se faltarem dados importantes, não bloqueies tudo: usa hipóteses provisórias e lista o que precisa ser confirmado.
- Age de forma autónoma dentro das regras, como uma equipa de social media organizada.

Regras obrigatórias:
- Nunca publiques conteúdo.
- Nunca respondas clientes como se a resposta tivesse sido enviada.
- Respostas a comentários/DMs são sempre rascunhos.
- Nunca inventes preços.
- Nunca prometas resultados garantidos.
- Nunca cries provas sociais falsas.
- Imagens só podem avançar depois de ideia e legenda aprovadas por humano.
- Publicação automática fica sempre bloqueada.
- Mesmo quando uma imagem for considerada boa no futuro, a aprovação final continua humana.
- Se algo for hipótese, marca como "Hipótese provisória".
- Se algo estiver confirmado, marca como "Informação confirmada".

Agentes disponíveis nesta chamada:
${agentList}

Workflow interno obrigatório:
1. Coordenador interpreta o pedido e define objetivo.
2. Conteúdo/Calendário cria plano editorial.
3. Copywriting cria legendas, CTAs, hashtags e roteiros.
4. Criativo Visual cria tarefas/prompts visuais, apenas como pendente.
5. Relatórios organiza status, calendário e próximos passos.
6. Revisão Final verifica riscos: promessas falsas, preços inventados, tom e aprovação humana.
7. Coordenador devolve tudo consolidado.

Devolve apenas JSON válido, sem markdown, sem comentários e sem texto fora do JSON.
Usa strings simples. Se uma lista for longa, limita a 5 itens.
Formato:
{
  "coordinatorMessage": "resumo curto do coordenador",
  "agentsUsed": ["coordinator", "content"],
  "strategy": {
    "period": "semana/mês/campanha",
    "objective": "objetivo principal",
    "contentMix": ["educativo", "comercial", "autoridade"],
    "postingRhythm": "ex: 3 posts por semana",
    "approvalPolicy": "resumo da política de aprovação"
  },
  "drafts": [
    {
      "title": "título",
      "format": "Carrossel/Reels/Post estático/Resposta",
      "category": "Educativo/Comercial/Autoridade/etc",
      "text": "conteúdo completo em rascunho",
      "cta": "CTA sugerido",
      "hashtags": ["#hashtag"],
      "status": "Em revisão",
      "visualTask": {
        "needed": true,
        "prompt": "prompt visual para imagem futura",
        "styleNotes": "direção visual profissional",
        "reviewCriteria": ["critério"]
      },
      "assumptions": ["hipótese usada"]
    }
  ],
  "calendar": [
    {
      "date": "YYYY-MM-DD",
      "format": "Carrossel",
      "category": "Educativo",
      "title": "tema",
      "status": "Em revisão"
    }
  ],
  "workflow": [
    {
      "agent": "coordinator",
      "task": "tarefa",
      "status": "feito/pendente"
    }
  ],
  "approvalQueue": [
    {
      "item": "nome do conteúdo",
      "requiresApprovalFor": ["ideia", "legenda", "imagem", "publicação"],
      "blockedActions": ["publicar", "responder cliente"]
    }
  ],
  "reportingTasks": ["tarefa de relatório ou métrica para acompanhar"],
  "needsHumanApproval": ["ponto a validar"],
  "confirmedInfo": ["informação confirmada usada"],
  "provisionalAssumptions": ["hipótese provisória"]
}`;
}

function parseAnthropicText(data) {
  return (data.content || [])
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim();
}

function safeJsonParse(text) {
  const normalized = text
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .replace(/,\s*([}\]])/g, "$1")
    .trim();
  try {
    return JSON.parse(normalized);
  } catch {
    const start = normalized.indexOf("{");
    const end = normalized.lastIndexOf("}");
    if (start >= 0 && end > start) {
      const sliced = normalized.slice(start, end + 1).replace(/,\s*([}\]])/g, "$1");
      return JSON.parse(sliced);
    }
    throw new Error("Resposta da IA não veio em JSON válido.");
  }
}

async function repairJsonWithModel(rawText, model) {
  const repairResponse = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 6500,
      temperature: 0,
      system:
        "Converte a entrada em JSON válido. Não acrescentes conteúdo. Não uses markdown. Corrige apenas sintaxe JSON: vírgulas, aspas, arrays e objetos.",
      messages: [
        {
          role: "user",
          content: rawText,
        },
      ],
    }),
  });

  const data = await repairResponse.json();
  if (!repairResponse.ok) {
    throw new Error(data.error?.message || "Erro ao reparar JSON da IA.");
  }

  return safeJsonParse(parseAnthropicText(data));
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Método não permitido." });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY não está configurada na Vercel." });
  }

  try {
    const { requestText, objective = "conteudo", useReview = false } = req.body || {};
    if (!requestText || typeof requestText !== "string") {
      return res.status(400).json({ error: "requestText é obrigatório." });
    }

    const selectedAgents = inferAgents(requestText, objective);
    const model = useReview || selectedAgents.includes("review") ? MODEL_REVIEW : MODEL_NORMAL;

    const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 6500,
        temperature: 0.4,
        system: systemPrompt(selectedAgents),
        messages: [
          {
            role: "user",
            content: `Objetivo selecionado: ${objective}\n\nPedido do utilizador:\n${requestText}`,
          },
        ],
      }),
    });

    const data = await anthropicResponse.json();
    if (!anthropicResponse.ok) {
      return res.status(anthropicResponse.status).json({
        error: data.error?.message || "Erro ao chamar Anthropic.",
      });
    }

    const text = parseAnthropicText(data);
    let parsed;
    try {
      parsed = safeJsonParse(text);
    } catch {
      parsed = await repairJsonWithModel(text, MODEL_CHEAP);
    }

    return res.status(200).json({
      ...parsed,
      meta: {
        model,
        selectedAgents,
        cheapModel: MODEL_CHEAP,
        normalModel: MODEL_NORMAL,
        reviewModel: MODEL_REVIEW,
      },
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Erro inesperado." });
  }
}
