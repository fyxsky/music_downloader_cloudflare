const csvInput = document.getElementById("csvInput");
const startBtn = document.getElementById("startBtn");
const clearLogBtn = document.getElementById("clearLogBtn");
const tbody = document.getElementById("tbody");
const searchName = document.getElementById("searchName");
const searchArtist = document.getElementById("searchArtist");
const concurrencySelect = document.getElementById("concurrencySelect");

const statTotal = document.getElementById("statTotal");
const statDone = document.getElementById("statDone");
const statRunning = document.getElementById("statRunning");
const statFail = document.getElementById("statFail");
const progressFill = document.getElementById("progressFill");
const progressText = document.getElementById("progressText");
const logBox = document.getElementById("logBox");
const ZIP_BATCH_SIZE = 30;

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

function concurrency() {
  const n = Number(concurrencySelect?.value || 1);
  if (!Number.isInteger(n) || n < 1) return 1;
  return n;
}

function statusBadge(status) {
  let cls = "idle";
  if (status.startsWith("完成")) cls = "ok";
  else if (status.startsWith("失败")) cls = "err";
  else if (status !== "待处理") cls = "run";
  return `<span class="badge ${cls}">${status}</span>`;
}

function metaBadge(text) {
  const t = text || "-";
  let cls = "idle";
  if (t === "已写入") cls = "ok";
  else if (t.includes("失败")) cls = "err";
  return `<span class="badge ${cls}">${t}</span>`;
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
        <td>${metaBadge(r.coverStatus)}</td>
        <td>${metaBadge(r.lyricStatus)}</td>
        <td>${statusBadge(r.status)}</td>
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
        coverStatus: "-",
        lyricStatus: "-"
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

function isSameSongName(expected, actual) {
  const a = normalize(expected);
  const b = normalize(actual);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

function primaryArtistName(artist) {
  return (artist || "").split(/[\/、，,&]/)[0].trim();
}

async function searchCandidates(name, artist) {
  const queries = [];
  const q1 = `${name} ${artist}`.trim();
  const q2 = `${name}`.trim();
  const pArtist = primaryArtistName(artist);
  const q3 = `${name} ${pArtist}`.trim();
  [q1, q2, q3].forEach((q) => {
    if (q && !queries.includes(q)) queries.push(q);
  });

  const merged = [];
  const seen = new Set();
  for (const q of queries) {
    try {
      const { songs } = await apiJson("/api/search", { s: q });
      for (const s of songs || []) {
        if (!s?.id || seen.has(s.id)) continue;
        seen.add(s.id);
        merged.push(s);
      }
    } catch {
      // 单轮搜索失败不终止整体流程，继续尝试下一组关键词。
    }
  }
  return merged;
}

async function chooseCandidate(name, artist, candidates) {
  if (!candidates.length) throw new Error("搜索不到");
  const m = mode();
  const sameName = candidates.filter((s) => isSameSongName(name, s.name));
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

function triggerDownload(blob, filename) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

async function downloadZipBatch(files, batchNo) {
  if (!files.length) return;
  if (!window.JSZip) {
    throw new Error("JSZip 未加载");
  }
  const zip = new window.JSZip();
  for (const item of files) {
    zip.file(item.filename, item.blob);
  }
  log(`正在生成第 ${batchNo} 个 ZIP（${files.length} 首）...`);
  const zipBlob = await zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 }
  });
  const zipName = `music_batch_${String(batchNo).padStart(2, "0")}_${files.length}首.zip`;
  triggerDownload(zipBlob, zipName);
  log(`第 ${batchNo} 个 ZIP 已下载：${zipName}`);
}

function updateRowStatus(row, status) {
  row.status = status;
  render();
}

async function processOne(row, idx) {
  updateRowStatus(row, "搜索中...");
  log(`#${idx + 1} ${row.name} - ${row.artist}：搜索候选`);

  const songs = await searchCandidates(row.name, row.artist);
  const picked = await chooseCandidate(row.name, row.artist, songs);

  updateRowStatus(row, "获取详情...");

  const [detailData, lyricData, mp3Buf] = await Promise.all([
    apiJson("/api/detail", { id: picked.id }),
    apiJson("/api/lyric", { id: picked.id }),
    fetchArrayBuffer("/api/download", { id: picked.id })
  ]);

  const detail = detailData.song || {};
  const lyric = lyricData.lyric || "";
  let coverStatus = "无封面";
  let lyricStatus = lyric ? "已写入" : "无歌词";
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
        coverStatus = "已写入";
      } catch {
        coverStatus = "获取失败";
        log(`#${idx + 1} ${row.name}：封面写入失败，已忽略`);
      }
    }

    writer.addTag();
    outputBlob = writer.getBlob();
  } else {
    outputBlob = new Blob([mp3Buf], { type: "audio/mpeg" });
  }

  const safe = `${metaName}-${metaArtist}`.replace(/[\\/:*?"<>|]/g, "_");
  return {
    blob: outputBlob,
    filename: `${safe}.mp3`,
    coverStatus,
    lyricStatus
  };
}

async function runAll() {
  if (!rows.length) {
    alert("请先选择有效 CSV 文件");
    return;
  }

  startBtn.disabled = true;
  const m = mode();
  const userConcurrency = concurrency();
  const workerCount = m === "manual" ? 1 : userConcurrency;
  if (m === "manual" && userConcurrency > 1) {
    log("手动模式下已自动切换为单并发，避免多弹窗冲突");
  }
  log(`开始处理，共 ${rows.length} 首，匹配模式：${m}，并发：${workerCount}，输出模式：本地 ZIP（30 首/包）`);
  const localBatchFiles = [];
  let batchNo = 0;
  let nextIndex = 0;
  let zipQueue = Promise.resolve();

  const flushBatch = async () => {
    if (localBatchFiles.length < ZIP_BATCH_SIZE) return;
    batchNo += 1;
    const files = localBatchFiles.splice(0, ZIP_BATCH_SIZE);
    zipQueue = zipQueue.then(() => downloadZipBatch(files, batchNo));
    await zipQueue;
  };

  const workerLoop = async () => {
    while (true) {
      const i = nextIndex;
      nextIndex += 1;
      if (i >= rows.length) return;
      const row = rows[i];
      try {
        const result = await processOne(row, i);
        localBatchFiles.push(result);
        row.coverStatus = result.coverStatus;
        row.lyricStatus = result.lyricStatus;
        updateRowStatus(row, "完成");
        log(`#${i + 1} ${row.name}：已加入 ZIP 批次`);
        await flushBatch();
      } catch (err) {
        const msg = err?.message || "处理异常";
        updateRowStatus(row, `失败: ${msg}`);
        log(`#${i + 1} ${row.name}：失败 - ${msg}`);
      }
    }
  };

  await Promise.all(Array.from({ length: workerCount }, () => workerLoop()));

  if (localBatchFiles.length > 0) {
    batchNo += 1;
    zipQueue = zipQueue.then(() => downloadZipBatch(localBatchFiles.splice(0), batchNo));
  }
  await zipQueue;

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
      r.coverStatus = "-";
      r.lyricStatus = "-";
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

render();
