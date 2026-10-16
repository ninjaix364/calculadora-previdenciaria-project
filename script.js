"use strict";

const $ = (selector) => document.querySelector(selector);
const periodForm = $("#period-form");
const startInput = $("#start-month");
const endInput = $("#end-month");
const defaultDueInput = $("#default-due");
const defaultPaidInput = $("#default-paid");
const formError = $("#form-error");
const yearSection = $("#year-section");
const yearTableBody = $("#year-table-body");
const monthSection = $("#month-section");
const monthTableBody = $("#month-table-body");
const summarySection = $("#summary-section");
const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const number4 = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 4,
  maximumFractionDigits: 6,
});

let yearValues = new Map();
let months = [];

function parseMoney(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function formatMoney(value) {
  return currency.format(roundMoney(value));
}

function parseYearMonth(value) {
  const match = /^(\d{4})-(\d{2})$/.exec(value || "");
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return { year, month };
}

function monthKey(year, month) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function monthLabel(year, month) {
  const date = new Date(year, month - 1, 1, 12);
  return new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
  }).format(date);
}

function escapeHTML(value) {
  return String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char],
  );
}

function showError(message) {
  formError.textContent = message;
  formError.hidden = !message;
}

function generatePeriod(event, shouldScroll = true) {
  if (event) event.preventDefault();
  showError("");

  const start = parseYearMonth(startInput.value);
  const end = parseYearMonth(endInput.value);
  const defaultDue = Number(defaultDueInput.value);
  const defaultPaid = Number(defaultPaidInput.value);

  if (!start || !end) {
    showError("Informe o mês inicial e o mês final.");
    return;
  }
  const startIndex = start.year * 12 + (start.month - 1);
  const endIndex = end.year * 12 + (end.month - 1);
  if (startIndex > endIndex) {
    showError("O mês inicial não pode ser posterior ao mês final.");
    return;
  }
  if (
    !Number.isFinite(defaultDue) ||
    defaultDue < 0 ||
    !Number.isFinite(defaultPaid) ||
    defaultPaid < 0
  ) {
    showError(
      "Os valores mensais devem ser números iguais ou maiores que zero.",
    );
    return;
  }
  const count = endIndex - startIndex + 1;
  if (count > 600) {
    showError(
      "O período está muito longo. Escolha no máximo 600 competências por cálculo.",
    );
    return;
  }

  const firstYear = start.year;
  const lastYear = end.year;
  yearValues = new Map();
  for (let year = firstYear; year <= lastYear; year += 1) {
    yearValues.set(year, {
      due: roundMoney(defaultDue),
      paid: roundMoney(defaultPaid),
    });
  }

  months = [];
  for (let index = startIndex; index <= endIndex; index += 1) {
    const year = Math.floor(index / 12);
    const month = (index % 12) + 1;
    const annual = yearValues.get(year);
    months.push({
      key: monthKey(year, month),
      year,
      month,
      due: annual.due,
      paid: annual.paid,
      factor: 1,
    });
  }

  renderYearTable();
  renderMonthTable();
  yearSection.hidden = false;
  monthSection.hidden = false;
  summarySection.hidden = false;
  updateSummary();
  if (shouldScroll)
    yearSection.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderYearTable() {
  yearTableBody.innerHTML = [...yearValues.entries()]
    .map(
      ([year, values]) => `
    <tr data-year="${year}">
      <td><strong>${year}</strong></td>
      <td><input class="year-input" type="number" min="0" step="0.01" data-year-field="due" value="${values.due.toFixed(2)}" aria-label="Valor devido por mês no ano de ${year}"></td>
      <td><input class="year-input" type="number" min="0" step="0.01" data-year-field="paid" value="${values.paid.toFixed(2)}" aria-label="Valor recebido por mês no ano de ${year}"></td>
    </tr>
  `,
    )
    .join("");
}

function renderMonthTable() {
  monthTableBody.innerHTML = months
    .map(
      (item, index) => `
    <tr data-index="${index}">
      <td>${escapeHTML(monthLabel(item.year, item.month))}</td>
      <td><input class="month-input" type="number" min="0" step="0.01" data-field="due" value="${item.due.toFixed(2)}" aria-label="Valor devido em ${escapeHTML(monthLabel(item.year, item.month))}"></td>
      <td><input class="month-input" type="number" min="0" step="0.01" data-field="paid" value="${item.paid.toFixed(2)}" aria-label="Valor recebido em ${escapeHTML(monthLabel(item.year, item.month))}"></td>
      <td class="money" data-cell="difference">${formatMoney(0)}</td>
      <td><input class="month-input month-factor" type="number" min="0" step="0.000001" data-field="factor" value="${item.factor.toFixed(6)}" aria-label="Fator de atualização em ${escapeHTML(monthLabel(item.year, item.month))}"></td>
      <td class="money" data-cell="updated">${formatMoney(0)}</td>
    </tr>
  `,
    )
    .join("");
  $("#month-count").textContent =
    `${months.length} ${months.length === 1 ? "parcela" : "parcelas"}`;
  updateSummary();
}

function readMonthRows() {
  const rows = [...monthTableBody.querySelectorAll("tr")];
  return rows.map((row) => {
    const index = Number(row.dataset.index);
    const base = months[index];
    const dueInput = row.querySelector('[data-field="due"]');
    const paidInput = row.querySelector('[data-field="paid"]');
    const factorInput = row.querySelector('[data-field="factor"]');
    let due = Number(dueInput.value);
    let paid = Number(paidInput.value);
    let factor =
      factorInput.value.trim() === "" ? 1 : Number(factorInput.value);

    if (!Number.isFinite(due) || due < 0) due = 0;
    if (!Number.isFinite(paid) || paid < 0) paid = 0;
    if (!Number.isFinite(factor) || factor < 0) factor = 1;
    due = roundMoney(due);
    paid = roundMoney(paid);
    const principal = roundMoney(Math.max(0, due - paid));
    const overpayment = roundMoney(Math.max(0, paid - due));
    const updated = roundMoney(principal * factor);
    const correction = roundMoney(updated - principal);

    base.due = due;
    base.paid = paid;
    base.factor = factor;
    base.principal = principal;
    base.overpayment = overpayment;
    base.updated = updated;
    base.correction = correction;

    const differenceCell = row.querySelector('[data-cell="difference"]');
    const updatedCell = row.querySelector('[data-cell="updated"]');
    differenceCell.textContent = formatMoney(principal);
    differenceCell.className = `money ${principal > 0 ? "money-debt" : "money-zero"}`;
    updatedCell.textContent = formatMoney(updated);
    updatedCell.className = `money ${updated > 0 ? "money-debt" : "money-zero"}`;

    if (
      dueInput.value !== String(due) &&
      !Number.isFinite(Number(dueInput.value))
    )
      dueInput.value = due.toFixed(2);
    if (
      paidInput.value !== String(paid) &&
      !Number.isFinite(Number(paidInput.value))
    )
      paidInput.value = paid.toFixed(2);
    if (
      factorInput.value !== String(factor) &&
      !Number.isFinite(Number(factorInput.value))
    )
      factorInput.value = factor.toFixed(6);

    return base;
  });
}

function updateSummary() {
  if (!months.length) return;
  const values = readMonthRows();
  const principal = roundMoney(
    values.reduce((sum, item) => sum + item.principal, 0),
  );
  const updated = roundMoney(
    values.reduce((sum, item) => sum + item.updated, 0),
  );
  const correction = roundMoney(updated - principal);
  const noDebtCount = values.filter((item) => item.principal === 0).length;

  $("#total-principal").textContent = formatMoney(principal);
  $("#total-correction").textContent = formatMoney(correction);
  $("#total-updated").textContent = formatMoney(updated);
  $("#zero-difference-count").textContent = String(noDebtCount);
}

function applyAnnualValues() {
  const inputs = [...yearTableBody.querySelectorAll("input[data-year-field]")];
  const nextYearValues = new Map();
  for (const row of yearTableBody.querySelectorAll("tr[data-year]")) {
    const year = Number(row.dataset.year);
    const dueRaw = row.querySelector('[data-year-field="due"]').value.trim();
    const paidRaw = row.querySelector('[data-year-field="paid"]').value.trim();
    const due = Number(dueRaw);
    const paid = Number(paidRaw);
    if (
      dueRaw === "" ||
      paidRaw === "" ||
      !Number.isFinite(due) ||
      due < 0 ||
      !Number.isFinite(paid) ||
      paid < 0
    ) {
      showError(
        "Os valores anuais devem ser números iguais ou maiores que zero.",
      );
      yearSection.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    nextYearValues.set(year, { due: roundMoney(due), paid: roundMoney(paid) });
  }
  showError("");
  yearValues = nextYearValues;
  months = months.map((item) => {
    const annual = yearValues.get(item.year);
    return { ...item, due: annual.due, paid: annual.paid };
  });
  renderMonthTable();
  monthSection.scrollIntoView({ behavior: "smooth", block: "start" });
}

function applyBulkFactor() {
  const factorRaw = $("#bulk-factor").value.trim();
  const factor = Number(factorRaw);
  if (factorRaw === "" || !Number.isFinite(factor) || factor < 0) {
    window.alert("Informe um fator numérico igual ou maior que zero.");
    return;
  }
  for (const input of monthTableBody.querySelectorAll(
    '[data-field="factor"]',
  )) {
    input.value = factor.toFixed(6);
  }
  updateSummary();
}

function exportCSV() {
  if (!months.length) return;
  const values = readMonthRows();
  const header = [
    "Competência",
    "Valor devido (R$)",
    "Valor recebido (R$)",
    "Principal em atraso (R$)",
    "Fator acumulado",
    "Atualização estimada (R$)",
    "Total atualizado (R$)",
    "Excedente recebido (R$)",
  ];
  const rows = values.map((item) => [
    item.key,
    item.due.toFixed(2),
    item.paid.toFixed(2),
    item.principal.toFixed(2),
    item.factor.toFixed(6),
    item.correction.toFixed(2),
    item.updated.toFixed(2),
    item.overpayment.toFixed(2),
  ]);
  const csvCell = (value) => `"${String(value).replace(/"/g, '""')}"`;
  const csv =
    "\uFEFF" +
    [header, ...rows].map((row) => row.map(csvCell).join(";")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "relatorio-atrasados-previdenciarios.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

periodForm.addEventListener("submit", generatePeriod);
$("#apply-years").addEventListener("click", applyAnnualValues);
$("#apply-factor").addEventListener("click", applyBulkFactor);
$("#export-csv").addEventListener("click", exportCSV);
$("#print-report").addEventListener("click", () => window.print());
monthTableBody.addEventListener("input", (event) => {
  if (event.target.matches("[data-field]")) updateSummary();
});

generatePeriod(undefined, false);

// Integração com a API oficial: a chave fica no servidor Node, não no navegador
const fabricaForm = $("#fabrica-api-form");
const calcFileInput = $("#calc-file");
const apiHealth = $("#api-health");
const apiResult = $("#api-result");
const apiResultContent = $("#api-result-content");
const apiResultMessage = $("#api-result-message");
const apiSubmit = $("#api-submit");
let lastApiResponse = null;

function setApiStatus(message, kind = "neutral") {
  if (!apiHealth) return;
  apiHealth.textContent = message;
  apiHealth.className = `api-status api-status-${kind}`;
}

async function checkApiHealth() {
  if (!apiHealth) return;
  try {
    const response = await fetch("/api/health", {
      headers: { Accept: "application/json" },
    });
    const data = await response.json();
    if (!response.ok)
      throw new Error(
        data.message || "Não foi possível verificar o servidor local.",
      );
    if (data.apiKeyConfigured) {
      setApiStatus(
        "Servidor local conectado. A chave da API está configurada. A chamada real ainda depende de a credencial estar autorizada pela plataforma.",
        "success",
      );
    } else {
      setApiStatus(
        "Servidor local conectado, mas a chave da API não está configurada. Copie .env.example para .env e preencha FC_API_KEY com uma chave autorizada.",
        "warning",
      );
    }
  } catch (error) {
    setApiStatus(
      'A integração precisa do servidor Node local. Execute "npm start" na pasta do projeto e acesse http://localhost:3000 (não abra o index.html diretamente).',
      "warning",
    );
  }
}

function showApiResult(data, httpStatus, ok) {
  lastApiResponse = { httpStatus, data };
  apiResult.hidden = false;
  const messages = Array.isArray(data?.messages)
    ? data.messages.filter(Boolean).join("\n")
    : "";
  if (ok && data?.status !== "error") {
    apiResultMessage.textContent = `A API respondeu com HTTP ${httpStatus}. Confira o retorno oficial abaixo; o protótipo não interpreta nem altera a liquidação jurídica.`;
  } else {
    apiResultMessage.textContent = `A API respondeu com HTTP ${httpStatus}. ${messages || data?.message || data?.statusMessage || "Confira os detalhes retornados pelo serviço."}`;
  }
  apiResultContent.textContent = JSON.stringify(data, null, 2);
}

if (fabricaForm) {
  fabricaForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    apiResult.hidden = true;
    const file = calcFileInput.files?.[0];
    if (!file) {
      setApiStatus("Selecione um arquivo .calc antes de enviar.", "error");
      return;
    }
    if (!file.name.toLowerCase().endsWith(".calc")) {
      setApiStatus(
        "O arquivo deve ter a extensão .calc. Exporte o cálculo no formato compatível e tente novamente.",
        "error",
      );
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setApiStatus("O arquivo excede 5 MB. Escolha um arquivo menor.", "error");
      return;
    }

    const formData = new FormData();
    formData.append("file", file, file.name);
    apiSubmit.disabled = true;
    apiSubmit.textContent = "Enviando e calculando…";
    setApiStatus(
      "Enviando o arquivo à API da Fábrica de Cálculos. Não feche esta página.",
      "neutral",
    );

    try {
      const response = await fetch("/api/fabrica/calcular-atrasados", {
        method: "POST",
        body: formData,
        headers: { Accept: "application/json" },
      });
      const raw = await response.text();
      let data;
      try {
        data = JSON.parse(raw);
      } catch {
        data = { responseText: raw };
      }
      showApiResult(data, response.status, response.ok);
      if (response.ok && data?.status !== "error") {
        setApiStatus(
          "Resposta recebida da API. Consulte o retorno detalhado abaixo.",
          "success",
        );
      } else {
        setApiStatus(
          "A API não concluiu o cálculo. Leia a mensagem de erro retornada; talvez seja necessária uma chave autorizada ou um arquivo válido.",
          "error",
        );
      }
    } catch (error) {
      setApiStatus(
        `Falha ao conectar ao servidor local: ${error.message}. Confira se "npm start" está em execução.`,
        "error",
      );
    } finally {
      apiSubmit.disabled = false;
      apiSubmit.textContent = "Enviar arquivo e calcular";
    }
  });
}

const downloadApiResultButton = $("#download-api-result");
if (downloadApiResultButton) {
  downloadApiResultButton.addEventListener("click", () => {
    if (!lastApiResponse) return;
    const blob = new Blob([JSON.stringify(lastApiResponse, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "resposta-api-atrasados.json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  });
}

checkApiHealth();
