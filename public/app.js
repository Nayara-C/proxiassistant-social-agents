const STORAGE_KEY = "proxiassistant-agent-system-v1";
const FIRESTORE_COLLECTION = "userWorkspaces";

const firebaseConfig = {
  apiKey: "AIzaSyBCdt_h6S7jSppXR3pfuYx02jh1ZEiNFh8",
  authDomain: "proxiassistant-social-agents.firebaseapp.com",
  projectId: "proxiassistant-social-agents",
  storageBucket: "proxiassistant-social-agents.firebasestorage.app",
  messagingSenderId: "763058535666",
  appId: "1:763058535666:web:b457bd801750c1015aa46b",
};

let auth = null;
let db = null;
let currentUser = null;
let saveTimer = null;

if (window.firebase) {
  firebase.initializeApp(firebaseConfig);
  auth = firebase.auth();
  db = firebase.firestore();
}

const confirmedFacts = [
  "A empresa chama-se Proxiassistant.",
  "A Proxiassistant é uma empresa de consultoria local.",
  "O público-alvo são empresas e empreendedores.",
  "O Instagram é o canal principal.",
  "O tom deve ser profissional, claro e direto.",
  "Nada deve ser publicado sem aprovação humana.",
  "Respostas a clientes são apenas rascunhos.",
  "Imagens só avançam depois da ideia e legenda aprovadas.",
];

const defaultAssumptions = [
  "A Proxiassistant pode falar de organização, processos, gestão, atendimento e vendas.",
  "A campanha inicial pode chamar-se Diagnóstico Empresarial.",
  "O CTA provisório pode ser Fala connosco ou Entra em contacto connosco.",
  "A frequência piloto pode ser de 3 conteúdos por semana.",
];

const agents = {
  coordinator: {
    name: "Agente Coordenador",
    role: "Interpreta o pedido, decide agentes a acionar e consolida o resultado.",
  },
  content: {
    name: "Agente Conteúdo/Calendário",
    role: "Cria ideias, calendário, formatos, categorias e objetivos.",
  },
  copy: {
    name: "Agente Copywriting",
    role: "Escreve legendas, CTAs, hashtags, roteiros e respostas em rascunho.",
  },
  visual: {
    name: "Agente Criativo Visual/Imagem",
    role: "Define direção visual premium e cria imagens após aprovação humana.",
  },
  reports: {
    name: "Agente Relatórios Excel",
    role: "Organiza dados em tabelas, status e próximos passos.",
  },
  review: {
    name: "Agente Revisão Final",
    role: "Revê riscos, tom, promessas e decisões importantes.",
  },
  metrics: {
    name: "Agente Métricas",
    role: "Analisa resultados quando existirem métricas reais.",
  },
  competition: {
    name: "Agente Concorrência",
    role: "Analisa concorrentes quando existirem nomes ou links.",
  },
};

let state = loadState();

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    return JSON.parse(saved);
  }

  return {
    messages: [
      {
        sender: "agent",
        name: "Agente Coordenador",
        text:
          "Sistema pronto. Envia um pedido e eu aciono os agentes necessários. Tudo será tratado como rascunho até aprovação humana.",
      },
    ],
    drafts: [],
    calendar: [],
    approvals: [],
    assumptions: [...defaultAssumptions],
    lastAgents: [],
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  scheduleCloudSave();
}

function scheduleCloudSave() {
  if (!currentUser || !db) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    db.collection(FIRESTORE_COLLECTION)
      .doc(currentUser.uid)
      .set(
        {
          ownerEmail: currentUser.email,
          state,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      )
      .catch((error) => {
        console.error("Erro ao guardar no Firestore:", error);
      });
  }, 450);
}

