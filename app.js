"use strict";

const BROKER_HOST = "35902b51ff004900a09ea8c4c2875495.s1.eu.hivemq.cloud";
const BROKER_WS_PORT = 8884;
const BROKER_WS_PATH = "/mqtt";

const TOPICS = {
  temperature: "home/mist/temperature",
  humidity: "home/mist/humidity",
  rssi: "home/mist/rssi",
  status: "home/mist/status",
};

const SPARK_MAX_POINTS = 20;
const series = {
  temperature: [],
  humidity: [],
};

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

function pushSeries(key, value) {
  const arr = series[key];
  arr.push(value);
  if (arr.length > SPARK_MAX_POINTS) arr.shift();
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

function handleMessage(topic, payload) {
  if (topic === TOPICS.status) {
    setDeviceStatus(payload.toString().trim());
    return;
  }

  const value = parseFloat(payload.toString());
  if (Number.isNaN(value)) return;

  if (topic === TOPICS.temperature) {
    el("tempValue").textContent = value.toFixed(1);
    pushSeries("temperature", value);
    renderSpark("tempSpark", series.temperature);
  } else if (topic === TOPICS.humidity) {
    el("humValue").textContent = value.toFixed(1);
    pushSeries("humidity", value);
    renderSpark("humSpark", series.humidity);
  } else if (topic === TOPICS.rssi) {
    el("rssiValue").textContent = value.toFixed(0);
    const status = rssiStatus(value);
    const badge = el("rssiBadge");
    badge.textContent = status.label;
    badge.className = "badge " + status.cls;
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
