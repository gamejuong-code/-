import { initializeApp } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getFirestore,
  onSnapshot,
  updateDoc,
  writeBatch,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyD61p7YZHNtqw3J0X7w4JIog4jMH-YSy50",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "smart-task-manager-14ebb.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "smart-task-manager-14ebb",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:899006723080:web:79a8ae698e8d5937914dbd",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "smart-task-manager-14ebb.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "899006723080",
};

const cloudConfigured = ["apiKey", "authDomain", "projectId", "appId"].every(
  (key) => Boolean(firebaseConfig[key]),
);
const LOCAL_KEY = "smart-task-web:v1";
const requiredIds = [
  "setupPanel", "authPanel", "appPanel", "authForm", "authEmail", "authPassword",
  "signInButton", "signUpButton", "logoutButton", "userEmail", "taskForm",
  "subjectInput", "titleInput", "contentInput", "dueInput", "saveButton",
  "cancelEditButton", "searchInput", "filterSelect", "tasksList", "emptyState",
  "detailPanel", "importInput", "importButton", "exportButton", "alertBanner",
  "toast", "totalCount", "activeCount", "dueSoonCount", "doneCount",
];
const ui = Object.fromEntries(requiredIds.map((id) => [id, document.getElementById(id)]));
for (const id of requiredIds) {
  if (!ui[id]) throw new Error(`화면 요소를 찾을 수 없습니다: ${id}`);
}

const state = {
  mode: cloudConfigured ? "cloud" : "local",
  user: null,
  db: null,
  auth: null,
  unsubscribe: null,
  tasks: [],
  selectedId: null,
  editingId: null,
  toastTimer: null,
};

function element(tag, className = "", content = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = content;
  return node;
}

function showToast(message, isError = false) {
  clearTimeout(state.toastTimer);
  ui.toast.textContent = message;
  ui.toast.className = isError ? "toast toast--error" : "toast";
  ui.toast.hidden = false;
  state.toastTimer = setTimeout(() => { ui.toast.hidden = true; }, 5000);
}

function parseDate(text) {
  if (typeof text !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const [year, month, day] = text.split("-").map(Number);
  const result = new Date(0);
  result.setFullYear(year, month - 1, day);
  result.setHours(0, 0, 0, 0);
  if (result.getFullYear() !== year || result.getMonth() !== month - 1 || result.getDate() !== day) {
    return null;
  }
  return result;
}

function daysUntil(text) {
  const due = parseDate(text);
  if (!due) return Number.POSITIVE_INFINITY;
  const today = new Date();
  const todayUTC = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const dueUTC = Date.UTC(due.getFullYear(), due.getMonth(), due.getDate());
  return Math.round((dueUTC - todayUTC) / 86_400_000);
}

function dueText(task) {
  const days = daysUntil(task["제출 날짜"]);
  if (!Number.isFinite(days)) return "날짜 확인 필요";
  if (days < 0) return `마감 ${Math.abs(days)}일 지남`;
  if (days === 0) return "오늘 마감";
  if (days === 1) return "내일 마감";
  return `${days}일 남음`;
}

function normalizeTask(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const subject = typeof value["과목"] === "string" ? value["과목"].trim() : "";
  const title = typeof value["과제명"] === "string" ? value["과제명"].trim() : "";
  const content = typeof value["내용"] === "string" ? value["내용"].trim() : "";
  const due = typeof value["제출 날짜"] === "string" ? value["제출 날짜"].trim() : "";
  if (!subject || !title || !parseDate(due)) return null;
  return {
    "과목": subject,
    "과제명": title,
    "내용": content,
    "제출 날짜": due,
    "완료": value["완료"] === "완료" ? "완료" : "미완료",
  };
}

function taskFields(task) {
  return {
    "과목": task["과목"],
    "과제명": task["과제명"],
    "내용": task["내용"],
    "제출 날짜": task["제출 날짜"],
    "완료": task["완료"],
  };
}

function taskFingerprint(task) {
  return JSON.stringify(taskFields(task));
}

function readLocalTasks() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      const normalized = normalizeTask(item);
      return normalized ? [{ id: typeof item.id === "string" ? item.id : crypto.randomUUID(), ...normalized }] : [];
    });
  } catch {
    showToast("브라우저의 저장 데이터를 읽지 못했습니다.", true);
    return [];
  }
}