async function loadCloudState(user) {
  if (!db) return;
  const doc = await db.collection(FIRESTORE_COLLECTION).doc(user.uid).get();
  if (doc.exists && doc.data().state) {
    state = doc.data().state;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } else {
    await db.collection(FIRESTORE_COLLECTION).doc(user.uid).set(
      {
        ownerEmail: user.email,
        state,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }
}

function normalize(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function inferAgents(text, objective) {
  const clean = normalize(`${objective} ${text}`);
  const selected = ["coordinator"];

  if (/conteudo|post|posts|calendario|ideia|semana|mes|campanha/.test(clean)) {
    selected.push("content");
  }
  if (/legenda|copy|hashtags|reels|comentario|mensagem|dm|resposta|texto/.test(clean)) {
    selected.push("copy");
  }
  if (/conteudo|post|posts|calendario|ideia|semana|mes|campanha|imagem|visual|design/.test(clean)) {
    selected.push("visual");
  }
  if (/excel|relatorio|tabela|organizar|aprovacao|status/.test(clean)) {
    selected.push("reports");
  }
  if (/metrica|alcance|impressoes|gostos|comentarios|seguidores|desempenho/.test(clean)) {
    selected.push("metrics");
  }
  if (/concorrente|concorrencia|referencia/.test(clean)) {
    selected.push("competition");
  }

  if (selected.length === 1) {
    selected.push("content", "copy", "reports");
  }

  return [...new Set(selected)];
}

function makeDate(offset) {
  const start = new Date("2026-06-15T12:00:00");
  start.setDate(start.getDate() + offset);
  return start.toISOString().slice(0, 10);
}

function buildContentIdeas(requestText, objective) {
  const clean = normalize(requestText);
  const isCampaign = objective === "campanha" || clean.includes("campanha");
  const isResponse = objective === "resposta" || /comentario|mensagem|dm|resposta/.test(clean);

  if (isResponse) {
    return [
      {
        format: "Resposta",
        category: "Atendimento",
        title: "Rascunho de resposta a cliente",
        goal: "Responder com clareza sem enviar automaticamente",
      },
    ];
  }

  if (isCampaign) {
    return [
      {
        date: makeDate(0),
        format: "Carrossel",
        category: "Campanha",
        title: "Diagnóstico Empresarial: por onde começar",
        goal: "Apresentar a campanha sem prometer resultados",
      },
      {
        date: makeDate(2),
        format: "Reels",
        category: "Educativo",
        title: "3 bloqueios que travam a gestão",
        goal: "Gerar identificação com empreendedores",
      },
      {
        date: makeDate(4),
        format: "Post estático",
        category: "Comercial",
        title: "Conversa inicial com a Proxiassistant",
        goal: "Convidar para contacto inicial",
      },
    ];
  }

  return [
    {
      date: makeDate(0),
      format: "Carrossel",
      category: "Educativo",
      title: "5 sinais de que a empresa precisa de organização",
      goal: "Ajudar empresas a reconhecer problemas internos",
    },
    {
      date: makeDate(2),
      format: "Reels",
      category: "Autoridade",
      title: "O que uma consultoria local pode melhorar numa empresa",
      goal: "Explicar o valor da consultoria de forma simples",
    },
    {
      date: makeDate(4),
      format: "Post estático",
      category: "Comercial",
      title: "Diagnóstico empresarial sem prometer resultados",
      goal: "Gerar pedidos de conversa inicial",
    },
  ];
}

function buildCaption(idea) {
  if (idea.format === "Resposta") {
    return `Rascunho de resposta:

Olá, obrigado pela mensagem.

Para responder com mais precisão, precisamos primeiro de perceber melhor o contexto da empresa e o tipo de apoio que procura.

Podemos analisar a situação e indicar os próximos passos possíveis, sem assumir valores ou prometer resultados antes dessa avaliação.

Ponto de validação humana: confirmar se existe link, contacto ou horário que deve ser incluído.`;
  }

  if (idea.title.includes("5 sinais")) {
    return `Gancho:
Às vezes, o problema não é falta de esforço. É falta de organização.

Legenda:
Se a tua empresa vive com tarefas atrasadas, decisões feitas à pressa e informação espalhada, talvez esteja na hora de olhar para os processos com mais clareza.

Alguns sinais comuns:
- tarefas importantes ficam esquecidas;
- a equipa não sabe bem o que é prioridade;
- os clientes não recebem acompanhamento consistente;
- há muitas decisões sem dados;
- a rotina depende demasiado da memória das pessoas.

CTA:
Queres identificar os principais pontos de melhoria da tua empresa? Fala connosco.

Hashtags:
#consultoria #gestaoempresarial #empreendedores #empresaslocais #organizacao #processos #proxiassistant`;
  }

  if (idea.title.includes("consultoria local")) {
    return `Gancho:
Uma consultoria não precisa complicar a gestão.

Legenda:
O papel é ajudar a empresa a olhar para os seus processos, prioridades e oportunidades de melhoria com mais clareza.

Na prática, isso pode passar por organizar processos, melhorar acompanhamento de clientes, rever rotinas comerciais e criar formas simples de medir resultados.

O objetivo não é prometer soluções mágicas. É ajudar a empresa a tomar decisões mais conscientes.

CTA:
Se sentes que a tua empresa precisa de mais clareza, podemos conversar.

Hashtags:
#consultoriaempresarial #gestao #negocioslocais #empreendedorismo #empresas #proxiassistant`;
  }

  return `Gancho:
Antes de prometer soluções, é preciso entender o problema.

Legenda:
Na Proxiassistant, acreditamos que uma boa consultoria começa com análise, contexto e prioridades claras.

Um diagnóstico empresarial pode ajudar a perceber onde estão os bloqueios, que processos precisam de atenção e que ações fazem mais sentido para o momento da empresa.

Sem promessas exageradas. Sem fórmulas mágicas. Primeiro, clareza.

CTA:
Queres marcar uma conversa inicial? Entra em contacto connosco.

Hashtags:
#diagnosticoempresarial #consultoria #empresas #empreendedores #gestao #negocioslocais #proxiassistant`;
}

function normalizeApiDraft(draft, index) {
  const now = Date.now();
  return {
    id: `draft-${now}-${index}`,
    title: draft.title || "Rascunho sem título",
    format: draft.format || "Post",
    category: draft.category || "Conteúdo",
    status: draft.status || "Em revisão",
    createdAt: new Date().toISOString(),
    text: draft.text || "",
    cta: draft.cta || "",
    hashtags: Array.isArray(draft.hashtags) ? draft.hashtags : [],
    visualTask: draft.visualTask || null,
    image: draft.image || null,
    imageStatus: draft.imageStatus || "Não gerada",
    approvals: {
      idea: false,
      caption: false,
      image: false,
      publish: false,
    },
    assumptions: Array.isArray(draft.assumptions) ? draft.assumptions : [],
  };
}

async function callAgentsApi(requestText, objective) {
  const response = await fetch("/api/agents", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      requestText,
      objective,
    }),
  });

  const rawText = await response.text();
  let data = {};
  try {
    data = rawText ? JSON.parse(rawText) : {};
  } catch {
    throw new Error(`Resposta inválida da API (${response.status}).`);
  }

  if (!response.ok) {
    throw new Error(readableApiError(data.error || data || "Erro ao chamar agentes."));
  }
  return data;
}

