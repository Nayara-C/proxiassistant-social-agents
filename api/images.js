const IMAGE_PROVIDER = process.env.IMAGE_PROVIDER || "template";
const IDEOGRAM_MODEL_ENDPOINT =
  process.env.IDEOGRAM_MODEL_ENDPOINT || "https://api.ideogram.ai/v1/ideogram-v3/generate";
const IDEOGRAM_RENDERING_SPEED = process.env.IDEOGRAM_RENDERING_SPEED || "TURBO";
const IDEOGRAM_ASPECT_RATIO = process.env.IDEOGRAM_ASPECT_RATIO || "";
const MAX_PROMPT_LENGTH = 3600;

function cleanText(value, fallback = "") {
  return String(value || fallback)
    .replace(/[“”"]/g, "")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildHeadline(title) {
  return cleanText(title, "Organização empresarial").slice(0, 86);
}

function compactText(value, limit = 1400) {
  return cleanText(value).slice(0, limit);
}

function escapeXml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function wrapWords(text, maxChars, maxLines = 4) {
  const words = cleanText(text).split(" ").filter(Boolean);
  const lines = [];
  let line = "";

  words.forEach((word) => {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  });

  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1].replace(/[.,;:!?]+$/, "")}...`;
    return kept;
  }
  return lines;
}

function splitSupportLine(caption) {
  const text = cleanText(caption)
    .replace(/^Legenda:\s*/i, "")
    .replace(/^Slide\s+\d+:\s*/i, "");
  if (!text) return "Clareza para decidir. Estrutura para crescer.";
  return text.slice(0, 92);
}

function buildTemplateSvg({ title, format, category, caption }) {
  const headline = buildHeadline(title);
  const headlineLines = wrapWords(headline, headline.length > 52 ? 19 : 23, 4);
  const support = splitSupportLine(caption);
  const supportLines = wrapWords(support, 42, 2);
  const categoryLabel = cleanText(category, "Gestão").toUpperCase().slice(0, 24);
  const formatLabel = cleanText(format, "POST").toUpperCase().slice(0, 22);
  const titleSize = headlineLines.length >= 4 ? 58 : headlineLines.length === 3 ? 68 : 78;
  const titleStartY = headlineLines.length >= 4 ? 360 : headlineLines.length === 3 ? 390 : 420;
  const titleLineHeight = titleSize + 12;

  const titleText = headlineLines
    .map(
      (line, index) =>
        `<text x="88" y="${titleStartY + index * titleLineHeight}" class="headline">${escapeXml(line)}</text>`,
    )
    .join("");

  const supportText = supportLines
    .map(
      (line, index) =>
        `<text x="92" y="${760 + index * 38}" class="support">${escapeXml(line)}</text>`,
    )
    .join("");

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#f7fbff"/>
      <stop offset="58%" stop-color="#e9f2f8"/>
      <stop offset="100%" stop-color="#d6e6f1"/>
    </linearGradient>
    <linearGradient id="navy" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#123f66"/>
      <stop offset="100%" stop-color="#1f5b8c"/>
    </linearGradient>
    <style>
      .label { font-family: Arial, Helvetica, sans-serif; font-size: 24px; font-weight: 700; letter-spacing: 2px; fill: #1f5b8c; }
      .headline { font-family: Arial, Helvetica, sans-serif; font-size: ${titleSize}px; font-weight: 800; fill: #102f4a; letter-spacing: 0; }
      .support { font-family: Arial, Helvetica, sans-serif; font-size: 28px; font-weight: 500; fill: #38566d; letter-spacing: 0; }
      .footer { font-family: Arial, Helvetica, sans-serif; font-size: 24px; font-weight: 700; fill: #ffffff; letter-spacing: 0.5px; }
    </style>
  </defs>

  <rect width="1080" height="1080" fill="url(#bg)"/>
  <rect x="0" y="0" width="1080" height="1080" fill="none"/>

  <circle cx="940" cy="130" r="190" fill="#ffffff" opacity="0.55"/>
  <circle cx="950" cy="130" r="124" fill="none" stroke="#1f5b8c" stroke-width="2" opacity="0.18"/>
  <circle cx="892" cy="780" r="280" fill="#1f5b8c" opacity="0.08"/>
  <path d="M750 220 C820 280 882 340 946 428" fill="none" stroke="#1f5b8c" stroke-width="4" opacity="0.22"/>
  <path d="M748 286 C850 330 910 390 984 500" fill="none" stroke="#1f5b8c" stroke-width="2" opacity="0.14"/>

  <rect x="72" y="72" width="936" height="936" rx="0" fill="none" stroke="#b9cedd" stroke-width="2"/>
  <rect x="72" y="72" width="14" height="936" fill="url(#navy)"/>

  <text x="92" y="138" class="label">${escapeXml(categoryLabel)} / ${escapeXml(formatLabel)}</text>
  <line x1="92" y1="172" x2="328" y2="172" stroke="#1f5b8c" stroke-width="5"/>
  <circle cx="356" cy="172" r="7" fill="#1f5b8c"/>
  <circle cx="386" cy="172" r="7" fill="#8fb8d4"/>

  ${titleText}

  <rect x="88" y="704" width="620" height="3" fill="#8fb8d4"/>
  ${supportText}

  <rect x="72" y="920" width="936" height="88" fill="url(#navy)"/>
  <text x="92" y="974" class="footer">Proxiassistant</text>
  <text x="700" y="974" class="footer" opacity="0.86">Consultoria empresarial</text>
</svg>`.trim();
}