function writeLocalTasks(tasks) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(tasks));
  } catch {
    throw new Error("브라우저에 저장하지 못했습니다. 저장 공간을 확인해 주세요.");
  }
}

function filteredTasks() {
  const keyword = ui.searchInput.value.trim().toLocaleLowerCase();
  const filter = ui.filterSelect.value;
  return state.tasks.filter((task) => {
    const complete = task["완료"] === "완료";
    if (["active", "미완료만 보기"].includes(filter) && complete) return false;
    if (["done", "완료만 보기"].includes(filter) && !complete) return false;
    const haystack = [task["과목"], task["과제명"], task["내용"]].join(" ").toLocaleLowerCase();
    return !keyword || haystack.includes(keyword);
  }).sort((a, b) => a["제출 날짜"].localeCompare(b["제출 날짜"]));
}

function updateCounts() {
  const done = state.tasks.filter((task) => task["완료"] === "완료").length;
  const soon = state.tasks.filter((task) => task["완료"] !== "완료" && [0, 1].includes(daysUntil(task["제출 날짜"]))).length;
  ui.totalCount.textContent = String(state.tasks.length);
  ui.activeCount.textContent = String(state.tasks.length - done);
  ui.dueSoonCount.textContent = String(soon);
  ui.doneCount.textContent = String(done);
}

function updateAlert() {
  const dueSoon = state.tasks
    .filter((task) => task["완료"] !== "완료" && [0, 1].includes(daysUntil(task["제출 날짜"])))
    .sort((a, b) => a["제출 날짜"].localeCompare(b["제출 날짜"]));
  ui.alertBanner.hidden = dueSoon.length === 0;
  if (dueSoon.length) {
    const names = dueSoon.slice(0, 3).map((task) => `${task["과목"]} · ${task["과제명"]}`).join(", ");
    const extra = dueSoon.length > 3 ? ` 외 ${dueSoon.length - 3}건` : "";
    ui.alertBanner.textContent = `오늘 또는 내일 마감인 과제 ${dueSoon.length}건: ${names}${extra}`;
  }
}

function renderList() {
  const visible = filteredTasks();
  ui.tasksList.replaceChildren();
  ui.emptyState.hidden = visible.length !== 0;
  if (!visible.some((task) => task.id === state.selectedId)) state.selectedId = null;

  for (const task of visible) {
    const done = task["완료"] === "완료";
    const card = element("button", `task-card${state.selectedId === task.id ? " task-card--selected" : ""}${done ? " is-done" : ""}`);
    card.type = "button";
    card.setAttribute("aria-pressed", String(state.selectedId === task.id));
    const indicator = element("span", "task-indicator", done ? "✓" : "");
    indicator.setAttribute("aria-hidden", "true");
    const main = element("span", "task-card-main");
    const meta = element("span", "task-meta");
    meta.append(element("span", "subject-chip", task["과목"]));
    meta.append(element("span", "task-date", task["제출 날짜"]));
    const badges = element("span", "task-card-badges");
    const status = element("span", `status-chip${done ? " status-chip--done" : ""}`, task["완료"]);
    const days = daysUntil(task["제출 날짜"]);
    const due = element("span", `due-chip${days < 0 ? " due-chip--late" : [0, 1].includes(days) ? " due-chip--urgent" : ""}`, dueText(task));
    const title = element("strong", "task-title", task["과제명"]);
    const snippet = element("span", "task-snippet", task["내용"] || "내용 없음");
    main.append(meta, title, snippet);
    badges.append(status, due);
    card.append(indicator, main, badges);
    card.addEventListener("click", () => {
      state.selectedId = task.id;
      renderList();
      renderDetail();
    });
    ui.tasksList.append(card);
  }
}

