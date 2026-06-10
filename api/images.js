const IMAGE_MODEL = process.env.IMAGE_MODEL || "gpt-image-1";

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

  if (!process.env.OPENAI_API_KEY) {
    response.status(500).json({
      error:
        "OPENAI_API_KEY não está configurada na Vercel. Adiciona essa variável para ativar a geração de imagens.",
    });
    return;
  }

  try {
    const payload = request.body || {};
    const review = reviewVisualRequest(payload);
    const prompt = buildImagePrompt(payload);

    const openaiResponse = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: IMAGE_MODEL,
        prompt,
        size: "1024x1024",
        quality: "low",
        output_format: "png",
      }),
    });

    const data = await openaiResponse.json();
    if (!openaiResponse.ok) {
      response.status(openaiResponse.status).json({
        error: data.error?.message || "Erro ao gerar imagem.",
      });
      return;
    }

    const image = data.data?.[0];
    if (!image?.b64_json && !image?.url) {
      response.status(500).json({ error: "A API de imagem não devolveu uma imagem utilizável." });
      return;
    }

    response.status(200).json({
      imageUrl: image.b64_json ? `data:image/png;base64,${image.b64_json}` : image.url,
      revisedPrompt: image.revised_prompt || prompt,
      review,
      meta: {
        provider: "openai",
        model: IMAGE_MODEL,
        approvalRequired: true,
      },
    });
  } catch (error) {
    response.status(500).json({ error: error.message || "Erro inesperado ao gerar imagem." });
  }
}
