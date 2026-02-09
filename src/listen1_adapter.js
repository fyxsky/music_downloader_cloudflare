import QQProvider from "./listen1/provider/qq.js";
import KugouProvider from "./listen1/provider/kugou.js";
import hackHeaderModule from "./listen1/hack_header.js";

const SOURCE_PRIORITY = ["qq", "kugou", "netease"];

const PROVIDERS = {
  qq: QQProvider,
  kugou: KugouProvider,
  netease: null
};

const ID_PREFIX_MAP = {
  qq: "qq",
  kg: "kugou",
  ne: "netease"
};

class CookieProvider {
  constructor() {
    this.store = new Map();
  }

  getDomain(url) {
    try {
      return new URL(url).hostname;
    } catch {
      return "";
    }
  }

  setCookie(url, name, value) {
    const domain = this.getDomain(url);
    if (!domain) return;
    if (!this.store.has(domain)) this.store.set(domain, new Map());
    this.store.get(domain).set(name, value);
  }

  getCookieForHTTPHeader(url) {
    const domain = this.getDomain(url);
    const kv = this.store.get(domain);
    if (!kv) return "";
    const parts = [];
    kv.forEach((v, k) => parts.push(`${k}=${v}`));
    return parts.join("; ");
  }

  getCookie(url, name, callback) {
    const domain = this.getDomain(url);
    const kv = this.store.get(domain);
    callback(kv?.get(name) || "");
  }
}

function parseSetCookie(setCookie) {
  if (!setCookie) return [];
  return setCookie
    .split(/,(?=[^;]+=)/g)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((line) => line.split(";")[0])
    .map((kv) => {
      const idx = kv.indexOf("=");
      if (idx <= 0) return null;
      return [kv.slice(0, idx).trim(), kv.slice(idx + 1).trim()];
    })
    .filter(Boolean);
}

function createHTTPClient(cookieProvider) {
  return async (params) => {
    let headers = {
      "User-Agent": "Mozilla/5.0"
    };
    if (params.headers) {
      headers = { ...headers, ...params.headers };
    }
    const hackHeader = hackHeaderModule.hackHeader(params.url);
    if (hackHeader.add_referer || (hackHeader.replace_referer && headers.Referer === undefined)) {
      headers.Referer = hackHeader.referer_value;
    }
    if (hackHeader.add_origin || (hackHeader.replace_origin && headers.Origin === undefined)) {
      headers.Origin = hackHeader.referer_value;
    }
    const cookie = cookieProvider.getCookieForHTTPHeader(params.url);
    if (cookie) headers.Cookie = cookie;

    const method = params.method || "GET";
    const body = method === "POST" && params.data ? new URLSearchParams(params.data).toString() : undefined;
    if (body) {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
    }

    const resp = await fetch(params.url, {
      method,
      headers,
      body,
      redirect: "follow"
    });

    const setCookie = resp.headers.get("set-cookie");
    parseSetCookie(setCookie).forEach(([k, v]) => cookieProvider.setCookie(params.url, k, v));

    const text = await resp.text();
    if (params.transformResponse === false) {
      return { data: text };
    }
    try {
      return { data: JSON.parse(text) };
    } catch {
      return { data: text };
    }
  };
}

function pfn(fn) {
  return new Promise(fn);
}

function providerByTrackId(trackId) {
  const prefix = String(trackId || "").slice(0, 2);
  const source = ID_PREFIX_MAP[prefix];
  return source ? PROVIDERS[source] : null;
}

async function requestJson(url, params = {}) {
  const u = new URL(url);
  Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, String(v)));
  const resp = await fetch(u.toString(), {
    headers: {
      "User-Agent": "Mozilla/5.0",
      Referer: "https://music.163.com/"
    }
  });
  if (!resp.ok) throw new Error(`上游请求失败: ${resp.status}`);
  return resp.json();
}