function detailLine(label, value) {
  const row = element("div", "detail-row");
  row.append(element("dt", "detail-label", label), element("dd", "detail-value", value));
  return row;
}

function renderDetail() {
  ui.detailPanel.replaceChildren();
  const task = state.tasks.find((item) => item.id === state.selectedId);
  if (!task) {
    ui.detailPanel.append(element("p", "detail-empty", "목록에서 과제를 선택하면 자세한 내용이 여기에 표시됩니다."));
    return;
  }
  const title = element("h3", "detail-title", task["과제명"]);
  const details = element("dl", "detail-grid");
  details.append(
    detailLine("과목", task["과목"]),
    detailLine("제출 날짜", `${task["제출 날짜"]} · ${dueText(task)}`),
    detailLine("상태", task["완료"]),
    detailLine("과제 내용", task["내용"] || "(내용 없음)"),
  );
  const actions = element("div", "detail-actions");
  const edit = element("button", "secondary-button", "수정");
  const toggle = element("button", "secondary-button", task["완료"] === "완료" ? "미완료로 변경" : "완료로 변경");
  const remove = element("button", "danger-button", "삭제");
  for (const button of [edit, toggle, remove]) button.type = "button";
  edit.addEventListener("click", () => beginEdit(task));
  toggle.addEventListener("click", () => toggleComplete(task));
  remove.addEventListener("click", () => removeTask(task));
  actions.append(edit, toggle, remove);
  ui.detailPanel.append(title, details, actions);
}

function render() {
  updateCounts();
  updateAlert();
  renderList();
  renderDetail();
}

