const MODEL_CHEAP = process.env.MODEL_CHEAP || "claude-haiku-4-5-20251001";
const MODEL_NORMAL = process.env.MODEL_NORMAL || "claude-sonnet-4-6";
const MODEL_REVIEW = process.env.MODEL_REVIEW || "claude-opus-4-8";

const AGENT_REGISTRY = {
  coordinator: {
    name: "Agente Coordenador",
    model: MODEL_NORMAL,
    useWhen: "Orquestra o fluxo, decide etapas, consolida e protege as regras.",
  },
  content: {
    name: "Agente Conteúdo/Calendário",
    model: MODEL_CHEAP,
    useWhen: "Estratégia editorial, calendário, formatos e categorias.",
  },
  copy: {
    name: "Agente Copywriting",
    model: MODEL_NORMAL,
    useWhen: "Legendas, CTAs, hashtags, roteiros e respostas em rascunho.",
  },
  visual: {
    name: "Agente Criativo Visual",
    model: MODEL_NORMAL,
    useWhen: "Prompts visuais, direção de imagem e critérios de revisão.",
  },
  reports: {
    name: "Agente Relatórios Excel",
    model: MODEL_CHEAP,
    useWhen: "Status, aprovações, relatório, métricas e organização.",
  },
  review: {
    name: "Agente Revisão Final",
    model: MODEL_REVIEW,
    useWhen: "Revisão de riscos, promessas, tom e decisões importantes.",
  },
};

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function inferAgents(text, objective) {
  const clean = normalize(`${objective} ${text}`);
  const selected = ["coordinator", "content", "copy", "reports"];

  if (/imagem|visual|design|criativo|post visual/.test(clean)) selected.push("visual");
  if (/rever|revisao|final|estrategia|decisao importante/.test(clean)) selected.push("review");
  if (/comentario|mensagem|dm|cliente|responder|comunidade/.test(clean)) selected.push("copy");

  return [...new Set(selected)];
}

async function callAnthropicTool({
  model,
  system,
  user,
  schema,
  maxTokens = 4500,
  temperature = 0.35,
}) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature,
      system,
      tools: [
        {
          name: "return_result",
          description: "Devolve o resultado estruturado para a aplicação.",
          input_schema: schema,
        },
      ],
      tool_choice: { type: "tool", name: "return_result" },
      messages: [{ role: "user", content: user }],
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || "Erro ao chamar Anthropic.");
  }

  const toolUse = (data.content || []).find(
    (part) => part.type === "tool_use" && part.name === "return_result",
  );

  if (!toolUse?.input) {
    throw new Error("A Anthropic não devolveu resultado estruturado.");
  }

  return toolUse.input;
}

function baseRules() {
  return `Contexto:
- Empresa: Proxiassistant.
- Tipo: consultoria local para empresas e empreendedores.
- Canal principal: Instagram.
- Tom: profissional, claro e direto.

Regras obrigatórias:
- Nunca publicar conteúdo.
- Nunca responder clientes automaticamente.
- Respostas a comentários/DMs são sempre rascunhos.
- Nunca inventar preços.
- Nunca prometer resultados garantidos.
- Nunca criar provas sociais falsas.
- Imagens só podem avançar depois de ideia e legenda aprovadas por humano.
- Publicação automática fica bloqueada.
- Se algo for hipótese, marcar como "Hipótese provisória".`;
}

const coordinatorSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    coordinatorMessage: { type: "string" },
    strategy: {
      type: "object",
      additionalProperties: false,
      properties: {
        period: { type: "string" },
        objective: { type: "string" },
        contentMix: { type: "array", items: { type: "string" } },
        postingRhythm: { type: "string" },
        approvalPolicy: { type: "string" },
      },
      required: ["period", "objective", "contentMix", "postingRhythm", "approvalPolicy"],
    },
    workflow: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          agent: { type: "string" },
          task: { type: "string" },
          status: { type: "string" },
        },
        required: ["agent", "task", "status"],
      },
    },
    confirmedInfo: { type: "array", items: { type: "string" } },
    provisionalAssumptions: { type: "array", items: { type: "string" } },
    needsHumanApproval: { type: "array", items: { type: "string" } },
  },
  required: [
    "coordinatorMessage",
    "strategy",
    "workflow",
    "confirmedInfo",
    "provisionalAssumptions",
    "needsHumanApproval",
  ],
};

const contentSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    calendar: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          date: { type: "string" },
          format: { type: "string" },
          category: { type: "string" },
          title: { type: "string" },
          objective: { type: "string" },
          status: { type: "string" },
        },
        required: ["date", "format", "category", "title", "objective", "status"],
      },
    },
    contentNotes: { type: "array", items: { type: "string" } },
  },
  required: ["calendar", "contentNotes"],
};

const copySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    drafts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          format: { type: "string" },
          category: { type: "string" },
          text: { type: "string" },
          cta: { type: "string" },
          hashtags: { type: "array", items: { type: "string" } },
          status: { type: "string" },
          visualTask: {
            type: "object",
            additionalProperties: false,
            properties: {
              needed: { type: "boolean" },
              prompt: { type: "string" },
              styleNotes: { type: "string" },
              reviewCriteria: { type: "array", items: { type: "string" } },
            },
            required: ["needed", "prompt", "styleNotes", "reviewCriteria"],
          },
          assumptions: { type: "array", items: { type: "string" } },
        },
        required: [
          "title",
          "format",
          "category",
          "text",
          "cta",
          "hashtags",
          "status",
          "visualTask",
          "assumptions",
        ],
      },
    },
  },
  required: ["drafts"],
};

const reviewSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    approvalQueue: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          item: { type: "string" },
          requiresApprovalFor: { type: "array", items: { type: "string" } },
          blockedActions: { type: "array", items: { type: "string" } },
        },
        required: ["item", "requiresApprovalFor", "blockedActions"],
      },
    },
    reportingTasks: { type: "array", items: { type: "string" } },
    reviewNotes: { type: "array", items: { type: "string" } },
    needsHumanApproval: { type: "array", items: { type: "string" } },
  },
  required: ["approvalQueue", "reportingTasks", "reviewNotes", "needsHumanApproval"],
};

function coordinatorSystem() {
  return `${baseRules()}

És o Agente Coordenador. Age como gestor completo de redes sociais.
Quando o utilizador disser algo amplo como "gere o Instagram", cria um plano profissional sem pedir microinstruções.
Decide período, objetivo, mix editorial, ritmo, workflow e aprovações.

Usa a ferramenta return_result para devolver estratégia, workflow, informação confirmada, hipóteses e aprovações necessárias.`;
}

function contentSystem() {
  return `${baseRules()}

És o Agente Conteúdo/Calendário.
Cria calendário editorial profissional com base no pedido e na estratégia do Coordenador.
Se for pedido mensal e não houver quantidade, cria 8 conteúdos nesta primeira versão.
Se for pedido semanal e não houver quantidade, cria 3 conteúdos.
Alterna formatos: Carrossel, Reels, Post estático, Story.
Equilibra educativo, autoridade, relacionamento e comercial.

Usa a ferramenta return_result para devolver calendar e contentNotes.`;
}

function copySystem() {
  return `${baseRules()}

És o Agente Copywriting e Criativo Visual.
Recebes um calendário e transformas cada item em rascunho pronto para aprovação.
Mantém cada rascunho compacto para evitar respostas demasiado longas.
Para carrosséis, escreve estrutura por slides.
Para Reels, escreve roteiro curto.
Para posts estáticos, escreve legenda.
Para Stories, escreve sequência simples.
Inclui CTA, hashtags e tarefa visual para cada conteúdo.

Usa a ferramenta return_result para devolver drafts estruturados.`;
}

function reviewSystem() {
  return `${baseRules()}

És o Agente Revisão Final e Relatórios.
Revê riscos, aprovações, promessas, preço inventado, tom e organização.
Não reescrevas tudo. Devolve fila de aprovação, tarefas de relatório e alertas.

Usa a ferramenta return_result para devolver approvalQueue, reportingTasks, reviewNotes e needsHumanApproval.`;
}