function readableApiError(error) {
  if (!error) return "Erro desconhecido.";
  if (typeof error === "string") return error;
  if (typeof error.message === "string") return error.message;
  if (typeof error.error === "string") return error.error;
  if (typeof error.type === "string") {
    return `${error.type}: ${JSON.stringify(error)}`;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

async function runCoordinator(requestText, objective) {
  const processingId = beginCoordinatorRun(requestText);
  try {
    await runCoordinatorWithApi(requestText, objective, processingId);
  } catch (error) {
    console.warn("A usar fallback local:", error);
    runCoordinatorLocal(requestText, objective, error.message, processingId);
  }
}

function beginCoordinatorRun(requestText) {
  const processingId = `processing-${Date.now()}`;
  state.messages.push({ sender: "user", name: "Tu", text: requestText });
  state.messages.push({
    id: processingId,
    sender: "agent",
    name: "Agente Coordenador",
    text: "A processar o pedido com os agentes...",
  });
  render();
  return processingId;
}

function finishCoordinatorRun(processingId, text) {
  const message = state.messages.find((item) => item.id === processingId);
  if (message) {
    message.text = text;
  } else {
    state.messages.push({ sender: "agent", name: "Agente Coordenador", text });
  }
}

async function runCoordinatorWithApi(requestText, objective, processingId) {
  const data = await callAgentsApi(requestText, objective);
  const timestamp = new Date().toISOString();
  const selectedAgents = data.meta?.selectedAgents || data.agentsUsed || ["coordinator"];
  const drafts = (data.drafts || []).map(normalizeApiDraft);
  const calendarItems = (data.calendar || []).map((item, index) => ({
    id: `cal-${Date.now()}-${index}`,
    date: item.date || "",
    format: item.format || "Post",
    category: item.category || "Conteúdo",
    title: item.title || "Sem título",
    status: item.status || "Em revisão",
  }));

  const response = [
    data.coordinatorMessage || "Pedido recebido e processado pelos agentes reais.",
    "",
    data.strategy?.objective ? `Objetivo estratégico: ${data.strategy.objective}.` : "",
    data.strategy?.postingRhythm ? `Ritmo sugerido: ${data.strategy.postingRhythm}.` : "",
    "",
    `Agentes acionados: ${selectedAgents.map((key) => agents[key]?.name || key).join(", ")}.`,
    data.meta?.model ? `Modelo usado no coordenador: ${data.meta.model}.` : "",
    "",
    `Foram gerados ${drafts.length} rascunho(s), todos pendentes de aprovação humana.`,
    data.approvalQueue?.length ? `Fila de aprovação: ${data.approvalQueue.length} item(ns).` : "",
    data.reportingTasks?.length ? `Tarefas de acompanhamento: ${data.reportingTasks.length}.` : "",
  ]
    .filter(Boolean)
    .join("\n");

  finishCoordinatorRun(processingId, response);
  state.drafts.unshift(...drafts);
  state.calendar.unshift(...calendarItems);
  state.approvals.unshift(
    ...drafts.map((draft) => ({
      id: draft.id,
      title: draft.title,
      status: draft.status,
      imageAllowed: false,
      publishAllowed: false,
    })),
  );
  state.lastAgents = selectedAgents;
  state.strategy = data.strategy || null;
  state.workflow = Array.isArray(data.workflow) ? data.workflow : [];
  state.approvalQueue = Array.isArray(data.approvalQueue) ? data.approvalQueue : [];
  state.reportingTasks = Array.isArray(data.reportingTasks) ? data.reportingTasks : [];
  (data.provisionalAssumptions || []).forEach(addAssumption);
  state.lastApiRun = {
    at: timestamp,
    model: data.meta?.model,
    mode: "anthropic",
  };

  saveState();
  render();
}

function runCoordinatorLocal(requestText, objective, errorMessage = "", processingId = null) {
  const selectedAgents = inferAgents(requestText, objective);
  const ideas = buildContentIdeas(requestText, objective);
  const timestamp = new Date().toISOString();

  const drafts = ideas.map((idea, index) => ({
    id: `draft-${Date.now()}-${index}`,
    title: idea.title,
    format: idea.format,
    category: idea.category,
    status: "Em revisão",
    createdAt: timestamp,
    text: buildCaption(idea),
    approvals: {
      idea: false,
      caption: false,
      image: false,
      publish: false,
    },
    assumptions: [
      "Serviços específicos ainda não confirmados.",
      "CTA provisório usado até validação humana.",
      "Datas são piloto e podem ser alteradas.",
    ],
    visualTask: {
      needed: true,
      prompt: `Criar imagem profissional para o conceito "${idea.title}", sem texto e sem logótipo, com estilo limpo de consultoria empresarial.`,
      styleNotes: "Visual profissional, claro, azul/branco/cinza, sem letras, sem slogans e sem logótipos inventados.",
      reviewCriteria: ["sem texto", "sem logótipo inventado", "profissionalismo", "coerência com a legenda"],
    },
    image: null,
    imageStatus: "Não gerada",
  }));

  const calendarItems = ideas
    .filter((idea) => idea.date)
    .map((idea, index) => ({
      id: `cal-${Date.now()}-${index}`,
      date: idea.date,
      format: idea.format,
      category: idea.category,
      title: idea.title,
      status: "Em revisão",
    }));

  const response = [
    errorMessage ? `API indisponível: ${errorMessage}` : "Pedido recebido.",
    errorMessage ? "Usei o modo local de fallback com templates." : "",
    "",
    "",
    `Agentes acionados: ${selectedAgents.map((key) => agents[key].name).join(", ")}.`,
    "",
    `Foram gerados ${drafts.length} rascunho(s), todos com status “Em revisão”.`,
    "Nenhum conteúdo foi marcado como aprovado, nenhuma imagem foi autorizada e nada será publicado automaticamente.",
  ].join("\n");

  finishCoordinatorRun(processingId, response);
  state.drafts.unshift(...drafts);
  state.calendar.unshift(...calendarItems);
  state.approvals.unshift(
    ...drafts.map((draft) => ({
      id: draft.id,
      title: draft.title,
      status: draft.status,
      imageAllowed: false,
      publishAllowed: false,
    })),
  );
  state.lastAgents = selectedAgents;
  selectedAgents.forEach((key) => {
    if (key === "metrics") {
      addAssumption("Métricas reais ainda não foram ligadas; análise será manual até haver dados.");
    }
    if (key === "competition") {
      addAssumption("Concorrentes ainda não foram indicados; análise será provisória até haver nomes ou links.");
    }
  });

  saveState();
  render();
}

async function generateImageForDraft(id) {
  const draft = state.drafts.find((item) => item.id === id);
  if (!draft || draft.status !== "Aprovado") return;
  if (draft.imageStatus === "A gerar imagem...") return;
  if (draft.image?.url) {
    const ok = confirm("Este rascunho já tem uma imagem. Queres gastar créditos para gerar outra?");
    if (!ok) return;
  }

  draft.imageStatus = "A gerar imagem...";
  saveState();
  render();

  try {
    const response = await fetch("/api/images", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: draft.title,
        format: draft.format,
        category: draft.category,
        caption: draft.text,
        visualTask: draft.visualTask,
      }),
    });

    const rawText = await response.text();
    let data = {};
    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch {
      data = { error: rawText || "Resposta inválida da API de imagem." };
    }
    if (!response.ok) {
      const hint = data.hint ? ` ${data.hint}` : "";
      throw new Error(`${readableApiError(data.error || data || "Erro ao gerar imagem.")}${hint}`);
    }

    draft.image = {
      url: data.imageUrl,
      revisedPrompt: data.revisedPrompt,
      review: data.review,
      provider: data.meta?.provider || "ideogram",
      model: data.meta?.model || "",
      createdAt: new Date().toISOString(),
    };
    draft.imageStatus = data.review?.status || "Pronto para revisão humana";
    draft.approvals.image = false;

    const approval = state.approvals.find((item) => item.id === id);
    if (approval) {
      approval.imageAllowed = false;
      approval.imageStatus = draft.imageStatus;
    }
  } catch (error) {
    console.error("Erro detalhado ao gerar imagem:", error);
    draft.imageStatus = `Erro ao gerar imagem: ${error.message}`;
  }

  saveState();
  render();
}