function beginEdit(task) {
  state.editingId = task.id;
  ui.subjectInput.value = task["과목"];
  ui.titleInput.value = task["과제명"];
  ui.contentInput.value = task["내용"];
  ui.dueInput.value = task["제출 날짜"];
  ui.saveButton.textContent = "수정 내용 저장";
  ui.cancelEditButton.hidden = false;
  ui.subjectInput.focus();
  ui.taskForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

function endEdit() {
  state.editingId = null;
  ui.taskForm.reset();
  ui.saveButton.textContent = "과제 등록";
  ui.cancelEditButton.hidden = true;
}

function tasksCollection() {
  return collection(state.db, "users", state.user.uid, "tasks");
}

function taskReference(id) {
  return doc(state.db, "users", state.user.uid, "tasks", id);
}

async function saveTask(task, id) {
  if (state.mode === "local") {
    let nextTasks;
    if (id) {
      const index = state.tasks.findIndex((item) => item.id === id);
      if (index < 0) throw new Error("수정할 과제를 찾지 못했습니다.");
      nextTasks = state.tasks.map((item) => item.id === id ? { id, ...task } : item);
    } else {
      id = crypto.randomUUID();
      nextTasks = [...state.tasks, { id, ...task }];
    }
    writeLocalTasks(nextTasks);
    state.tasks = nextTasks;
    state.selectedId = id;
    render();
    return;
  }
  if (id) {
    await updateDoc(taskReference(id), task);
    state.selectedId = id;
  } else {
    const reference = await addDoc(tasksCollection(), task);
    state.selectedId = reference.id;
  }
  render();
}

async function toggleComplete(task) {
  const next = task["완료"] === "완료" ? "미완료" : "완료";
  try {
    if (state.mode === "local") {
      const nextTasks = state.tasks.map((item) => item.id === task.id ? { ...item, "완료": next } : item);
      writeLocalTasks(nextTasks);
      state.tasks = nextTasks;
      render();
    } else {
      await updateDoc(taskReference(task.id), { "완료": next });
    }
    showToast(`과제를 ${next} 상태로 변경했습니다.`);
  } catch (error) {
    showToast(errorMessage(error), true);
  }
}

async function removeTask(task) {
  if (!window.confirm(`'${task["과제명"]}' 과제를 삭제할까요?`)) return;
  try {
    if (state.mode === "local") {
      const nextTasks = state.tasks.filter((item) => item.id !== task.id);
      writeLocalTasks(nextTasks);
      state.tasks = nextTasks;
      state.selectedId = null;
      render();
    } else {
      await deleteDoc(taskReference(task.id));
      state.selectedId = null;
    }
    if (state.editingId === task.id) endEdit();
    showToast("과제를 삭제했습니다.");
  } catch (error) {
    showToast(errorMessage(error), true);
  }
}

function errorMessage(error) {
  const messages = {
    "auth/email-already-in-use": "이미 가입된 이메일입니다. 로그인해 주세요.",
    "auth/invalid-email": "이메일 주소를 확인해 주세요.",
    "auth/weak-password": "비밀번호는 6자 이상으로 입력해 주세요.",
    "auth/invalid-credential": "이메일 또는 비밀번호가 맞지 않습니다.",
    "auth/too-many-requests": "시도가 너무 많습니다. 잠시 후 다시 해 주세요.",
    "permission-denied": "Firestore 접근이 거부되었습니다. 보안 규칙과 로그인 상태를 확인해 주세요.",
    "unavailable": "네트워크에 연결할 수 없습니다. 다시 시도해 주세요.",
  };
  return messages[error?.code] || error?.message || "작업을 완료하지 못했습니다.";
}

async function authenticate(createAccount) {
  const email = ui.authEmail.value.trim();
  const password = ui.authPassword.value;
  if (!email || !password) {
    showToast("이메일과 비밀번호를 입력해 주세요.", true);
    return;
  }
  ui.signInButton.disabled = true;
  ui.signUpButton.disabled = true;
  try {
    if (createAccount) {
      await createUserWithEmailAndPassword(state.auth, email, password);
      showToast("계정을 만들었습니다.");
    } else {
      await signInWithEmailAndPassword(state.auth, email, password);
      showToast("로그인했습니다.");
    }
    ui.authPassword.value = "";
  } catch (error) {
    showToast(errorMessage(error), true);
  } finally {
    ui.signInButton.disabled = false;
    ui.signUpButton.disabled = false;
  }
}

function showSignedOut() {
  state.unsubscribe?.();
  state.unsubscribe = null;
  state.user = null;
  state.tasks = [];
  state.selectedId = null;
  endEdit();
  ui.setupPanel.hidden = true;
  ui.authPanel.hidden = false;
  ui.appPanel.hidden = true;
  ui.userEmail.textContent = "";
}

function showSignedIn(user) {
  state.unsubscribe?.();
  state.user = user;
  state.tasks = [];
  state.selectedId = null;
  endEdit();
  ui.setupPanel.hidden = true;
  ui.authPanel.hidden = true;
  ui.appPanel.hidden = false;
  ui.logoutButton.hidden = false;
  ui.userEmail.textContent = user.email || "로그인됨";
  render();
  state.unsubscribe = onSnapshot(tasksCollection(), (snapshot) => {
    state.tasks = snapshot.docs.flatMap((record) => {
      const normalized = normalizeTask(record.data());
      return normalized ? [{ id: record.id, ...normalized }] : [];
    });
    render();
  }, (error) => showToast(errorMessage(error), true));
}

function startLocalMode() {
  state.mode = "local";
  state.tasks = readLocalTasks();
  ui.setupPanel.hidden = false;
  ui.authPanel.hidden = true;
  ui.appPanel.hidden = false;
  ui.logoutButton.hidden = true;
  ui.userEmail.textContent = "이 브라우저에 저장 중";
  render();
}

ui.taskForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const task = normalizeTask({
    "과목": ui.subjectInput.value,
    "과제명": ui.titleInput.value,
    "내용": ui.contentInput.value,
    "제출 날짜": ui.dueInput.value,
    "완료": state.editingId
      ? state.tasks.find((item) => item.id === state.editingId)?.["완료"]
      : "미완료",
  });
  if (!task) {
    showToast("과목명, 과제명, 올바른 제출 날짜를 입력해 주세요.", true);
    return;
  }
  ui.saveButton.disabled = true;
  try {
    const wasEditing = Boolean(state.editingId);
    await saveTask(task, state.editingId);
    endEdit();
    showToast(wasEditing ? "과제를 수정했습니다." : "과제를 등록했습니다.");
  } catch (error) {
    showToast(errorMessage(error), true);
  } finally {
    ui.saveButton.disabled = false;
  }
});

