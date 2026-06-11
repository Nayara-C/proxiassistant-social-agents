const IDEOGRAM_MODEL_ENDPOINT =
  process.env.IDEOGRAM_MODEL_ENDPOINT || "https://api.ideogram.ai/v1/ideogram-v3/generate";
const IDEOGRAM_RENDERING_SPEED = process.env.IDEOGRAM_RENDERING_SPEED || "TURBO";
const IDEOGRAM_ASPECT_RATIO = process.env.IDEOGRAM_ASPECT_RATIO || "";
const MAX_PROMPT_LENGTH = 3600;

function buildHeadline(title) {
  return String(title || "Organização empresarial")
    .replace(/[“”"]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function compactText(value, limit = 1400) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

function buildImagePrompt({ title, format, category, caption, visualTask }) {
  const headline = buildHeadline(title);
  const styleNotes =
    visualTask?.styleNotes ||
    "Design profissional, claro e sóbrio para consultoria local, inspirado em comunicação empresarial premium.";

  const prompt = [
    "Criar o DESIGN FINAL de um post quadrado 1:1 para Instagram de uma consultoria empresarial.",
    "A imagem deve ser o próprio post pronto para publicar, não uma pré-visualização, não um mockup e não uma fotografia de um telemóvel.",
    "",
    "Proibições obrigatórias:",
    "- Não criar telemóvel, smartphone, ecrã, app, moldura de Instagram, feed, interface, likes, comentários, barra inferior ou screenshot.",
    "- Não criar logótipos inventados, websites, usernames, marcas falsas ou nomes de concorrentes.",
    "- Não escrever texto pequeno, ilegível, distorcido ou em falso português.",
    "- Não colocar Deloitte, PwC, KPMG ou qualquer marca de terceiros.",
    "- Não incluir preços, promessas de resultados, selos falsos, rankings falsos ou avaliações falsas.",
    "",
    "Texto do post:",
    `- Usar exatamente este título principal, grande e legível: "${headline}".`,
    "- Se o título for longo, dividir em 2 ou 3 linhas bem equilibradas.",
    "- Não adicionar parágrafos pequenos. No máximo, uma linha curta de apoio sem detalhes.",
    "- O texto deve ocupar área ampla e ter contraste forte.",
    "",
    "Direção visual:",
    "- Consultoria local para empresas e empreendedores.",
    "- Aparência de consultoria profissional premium, ao nível de firmas reconhecidas, sem copiar Deloitte, PwC, KPMG ou qualquer marca existente.",
    "- Sensação: confiança, rigor, clareza, organização, inovação discreta.",
    "- Layout limpo, editorial, sofisticado, corporativo e credível.",
    "- Usar azul corporativo profundo, branco, cinza claro, azul claro e detalhes subtis.",
    "- Composição com muito espaço negativo, hierarquia clara e ar premium.",
    "- Pode usar fotografia empresarial realista discreta, arquitetura moderna, gráficos subtis ou abstração corporativa elegante.",
    "- Evitar stock genérico exagerado, pessoas com aparência artificial, mãos deformadas, gráficos confusos, excesso de brilhos, 3D infantil ou estilo cartoon.",
    "",
    "Elementos visuais aceitáveis:",
    "- Escritório moderno com vidro, reuniões profissionais, análise de dados, relatórios financeiros, gráficos subtis, cidade corporativa, arquitetura moderna.",
    "- Abstrações com linhas finas, pontos conectados, mapas discretos, grelhas, dashboards e formas geométricas sóbrias.",
    "- Estética consistente com portfólio corporate azul e branco.",
    "",
    `Formato do conteúdo: ${format || "Post Instagram"}.`,
    `Categoria: ${category || "Conteúdo empresarial"}.`,
    `Tema do conteúdo: ${title || "conteúdo empresarial"}.`,
    "",
    "Direção visual aprovada:",
    visualTask?.prompt || "Imagem editorial empresarial, organizada e com espaço visual para mensagem curta.",
    "",
    "Notas de estilo:",
    styleNotes,
    "",
    "Resumo da legenda para contexto:",
    compactText(caption),
  ].join("\n");

  return prompt.slice(0, MAX_PROMPT_LENGTH);
}

function reviewVisualRequest({ title, caption, visualTask }) {
  const warnings = [];
  const joined = `${title || ""} ${caption || ""} ${visualTask?.prompt || ""}`.toLowerCase();

  if (/(preço|kwanza|usd|€|\$)/i.test(joined)) {
    warnings.push("O pedido menciona preço; confirmar manualmente antes de usar.");
  }
  if (/(garantid|resultado garantido|100%|milagre|fórmula mágica)/i.test(joined)) {
    warnings.push("O pedido pode sugerir promessa forte; rever antes de publicar.");
  }
  if (!visualTask?.prompt) {
    warnings.push("O rascunho não tinha prompt visual detalhado; foi usado um prompt seguro padrão.");
  }
  if (String(visualTask?.prompt || "").length < 80) {
    warnings.push("O prompt visual era curto; foi enriquecido automaticamente com o guia visual corporate.");
  }
  if (/logo|logotipo|logótipo|proxi/i.test(visualTask?.prompt || "")) {
    warnings.push(
      "O pedido visual menciona logótipo/marca; a geração foi orientada para não inventar marcas.",
    );
  }

  return {
    status: warnings.length ? "Precisa revisão humana" : "Pronto para revisão humana",
    warnings,
    criteria: [
      "A imagem deve parecer premium, profissional e adequada a consultoria.",
      "A imagem deve seguir o universo azul/branco/cinza definido para a marca.",
      "A imagem não deve parecer stock genérico nem visual artificial.",
      "A imagem deve ser o post final, sem telemóvel, app, feed ou screenshot.",
      "O título principal deve estar grande e legível.",
      "A imagem não deve conter logótipo inventado, usernames, interface social ou texto pequeno ilegível.",
      "Não deve conter preços, promessas garantidas ou provas sociais falsas.",
      "A imagem final deve ser validada por uma pessoa antes de publicar.",
    ],
  };
}

function readIdeogramError(data) {
  if (!data) return "Erro ao gerar imagem.";
  if (typeof data === "string") return data;
  if (typeof data.message === "string") return data.message;
  if (typeof data.detail === "string") return data.detail;
  if (typeof data.error === "string") return data.error;
  if (typeof data.error?.message === "string") return data.error.message;
  if (Array.isArray(data.errors) && data.errors.length) {
    return data.errors
      .map((item) => item.message || item.detail || JSON.stringify(item))
      .join(" ");
  }
  try {
    return JSON.stringify(data);
  } catch {
    return "Erro ao gerar imagem.";
  }
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
    const requestBody = {
      prompt,
      rendering_speed: IDEOGRAM_RENDERING_SPEED,
    };

    if (IDEOGRAM_ASPECT_RATIO) {
      requestBody.aspect_ratio = IDEOGRAM_ASPECT_RATIO;
    }

    const ideogramResponse = await fetch(IDEOGRAM_MODEL_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "Api-Key": process.env.IDEOGRAM_API_KEY,
      },
      body: JSON.stringify(requestBody),
    });

    const rawData = await ideogramResponse.text();
    let data = {};
    try {
      data = rawData ? JSON.parse(rawData) : {};
    } catch {
      data = { message: rawData || "Resposta inválida da Ideogram." };
    }
    if (!ideogramResponse.ok) {
      response.status(ideogramResponse.status).json({
        error: readIdeogramError(data),
        provider: "ideogram",
        status: ideogramResponse.status,
        hint:
          "Confirma se a IDEOGRAM_API_KEY está correta, se há créditos disponíveis e se IDEOGRAM_RENDERING_SPEED está definido como TURBO, DEFAULT ou QUALITY.",
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
        costControl: {
          imagesRequested: 1,
          duplicateRequestsBlockedInApp: true,
          renderingSpeed: IDEOGRAM_RENDERING_SPEED,
          aspectRatioParameterSent: Boolean(IDEOGRAM_ASPECT_RATIO),
        },
      },
    });
  } catch (error) {
    response.status(500).json({ error: error.message || "Erro inesperado ao gerar imagem." });
  }
}
