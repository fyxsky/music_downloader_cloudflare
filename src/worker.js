import { createListen1Client } from "./listen1_adapter.js";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

const ALLOW_FETCH_HOSTS = new Set([
  "imgcache.qq.com",
  "y.gtimg.cn",
  "qpic.y.qq.com",
  "p1.music.126.net",
  "p2.music.126.net",
  "p3.music.126.net",
  "p4.music.126.net",
  "m7.music.126.net",
  "m8.music.126.net",
  "m10.music.126.net",
  "m701.music.126.net",
  "m801.music.126.net",
  "imgessl.kugou.com",
  "imge.kugou.com",
  "img1.kuwo.cn",
  "img2.kuwo.cn",
  "i0.hdslb.com",
  "i1.hdslb.com",
  "i2.hdslb.com"
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

const listen1 = createListen1Client();

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
        const songs = await listen1.searchAll(s);
        return json({ code: 200, songs });
      }

      if (pathname === "/api/lyric") {
        const id = searchParams.get("id");
        if (!id) return json({ code: 400, message: "缺少参数 id" }, 400);
        const lyric = await listen1.lyric(id);
        return json({ code: 200, lyric });
      }

      if (pathname === "/api/download") {
        const id = searchParams.get("id");
        if (!id) return json({ code: 400, message: "缺少参数 id" }, 400);
        const source = await listen1.bootstrapTrack(id);
        const resp = await fetch(source, { redirect: "follow" });
        if (!resp.ok) return json({ code: 404, message: "歌曲不存在或不可下载" }, 404);
        return withCors(resp);
      }

      if (pathname === "/api/fetch") {
        const target = searchParams.get("url");
        if (!target) return json({ code: 400, message: "缺少参数 url" }, 400);
        const targetUrl = new URL(target);
        if (!ALLOW_FETCH_HOSTS.has(targetUrl.hostname)) {
          return json({ code: 403, message: "目标域名不在允许列表" }, 403);
        }
        const resp = await fetch(targetUrl.toString());
        return withCors(resp);
      }

      return json({ code: 404, message: "接口不存在" }, 404);
    } catch (err) {
      return json({ code: 500, message: err?.message || "服务器错误" }, 500);
    }
  }
};
