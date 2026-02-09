/* eslint-disable no-unused-vars */
/* global atob */
import * as entities from 'entities';
import encoding from 'text-encoding';
import { getParameterByName } from '../utils.js';

function build_qq() {
  function htmlDecode(value) {
    return entities.decodeHTML(value);
  }

  function qq_show_playlist(url, hm, pfn) {
    const offset = Number(getParameterByName('offset', url)) || 0;
    const target_url = `${'https://c.y.qq.com/splcloud/fcgi-bin/fcg_get_diss_by_tag.fcg'
        + '?rnd=0.4781484879517406&g_tk=732560869&jsonpCallback=MusicJsonCallback'
        + '&loginUin=0&hostUin=0&format=jsonp&inCharset=utf8&outCharset=utf-8'
        + '&notice=0&platform=yqq&needNewCode=0'
        + '&categoryId=10000000&sortId=5&sin='}${offset}&ein=${49 + offset}`;

    return pfn((resolve, reject) => {
      hm({
        url: target_url,
        method: 'GET',
        transformResponse: false,
      }).then((response) => {
        let { data } = response;
        data = data.slice('MusicJsonCallback('.length, -')'.length);
        data = JSON.parse(data);

        const playlists = data.data.list.map(item => ({
          cover_img_url: item.imgurl,
          title: htmlDecode(item.dissname),
          id: `qqplaylist_${item.dissid}`,
          source_url: `http://y.qq.com/#type=taoge&id=${item.dissid}`,
        }));

        return resolve({
          result: playlists,
        });
      });
    });
  }

  function qq_get_image_url(qqimgid, img_type) {
    if (qqimgid == null) {
      return '';
    }
    let category = '';
    if (img_type === 'artist') {
      category = 'mid_singer_300';
    }
    if (img_type === 'album') {
      category = 'mid_album_300';
    }

    const s = [category, qqimgid[qqimgid.length - 2], qqimgid[qqimgid.length - 1], qqimgid].join('/');
    const url = `http://imgcache.qq.com/music/photo/${s}.jpg`;
    return url;
  }

  function qq_is_playable(song) {
    const switch_flag = song.switch.toString(2).split('');
    switch_flag.pop();
    switch_flag.reverse();
    // flag switch table meaning:
    // ["play_lq", "play_hq", "play_sq", "down_lq", "down_hq", "down_sq", "soso",
    //  "fav", "share", "bgm", "ring", "sing", "radio", "try", "give"]
    const play_flag = switch_flag[0];
    const try_flag = switch_flag[13];
    return ((play_flag === '1') || ((play_flag === '1') && (try_flag === '1')));
  }

  function qq_convert_song(song) {
    const d = {
      id: `qqtrack_${song.songmid}`,
      title: htmlDecode(song.songname),
      artist: htmlDecode(song.singer[0].name),
      artist_id: `qqartist_${song.singer[0].mid}`,
      album: htmlDecode(song.albumname),
      album_id: `qqalbum_${song.albummid}`,
      img_url: qq_get_image_url(song.albummid, 'album'),
      source: 'qq',
      source_url: `http://y.qq.com/#type=song&mid=${song.songmid}&tpl=yqq_song_detail`,
      url: `qqtrack_${song.songmid}`,
      disabled: !qq_is_playable(song),
    };
    return d;
  }

  function qq_get_playlist(url, hm, pfn) { // eslint-disable-line no-unused-vars
    const list_id = getParameterByName('list_id', url).split('_').pop();

    return pfn((resolve, reject) => {
      const target_url = `${'http://i.y.qq.com/qzone-music/fcg-bin/fcg_ucc_getcdinfo_'
            + 'byids_cp.fcg?type=1&json=1&utf8=1&onlysong=0&jsonpCallback='
            + 'jsonCallback&nosign=1&disstid='}${list_id}&g_tk=5381&loginUin=0&hostUin=0`
            + '&format=jsonp&inCharset=GB2312&outCharset=utf-8&notice=0'
            + '&platform=yqq&jsonpCallback=jsonCallback&needNewCode=0';
      hm({
        url: target_url,
        method: 'GET',
        transformResponse: false,
      })
        .then((response) => {
          let { data } = response;
          data = data.slice('jsonCallback('.length, -')'.length);
          data = JSON.parse(data);

          const info = {
            cover_img_url: data.cdlist[0].logo,
            title: data.cdlist[0].dissname,
            id: `qqplaylist_${list_id}`,
            source_url: `http://y.qq.com/#type=taoge&id=${list_id}`,
          };

          const tracks = data.cdlist[0].songlist.map(item => qq_convert_song(item));
          return resolve({
            tracks,
            info,
          });
        });
    });
  }

  function qq_album(url, hm, pfn) {
    const album_id = getParameterByName('list_id', url).split('_').pop();

    return pfn((resolve, reject) => {
      const target_url = `${'http://i.y.qq.com/v8/fcg-bin/fcg_v8_album_info_cp.fcg'
            + '?platform=h5page&albummid='}${album_id}&g_tk=938407465`
            + '&uin=0&format=jsonp&inCharset=utf-8&outCharset=utf-8'
            + '&notice=0&platform=h5&needNewCode=1&_=1459961045571'
            + '&jsonpCallback=asonglist1459961045566';
      hm({
        url: target_url,
        method: 'GET',
        transformResponse: false,
      })
        .then((response) => {
          let { data } = response;
          data = data.slice(' asonglist1459961045566('.length, -')'.length);
          data = JSON.parse(data);

          const info = {
            cover_img_url: qq_get_image_url(album_id, 'album'),
            title: data.data.name,
            id: `qqalbum_${album_id}`,
            source_url: `http://y.qq.com/#type=album&mid=${album_id}`,
          };

          const tracks = data.data.list.map(item => qq_convert_song(item));
          return resolve({
            tracks,
            info,
          });
        });
    });
  }

  function qq_artist(url, hm, pfn) {
    const artist_id = getParameterByName('list_id', url).split('_').pop();

    return pfn((resolve, reject) => {
      const target_url = `${'http://i.y.qq.com/v8/fcg-bin/fcg_v8_singer_track_cp.fcg'
            + '?platform=h5page&order=listen&begin=0&num=50&singermid='}${artist_id}`
            + '&g_tk=938407465&uin=0&format=jsonp&'
            + 'inCharset=utf-8&outCharset=utf-8&notice=0&platform='
            + 'h5&needNewCode=1&from=h5&_=1459960621777&'
            + 'jsonpCallback=ssonglist1459960621772';
      hm({
        url: target_url,
        method: 'GET',
        transformResponse: false,
      })
        .then((response) => {
          let { data } = response;
          data = data.slice(' ssonglist1459960621772('.length, -')'.length);
          data = JSON.parse(data);

          const info = {
            cover_img_url: qq_get_image_url(artist_id, 'artist'),
            title: data.data.singer_name,
            id: `qqartist_${artist_id}`,
            source_url: `http://y.qq.com/#type=singer&mid=${artist_id}`,
          };

          const tracks = data.data.list.map(item => qq_convert_song(item.musicData));
          return resolve({
            tracks,
            info,
          });
        });
    });
  }

  function qq_search(url, hm, pfn) { // eslint-disable-line no-unused-vars
    return pfn((resolve, reject) => {
      const keyword = getParameterByName('keywords', url);
      const curpage = getParameterByName('curpage', url);
      const target_url = `${'http://i.y.qq.com/s.music/fcgi-bin/search_for_qq_cp?'
            + 'g_tk=938407465&uin=0&format=jsonp&inCharset=utf-8'
            + '&outCharset=utf-8&notice=0&platform=h5&needNewCode=1'
            + '&w='}${keyword}&zhidaqu=1&catZhida=1`
            + `&t=0&flag=1&ie=utf-8&sem=1&aggr=0&perpage=20&n=20&p=${curpage
            }&remoteplace=txt.mqq.all&_=1459991037831&jsonpCallback=jsonp4`;
      hm({
        url: target_url,
        method: 'GET',
        transformResponse: false,
      })
        .then((response) => {
          let { data } = response;
          data = data.slice('jsonp4('.length, -')'.length);
          data = JSON.parse(data);
          const tracks = data.data.song.list.map(item => qq_convert_song(item));
          return resolve({
            result: tracks,
            total: data.data.song.totalnum,
          });
        });
    });
  }

  // eslint-disable-next-line no-unused-vars
  function qq_bootstrap_track(trackId, hm, pfn) {
    const songId = trackId.slice('qqtrack_'.length);
    const file320 = `M800${songId}${songId}.mp3`;
    const file128 = `M500${songId}${songId}.mp3`;
    const requestData = {
      req_0: {
        module: 'vkey.GetVkeyServer',
        method: 'CgiGetVkey',
        param: {
          guid: '10000',
          songmid: [songId, songId],
          songtype: [0, 0],
          uin: '0',
          loginflag: 1,
          platform: '20',
          filename: [file320, file128]
        }
      },
      comm: {
        uin: 0,
        format: 'json',
        ct: 20,
        cv: 0
      }
    };
    const target_url = `${'https://u.y.qq.com/cgi-bin/musicu.fcg?loginUin=0&'
      + 'hostUin=0&format=json&inCharset=utf8&outCharset=utf-8&notice=0&'
      + 'platform=yqq.json&needNewCode=0&data='}${encodeURIComponent(JSON.stringify(requestData))}`;
    return pfn((resolve, reject) => {
      hm({
        url: target_url,
        method: 'GET',
        transformResponse: false,
      })
        .then((response) => {
          let { data } = response;
          data = JSON.parse(data);
          const base = data?.req_0?.data?.sip?.[0] || '';
          const infos = data?.req_0?.data?.midurlinfo || [];
          const picked = infos.find(x => x?.purl && String(x.purl).toLowerCase().endsWith('.mp3'));
          if (!base || !picked?.purl) {
            reject(new Error('VIP歌曲不可下载'));
            return;
          }
          resolve({ url: base + picked.purl });
        });
    });
  }

  function str2ab(str) {
    // string to array buffer.
    const buf = new ArrayBuffer(str.length);
    const bufView = new Uint8Array(buf);
    for (let i = 0, strLen = str.length; i < strLen; i += 1) {
      bufView[i] = str.charCodeAt(i);
    }
    return buf;
  }

  function qq_lyric(url, hm, pfn) { // eslint-disable-line no-unused-vars
    const track_id = getParameterByName('track_id', url).split('_').pop();
    // use chrome extension to modify referer.
    const target_url = `${'http://i.y.qq.com/lyric/fcgi-bin/fcg_query_lyric.fcg?'
        + 'songmid='}${track_id}&loginUin=0&hostUin=0&format=jsonp&inCharset=GB2312`
        + '&outCharset=utf-8&notice=0&platform=yqq&jsonpCallback=MusicJsonCallback&needNewCode=0';
    return pfn((resolve, reject) => {
      hm({
        url: target_url,
        method: 'GET',
        transformResponse: false,
      }).then((response) => {
        let { data } = response;
        data = data.slice('MusicJsonCallback('.length, -')'.length);
        data = JSON.parse(data);
        let lrc = '';
        if (data.lyric != null) {
          // const td = new TextDecoder('utf8');
          const td = new encoding.TextDecoder();
          lrc = td.decode(str2ab(atob(data.lyric)));
        }
        return resolve({
          lyric: lrc,
        });
      });
    });
  }

  function qq_parse_url(url) {
    let result;
    let match = /\/\/y.qq.com\/n\/yqq\/playlist\/([0-9]+)/.exec(url);
    if (match != null) {
      const playlist_id = match[1];
      result = {
        type: 'playlist',
        id: `qqplaylist_${playlist_id}`,
      };
    }
    match = /\/\/y.qq.com\/n\/yqq\/playsquare\/([0-9]+)/.exec(url);
    if (match != null) {
      const playlist_id = match[1];
      result = {
        type: 'playlist',
        id: `qqplaylist_${playlist_id}`,
      };
    }
    match = /\/\/y.qq.com\/n\/m\/detail\/taoge\/index.html\?id=([0-9]+)/.exec(url);
    if (match != null) {
      const playlist_id = match[1];
      result = {
        type: 'playlist',
        id: `qqplaylist_${playlist_id}`,
      };
    }
    return result;
  }

  function get_playlist(url, hm, pfn) {
    const list_id = getParameterByName('list_id', url).split('_')[0];
    switch (list_id) {
      case 'qqplaylist':
        return qq_get_playlist(url, hm, pfn);
      case 'qqalbum':
        return qq_album(url, hm, pfn);
      case 'qqartist':
        return qq_artist(url, hm, pfn);
      default:
        return null;
    }
  }

  return {
    showPlaylist: qq_show_playlist,
    getPlaylist: get_playlist,
    parseUrl: qq_parse_url,
    bootstrapTrack: qq_bootstrap_track,
    search: qq_search,
    lyric: qq_lyric,
  };
}

export default build_qq(); // eslint-disable-line no-unused-vars
