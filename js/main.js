(() => {
  "use strict";

  const EXPERIMENTS_KEY = "chaoslab.experiments.v1";
  const TEAM_KEY = "chaoslab.team.v1";

  function readStorage(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : fallback;
    } catch (error) {
      console.error(`Unable to read ${key} from localStorage.`, error);
      return fallback;
    }
  }

  function writeStorage(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error(`Unable to save ${key} to localStorage.`, error);
      return false;
    }
  }

  function initializeNavigation() {
    const toggle = document.querySelector(".menu-toggle");
    const nav = document.querySelector(".main-nav");
    if (!toggle || !nav) return;
    toggle.addEventListener("click", () => {
      const isOpen = nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(isOpen));
    });
    nav.addEventListener("click", (event) => {
      if (event.target instanceof HTMLAnchorElement) {
        nav.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
      }
    });
  }

  function initializeExperiments() {
    const form = document.querySelector("#experiment-form");
    const list = document.querySelector("#experiment-list");
    if (!(form instanceof HTMLFormElement) || !list) return;

    const idInput = document.querySelector("#experiment-id");
    const nameInput = document.querySelector("#experiment-name");
    const targetInput = document.querySelector("#experiment-target");
    const failureInput = document.querySelector("#experiment-failure");
    const riskInput = document.querySelector("#experiment-risk");
    const statusInput = document.querySelector("#experiment-status");
    const count = document.querySelector("#experiment-count");
    const emptyState = document.querySelector("#empty-state");
    const formTitle = document.querySelector("#form-title");
    const submitButton = document.querySelector("#submit-experiment");
    const cancelButton = document.querySelector("#cancel-edit");
    const formMessage = document.querySelector("#form-message");
    const listMessage = document.querySelector("#list-message");
    let experiments = readStorage(EXPERIMENTS_KEY, []);
    if (!Array.isArray(experiments)) experiments = [];

    const announce = (message, isError = false) => {
      if (!formMessage) return;
      formMessage.textContent = message;
      formMessage.classList.toggle("error", isError);
    };

    const render = () => {
      list.replaceChildren();
      if (count) count.textContent = String(experiments.length);
      if (emptyState) emptyState.classList.toggle("hidden", experiments.length > 0);
      for (const experiment of experiments) {
        const row = document.createElement("tr");
        const nameCell = document.createElement("td");
        const name = document.createElement("span");
        name.className = "experiment-name";
        name.textContent = experiment.name;
        const target = document.createElement("span");
        target.className = "experiment-target";
        target.textContent = experiment.target;
        nameCell.append(name, target);

        const failureCell = document.createElement("td");
        failureCell.textContent = experiment.failure;
        const riskCell = document.createElement("td");
        riskCell.textContent = experiment.risk;
        const statusCell = document.createElement("td");
        const status = document.createElement("span");
        status.className = `status-badge ${experiment.status.toLowerCase()}`;
        status.textContent = experiment.status;
        statusCell.append(status);

        const actionsCell = document.createElement("td");
        const actions = document.createElement("div");
        actions.className = "table-actions";
        const edit = document.createElement("button");
        edit.type = "button";
        edit.className = "edit-experiment";
        edit.dataset.id = experiment.id;
        edit.textContent = "Edit";
        edit.setAttribute("aria-label", `Edit ${experiment.name}`);
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "delete-experiment";
        remove.dataset.id = experiment.id;
        remove.textContent = "Delete";
        remove.setAttribute("aria-label", `Delete ${experiment.name}`);
        actions.append(edit, remove);
        actionsCell.append(actions);
        row.append(nameCell, failureCell, riskCell, statusCell, actionsCell);
        list.append(row);
      }
    };

    const resetForm = () => {
      form.reset();
      if (idInput) idInput.value = "";
      if (formTitle) formTitle.textContent = "Create an experiment";
      if (submitButton) submitButton.innerHTML = 'Save experiment <span aria-hidden="true">→</span>';
      cancelButton?.classList.add("hidden");
      announce("");
    };

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!(nameInput instanceof HTMLInputElement) || !(targetInput instanceof HTMLInputElement) ||
          !(failureInput instanceof HTMLSelectElement) || !(riskInput instanceof HTMLSelectElement) ||
          !(statusInput instanceof HTMLSelectElement)) return;

      const name = nameInput.value.trim();
      const target = targetInput.value.trim();
      if (!name || !target) {
        announce("Add an experiment name and digital-twin component.", true);
        return;
      }

      const editingId = idInput instanceof HTMLInputElement ? idInput.value : "";
      const experiment = {
        id: editingId || (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`),
        name,
        target,
        failure: failureInput.value,
        risk: riskInput.value,
        status: statusInput.value
      };
      const previousExperiments = [...experiments];
      const existingIndex = experiments.findIndex((item) => item.id === editingId);
      if (existingIndex >= 0) experiments[existingIndex] = experiment;
      else experiments.unshift(experiment);

      if (!writeStorage(EXPERIMENTS_KEY, experiments)) {
        experiments = previousExperiments;
        announce("Could not save to this browser. Check local storage settings and try again.", true);
        return;
      }
      render();
      resetForm();
      if (listMessage) listMessage.textContent = existingIndex >= 0 ? "Experiment updated." : "Experiment created.";
    });

    list.addEventListener("click", (event) => {
      if (!(event.target instanceof HTMLButtonElement)) return;
      const experiment = experiments.find((item) => item.id === event.target.dataset.id);
      if (!experiment) return;

      if (event.target.classList.contains("edit-experiment")) {
        if (!(idInput instanceof HTMLInputElement) || !(nameInput instanceof HTMLInputElement) ||
            !(targetInput instanceof HTMLInputElement) || !(failureInput instanceof HTMLSelectElement) ||
            !(riskInput instanceof HTMLSelectElement) || !(statusInput instanceof HTMLSelectElement)) return;
        idInput.value = experiment.id;
        nameInput.value = experiment.name;
        targetInput.value = experiment.target;
        failureInput.value = experiment.failure;
        riskInput.value = experiment.risk;
        statusInput.value = experiment.status;
        if (formTitle) formTitle.textContent = "Edit experiment";
        if (submitButton) submitButton.innerHTML = 'Update experiment <span aria-hidden="true">→</span>';
        cancelButton?.classList.remove("hidden");
        announce("");
        nameInput.focus();
      } else if (event.target.classList.contains("delete-experiment")) {
        const previous = experiments;
        experiments = experiments.filter((item) => item.id !== experiment.id);
        if (!writeStorage(EXPERIMENTS_KEY, experiments)) {
          experiments = previous;
          if (listMessage) listMessage.textContent = "Could not delete the experiment. Check local storage settings and try again.";
          return;
        }
        render();
        if (idInput instanceof HTMLInputElement && idInput.value === experiment.id) resetForm();
        if (listMessage) listMessage.textContent = `${experiment.name} deleted.`;
      }
    });

    cancelButton?.addEventListener("click", resetForm);
    render();
  }

  function initializeTeamEditor() {
    const members = document.querySelector("#team-members");
    if (!members) return;
    const status = document.querySelector("#team-save-status");
    const defaults = [...members.querySelectorAll(".team-member")].map((card) => ({
      name: card.querySelector('[data-team-field="name"]')?.value ?? "",
      role: card.querySelector('[data-team-field="role"]')?.value ?? "",
      contribution: card.querySelector('[data-team-field="contribution"]')?.value ?? ""
    }));
    let team = readStorage(TEAM_KEY, null);
    if (!Array.isArray(team)) team = defaults;

    const render = () => {
      members.replaceChildren();
      team.forEach((member, index) => {
        const card = document.createElement("article");
        card.className = "team-member";
        const avatar = document.createElement("div");
        avatar.className = "member-avatar";
        avatar.setAttribute("aria-hidden", "true");
        avatar.textContent = String(index + 1).padStart(2, "0");
        const fields = document.createElement("div");
        fields.className = "member-fields";
        for (const [key, label] of [["name", "NAME"], ["role", "ROLE"], ["contribution", "CONTRIBUTION"]]) {
          const fieldLabel = document.createElement("label");
          const fieldName = document.createElement("span");
          fieldName.textContent = label;
          const input = key === "contribution" ? document.createElement("textarea") : document.createElement("input");
          input.dataset.teamField = key;
          input.setAttribute("aria-label", `Group member ${index + 1} ${key}`);
          input.value = member[key] ?? "";
          if (input instanceof HTMLTextAreaElement) input.rows = 2;
          fieldLabel.append(fieldName, input);
          fields.append(fieldLabel);
        }
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "icon-button remove-member";
        remove.setAttribute("aria-label", `Remove group member ${index + 1}`);
        remove.textContent = "×";
        card.append(avatar, fields, remove);
        members.append(card);
      });
    };

    let saveTimer;
    const save = () => {
      team = [...members.querySelectorAll(".team-member")].map((card) => ({
        name: card.querySelector('[data-team-field="name"]')?.value.trim() ?? "",
        role: card.querySelector('[data-team-field="role"]')?.value.trim() ?? "",
        contribution: card.querySelector('[data-team-field="contribution"]')?.value.trim() ?? ""
      }));
      const saved = writeStorage(TEAM_KEY, team);
      if (status) status.textContent = saved ? "Saved on this device" : "Could not save changes";
    };

    render();
    members.addEventListener("input", () => {
      if (status) status.textContent = "Saving…";
      window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(save, 250);
    });
    members.addEventListener("click", (event) => {
      if (!(event.target instanceof HTMLButtonElement) || !event.target.classList.contains("remove-member")) return;
      const cards = [...members.querySelectorAll(".team-member")];
      const index = cards.indexOf(event.target.closest(".team-member"));
      if (index < 0) return;
      team.splice(index, 1);
      render();
      save();
    });
    document.querySelector("#add-member")?.addEventListener("click", () => {
      team.push({ name: `Group member ${team.length + 1}`, role: "Project role", contribution: "Add a short description of this member’s contribution." });
      render();
      save();
      members.querySelector(".team-member:last-child input")?.focus();
    });
  }

  function initializeAssistantSamples() {
    const answer = document.querySelector("#sample-answer p");
    if (!answer) return;
    document.querySelectorAll(".sample-question").forEach((button) => {
      button.addEventListener("click", () => {
        document.querySelectorAll(".sample-question").forEach((question) => question.classList.remove("selected"));
        button.classList.add("selected");
        answer.textContent = button.dataset.answer ?? "";
      });
    });
  }

  function initializeDashboardCharts() {
    if (typeof window.Chart !== "function") return;
    const uptimeCanvas = document.querySelector("#uptime-chart");
    const incidentsCanvas = document.querySelector("#incidents-chart");
    const recoveryCanvas = document.querySelector("#recovery-chart");
    if (!(uptimeCanvas instanceof HTMLCanvasElement) || !(incidentsCanvas instanceof HTMLCanvasElement) ||
        !(recoveryCanvas instanceof HTMLCanvasElement)) return;

    const palette = {
      cyan: "#57e2d0",
      violet: "#ad91ff",
      green: "#78dfb2",
      grid: "rgba(145, 163, 181, .11)",
      tick: "#788da0"
    };
    const labelsFor = (days) => Array.from({ length: days }, (_, index) => {
      const date = new Date();
      date.setDate(date.getDate() - (days - index - 1));
      return date.toLocaleDateString("en-US", days === 7 ? { weekday: "short" } : { month: "short", day: "numeric" });
    });
    const uptime = (days) => Array.from({ length: days }, (_, index) => Number((99.86 + ((index * 7 + 3) % 11) * 0.013).toFixed(2)));
    const incidents = (days) => Array.from({ length: days }, (_, index) => (index * 5 + 2) % 4);
    const recovery = (days) => Array.from({ length: days }, (_, index) => Number((3.2 + ((index * 3 + 1) % 9) * 0.22).toFixed(1)));
    const commonOptions = {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: "index" },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#102235",
          borderColor: "rgba(145, 163, 181, .2)",
          borderWidth: 1,
          titleColor: "#e4edf3",
          bodyColor: "#a9bac7",
          padding: 10,
          displayColors: false
        }
      },
      scales: {
        x: { grid: { display: false }, border: { display: false }, ticks: { color: palette.tick, maxRotation: 0, autoSkip: true, maxTicksLimit: 9, font: { family: "DM Mono", size: 8 } } },
        y: { grid: { color: palette.grid }, border: { display: false }, ticks: { color: palette.tick, maxTicksLimit: 5, font: { family: "DM Mono", size: 8 }, padding: 7 } }
      }
    };
    const lineDataset = (color) => ({
      borderColor: color,
      backgroundColor: `${color}20`,
      fill: true,
      tension: .36,
      borderWidth: 2,
      pointRadius: 2,
      pointHoverRadius: 4,
      pointBackgroundColor: color,
      pointBorderWidth: 0
    });
    const chartConfigs = [
      {
        canvas: uptimeCanvas,
        config: { type: "line", data: { labels: labelsFor(7), datasets: [{ label: "Simulated uptime", data: uptime(7), ...lineDataset(palette.cyan) }] }, options: { ...commonOptions, scales: { ...commonOptions.scales, y: { ...commonOptions.scales.y, min: 99.8, max: 100, ticks: { ...commonOptions.scales.y.ticks, callback: (value) => `${value}%` } } } } }
      },
      {
        canvas: incidentsCanvas,
        config: { type: "bar", data: { labels: labelsFor(7), datasets: [{ label: "Contained incidents", data: incidents(7), backgroundColor: `${palette.violet}b0`, hoverBackgroundColor: palette.violet, borderRadius: 4, maxBarThickness: 17 }] }, options: { ...commonOptions, scales: { ...commonOptions.scales, y: { ...commonOptions.scales.y, beginAtZero: true, suggestedMax: 4, ticks: { ...commonOptions.scales.y.ticks, precision: 0 } } } } }
      },
      {
        canvas: recoveryCanvas,
        config: { type: "line", data: { labels: labelsFor(7), datasets: [{ label: "Recovery time", data: recovery(7), ...lineDataset(palette.green) }] }, options: { ...commonOptions, scales: { ...commonOptions.scales, y: { ...commonOptions.scales.y, beginAtZero: true, suggestedMax: 6, ticks: { ...commonOptions.scales.y.ticks, callback: (value) => `${value}m` } } } } }
      }
    ];
    const charts = chartConfigs.map(({ canvas, config }) => new window.Chart(canvas, config));
    document.querySelectorAll(".range-button").forEach((button) => {
      button.addEventListener("click", () => {
        const days = Number(button.dataset.range);
        if (days !== 7 && days !== 30) return;
        document.querySelectorAll(".range-button").forEach((item) => {
          const selected = item === button;
          item.classList.toggle("active", selected);
          item.setAttribute("aria-pressed", String(selected));
        });
        const labels = labelsFor(days);
        charts.forEach((chart, index) => {
          chart.data.labels = labels;
          chart.data.datasets[0].data = [uptime(days), incidents(days), recovery(days)][index];
          chart.update();
        });
      });
    });
  }

  function initializeDashboardSimulation() {
    const form = document.querySelector("#dashboard-simulation-form");
    if (!(form instanceof HTMLFormElement)) return;

    const roleInput = document.querySelector("#dashboard-server-role");
    const durationInput = document.querySelector("#dashboard-outage-duration");
    const redundancyInput = document.querySelector("#dashboard-redundancy");
    const originInput = document.querySelector("#dashboard-api-origin");
    const runButton = document.querySelector("#dashboard-run-simulation");
    const status = document.querySelector("#dashboard-simulation-status-text");
    const indicator = document.querySelector(".dashboard-api-dot");
    const results = document.querySelector("#dashboard-simulation-results");
    const summary = document.querySelector("#dashboard-result-summary");
    const outcomeBadge = document.querySelector("#dashboard-outcome-badge");
    const serverStatus = document.querySelector("#dashboard-server-status");
    const detectionTime = document.querySelector("#dashboard-detection-time");
    const recoveryTime = document.querySelector("#dashboard-recovery-time");
    const availability = document.querySelector("#dashboard-availability");
    const timeline = document.querySelector("#dashboard-agent-timeline");
    const rawResponse = document.querySelector("#dashboard-raw-response-json");
    const endpointPath = "/api/simulations/hospital-server-failure";
    const roles = ["patient_records", "scheduling", "laboratory"];
    const redundancies = ["none", "standby_unavailable", "standby_ready"];
    const outcomes = ["contained", "degraded", "disrupted"];
    const agents = ["monitoring", "analysis", "recovery"];

    const setStatus = (message, state) => {
      if (status) status.textContent = message;
      indicator?.classList.remove("idle", "running", "success", "error");
      indicator?.classList.add(state);
    };

    const localApiOrigin = () => {
      if (!(originInput instanceof HTMLInputElement)) {
        throw new Error("The local API origin field is unavailable.");
      }
      let parsed;
      try {
        parsed = new URL(originInput.value.trim());
      } catch {
        throw new Error("Enter a valid local API origin, such as http://127.0.0.1:8000.");
      }
      if (!["http:", "https:"].includes(parsed.protocol) ||
          !["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname) ||
          parsed.username || parsed.password || parsed.pathname !== "/" ||
          parsed.search || parsed.hash) {
        throw new Error("Use a local API origin only (localhost, 127.0.0.1, or ::1).");
      }
      return parsed.origin;
    };

    const isDashboardResponse = (body) => {
      if (!body || typeof body !== "object" ||
          !roles.includes(body.server_role) ||
          !Array.isArray(body.affected_services) ||
          !body.affected_services.every((service) => typeof service === "string") ||
          !outcomes.includes(body.outcome) ||
          !Number.isInteger(body.recovery_minutes) ||
          typeof body.summary !== "string" ||
          body.simulation_only !== true ||
          body.production_impact !== "none") return false;

      const workflow = body.dashboard_workflow;
      if (!workflow || workflow.agent_type !== "deterministic_rules_based" ||
          workflow.simulation_only !== true ||
          !Array.isArray(workflow.agents) || !Array.isArray(workflow.events) ||
          workflow.agents.length !== agents.length ||
          workflow.events.length !== agents.length) return false;

      const executions = new Map(workflow.agents.map((item) => [item.agent_name, item]));
      if (!agents.every((name) => {
        const execution = executions.get(name);
        return execution?.status === "completed" &&
          execution.output?.agent_name === name &&
          Number.isFinite(Date.parse(execution.started_at)) &&
          Number.isFinite(Date.parse(execution.completed_at));
      })) return false;

      const monitoring = executions.get("monitoring").output;
      const analysis = executions.get("analysis").output;
      const recovery = executions.get("recovery").output;
      return ["healthy", "degraded", "failed"].includes(monitoring.server_status) &&
        Number.isFinite(monitoring.failure_detection_time_seconds) &&
        Number.isFinite(monitoring.system_availability_percent) &&
        monitoring.system_availability_percent >= 0 &&
        monitoring.system_availability_percent <= 100 &&
        ["redundancy_ready", "redundancy_unavailable", "no_redundancy"].includes(analysis.failure_pattern) &&
        Array.isArray(analysis.findings) &&
        analysis.findings.every((item) => typeof item === "string") &&
        Array.isArray(analysis.affected_services) &&
        analysis.affected_services.every((item) => typeof item === "string") &&
        Array.isArray(recovery.recommended_actions) &&
        recovery.recommended_actions.every((item) => typeof item === "string") &&
        Number.isInteger(recovery.estimated_recovery_minutes) &&
        recovery.recovered_server_status === "healthy" &&
        workflow.events.every((event, index) =>
          event.sequence === index + 1 &&
          agents.includes(event.agent_name) &&
          typeof event.event_type === "string" &&
          typeof event.message === "string" &&
          Number.isFinite(Date.parse(event.timestamp))
        );
    };

    const renderTimeline = (workflow) => {
      if (!timeline) return;
      const executions = new Map(workflow.agents.map((item) => [item.agent_name, item]));
      const labels = {
        monitoring: "Monitoring Agent",
        analysis: "Analysis Agent",
        recovery: "Recovery Agent"
      };
      timeline.replaceChildren();
      workflow.events.forEach((event) => {
        const output = executions.get(event.agent_name).output;
        const item = document.createElement("li");
        item.className = "dashboard-agent-event";
        const time = document.createElement("time");
        time.dateTime = event.timestamp;
        time.textContent = new Date(event.timestamp).toLocaleString();
        const content = document.createElement("div");
        const heading = document.createElement("div");
        heading.className = "dashboard-agent-event-heading";
        const name = document.createElement("strong");
        name.textContent = labels[event.agent_name];
        const eventType = document.createElement("span");
        eventType.textContent = event.event_type;
        heading.append(name, eventType);
        const message = document.createElement("p");
        message.textContent = event.message;
        content.append(heading, message);

        if (event.agent_name === "analysis" && output.findings.length) {
          const findings = document.createElement("ul");
          output.findings.forEach((finding) => {
            const entry = document.createElement("li");
            entry.textContent = finding;
            findings.append(entry);
          });
          content.append(findings);
        } else if (event.agent_name === "recovery" && output.recommended_actions.length) {
          const actions = document.createElement("ul");
          output.recommended_actions.forEach((action) => {
            const entry = document.createElement("li");
            entry.textContent = action;
            actions.append(entry);
          });
          content.append(actions);
        }
        item.append(time, content);
        timeline.append(item);
      });
    };

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!(roleInput instanceof HTMLSelectElement) ||
          !(durationInput instanceof HTMLInputElement) ||
          !(redundancyInput instanceof HTMLSelectElement) ||
          !(runButton instanceof HTMLButtonElement)) return;

      const outageDuration = Number(durationInput.value);
      if (!roles.includes(roleInput.value) || !Number.isInteger(outageDuration) ||
          outageDuration < 1 || outageDuration > 120 ||
          !redundancies.includes(redundancyInput.value)) {
        setStatus("Choose a supported role and redundancy setting, and an outage duration from 1–120 minutes.", "error");
        return;
      }

      let apiOrigin;
      try {
        apiOrigin = localApiOrigin();
      } catch (error) {
        setStatus(error.message, "error");
        return;
      }

      const requestBody = {
        server_role: roleInput.value,
        outage_duration_minutes: outageDuration,
        redundancy_state: redundancyInput.value
      };
      if (runButton) runButton.disabled = true;
      if (results) results.hidden = true;
      setStatus("Running the isolated digital-twin simulation…", "running");

      try {
        const response = await fetch(
          `${apiOrigin}${endpointPath}?include_dashboard_trace=true`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestBody)
          }
        );
        let body;
        try {
          body = await response.json();
        } catch {
          throw new Error(`The API returned a non-JSON response (HTTP ${response.status}).`);
        }
        if (!response.ok) {
          const detail = body.detail;
          const message = typeof detail === "string"
            ? detail
            : Array.isArray(detail)
              ? detail.map((item) => item.msg ?? JSON.stringify(item)).join("; ")
              : detail?.message ?? `HTTP ${response.status}`;
          throw new Error(`Simulation request failed: ${message}`);
        }
        if (!isDashboardResponse(body)) {
          throw new Error("The API response did not match the dashboard simulation schema.");
        }

        const workflow = body.dashboard_workflow;
        const executions = new Map(workflow.agents.map((item) => [item.agent_name, item]));
        const monitoring = executions.get("monitoring").output;
        const recovery = executions.get("recovery").output;
        if (summary) summary.textContent = body.summary;
        if (outcomeBadge) {
          outcomeBadge.textContent = body.outcome.toUpperCase();
          outcomeBadge.dataset.outcome = body.outcome;
        }
        if (serverStatus) {
          serverStatus.textContent =
            `${monitoring.server_status.toUpperCase()} → ${recovery.recovered_server_status.toUpperCase()}`;
        }
        if (detectionTime) detectionTime.textContent =
          `${monitoring.failure_detection_time_seconds} sec`;
        if (recoveryTime) recoveryTime.textContent =
          `${recovery.estimated_recovery_minutes} min`;
        if (availability) availability.textContent =
          `${monitoring.system_availability_percent}%`;
        if (rawResponse) rawResponse.textContent = JSON.stringify(body, null, 2);
        renderTimeline(workflow);
        if (results) results.hidden = false;
        setStatus(
          `Simulation completed · ${body.outcome} · all three deterministic dashboard agents reported.`,
          "success"
        );
      } catch (error) {
        setStatus(
          error instanceof TypeError
            ? "Could not reach the local API. Start FastAPI, check the local API origin, and allow this page's origin in CORS."
            : error.message,
          "error"
        );
      } finally {
        if (runButton) runButton.disabled = false;
      }
    });
  }

  function initializeDigitalTwin() {
    const form = document.querySelector("#twin-simulation-form");
    const topology = document.querySelector("#twin-topology");
    if (!(form instanceof HTMLFormElement) || !(topology instanceof SVGSVGElement)) return;

    const endpointPath = "/api/simulations/hospital-server-failure";
    const originInput = document.querySelector("#twin-api-origin");
    const roleInput = document.querySelector("#twin-server-role");
    const durationInput = document.querySelector("#twin-outage-duration");
    const redundancyInput = document.querySelector("#twin-redundancy");
    const runButton = document.querySelector("#run-twin-simulation");
    const resetButton = document.querySelector("#reset-twin-simulation");
    const pauseButton = document.querySelector("#pause-twin-animation");
    const statusText = document.querySelector("#twin-run-status-text");
    const statusIndicator = document.querySelector("#twin-run-status .api-indicator");
    const progressLabel = document.querySelector("#agent-progress-label");
    const progressCount = document.querySelector("#agent-progress-count");
    const progressTrack = document.querySelector(".workflow-progress-track");
    const progressBar = document.querySelector("#agent-progress-bar");
    const progressList = document.querySelector("#agent-progress-list");
    const executionLog = document.querySelector("#agent-execution-log");
    const logSource = document.querySelector("#agent-log-source");
    const resultsPanel = document.querySelector("#twin-results");
    const resultsToggle = document.querySelector("#toggle-twin-results");
    const timeline = document.querySelector("#twin-timeline");
    const resultPayload = document.querySelector("#raw-results-json code");
    const serviceList = document.querySelector("#affected-services-list");
    const runStatus = document.querySelector("#result-source-badge");
    const timelineMode = document.querySelector("#timeline-mode");
    const backendSummary = document.querySelector("#backend-summary");
    const outcomeValue = document.querySelector("#result-outcome");
    const recoveryValue = document.querySelector("#result-recovery");
    const impactValue = document.querySelector("#result-impact");
    const stage = document.querySelector("#topology-stage");
    const nodes = [...topology.querySelectorAll(".topology-node")];
    const roleNode = {
      patient_records: "database",
      scheduling: "application-server",
      laboratory: "application-server"
    };
    const serviceNode = [
      [/admissions workspace|appointment scheduler/i, "emergency-dispatch"],
      [/records service|staff roster|specimen tracker/i, "database"],
      [/lab-results queue/i, "application-server"]
    ];
    const validRoles = ["patient_records", "scheduling", "laboratory"];
    const validOutcomes = ["contained", "degraded", "disrupted"];
    const validRedundancy = ["none", "standby_unavailable", "standby_ready"];
    let animationTimer = 0;
    let playbackStep = 0;
    let paused = false;
    let responseData = null;
    let targetNode = null;
    let affectedNodeIds = [];
    let requestInFlight = false;

    const setStatus = (message, state = "idle") => {
      if (statusText) statusText.textContent = message;
      statusIndicator?.classList.remove("idle", "running", "success", "error");
      statusIndicator?.classList.add(state);
    };

    const updateAgents = (states) => {
      for (const [agent, state, detail] of states) {
        const card = document.querySelector(`[data-agent="${agent}"]`);
        if (!card) continue;
        const badge = card.querySelector(".agent-state");
        const description = card.querySelector(".agent-copy p");
        card.classList.toggle("agent-active", state === "Active");
        card.classList.toggle("agent-complete", state === "Complete" || state === "Completed");
        card.classList.toggle("agent-failed", state === "Failed");
        if (badge) badge.textContent = state;
        if (description) description.textContent = detail;
      }
    };

    const updateControlRoom = (workflow) => {
      const agentNames = {
        planner: "Planner",
        fault_injection: "Fault Injection",
        observer: "Observer",
        recovery: "Recovery"
      };
      const cardIds = {
        planner: "planner",
        fault_injection: "fault-injector",
        observer: "observer",
        recovery: "recovery"
      };
      const defaultDetails = {
        planner: "Waiting for a simulation request.",
        fault_injection: "Changes only the request-scoped in-memory twin.",
        observer: "Waiting to collect rules-based synthetic metrics.",
        recovery: "Waiting to restore and verify the in-memory twin."
      };
      if (!workflow) {
        if (progressLabel) progressLabel.textContent = "Awaiting backend workflow";
        if (progressCount) progressCount.textContent = "0 / 4 agents";
        progressTrack?.setAttribute("aria-valuenow", "0");
        if (progressBar) progressBar.style.width = "0%";
        progressList?.querySelectorAll("[data-progress-agent]").forEach((step) => {
          step.classList.remove("is-complete", "is-failed", "is-running");
          const state = step.querySelector(".progress-step-status");
          if (state) state.textContent = "Waiting";
        });
        if (executionLog) {
          executionLog.replaceChildren();
          const empty = document.createElement("li");
          empty.className = "execution-log-empty";
          empty.textContent = "Agent events will appear here after the backend run.";
          executionLog.append(empty);
        }
        if (logSource) logSource.textContent = "Awaiting response";
        updateAgents([
          ["planner", "Standby", defaultDetails.planner],
          ["fault-injector", "Standby", defaultDetails.fault_injection],
          ["observer", "Standby", defaultDetails.observer],
          ["recovery", "Standby", defaultDetails.recovery]
        ]);
        return;
      }

      const executions = new Map(workflow.agents.map((agent) => [agent.agent_name, agent]));
      let finishedCount = 0;
      const cardStates = [];
      Object.entries(agentNames).forEach(([agentName]) => {
        const execution = executions.get(agentName);
        const state = execution?.status === "completed"
          ? "Completed"
          : execution?.status === "failed" ? "Failed" : "Waiting";
        if (execution && execution.status !== "running") finishedCount += 1;
        const output = execution?.output ?? {};
        let description = defaultDetails[agentName];
        if (execution?.status === "failed") description = execution.error ?? "Agent failed.";
        if (execution?.status === "completed") {
          if (agentName === "planner") {
            description = `Planned ${output.planned_outcome} outcome for ${output.server_role}.`;
          } else if (agentName === "fault_injection") {
            description = `In-memory nodes changed: ${(output.changed_nodes ?? []).join(", ")}.`;
          } else if (agentName === "observer") {
            description = `${output.availability_percent}% availability · ${output.response_time_ms} ms · ${output.error_rate_percent}% errors.`;
          } else if (agentName === "recovery") {
            description = output.recovery_verified
              ? `Verified healthy baseline for ${(output.restored_nodes ?? []).length} nodes.`
              : "Recovery baseline verification failed.";
          }
        }
        const step = progressList?.querySelector(`[data-progress-agent="${agentName}"]`);
        step?.classList.remove("is-complete", "is-failed", "is-running");
        if (step) {
          step.classList.toggle("is-complete", state === "Completed");
          step.classList.toggle("is-failed", state === "Failed");
          const status = step.querySelector(".progress-step-status");
          if (status) status.textContent = state;
        }
        cardStates.push([cardIds[agentName], state, description]);
      });
      if (progressLabel) {
        progressLabel.textContent = workflow.status === "completed"
          ? "Workflow completed · all rules-based agents finished"
          : `Workflow failed · ${workflow.error ?? "agent failure reported"}`;
      }
      if (progressCount) progressCount.textContent = `${finishedCount} / 4 agents`;
      progressTrack?.setAttribute("aria-valuenow", String(finishedCount));
      if (progressBar) progressBar.style.width = `${finishedCount * 25}%`;
      if (logSource) logSource.textContent = "BACKEND GENERATED";
      updateAgents(cardStates);

      if (!executionLog) return;
      executionLog.replaceChildren();
      workflow.events.forEach((event) => {
        const item = document.createElement("li");
        item.className = `execution-event${event.event_type === "agent_failed" ? " is-failed" : ""}`;
        const time = document.createElement("time");
        time.dateTime = event.timestamp;
        const timestamp = new Date(event.timestamp);
        time.textContent = Number.isNaN(timestamp.getTime())
          ? event.timestamp
          : timestamp.toLocaleString();
        const content = document.createElement("div");
        content.className = "execution-event-copy";
        const heading = document.createElement("div");
        heading.className = "execution-event-heading";
        const name = document.createElement("strong");
        name.textContent = event.agent_name ? agentNames[event.agent_name] ?? event.agent_name : event.state;
        const type = document.createElement("span");
        type.textContent = event.event_type.replaceAll("_", " ");
        heading.append(name, type);
        const message = document.createElement("p");
        message.textContent = event.message;
        content.append(heading, message);
        item.append(time, content);
        executionLog.append(item);
      });
    };

    const setNodeStatus = (nodeId, state) => {
      const node = nodes.find((item) => item.dataset.node === nodeId);
      if (!node) return;
      node.classList.remove("status-healthy", "status-degraded", "status-failed", "status-recovering");
      node.classList.add(`status-${state}`);
      const statusLabel = node.querySelector(".node-state");
      if (statusLabel) statusLabel.textContent = state.toUpperCase();
      const label = node.querySelector(".node-name")?.textContent ?? nodeId;
      node.setAttribute("aria-label", `${label}, ${state}. Select this node to configure a scenario.`);
    };

    const setTopologyState = (target, affected, state) => {
      for (const node of nodes) setNodeStatus(node.dataset.node, "healthy");
      const dependencyState = state === "recovering" ? "recovering" : "degraded";
      for (const nodeId of affected) setNodeStatus(nodeId, dependencyState);
      if (target) setNodeStatus(target, state);
      topology.querySelectorAll(".topology-edge").forEach((edge) => {
        edge.classList.remove("edge-failed", "edge-degraded", "edge-recovering");
        const endpoints = (edge.dataset.edge ?? "").split("-");
        const relatedIds = endpoints.map((endpoint) => ({
          dispatch: "emergency-dispatch",
          load: "load-balancer",
          app: "application-server",
          database: "database",
          backup: "backup-server",
          monitor: "monitoring-service"
        }[endpoint]));
        const edgeState = relatedIds.includes(target)
          ? state
          : relatedIds.some((id) => affected.includes(id)) ? dependencyState : "";
        if (edgeState && edgeState !== "healthy") edge.classList.add(`edge-${edgeState}`);
      });
    };

    const workflowIsValid = (workflow) =>
      workflow !== null &&
      typeof workflow === "object" &&
      ["completed", "failed"].includes(workflow.status) &&
      Array.isArray(workflow.agents) &&
      workflow.agents.every((agent) =>
        agent !== null &&
        typeof agent === "object" &&
        ["planner", "fault_injection", "observer", "recovery"].includes(agent.agent_name) &&
        ["running", "completed", "failed"].includes(agent.status) &&
        typeof agent.started_at === "string"
      ) &&
      Array.isArray(workflow.events) &&
      workflow.events.every((event) =>
        event !== null &&
        typeof event === "object" &&
        Number.isInteger(event.sequence) &&
        typeof event.timestamp === "string" &&
        typeof event.state === "string" &&
        typeof event.event_type === "string" &&
        typeof event.message === "string"
      );

    const responseIsValid = (data) =>
      data !== null &&
      typeof data === "object" &&
      validRoles.includes(data.server_role) &&
      Array.isArray(data.affected_services) &&
      data.affected_services.every((service) => typeof service === "string") &&
      validOutcomes.includes(data.outcome) &&
      Number.isInteger(data.recovery_minutes) &&
      data.recovery_minutes >= 0 &&
      typeof       data.summary === "string" &&
      data.simulation_only === true &&
      data.production_impact === "none" &&
      workflowIsValid(data.agent_workflow) &&
      data.agent_workflow.status === "completed";

    const makeTimeline = (request, result) => {
      const names = new Map(nodes.map((node) => [node.dataset.node, node.querySelector(".node-name")?.textContent ?? node.dataset.node]));
      const affectedText = result.affected_services.length
        ? result.affected_services.join(" · ")
        : "The API reported no affected services.";
      const events = [
        { label: "Scenario submitted", detail: `${request.server_role.replaceAll("_", " ")} · ${request.outage_duration_minutes} minute(s) · ${request.redundancy_state.replaceAll("_", " ")}.`, source: "REQUEST" },
        { label: "Backend outcome", detail: result.summary, source: "API RESPONSE" },
        { label: "Affected services", detail: affectedText, source: "API RESPONSE" },
        { label: "Recovery playback", detail: `Backend recovery estimate: ${result.recovery_minutes} minute(s). The blue recovery state is an illustrative playback of that estimate.`, source: "API RESPONSE" }
      ];
      const targetName = names.get(targetNode) ?? "Selected server";
      events[0].topologyDetail = `${targetName} is highlighted for the requested failure playback; this visualization is not an event emitted by the backend.`;
      return events;
    };

    const renderTimeline = (events, activeIndex) => {
      if (!timeline) return;
      timeline.replaceChildren();
      events.forEach((event, index) => {
        const item = document.createElement("li");
        item.className = `timeline-event${index === activeIndex ? " is-active" : ""}${index < activeIndex ? " is-complete" : ""}`;
        const marker = document.createElement("span");
        marker.className = "timeline-marker";
        marker.setAttribute("aria-hidden", "true");
        const content = document.createElement("div");
        content.className = "timeline-copy";
        const heading = document.createElement("div");
        heading.className = "timeline-event-heading";
        const title = document.createElement("strong");
        title.textContent = event.label;
        const source = document.createElement("span");
        source.className = "timeline-source";
        source.textContent = event.source;
        heading.append(title, source);
        const detail = document.createElement("p");
        detail.textContent = event.detail;
        content.append(heading, detail);
        if (event.topologyDetail) {
          const annotation = document.createElement("p");
          annotation.className = "timeline-annotation";
          annotation.textContent = event.topologyDetail;
          content.append(annotation);
        }
        item.append(marker, content);
        timeline.append(item);
      });
    };

    const resetView = () => {
      window.clearTimeout(animationTimer);
      animationTimer = 0;
      playbackStep = 0;
      paused = false;
      responseData = null;
      targetNode = null;
      affectedNodeIds = [];
      setTopologyState(null, [], "healthy");
      stage?.classList.remove("is-paused");
      topology.unpauseAnimations?.();
      if (pauseButton) {
        pauseButton.disabled = true;
        pauseButton.textContent = "Pause animation";
        pauseButton.setAttribute("aria-pressed", "false");
      }
      if (resultsPanel) resultsPanel.hidden = true;
      resultsToggle?.setAttribute("aria-expanded", "false");
      if (resultPayload) resultPayload.textContent = "No backend response received yet.";
      if (serviceList) {
        serviceList.replaceChildren();
        const placeholder = document.createElement("li");
        placeholder.textContent = "Awaiting backend response.";
        serviceList.append(placeholder);
      }
      if (backendSummary) backendSummary.textContent = `Run a scenario to display the actual response from POST ${endpointPath}. No sample outcome is presented as backend data.`;
      if (outcomeValue) outcomeValue.textContent = "—";
      if (recoveryValue) recoveryValue.textContent = "—";
      if (impactValue) impactValue.textContent = "—";
      runStatus?.classList.remove("received");
      if (runStatus) {
        runStatus.classList.add("waiting");
        runStatus.textContent = "AWAITING REQUEST";
      }
      if (timelineMode) timelineMode.textContent = "NO RUN";
      if (timeline) {
        timeline.replaceChildren();
        const empty = document.createElement("li");
        empty.className = "timeline-empty";
        empty.textContent = "Run a simulation to build its event sequence.";
        timeline.append(empty);
      }
      updateControlRoom(null);
      if (!requestInFlight) setStatus("Ready · all topology nodes are healthy.", "idle");
    };

    const finishPlayback = () => {
      window.clearTimeout(animationTimer);
      animationTimer = 0;
      const outcomeStates = {
        contained: "healthy",
        degraded: "degraded",
        disrupted: "failed"
      };
      setTopologyState(targetNode, affectedNodeIds, outcomeStates[responseData.outcome]);
      renderTimeline(currentEvents, currentEvents.length);
      if (timelineMode) timelineMode.textContent = "PLAYBACK COMPLETE";
      if (pauseButton) {
        pauseButton.disabled = true;
        pauseButton.textContent = "Pause animation";
      }
      setStatus(`Backend result received · ${responseData.outcome} · ${responseData.recovery_minutes} minute recovery estimate.`, "success");
    };

    const playbackSequence = [
      {
        duration: 900,
        run: () => {
          setTopologyState(targetNode, affectedNodeIds, "failed");
          renderTimeline(currentEvents, 0);
          if (timelineMode) timelineMode.textContent = "FAILURE PLAYBACK";
        }
      },
      {
        duration: 900,
        run: () => {
          setTopologyState(targetNode, affectedNodeIds, "recovering");
          renderTimeline(currentEvents, 2);
          if (timelineMode) timelineMode.textContent = "RECOVERY PLAYBACK";
        }
      },
      {
        duration: 900,
        run: finishPlayback
      }
    ];
    let currentEvents = [];
    let currentRequest = null;

    const runNextPlaybackStep = () => {
      if (paused || requestInFlight || !responseData) return;
      if (playbackStep >= playbackSequence.length) {
        finishPlayback();
        return;
      }
      const step = playbackSequence[playbackStep];
      playbackStep += 1;
      step.run();
      if (playbackStep < playbackSequence.length) {
        animationTimer = window.setTimeout(runNextPlaybackStep, step.duration);
      }
    };

    const serviceNodes = (services) => [...new Set(services.flatMap((service) => {
      const rule = serviceNode.find(([pattern]) => pattern.test(service));
      return rule ? [rule[1]] : [];
    }))];

    const apiOrigin = () => {
      if (!(originInput instanceof HTMLInputElement)) throw new Error("The API origin field is unavailable.");
      let parsed;
      try {
        parsed = new URL(originInput.value.trim());
      } catch {
        throw new Error("Enter a valid local API origin, such as http://127.0.0.1:8000.");
      }
      if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password ||
          parsed.pathname !== "/" || parsed.search || parsed.hash) {
        throw new Error("Enter only the API origin (scheme and host), without a path or credentials.");
      }
      return parsed.origin;
    };

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!(roleInput instanceof HTMLSelectElement) || !(durationInput instanceof HTMLInputElement) ||
          !(redundancyInput instanceof HTMLSelectElement) || !(runButton instanceof HTMLButtonElement)) return;
      const duration = Number(durationInput.value);
      if (!validRoles.includes(roleInput.value) || !Number.isInteger(duration) || duration < 1 || duration > 120 ||
          !validRedundancy.includes(redundancyInput.value)) {
        setStatus("Check the server role, outage duration (1–120 minutes), and redundancy selection.", "error");
        return;
      }

      let baseUrl;
      try {
        baseUrl = apiOrigin();
      } catch (error) {
        setStatus(error.message, "error");
        return;
      }

      resetView();
      currentRequest = {
        server_role: roleInput.value,
        outage_duration_minutes: duration,
        redundancy_state: redundancyInput.value
      };
      targetNode = roleNode[currentRequest.server_role];
      requestInFlight = true;
      runButton.disabled = true;
      if (resetButton) resetButton.disabled = true;
      setStatus("Sending bounded scenario to the configured FastAPI endpoint…", "running");
      if (progressLabel) progressLabel.textContent = "Waiting for completed backend workflow";

      let reportedWorkflow = null;
      try {
        const response = await fetch(`${baseUrl}${endpointPath}?include_agent_trace=true`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(currentRequest)
        });
        const body = await response.json();
        if (!response.ok) {
          const detail = body.detail;
          if (detail && typeof detail === "object" && workflowIsValid(detail.agent_workflow)) {
            reportedWorkflow = detail.agent_workflow;
            updateControlRoom(reportedWorkflow);
            if (resultPayload) resultPayload.textContent = JSON.stringify(detail, null, 2);
          }
          const message = typeof detail === "string"
            ? detail
            : Array.isArray(detail)
              ? detail.map((item) => item.msg ?? JSON.stringify(item)).join("; ")
              : detail?.message ?? `HTTP ${response.status}`;
          throw new Error(`Simulation API rejected the request: ${message}`);
        }
        if (!responseIsValid(body)) {
          throw new Error("The API response did not match the expected hospital simulation response schema.");
        }

        responseData = body;
        affectedNodeIds = serviceNodes(body.affected_services).filter((id) => id !== targetNode);
        if (backendSummary) backendSummary.textContent = body.summary;
        if (outcomeValue) outcomeValue.textContent = body.outcome.toUpperCase();
        if (recoveryValue) recoveryValue.textContent = `${body.recovery_minutes} min`;
        if (impactValue) impactValue.textContent = body.production_impact.toUpperCase();
        if (serviceList) {
          serviceList.replaceChildren();
          body.affected_services.forEach((service) => {
            const item = document.createElement("li");
            item.textContent = service;
            serviceList.append(item);
          });
          if (!body.affected_services.length) {
            const item = document.createElement("li");
            item.textContent = "No affected services reported by the backend.";
            serviceList.append(item);
          }
        }
        if (resultPayload) resultPayload.textContent = JSON.stringify(body, null, 2);
        runStatus?.classList.remove("waiting");
        runStatus?.classList.add("received");
        if (runStatus) runStatus.textContent = "BACKEND GENERATED";
        currentEvents = makeTimeline(currentRequest, body);
        renderTimeline(currentEvents, 0);
        requestInFlight = false;
        runButton.disabled = false;
        if (resetButton) resetButton.disabled = false;
        if (pauseButton) pauseButton.disabled = false;
        playbackStep = 0;
        paused = false;
        updateControlRoom(body.agent_workflow);
        setStatus("Backend response received · starting illustrative topology playback.", "success");
        runNextPlaybackStep();
      } catch (error) {
        requestInFlight = false;
        runButton.disabled = false;
        if (resetButton) resetButton.disabled = false;
        setStatus(
          error instanceof TypeError
            ? "Could not reach the API. Start FastAPI, check the local API origin, and allow this page's origin in CORS."
            : error.message,
          "error"
        );
        if (reportedWorkflow) updateControlRoom(reportedWorkflow);
        else updateControlRoom(null);
      }
    });

    pauseButton?.addEventListener("click", () => {
      if (paused) {
        paused = false;
        stage?.classList.remove("is-paused");
        topology.unpauseAnimations?.();
        if (pauseButton) {
          pauseButton.textContent = "Pause animation";
          pauseButton.setAttribute("aria-pressed", "false");
        }
        setStatus("Playback resumed · no backend execution is being paused.", "running");
        runNextPlaybackStep();
        return;
      }
      if (!responseData || requestInFlight || animationTimer === 0) return;
      paused = true;
      stage?.classList.add("is-paused");
      topology.pauseAnimations?.();
      window.clearTimeout(animationTimer);
      animationTimer = 0;
      if (pauseButton) {
        pauseButton.textContent = "Resume animation";
        pauseButton.setAttribute("aria-pressed", "true");
      }
      setStatus("Playback paused · the backend request has already completed.", "running");
    });

    resetButton?.addEventListener("click", resetView);
    resultsToggle?.addEventListener("click", () => {
      if (!resultsPanel) return;
      resultsPanel.hidden = !resultsPanel.hidden;
      resultsToggle.setAttribute("aria-expanded", String(!resultsPanel.hidden));
      if (!resultsPanel.hidden) resultsPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });

    nodes.forEach((node) => {
      const selectRole = () => {
        const role = node.dataset.role;
        if (role && roleInput instanceof HTMLSelectElement) roleInput.value = role;
      };
      node.addEventListener("click", selectRole);
      node.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          selectRole();
        }
      });
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    initializeNavigation();
    initializeExperiments();
    initializeTeamEditor();
    initializeAssistantSamples();
    initializeDashboardCharts();
    initializeDashboardSimulation();
    initializeDigitalTwin();
  });
})();