function addAssumption(text) {
  if (!state.assumptions.includes(text)) {
    state.assumptions.push(text);
  }
}

function setDraftStatus(id, status) {
  const draft = state.drafts.find((item) => item.id === id);
  if (!draft) return;
  draft.status = status;
  draft.approvals.idea = status === "Aprovado";
  draft.approvals.caption = status === "Aprovado";
  draft.approvals.image = false;
  draft.approvals.publish = false;

  const approval = state.approvals.find((item) => item.id === id);
  if (approval) {
    approval.status = status;
    approval.imageAllowed = status === "Aprovado";
    approval.publishAllowed = false;
  }

  state.calendar
    .filter((item) => item.title === draft.title)
    .forEach((item) => {
      item.status = status;
    });

  saveState();
  render();
}

function renderMessages() {
  const log = document.querySelector("#chat-log");
  log.innerHTML = state.messages
    .map(
      (message) => `
        <article class="message ${message.sender}">
          <strong>${message.name}</strong>
          <span>${escapeHtml(message.text).replace(/\n/g, "<br>")}</span>
        </article>
      `,
    )
    .join("");
  log.scrollTop = log.scrollHeight;
}

function renderAgents() {
  const trace = document.querySelector("#agent-trace");
  if (!state.lastAgents.length) {
    trace.innerHTML = `<div class="empty">Ainda nenhum pedido foi encaminhado.</div>`;
    return;
  }
  trace.innerHTML = state.lastAgents
    .map(
      (key) => `
        <article class="agent-card">
          <h4>${agents[key].name}</h4>
          <p>${agents[key].role}</p>
        </article>
      `,
    )
    .join("");
}

