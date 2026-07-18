"use strict";

const BROKER_HOST = "35902b51ff004900a09ea8c4c2875495.s1.eu.hivemq.cloud";
const BROKER_WS_PORT = 8884;
const BROKER_WS_PATH = "/mqtt";

const TOPICS = {
  temperature: "home/mist/temperature",
  humidity: "home/mist/humidity",
  rssi: "home/mist/rssi",
  status: "home/mist/status",
  temperatureHigh: "home/mist/temperature/high",
  temperatureLow: "home/mist/temperature/low",
  temperatureHistory: "home/mist/temperature/history",
  humidityHigh: "home/mist/humidity/high",
  humidityLow: "home/mist/humidity/low",
  humidityHistory: "home/mist/humidity/history",
  mistState: "home/mist/relay/state",
  mistMode: "home/mist/relay/mode",
  targetHumidity: "home/mist/target_humidity",
  ledState: "home/mist/led/state",
  ledMode: "home/mist/led/mode",
  ledSchedule: "home/mist/led/schedule",
};

const SET_TOPICS = {
  mistSet: "home/mist/relay/set",
  targetHumiditySet: "home/mist/target_humidity/set",
  ledSet: "home/mist/led/set",
  ledScheduleSet: "home/mist/led/schedule/set",
};

// Історія (60 точок по 1/хв) тепер рахується на самому контролері й приходить
// готовим retained JSON-масивом — дашборду лишається тільки намалювати.

let client = null;

const el = (id) => document.getElementById(id);

function setConnStatus(state) {
  const dot = el("connDot");
  const text = el("connText");
  dot.classList.remove("on", "off");
  if (state === "connected") {
    dot.classList.add("on");
    text.textContent = "підключено";
  } else if (state === "connecting") {
    text.textContent = "підключення…";
  } else {
    dot.classList.add("off");
    text.textContent = "офлайн";
  }
}

function rssiStatus(rssi) {
  if (rssi >= -67) return { cls: "good", label: "Відмінний" };
  if (rssi >= -75) return { cls: "warning", label: "Добрий" };
  if (rssi >= -85) return { cls: "serious", label: "Слабкий" };
  return { cls: "critical", label: "Дуже слабкий" };
}