function buildFallbackFromText(rawText, requestText, selectedAgents, model) {
  const cleanText = String(rawText || "").replace(/```json/gi, "").replace(/```/g, "").trim();

  return {
    coordinatorMessage:
      "A IA gerou conteúdo, mas houve uma falha técnica na estrutura. Preservei a resposta como rascunho seguro.",
    agentsUsed: selectedAgents,
    strategy: {
      period: "a confirmar",
      objective: requestText,
      contentMix: ["educativo", "autoridade", "comercial"],
      postingRhythm: "a confirmar pela equipa",
      approvalPolicy: "Tudo fica pendente de aprovação humana.",
    },
    drafts: [
      {
        title: "Rascunho gerado pelo Coordenador",
        format: "Plano/Rascunho",
        category: "Gestão de redes sociais",
        text: cleanText || "A resposta da IA veio vazia ou ilegível.",
        cta: "",
        hashtags: [],
        status: "Em revisão",
        visualTask: {
          needed: true,
          prompt: "Criar imagem apenas depois de aprovação humana.",
          styleNotes: "Visual profissional, limpo e alinhado com consultoria local.",
          reviewCriteria: ["legibilidade", "profissionalismo", "coerência"],
        },
        assumptions: ["Fallback técnico usado."],
      },
    ],
    calendar: [],
    workflow: [{ agent: "coordinator", task: "Converter resposta em rascunho seguro.", status: "feito" }],
    approvalQueue: [
      {
        item: "Rascunho gerado pelo Coordenador",
        requiresApprovalFor: ["ideia", "legenda", "imagem", "publicação"],
        blockedActions: ["publicar", "responder cliente"],
      },
    ],
    reportingTasks: ["Rever rascunho e regenerar se necessário."],
    needsHumanApproval: ["Validar conteúdo antes de uso."],
    confirmedInfo: ["Aprovação humana é obrigatória."],
    provisionalAssumptions: ["Resposta preservada em modo fallback."],
    meta: { model, selectedAgents, parserFallback: true },
  };
}

async function runOrchestration({ requestText, objective, selectedAgents, useReview }) {
  const coordinator = await callAnthropicTool({
    model: MODEL_NORMAL,
    maxTokens: 2200,
    system: coordinatorSystem(),
    schema: coordinatorSchema,
    user: `Objetivo selecionado: ${objective}\nPedido do utilizador: ${requestText}`,
  });
  if (!coordinator?.strategy) {
    throw new Error("Agente Coordenador devolveu uma estrutura inválida.");
  }

  const content = await callAnthropicTool({
    model: MODEL_CHEAP,
    maxTokens: 4200,
    system: contentSystem(),
    schema: contentSchema,
    user: JSON.stringify({ requestText, objective, strategy: coordinator.strategy }),
  });
  if (!Array.isArray(content?.calendar)) {
    throw new Error("Agente Conteúdo devolveu uma estrutura inválida.");
  }

  const copy = await callAnthropicTool({
    model: MODEL_NORMAL,
    maxTokens: 5600,
    system: copySystem(),
    schema: copySchema,
    user: JSON.stringify({
      requestText,
      objective,
      strategy: coordinator.strategy,
      calendar: content.calendar || [],
    }),
  });
  if (!Array.isArray(copy?.drafts)) {
    throw new Error("Agente Copywriting devolveu uma estrutura inválida.");
  }

  const reviewModel = useReview ? MODEL_REVIEW : MODEL_NORMAL;
  const review = await callAnthropicTool({
    model: reviewModel,
    maxTokens: 3000,
    temperature: 0.2,
    system: reviewSystem(),
    schema: reviewSchema,
    user: JSON.stringify({
      requestText,
      strategy: coordinator.strategy,
      calendar: content.calendar || [],
      drafts: copy.drafts || [],
    }),
  });
  if (!review?.approvalQueue) {
    throw new Error("Agente Revisão devolveu uma estrutura inválida.");
  }

  return {
    coordinatorMessage: coordinator.coordinatorMessage,
    agentsUsed: selectedAgents,
    strategy: coordinator.strategy,
    drafts: copy.drafts || [],
    calendar: (content.calendar || []).map((item) => ({
      date: item.date || "",
      format: item.format || "Post",
      category: item.category || "Conteúdo",
      title: item.title || "Sem título",
      status: item.status || "Em revisão",
    })),
    workflow: coordinator.workflow || [],
    approvalQueue: review.approvalQueue || [],
    reportingTasks: review.reportingTasks || [],
    needsHumanApproval: [
      ...(coordinator.needsHumanApproval || []),
      ...(review.needsHumanApproval || []),
    ],
    confirmedInfo: coordinator.confirmedInfo || [],
    provisionalAssumptions: coordinator.provisionalAssumptions || [],
    reviewNotes: review.reviewNotes || [],
  };
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
    const result = await runOrchestration({ requestText, objective, selectedAgents, useReview });

    return res.status(200).json({
      ...result,
      meta: {
        model: MODEL_NORMAL,
        selectedAgents,
        cheapModel: MODEL_CHEAP,
        normalModel: MODEL_NORMAL,
        reviewModel: MODEL_REVIEW,
        orchestration: "multi-agent-staged",
      },
    });
  } catch (error) {
    const { requestText = "", objective = "conteudo" } = req.body || {};
    const selectedAgents = inferAgents(requestText, objective);
    return res.status(200).json(
      buildFallbackFromText(error.message, requestText, selectedAgents, MODEL_NORMAL),
    );
  }
}