function renderDrafts() {
  const list = document.querySelector("#drafts-list");
  if (!state.drafts.length) {
    list.innerHTML = `<div class="empty">Ainda não há rascunhos.</div>`;
    return;
  }

  list.innerHTML = state.drafts
    .map(
      (draft) => `
        <article class="draft-card">
          <header>
            <div>
              <h4>${escapeHtml(draft.title)}</h4>
              <p class="eyebrow">${draft.format} · ${draft.category}</p>
            </div>
            <span class="status ${statusClass(draft.status)}">${draft.status}</span>
          </header>
          <pre>${escapeHtml(draft.text)}</pre>
          ${renderDraftMeta(draft)}
          ${renderDraftImage(draft)}
          <div class="draft-actions">
            <button class="approve" data-action="approve" data-id="${draft.id}">Aprovar ideia e legenda</button>
            ${
              draft.status === "Aprovado"
                ? `<button class="image" data-action="image" data-id="${draft.id}" ${
                    draft.imageStatus === "A gerar imagem..." ? "disabled" : ""
                  }>${draft.image?.url ? "Gerar nova imagem" : "Gerar imagem"}</button>`
                : ""
            }
            <button data-action="review" data-id="${draft.id}">Manter em revisão</button>
            <button class="reject" data-action="reject" data-id="${draft.id}">Rejeitar</button>
          </div>
        </article>
      `,
    )
    .join("");
}

