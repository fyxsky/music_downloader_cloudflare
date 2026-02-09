const csvInput = document.getElementById("csvInput");
const startBtn = document.getElementById("startBtn");
const tbody = document.getElementById("tbody");
const summary = document.getElementById("summary");

let rows = [];

function normalize(text) {
  return (text || "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[\s\-_.()\[\]（）【】·,，'"/]+/g, "");
}

function mode() {
  return document.querySelector("input[name='matchMode']:checked")?.value || "fuzzy";
}

function setStatus(row, status, cls = "") {
  row.status = status;
  render();
}

function render() {
  tbody.innerHTML = rows
    .map((r, idx) => {
      const cls = r.status.startsWith("完成") ? "status-ok" : r.status.startsWith("失败") ? "status-err" : "status-run";
      return `<tr><td>${idx + 1}</td><td>${r.name}</td><td>${r.artist}</td><td class="${cls}">${r.status}</td></tr>`;
    })
    .join("");
  const done = rows.filter((r) => r.status.startsWith("完成")).length;
  summary.textContent = `待处理：${rows.length}，完成：${done}`;
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
  return lines.slice(1).map((line) => {
    const cols = line.split(",");
    return {
      name: (cols[nameIdx] || "").trim(),
      artist: (cols[artistIdx] || "").trim(),
      status: "待处理"
    };
  }).filter((r) => r.name);
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

  if (m === "manual") {
    const options = candidates.slice(0, 10);
    const text = options.map((s, i) => `${i + 1}. ${s.name} - ${artistList(s)}`).join("\n");
    const val = prompt(`请选择序号：\n${text}`, "1");
    const idx = Number(val) - 1;
    if (!Number.isInteger(idx) || idx < 0 || idx >= options.length) {
      throw new Error("手动选择取消");
    }
    return options[idx];
  }

  let ordered = [];
  if (m === "precise") {
    ordered = exactArtist(sameName);
    if (!ordered.length) throw new Error("精确匹配失败");
  } else {
    const sameNameExact = exactArtist(sameName);
    const sameNameRest = sameName.filter((s) => !sameNameExact.includes(s));
    const other = candidates.filter((s) => !sameName.includes(s));
    ordered = [...sameNameExact, ...sameNameRest, ...other];
  }

  for (const item of ordered) {
    if (await isPlayable(item.id)) return item;
  }
  return ordered[0];
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

async function processOne(row) {
  row.status = "搜索中...";
  render();

  const { songs } = await apiJson("/api/search", { s: `${row.name} ${row.artist}`.trim() });
  const picked = await chooseCandidate(row.name, row.artist, songs || []);

  row.status = "获取详情...";
  render();

  const [detailData, lyricData, mp3Buf] = await Promise.all([
    apiJson("/api/detail", { id: picked.id }),
    apiJson("/api/lyric", { id: picked.id }),
    fetchArrayBuffer("/api/download", { id: picked.id })
  ]);

  const detail = detailData.song || {};
  const lyric = lyricData.lyric || "";
  const finalName = (picked.name || row.name || "未知歌曲").trim();
  const finalArtist = artistList(picked) || row.artist || "未知歌手";

  let outputBlob;
  if (window.ID3Writer) {
    const writer = new ID3Writer(mp3Buf);
    writer
      .setFrame("TIT2", finalName)
      .setFrame("TPE1", [finalArtist])
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
        // 封面失败不影响下载
      }
    }

    writer.addTag();
    outputBlob = writer.getBlob();
  } else {
    outputBlob = new Blob([mp3Buf], { type: "audio/mpeg" });
  }

  const safe = `${finalName}-${finalArtist}`.replace(/[\\/:*?"<>|]/g, "_");
  triggerDownload(outputBlob, `${safe}.mp3`);
  row.status = "完成";
  render();
}

startBtn.addEventListener("click", async () => {
  if (!rows.length) {
    alert("请先选择有效 CSV 文件");
    return;
  }
  startBtn.disabled = true;
  for (const row of rows) {
    try {
      await processOne(row);
    } catch (err) {
      row.status = `失败: ${err.message || "处理异常"}`;
      render();
    }
  }
  startBtn.disabled = false;
});

csvInput.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    rows = parseCsv(text);
    render();
  } catch (err) {
    alert(err.message || "CSV 读取失败");
  }
});
