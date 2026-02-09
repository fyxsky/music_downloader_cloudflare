const csvInput = document.getElementById("csvInput");
const startBtn = document.getElementById("startBtn");
const clearLogBtn = document.getElementById("clearLogBtn");
const tbody = document.getElementById("tbody");
const searchName = document.getElementById("searchName");
const searchArtist = document.getElementById("searchArtist");
const uploadR2 = document.getElementById("uploadR2");

const statTotal = document.getElementById("statTotal");
const statDone = document.getElementById("statDone");
const statRunning = document.getElementById("statRunning");
const statFail = document.getElementById("statFail");
const progressFill = document.getElementById("progressFill");
const progressText = document.getElementById("progressText");
const logBox = document.getElementById("logBox");

let rows = [];

function now() {
  const d = new Date();
  return d.toLocaleTimeString("zh-CN", { hour12: false });
}

function log(message) {
  const line = document.createElement("div");
  line.className = "log-line";
  line.textContent = `[${now()}] ${message}`;
  logBox.appendChild(line);
  logBox.scrollTop = logBox.scrollHeight;
}

function clearLogs() {
  logBox.innerHTML = "";
}

function normalize(text) {
  return (text || "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[\s\-_.()\[\]（）【】·,，'"/]+/g, "");
}

function mode() {
  return document.querySelector("input[name='matchMode']:checked")?.value || "auto";
}

function statusBadge(status) {
  let cls = "idle";
  if (status.startsWith("完成")) cls = "ok";
  else if (status.startsWith("失败")) cls = "err";
  else if (status !== "待处理") cls = "run";
  return `<span class="badge ${cls}">${status}</span>`;
}

function filteredRows() {
  const nk = normalize(searchName.value);
  const ak = normalize(searchArtist.value);
  return rows.filter((r) => {
    if (nk && !normalize(r.name).includes(nk)) return false;
    if (ak && !normalize(r.artist).includes(ak)) return false;
    return true;
  });
}