function renderDraftMeta(draft) {
  const items = [];
  if (draft.cta) {
    items.push(`<p><strong>CTA:</strong> ${escapeHtml(draft.cta)}</p>`);
  }
  if (draft.hashtags?.length) {
    items.push(`<p><strong>Hashtags:</strong> ${draft.hashtags.map(escapeHtml).join(" ")}</p>`);
  }
  if (draft.visualTask?.needed) {
    items.push(
      `<p><strong>Tarefa visual:</strong> ${escapeHtml(draft.visualTask.prompt || "Criar imagem após aprovação humana.")}</p>`,
    );
  }
  if (!items.length) return "";
  return `<div class="draft-meta">${items.join("")}</div>`;
}

function renderDraftImage(draft) {
  if (!draft.image && (!draft.imageStatus || draft.imageStatus === "Não gerada")) return "";

  const warnings = draft.image?.review?.warnings || [];
  const warningHtml = warnings.length
    ? `<p><strong>Alertas:</strong> ${warnings.map(escapeHtml).join(" ")}</p>`
    : "";

  return `
    <div class="image-result">
      <div>
        <strong>Imagem:</strong> ${escapeHtml(draft.imageStatus || "Não gerada")}
      </div>
      ${
        draft.image?.url
          ? `<img src="${draft.image.url}" alt="Imagem gerada para ${escapeHtml(draft.title)}" loading="lazy" />`
          : ""
      }
      ${warningHtml}
      ${
        draft.image?.model
          ? `<p class="eyebrow">Gerada por ${escapeHtml(draft.image.provider)} · ${escapeHtml(draft.image.model)} · ainda requer aprovação humana</p>`
          : ""
      }
    </div>
  `;
}

function renderCalendar() {
  const body = document.querySelector("#calendar-body");
  if (!state.calendar.length) {
    body.innerHTML = `<tr><td colspan="5">Ainda não há calendário gerado.</td></tr>`;
    return;
  }
  body.innerHTML = state.calendar
    .map(
      (item) => `
        <tr>
          <td>${item.date}</td>
          <td>${item.format}</td>
          <td>${item.category}</td>
          <td>${escapeHtml(item.title)}</td>
          <td><span class="status ${statusClass(item.status)}">${item.status}</span></td>
        </tr>
      `,
    )
    .join("");
}

function renderApprovals() {
  const list = document.querySelector("#approval-list");
  if (!state.approvals.length) {
    list.innerHTML = `<div class="empty">Ainda não há itens para aprovação.</div>`;
    return;
  }

  list.innerHTML = state.approvals
    .map(
      (item) => `
        <article class="draft-card">
          <header>
            <div>
              <h4>${escapeHtml(item.title)}</h4>
              <p class="eyebrow">Imagem: ${item.imageAllowed ? "autorizada" : "bloqueada"} · Publicação: ${
                item.publishAllowed ? "autorizada" : "manual/bloqueada"
              }</p>
            </div>
            <span class="status ${statusClass(item.status)}">${item.status}</span>
          </header>
          <div class="draft-actions">
            <button class="approve" data-action="approve" data-id="${item.id}">Aprovar ideia e legenda</button>
            <button data-action="review" data-id="${item.id}">Manter em revisão</button>
            <button class="reject" data-action="reject" data-id="${item.id}">Rejeitar</button>
          </div>
        </article>
      `,
    )
    .join("");
}