function svgToDataUrl(svg) {
  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
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
  if (IMAGE_PROVIDER === "template") {
    warnings.push("Imagem gerada por template controlado para garantir texto legível e evitar mockups.");
  }

  return {
    status: warnings.length ? "Precisa revisão humana" : "Pronto para revisão humana",
    warnings,
    criteria: [
      "A imagem deve parecer premium, profissional e adequada a consultoria.",
      "A imagem deve seguir o universo azul/branco/cinza definido para a marca.",
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

async function generateWithIdeogram(payload, review) {
  if (!process.env.IDEOGRAM_API_KEY) {
    throw new Error("IDEOGRAM_API_KEY não está configurada na Vercel.");
  }

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
    const message = readIdeogramError(data);
    const error = new Error(message);
    error.status = ideogramResponse.status;
    throw error;
  }

  const image = data.data?.[0];
  if (!image?.url) {
    throw new Error("A API de imagem não devolveu uma imagem utilizável.");
  }

  return {
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
  };
}

function generateWithTemplate(payload, review) {
  const svg = buildTemplateSvg(payload);
  return {
    imageUrl: svgToDataUrl(svg),
    revisedPrompt:
      "Template Proxiassistant controlado por código: post quadrado 1:1, texto legível, sem telemóvel, sem interface social e sem logótipos inventados.",
    review,
    meta: {
      provider: "proxi-template-engine",
      model: "corporate-post-template-v1",
      approvalRequired: true,
      costControl: {
        imagesRequested: 0,
        paidGeneration: false,
        duplicateRequestsBlockedInApp: true,
      },
    },
  };
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.status(405).json({ error: "Método não permitido." });
    return;
  }

  try {
    const payload = request.body || {};
    const review = reviewVisualRequest(payload);
    const result =
      IMAGE_PROVIDER === "ideogram"
        ? await generateWithIdeogram(payload, review)
        : generateWithTemplate(payload, review);

    response.status(200).json(result);
  } catch (error) {
    response.status(error.status || 500).json({
      error: error.message || "Erro inesperado ao gerar imagem.",
      provider: IMAGE_PROVIDER,
      status: error.status || 500,
      hint:
        IMAGE_PROVIDER === "ideogram"
          ? "Confirma a chave, créditos e parâmetros da Ideogram. Para evitar custos e texto ilegível, usa IMAGE_PROVIDER=template."
          : "O motor de template falhou. Verifica título, legenda e payload enviado para /api/images.",
    });
  }
}
