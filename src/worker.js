const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

const HEADERS = {
  "User-Agent": "Mozilla/5.0",
  Referer: "https://music.163.com/"
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
  const url = `https://music.163.com/song/media/outer/url?id=${songId}.mp3`;
  const resp = await fetch(url, {
    headers: {
      ...HEADERS,
      Range: "bytes=0-1"
    },
    redirect: "follow"
  });
  if (!resp.ok) return false;
  if (resp.url.includes("music.163.com/404")) return false;
  const contentType = (resp.headers.get("content-type") || "").toLowerCase();
  // 某些边缘节点会返回 audio/mp3、audio/mpeg 或 octet-stream，统一视为可下载。
  if (contentType.includes("text/html")) return false;
  return true;
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
        const data = await requestJson("https://music.163.com/api/search/get/", {
          s,
          type: 1,
          limit: 50
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
        const source = `https://music.163.com/song/media/outer/url?id=${id}.mp3`;
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

      return json({ code: 404, message: "接口不存在" }, 404);
    } catch (err) {
      return json({ code: 500, message: err.message || "服务器错误" }, 500);
    }
  }
};
