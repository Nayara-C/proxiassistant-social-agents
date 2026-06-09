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
};

function inferAgents(text, objective) {
  const clean = `${objective} ${text}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const selected = ["coordinator"];

  if (/conteudo|post|posts|calendario|ideia|semana|mes|campanha/.test(clean)) selected.push("content");
  if (/legenda|copy|hashtags|reels|comentario|mensagem|dm|resposta|texto/.test(clean)) selected.push("copy");
  if (/excel|relatorio|tabela|organizar|aprovacao|status|metrica/.test(clean)) selected.push("reports");
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

  return `És o sistema de agentes da Proxiassistant, uma empresa de consultoria local para empresas e empreendedores.

Tom de voz: profissional, claro e direto.

Regras obrigatórias:
- Nunca publiques conteúdo.
- Nunca respondas clientes como se a resposta tivesse sido enviada.
- Respostas a comentários/DMs são sempre rascunhos.
- Nunca inventes preços.
- Nunca prometas resultados garantidos.
- Nunca cries provas sociais falsas.
- Imagens só podem avançar depois de ideia e legenda aprovadas por humano.
- Se algo for hipótese, marca como "Hipótese provisória".
- Se algo estiver confirmado, marca como "Informação confirmada".

Agentes disponíveis nesta chamada:
${agentList}

Devolve apenas JSON válido, sem markdown, neste formato:
{
  "coordinatorMessage": "resumo curto do coordenador",
  "agentsUsed": ["coordinator", "content"],
  "drafts": [
    {
      "title": "título",
      "format": "Carrossel/Reels/Post estático/Resposta",
      "category": "Educativo/Comercial/Autoridade/etc",
      "text": "conteúdo completo em rascunho",
      "status": "Em revisão",
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
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(text.slice(start, end + 1));
    }
    throw new Error("Resposta da IA não veio em JSON válido.");
  }
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
        max_tokens: 5000,
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
    const parsed = safeJsonParse(text);

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