function renderSpark(svgId, values) {
  const svg = el(svgId);
  if (values.length < 2) {
    svg.setAttribute("points", "");
    return;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * 100;
      const y = 30 - ((v - min) / range) * 28;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  svg.setAttribute("points", points);
}

function renderSparkFromJSON(svgId, jsonText) {
  let values = [];
  try {
    values = JSON.parse(jsonText);
  } catch (e) {
    return;
  }
  renderSpark(svgId, values);
}

function touchUpdatedAt() {
  const now = new Date();
  el("updatedAt").textContent =
    "Оновлено " + now.toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function setDeviceStatus(status) {
  // status: "online" | "offline" | "unknown"
  const box = el("deviceStatus");
  const dot = el("deviceDot");
  const text = el("deviceStatusText");
  box.className = "device-status " + status;
  dot.classList.remove("on", "off");
  if (status === "online") {
    dot.classList.add("on");
    text.textContent = "Контролер: онлайн";
  } else if (status === "offline") {
    dot.classList.add("off");
    text.textContent = "Контролер: офлайн";
  } else {
    text.textContent = "Контролер: невідомо";
  }
}

function setActiveMode(containerId, mode) {
  el(containerId)
    .querySelectorAll("button")
    .forEach((btn) => btn.classList.toggle("active", btn.dataset.mode === mode));
}

function renderSchedule(jsonText) {
  let periods = [];
  try {
    periods = JSON.parse(jsonText);
  } catch (e) {
    return;
  }
  for (let i = 0; i < 4; i++) {
    const p = periods[i];
    el(`sched${i}Start`).value = p ? p.start : "";
    el(`sched${i}End`).value = p ? p.end : "";
    el(`sched${i}State`).value = p ? p.state : "on";
  }
}

function handleMessage(topic, payload) {
  const text = payload.toString().trim();

  if (topic === TOPICS.status) {
    setDeviceStatus(text);
  } else if (topic === TOPICS.mistState) {
    el("mistStateText").textContent = text === "on" ? "увімкнено" : "вимкнено";
  } else if (topic === TOPICS.mistMode) {
    setActiveMode("mistModeButtons", text);
  } else if (topic === TOPICS.ledState) {
    el("ledStateText").textContent = text === "on" ? "увімкнено" : "вимкнено";
  } else if (topic === TOPICS.ledMode) {
    setActiveMode("ledModeButtons", text);
  } else if (topic === TOPICS.ledSchedule) {
    renderSchedule(text);
  } else if (topic === TOPICS.targetHumidity) {
    const value = parseFloat(text);
    if (!Number.isNaN(value) && document.activeElement !== el("targetHumidityInput")) {
      el("targetHumidityInput").value = value;
    }
  } else if (topic === TOPICS.temperature) {
    const value = parseFloat(text);
    if (Number.isNaN(value)) return;
    el("tempValue").textContent = value.toFixed(1);
  } else if (topic === TOPICS.temperatureHistory) {
    renderSparkFromJSON("tempSpark", text);
  } else if (topic === TOPICS.temperatureHigh) {
    const value = parseFloat(text);
    if (!Number.isNaN(value)) el("tempHigh").textContent = value.toFixed(1) + "°C";
  } else if (topic === TOPICS.temperatureLow) {
    const value = parseFloat(text);
    if (!Number.isNaN(value)) el("tempLow").textContent = value.toFixed(1) + "°C";
  } else if (topic === TOPICS.humidity) {
    const value = parseFloat(text);
    if (Number.isNaN(value)) return;
    el("humValue").textContent = value.toFixed(1);
  } else if (topic === TOPICS.humidityHistory) {
    renderSparkFromJSON("humSpark", text);
  } else if (topic === TOPICS.humidityHigh) {
    const value = parseFloat(text);
    if (!Number.isNaN(value)) el("humHigh").textContent = value.toFixed(1) + "%";
  } else if (topic === TOPICS.humidityLow) {
    const value = parseFloat(text);
    if (!Number.isNaN(value)) el("humLow").textContent = value.toFixed(1) + "%";
  } else if (topic === TOPICS.rssi) {
    const value = parseFloat(text);
    if (Number.isNaN(value)) return;
    el("rssiValue").textContent = value.toFixed(0);
    const status = rssiStatus(value);
    const badge = el("rssiBadge");
    badge.textContent = status.label;
    badge.className = "badge " + status.cls;
  } else {
    return;
  }

  touchUpdatedAt();
}

function connect(username, password) {
  setConnStatus("connecting");
  el("loginError").textContent = "";

  const url = `wss://${BROKER_HOST}:${BROKER_WS_PORT}${BROKER_WS_PATH}`;
  client = mqtt.connect(url, {
    username,
    password,
    clientId: "mist-dashboard-" + Math.random().toString(16).slice(2),
    clean: true,
    reconnectPeriod: 5000,
    connectTimeout: 10000,
    protocolVersion: 4,
  });

  client.on("connect", () => {
    setConnStatus("connected");
    el("login").style.display = "none";
    el("dashboard").style.display = "flex";
    client.subscribe(Object.values(TOPICS));
  });

  client.on("reconnect", () => setConnStatus("connecting"));
  client.on("close", () => setConnStatus("offline"));

  client.on("error", (err) => {
    setConnStatus("offline");
    const extra = {};
    if (err) {
      Object.getOwnPropertyNames(err).forEach((k) => {
        if (k !== "stack") extra[k] = err[k];
      });
    }
    const detail = (err && err.message) ? err.message : String(err);
    const box = el("loginError");
    box.textContent = "";
    box.append(
      document.createTextNode("Помилка підключення: " + detail),
      document.createElement("br")
    );
    const extraEl = document.createElement("span");
    extraEl.style.cssText = "font-size:11px;opacity:0.8";
    extraEl.textContent = JSON.stringify(extra);
    box.append(extraEl);
    console.error(err);
  });

  client.on("message", (topic, payload) => handleMessage(topic, payload));
}

function logout() {
  if (client) {
    client.end(true);
    client = null;
  }
  localStorage.removeItem("mist_user");
  localStorage.removeItem("mist_pass");
  el("dashboard").style.display = "none";
  el("login").style.display = "flex";
  el("user").value = "";
  el("pass").value = "";
  setConnStatus("offline");
}

el("togglePass").addEventListener("click", () => {
  const pass = el("pass");
  const btn = el("togglePass");
  const show = pass.type === "password";
  pass.type = show ? "text" : "password";
  btn.textContent = show ? "Сховати" : "Показати";
});

el("loginBtn").addEventListener("click", () => {
  const user = el("user").value.trim();
  const pass = el("pass").value.trim();
  if (!user || !pass) {
    el("loginError").textContent = "Введи користувача і пароль.";
    return;
  }
  localStorage.setItem("mist_user", user);
  localStorage.setItem("mist_pass", pass);
  connect(user, pass);
});

el("logout").addEventListener("click", logout);

function wireModeButtons(containerId, setTopic) {
  el(containerId)
    .querySelectorAll("button")
    .forEach((btn) => {
      btn.addEventListener("click", () => {
        if (!client || !client.connected) return;
        client.publish(setTopic, btn.dataset.mode);
      });
    });
}

wireModeButtons("mistModeButtons", SET_TOPICS.mistSet);
wireModeButtons("ledModeButtons", SET_TOPICS.ledSet);

el("targetHumiditySave").addEventListener("click", () => {
  if (!client || !client.connected) return;
  const value = el("targetHumidityInput").value;
  if (!value) return;
  client.publish(SET_TOPICS.targetHumiditySet, value);
});

el("scheduleSave").addEventListener("click", () => {
  if (!client || !client.connected) return;
  const periods = [];
  for (let i = 0; i < 4; i++) {
    const start = el(`sched${i}Start`).value;
    const end = el(`sched${i}End`).value;
    const state = el(`sched${i}State`).value;
    if (start && end) periods.push({ start, end, state });
  }
  client.publish(SET_TOPICS.ledScheduleSet, JSON.stringify(periods));
});

// Автовхід, якщо дані вже збережені в цьому браузері
const savedUser = localStorage.getItem("mist_user");
const savedPass = localStorage.getItem("mist_pass");
if (savedUser && savedPass) {
  el("user").value = savedUser;
  el("pass").value = savedPass;
  connect(savedUser, savedPass);
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