function renderMemory() {
  document.querySelector("#confirmed-list").innerHTML = confirmedFacts
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");
  document.querySelector("#assumptions-list").innerHTML = state.assumptions
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");
}

function render() {
  renderMessages();
  renderAgents();
  renderDrafts();
  renderCalendar();
  renderApprovals();
  renderMemory();
}

function statusClass(status) {
  return normalize(status).replace(/\s+/g, "-");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

document.querySelector("#coordinator-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const input = document.querySelector("#user-request");
  const request = input.value.trim();
  if (!request) return;
  runCoordinator(request, "auto");
  input.value = "";
});

document.querySelectorAll(".nav-tab").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".nav-tab").forEach((item) => item.classList.remove("active"));
    document.querySelectorAll(".view").forEach((item) => item.classList.remove("active-view"));
    button.classList.add("active");
    document.querySelector(`#${button.dataset.view}`).classList.add("active-view");
    document.querySelector("#view-title").textContent = button.querySelector("strong").textContent;
  });
});

document.querySelector("#drafts-list").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  if (button.dataset.action === "approve") setDraftStatus(button.dataset.id, "Aprovado");
  if (button.dataset.action === "image") generateImageForDraft(button.dataset.id);
  if (button.dataset.action === "review") setDraftStatus(button.dataset.id, "Em revisão");
  if (button.dataset.action === "reject") setDraftStatus(button.dataset.id, "Rejeitado");
});

document.querySelector("#approval-list").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  if (button.dataset.action === "approve") setDraftStatus(button.dataset.id, "Aprovado");
  if (button.dataset.action === "review") setDraftStatus(button.dataset.id, "Em revisão");
  if (button.dataset.action === "reject") setDraftStatus(button.dataset.id, "Rejeitado");
});

document.querySelector("#copy-last").addEventListener("click", async () => {
  const latest = state.drafts[0];
  if (!latest) return;
  await navigator.clipboard.writeText(`${latest.title}\n\n${latest.text}`);
});

document.querySelector("#export-json").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "proxiassistant-agentes-export.json";
  link.click();
  URL.revokeObjectURL(url);
});

document.querySelector("#reset-data").addEventListener("click", () => {
  const ok = confirm("Limpar dados locais desta app?");
  if (!ok) return;
  localStorage.removeItem(STORAGE_KEY);
  state = loadState();
  saveState();
  render();
});

document.querySelector("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = document.querySelector("#login-email").value.trim();
  const password = document.querySelector("#login-password").value;
  const errorBox = document.querySelector("#login-error");
  errorBox.textContent = "";

  try {
    await auth.signInWithEmailAndPassword(email, password);
  } catch (error) {
    errorBox.textContent = "Não foi possível entrar. Confirma o email/password e se o método Email/Password está ativo no Firebase.";
  }
});

document.querySelector("#logout-button").addEventListener("click", async () => {
  if (!auth) return;
  await auth.signOut();
});

if (auth) {
  auth.onAuthStateChanged(async (user) => {
    currentUser = user;
    const authView = document.querySelector("#auth-view");
    const appShell = document.querySelector(".app-shell");
    const userEmail = document.querySelector("#user-email");

    if (!user) {
      authView.classList.remove("hidden");
      appShell.classList.add("locked");
      userEmail.textContent = "";
      document.querySelector("#login-email").value = "";
      document.querySelector("#login-password").value = "";
      document.querySelector("#login-error").textContent = "";
      return;
    }

    authView.classList.add("hidden");
    appShell.classList.remove("locked");
    userEmail.textContent = user.email;

    try {
      await loadCloudState(user);
    } catch (error) {
      console.error("Erro ao carregar Firestore:", error);
      alert("Login feito, mas não consegui carregar a base de dados. Confirma se o Firestore está criado e as regras permitem acesso.");
    }
    render();
  });
} else {
  document.querySelector("#auth-view").classList.add("hidden");
  document.querySelector(".app-shell").classList.remove("locked");
}

render();
