const IDEOGRAM_MODEL_ENDPOINT =
  process.env.IDEOGRAM_MODEL_ENDPOINT || "https://api.ideogram.ai/v1/ideogram-v3/generate";
const IDEOGRAM_RENDERING_SPEED = process.env.IDEOGRAM_RENDERING_SPEED || "TURBO";

function buildImagePrompt({ title, format, category, caption, visualTask }) {
  const styleNotes =
    visualTask?.styleNotes ||
    "Design profissional, claro e sóbrio para consultoria local, inspirado em comunicação empresarial.";

  return [
    "Cria uma imagem para um post de Instagram da Proxiassistant.",
    "",
    "Identidade visual:",
    "- Empresa de consultoria local para empresas e empreendedores.",
    "- Estilo profissional, limpo, moderno e credível.",
    "- Usar azul corporativo, branco, cinza claro e pequenos detalhes neutros.",
    "- Evitar aspeto genérico de IA, excesso de brilho, elementos fantasiosos ou texto ilegível.",
    "- Não incluir preços, promessas de resultados, selos falsos, avaliações falsas ou logótipos de terceiros.",
    "",
    `Formato do conteúdo: ${format || "Post Instagram"}.`,
    `Categoria: ${category || "Conteúdo empresarial"}.`,
    `Tema: ${title || "Conteúdo Proxiassistant"}.`,
    "",
    "Direção visual aprovada:",
    visualTask?.prompt || "Imagem editorial empresarial, organizada e com espaço visual para mensagem curta.",
    "",
    "Notas de estilo:",
    styleNotes,
    "",
    "Resumo da legenda para contexto:",
    String(caption || "").slice(0, 1400),
  ].join("\n");
}

function reviewVisualRequest({ title, caption, visualTask }) {
  const warnings = [];
  const joined = `${title || ""} ${caption || ""} ${visualTask?.prompt || ""}`.toLowerCase();

  if (/(preço|kwanza|usd|€|\\$)/i.test(joined)) {
    warnings.push("O pedido menciona preço; confirmar manualmente antes de usar.");
  }
  if (/(garantid|resultado garantido|100%|milagre|fórmula mágica)/i.test(joined)) {
    warnings.push("O pedido pode sugerir promessa forte; rever antes de publicar.");
  }
  if (!visualTask?.prompt) {
    warnings.push("O rascunho não tinha prompt visual detalhado; foi usado um prompt seguro padrão.");
  }

  return {
    status: warnings.length ? "Precisa revisão humana" : "Pronto para revisão humana",
    warnings,
    criteria: [
      "A imagem deve parecer profissional e adequada a consultoria.",
      "Não deve conter preços, promessas garantidas ou provas sociais falsas.",
      "A imagem final deve ser validada por uma pessoa antes de publicar.",
    ],
  };
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.status(405).json({ error: "Método não permitido." });
    return;
  }

  if (!process.env.IDEOGRAM_API_KEY) {
    response.status(500).json({
      error:
        "IDEOGRAM_API_KEY não está configurada na Vercel. Adiciona essa variável para ativar a geração de imagens.",
    });
    return;
  }

  try {
    const payload = request.body || {};
    const review = reviewVisualRequest(payload);
    const prompt = buildImagePrompt(payload);

    const ideogramResponse = await fetch(IDEOGRAM_MODEL_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "Api-Key": process.env.IDEOGRAM_API_KEY,
      },
      body: JSON.stringify({
        prompt,
        rendering_speed: IDEOGRAM_RENDERING_SPEED,
        aspect_ratio: "ASPECT_1_1",
      }),
    });

    const data = await ideogramResponse.json();
    if (!ideogramResponse.ok) {
      response.status(ideogramResponse.status).json({
        error: data.error?.message || "Erro ao gerar imagem.",
      });
      return;
    }

    const image = data.data?.[0];
    if (!image?.url) {
      response.status(500).json({ error: "A API de imagem não devolveu uma imagem utilizável." });
      return;
    }

    response.status(200).json({
      imageUrl: image.url,
      revisedPrompt: image.revised_prompt || image.prompt || prompt,
      review,
      meta: {
        provider: "ideogram",
        model: `ideogram-v3-${IDEOGRAM_RENDERING_SPEED.toLowerCase()}`,
        approvalRequired: true,
      },
    });
  } catch (error) {
    response.status(500).json({ error: error.message || "Erro inesperado ao gerar imagem." });
  }
}