ui.cancelEditButton.addEventListener("click", endEdit);
ui.searchInput.addEventListener("input", render);
ui.filterSelect.addEventListener("change", render);
ui.authForm.addEventListener("submit", (event) => { event.preventDefault(); authenticate(false); });
ui.signUpButton.addEventListener("click", (event) => { event.preventDefault(); authenticate(true); });
ui.logoutButton.addEventListener("click", async () => {
  try { await signOut(state.auth); } catch (error) { showToast(errorMessage(error), true); }
});

ui.importButton.addEventListener("click", () => ui.importInput.click());
ui.importInput.addEventListener("change", async () => {
  const file = ui.importInput.files?.[0];
  if (!file) return;
  try {
    if (file.size > 5_000_000) throw new Error("5MB 이하의 JSON 파일을 선택해 주세요.");
    const parsed = JSON.parse(await file.text());
    if (!Array.isArray(parsed)) throw new Error("기존 과제목록.json처럼 배열 형식인 파일이 필요합니다.");
    const normalized = parsed.map(normalizeTask);
    if (normalized.some((task) => !task)) throw new Error("일부 과제의 과목·과제명·제출 날짜가 올바르지 않습니다.");
    const existing = new Set(state.tasks.map(taskFingerprint));
    const fresh = normalized.filter((task) => {
      const key = taskFingerprint(task);
      if (existing.has(key)) return false;
      existing.add(key);
      return true;
    });
    if (!fresh.length) {
      showToast("새로 가져올 과제가 없습니다.");
      return;
    }
    if (!window.confirm(`${fresh.length}개 과제를 현재 목록에 추가할까요?`)) return;
    ui.importButton.disabled = true;
    if (state.mode === "local") {
      const nextTasks = [...state.tasks, ...fresh.map((task) => ({ id: crypto.randomUUID(), ...task }))];
      writeLocalTasks(nextTasks);
      state.tasks = nextTasks;
      render();
    } else {
      for (let offset = 0; offset < fresh.length; offset += 400) {
        const batch = writeBatch(state.db);
        for (const task of fresh.slice(offset, offset + 400)) {
          batch.set(doc(tasksCollection()), task);
        }
        await batch.commit();
      }
    }
    showToast(`${fresh.length}개 과제를 가져왔습니다.`);
  } catch (error) {
    showToast(errorMessage(error), true);
  } finally {
    ui.importInput.value = "";
    ui.importButton.disabled = false;
  }
});

ui.exportButton.addEventListener("click", () => {
  const data = JSON.stringify(state.tasks.map(taskFields), null, 2);
  const url = URL.createObjectURL(new Blob([data], { type: "application/json;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  const today = new Date();
  const datePart = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, "0"), String(today.getDate()).padStart(2, "0")].join("-");
  link.download = `과제목록-${datePart}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

setInterval(() => { if (!ui.appPanel.hidden) { updateCounts(); updateAlert(); renderList(); renderDetail(); } }, 60_000);

if (!cloudConfigured) {
  startLocalMode();
} else {
  try {
    const app = initializeApp(firebaseConfig);
    state.auth = getAuth(app);
    state.db = getFirestore(app);
    onAuthStateChanged(state.auth, (user) => user ? showSignedIn(user) : showSignedOut(),
      (error) => showToast(errorMessage(error), true));
  } catch (error) {
    startLocalMode();
    showToast(`Firebase 설정을 확인해 주세요: ${errorMessage(error)}`, true);
  }
}