function normalizeTrack(track) {
  return {
    id: track.id,
    name: track.title || "",
    artists: [{ name: track.artist || "" }],
    album: {
      name: track.album || "",
      picUrl: track.img_url || "",
      publishTime: null
    },
    trackNo: null,
    source: track.source || "",
    sourceUrl: track.source_url || ""
  };
}

async function safeProviderCall(task, timeoutMs = 12000) {
  const timeout = new Promise((_, reject) => {
    setTimeout(() => reject(new Error("上游超时")), timeoutMs);
  });
  return Promise.race([task, timeout]);
}

function resolveSources(sources) {
  if (!Array.isArray(sources) || !sources.length) return SOURCE_PRIORITY;
  const selected = new Set(
    sources
      .map((s) => String(s || "").trim())
      .filter((s) => SOURCE_PRIORITY.includes(s))
  );
  if (!selected.size) return SOURCE_PRIORITY;
  return SOURCE_PRIORITY.filter((s) => selected.has(s));
}

export function createListen1Client() {
  const cookieProvider = new CookieProvider();
  const httpClient = createHTTPClient(cookieProvider);

  return {
    async searchAll(keyword, sources = SOURCE_PRIORITY) {
      const merged = [];
      const seen = new Set();
      const sourceOrder = resolveSources(sources);
      for (const source of sourceOrder) {
        if (source === "netease") {
          try {
            const data = await requestJson("https://music.163.com/api/search/get/", {
              s: keyword,
              type: 1,
              limit: 50
            });
            for (const item of data?.result?.songs || []) {
              const id = `netrack_${item.id}`;
              if (seen.has(id)) continue;
              seen.add(id);
              merged.push({
                id,
                name: item.name || "",
                artists: (item.artists || []).map((a) => ({ name: a?.name || "" })),
                album: {
                  name: item.album?.name || "",
                  picUrl: item.album?.picUrl || "",
                  publishTime: item.album?.publishTime || null
                },
                trackNo: item.no || null,
                source: "netease",
                sourceUrl: `https://music.163.com/#/song?id=${item.id}`
              });
            }
          } catch {
            // ignore
          }
          continue;
        }
        const provider = PROVIDERS[source];
        if (!provider?.search) continue;
        try {
          const path = `/search?source=${source}&keywords=${encodeURIComponent(keyword)}&curpage=1`;
          const data = await safeProviderCall(provider.search(path, httpClient, pfn, cookieProvider));
          for (const item of data?.result || []) {
            if (!item?.id || seen.has(item.id)) continue;
            seen.add(item.id);
            merged.push(normalizeTrack(item));
          }
        } catch {
          // 忽略单平台失败，继续下一个平台。
        }
      }
      return merged;
    },

    async lyric(trackId) {
      if (String(trackId).startsWith("netrack_")) {
        const rawId = String(trackId).slice("netrack_".length);
        const data = await requestJson("https://music.163.com/api/song/lyric", {
          id: rawId,
          lv: 1,
          kv: 1,
          tv: -1
        });
        return data?.lrc?.lyric || "";
      }
      const provider = providerByTrackId(trackId);
      if (!provider?.lyric) return "";
      const path = `/lyric?track_id=${encodeURIComponent(trackId)}`;
      const data = await safeProviderCall(provider.lyric(path, httpClient, pfn, cookieProvider));
      return data?.lyric || "";
    },

    async bootstrapTrack(trackId) {
      if (String(trackId).startsWith("netrack_")) {
        const rawId = String(trackId).slice("netrack_".length);
        const data = await requestJson("https://music.163.com/api/song/enhance/player/url", {
          id: rawId,
          ids: `[${rawId}]`,
          br: 320000
        });
        const item = data?.data?.[0];
        if (!item?.url) throw new Error("VIP歌曲不可下载");
        return item.url;
      }
      const provider = providerByTrackId(trackId);
      if (!provider?.bootstrapTrack) throw new Error("不支持的来源");
      const data = await safeProviderCall(provider.bootstrapTrack(trackId, httpClient, pfn, cookieProvider));
      if (!data?.url) throw new Error("VIP歌曲不可下载");
      return data.url;
    }
  };
}