function render() {
  const data = filteredRows();
  tbody.innerHTML = data
    .map((r, i) => `
      <tr>
        <td>${i + 1}</td>
        <td title="${r.name}">${r.name}</td>
        <td title="${r.artist}">${r.artist}</td>
        <td>${statusBadge(r.status)}</td>
        <td>
          ${
            r.cloudUrl
              ? `<span class=\"link-actions\"><a class=\"link-anchor\" target=\"_blank\" href=\"${r.cloudUrl}\">打开</a><button class=\"link-btn\" data-copy=\"${r.cloudUrl}\">复制</button></span>`
              : "-"
          }
        </td>
      </tr>
    `)
    .join("");

  const total = rows.length;
  const done = rows.filter((r) => r.status.startsWith("完成")).length;
  const fail = rows.filter((r) => r.status.startsWith("失败")).length;
  const running = rows.filter((r) => !r.status.startsWith("完成") && !r.status.startsWith("失败") && r.status !== "待处理").length;

  statTotal.textContent = String(total);
  statDone.textContent = String(done);
  statFail.textContent = String(fail);
  statRunning.textContent = String(running);

  const progress = total ? Math.round((done / total) * 100) : 0;
  progressFill.style.width = `${progress}%`;
  progressText.textContent = `${progress}%`;
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((s) => s.trim().replace(/^\uFEFF/, ""));
  const nameIdx = headers.indexOf("歌曲名");
  const artistIdx = headers.indexOf("歌手");
  if (nameIdx < 0 || artistIdx < 0) {
    throw new Error("CSV 缺少列：歌曲名、歌手");
  }
  return lines
    .slice(1)
    .map((line) => {
      const cols = line.split(",");
      return {
        name: (cols[nameIdx] || "").trim(),
        artist: (cols[artistIdx] || "").trim(),
        status: "待处理",
        cloudUrl: ""
      };
    })
    .filter((r) => r.name);
}

async function apiJson(path, params = {}) {
  const u = new URL(path, location.origin);
  Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
  const resp = await fetch(u);
  const data = await resp.json();
  if (!resp.ok || data.code >= 400) {
    throw new Error(data.message || "请求失败");
  }
  return data;
}

async function isPlayable(id) {
  const data = await apiJson("/api/playable", { id });
  return !!data.playable;
}

function artistList(song) {
  return (song.artists || []).map((a) => a.name || "").join(" / ");
}

async function chooseCandidate(name, artist, candidates) {
  if (!candidates.length) throw new Error("搜索不到");
  const m = mode();
  const sameName = candidates.filter((s) => normalize(s.name) === normalize(name));
  const exactArtist = (list) => list.filter((s) => (s.artists || []).some((a) => normalize(a.name) === normalize(artist)));

  const pickPlayable = async (ordered) => {
    if (!ordered.length) return null;
    for (const item of ordered) {
      if (await isPlayable(item.id)) return item;
    }
    return null;
  };

  if (!sameName.length) {
    throw new Error("自动匹配失败(无同名歌曲)");
  }

  if (m === "manual") {
    const options = sameName.slice(0, 10);
    const text = options.map((s, i) => `${i + 1}. ${s.name} - ${artistList(s)}`).join("\n");
    const val = prompt(`请选择序号：\n${text}`, "1");
    const idx = Number(val) - 1;
    if (!Number.isInteger(idx) || idx < 0 || idx >= options.length) {
      throw new Error("手动选择取消");
    }
    const selected = options[idx];
    if (await isPlayable(selected.id)) return selected;
    const fallback = await pickPlayable(options.filter((s) => s.id !== selected.id));
    if (fallback) return fallback;
    throw new Error("手动选择结果不可下载");
  }

  const sameNameExact = exactArtist(sameName);
  const sameNameRest = sameName.filter((s) => !sameNameExact.includes(s));
  const ordered = [...sameNameExact, ...sameNameRest];
  const playable = await pickPlayable(ordered);
  if (playable) return playable;
  throw new Error("自动匹配失败(无可下载链接)");
}

async function fetchArrayBuffer(url, params) {
  const u = new URL(url, location.origin);
  Object.entries(params || {}).forEach(([k, v]) => u.searchParams.set(k, v));
  const resp = await fetch(u);
  if (!resp.ok) throw new Error("下载失败");
  return resp.arrayBuffer();
}

async function uploadBlobToR2(blob, filename) {
  const u = new URL("/api/r2/upload", location.origin);
  u.searchParams.set("filename", filename);
  const resp = await fetch(u, {
    method: "PUT",
    headers: { "Content-Type": blob.type || "audio/mpeg" },
    body: blob
  });
  const data = await resp.json();
  if (!resp.ok || data.code >= 400) {
    throw new Error(data.message || "R2 上传失败");
  }
  return data.download_url;
}

function triggerDownload(blob, filename) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

function updateRowStatus(row, status) {
  row.status = status;
  render();
}

async function processOne(row, idx) {
  updateRowStatus(row, "搜索中...");
  log(`#${idx + 1} ${row.name} - ${row.artist}：搜索候选`);

  const { songs } = await apiJson("/api/search", { s: `${row.name} ${row.artist}`.trim() });
  const picked = await chooseCandidate(row.name, row.artist, songs || []);

  updateRowStatus(row, "获取详情...");

  const [detailData, lyricData, mp3Buf] = await Promise.all([
    apiJson("/api/detail", { id: picked.id }),
    apiJson("/api/lyric", { id: picked.id }),
    fetchArrayBuffer("/api/download", { id: picked.id })
  ]);

  const detail = detailData.song || {};
  const lyric = lyricData.lyric || "";
  const metaName = (detail.name || picked.name || row.name || "未知歌曲").trim();
  const metaArtist =
    ((detail.ar || detail.artists || []).map((a) => a?.name || "").filter(Boolean).join(" / ") || artistList(picked) || row.artist || "未知歌手").trim();

  let outputBlob;
  if (window.ID3Writer) {
    const writer = new ID3Writer(mp3Buf);
    writer
      .setFrame("TIT2", metaName)
      .setFrame("TPE1", [metaArtist])
      .setFrame("TALB", detail.album?.name || "")
      .setFrame("COMM", {
        description: "",
        text: `Netease Song ID: ${picked.id}`
      });

    if (lyric) writer.setFrame("USLT", { description: "", lyrics: lyric });

    const picUrl = detail.album?.picUrl;
    if (picUrl) {
      try {
        const imgBuf = await fetchArrayBuffer("/api/fetch", { url: picUrl });
        writer.setFrame("APIC", {
          type: 3,
          data: imgBuf,
          description: "Cover"
        });
      } catch {
        log(`#${idx + 1} ${row.name}：封面写入失败，已忽略`);
      }
    }

    writer.addTag();
    outputBlob = writer.getBlob();
  } else {
    outputBlob = new Blob([mp3Buf], { type: "audio/mpeg" });
  }

  const safe = `${metaName}-${metaArtist}`.replace(/[\\/:*?"<>|]/g, "_");
  if (uploadR2.checked) {
    updateRowStatus(row, "上传到 R2...");
    const url = await uploadBlobToR2(outputBlob, `${safe}.mp3`);
    row.cloudUrl = url;
    updateRowStatus(row, "完成(云端)");
    log(`#${idx + 1} ${row.name}：已上传到 R2`);
  } else {
    row.cloudUrl = "";
    triggerDownload(outputBlob, `${safe}.mp3`);
    updateRowStatus(row, "完成");
    log(`#${idx + 1} ${row.name}：完成`);
  }
}

async function runAll() {
  if (!rows.length) {
    alert("请先选择有效 CSV 文件");
    return;
  }

  startBtn.disabled = true;
  log(`开始处理，共 ${rows.length} 首，匹配模式：${mode()}，输出模式：${uploadR2.checked ? "R2 云端" : "本地下载"}`);

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    try {
      await processOne(row, i);
    } catch (err) {
      const msg = err?.message || "处理异常";
      updateRowStatus(row, `失败: ${msg}`);
      log(`#${i + 1} ${row.name}：失败 - ${msg}`);
    }
  }

  startBtn.disabled = false;
  log("任务结束");
}

csvInput.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    rows = parseCsv(text);
    rows.forEach((r) => {
      r.status = "待处理";
    });
    clearLogs();
    log(`已加载 CSV：${file.name}，共 ${rows.length} 条`);
    render();
  } catch (err) {
    alert(err.message || "CSV 读取失败");
  }
});

startBtn.addEventListener("click", runAll);
searchName.addEventListener("input", render);
searchArtist.addEventListener("input", render);
clearLogBtn.addEventListener("click", clearLogs);
tbody.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-copy]");
  if (!btn) return;
  const value = btn.getAttribute("data-copy");
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
    log("已复制下载链接到剪贴板");
  } catch {
    alert("复制失败，请手动复制");
  }
});

render();
