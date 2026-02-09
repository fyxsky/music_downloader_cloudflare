const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,PUT,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

const HEADERS = {
  "User-Agent": "Mozilla/5.0",
  Referer: "http://music.163.com/"
};

const ALLOW_FETCH_HOSTS = new Set([
  "p1.music.126.net",
  "p2.music.126.net",
  "p3.music.126.net",
  "p4.music.126.net",
  "m7.music.126.net",
  "m8.music.126.net",
  "m10.music.126.net",
  "m701.music.126.net",
  "m801.music.126.net"
]);

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...CORS_HEADERS
    }
  });
}

function withCors(resp) {
  const headers = new Headers(resp.headers);
  Object.entries(CORS_HEADERS).forEach(([k, v]) => headers.set(k, v));
  return new Response(resp.body, {
    status: resp.status,
    statusText: resp.statusText,
    headers
  });
}

function sanitizeFileName(name) {
  return (name || "music.mp3").replace(/[\\/:*?"<>|]+/g, "_").trim() || "music.mp3";
}

function makeObjectKey(filename) {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const rand = crypto.randomUUID().slice(0, 8);
  return `${stamp}_${rand}_${sanitizeFileName(filename)}`;
}

async function requestJson(url, params = {}) {
  const u = new URL(url);
  Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, String(v)));
  const resp = await fetch(u.toString(), { headers: HEADERS });
  if (!resp.ok) {
    throw new Error(`上游请求失败: ${resp.status}`);
  }
  return resp.json();
}

async function checkPlayable(songId) {
  const url = `http://music.163.com/song/media/outer/url?id=${songId}.mp3`;
  const resp = await fetch(url, { headers: HEADERS, redirect: "follow" });
  const contentType = resp.headers.get("content-type") || "";
  return !resp.url.includes("music.163.com/404") && contentType.includes("audio/mpeg");
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const { pathname, searchParams } = url;

    if (!pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }

    try {
      if (pathname === "/api/search") {
        const s = searchParams.get("s") || "";
        if (!s.trim()) return json({ code: 400, message: "缺少参数 s" }, 400);
        const data = await requestJson("http://music.163.com/api/search/get/", {
          s,
          type: 1,
          limit: 12
        });
        const songs = data?.result?.songs || [];
        return json({ code: 200, songs });
      }

      if (pathname === "/api/detail") {
        const id = searchParams.get("id");
        if (!id) return json({ code: 400, message: "缺少参数 id" }, 400);
        const data = await requestJson("https://music.163.com/api/song/detail/", {
          ids: `[${id}]`,
          id
        });
        return json({ code: 200, song: data?.songs?.[0] || null });
      }

      if (pathname === "/api/lyric") {
        const id = searchParams.get("id");
        if (!id) return json({ code: 400, message: "缺少参数 id" }, 400);
        const data = await requestJson("https://music.163.com/api/song/lyric", {
          id,
          lv: 1,
          kv: 1,
          tv: -1
        });
        return json({ code: 200, lyric: data?.lrc?.lyric || "" });
      }

      if (pathname === "/api/playable") {
        const id = searchParams.get("id");
        if (!id) return json({ code: 400, message: "缺少参数 id" }, 400);
        const playable = await checkPlayable(id);
        return json({ code: 200, playable });
      }

      if (pathname === "/api/download") {
        const id = searchParams.get("id");
        if (!id) return json({ code: 400, message: "缺少参数 id" }, 400);
        const source = `http://music.163.com/song/media/outer/url?id=${id}.mp3`;
        const resp = await fetch(source, { headers: HEADERS, redirect: "follow" });
        if (resp.url.includes("music.163.com/404")) {
          return json({ code: 404, message: "歌曲不存在或不可下载" }, 404);
        }
        return withCors(resp);
      }

      if (pathname === "/api/fetch") {
        const target = searchParams.get("url");
        if (!target) return json({ code: 400, message: "缺少参数 url" }, 400);
        const targetUrl = new URL(target);
        if (!ALLOW_FETCH_HOSTS.has(targetUrl.hostname)) {
          return json({ code: 403, message: "目标域名不在允许列表" }, 403);
        }
        const resp = await fetch(targetUrl.toString(), { headers: HEADERS });
        return withCors(resp);
      }

      if (pathname === "/api/r2/upload" && request.method === "PUT") {
        if (!env.MUSIC_BUCKET) {
          return json({ code: 503, message: "R2 未配置，请在 Worker 绑定 MUSIC_BUCKET" }, 503);
        }
        const inputFilename = sanitizeFileName(searchParams.get("filename") || "music.mp3");
        const key = makeObjectKey(inputFilename);
        const contentType = request.headers.get("content-type") || "audio/mpeg";
        const body = await request.arrayBuffer();
        if (!body || body.byteLength === 0) {
          return json({ code: 400, message: "上传内容为空" }, 400);
        }

        await env.MUSIC_BUCKET.put(key, body, {
          httpMetadata: {
            contentType,
            contentDisposition: `attachment; filename=\"${inputFilename}\"`
          },
          customMetadata: {
            originalName: inputFilename
          }
        });

        return json({
          code: 200,
          key,
          download_url: `${url.origin}/api/r2/file?key=${encodeURIComponent(key)}`
        });
      }

      if (pathname === "/api/r2/file") {
        if (!env.MUSIC_BUCKET) {
          return json({ code: 503, message: "R2 未配置，请在 Worker 绑定 MUSIC_BUCKET" }, 503);
        }
        const key = searchParams.get("key") || "";
        if (!key) return json({ code: 400, message: "缺少参数 key" }, 400);

        const obj = await env.MUSIC_BUCKET.get(key);
        if (!obj) return json({ code: 404, message: "文件不存在" }, 404);

        const headers = new Headers();
        headers.set("Content-Type", obj.httpMetadata?.contentType || "application/octet-stream");
        const fallbackName = obj.customMetadata?.originalName || key.split("_").slice(2).join("_") || "music.mp3";
        headers.set("Content-Disposition", obj.httpMetadata?.contentDisposition || `attachment; filename=\"${fallbackName}\"`);
        headers.set("Cache-Control", "public, max-age=31536000, immutable");
        Object.entries(CORS_HEADERS).forEach(([k, v]) => headers.set(k, v));
        return new Response(obj.body, { status: 200, headers });
      }

      return json({ code: 404, message: "接口不存在" }, 404);
    } catch (err) {
      return json({ code: 500, message: err.message || "服务器错误" }, 500);
    }
  }
};
