/* =====================================================================
   scripts/dev-server.js — 로컬 확인용 정적 서버 (의존성 0)
   ---------------------------------------------------------------------
   왜 만들었나
     기존 `npm run dev` 는 `serve`(14.2.6) 였는데, 브라우저 요청을 몇 시간
     받으면 `EMFILE: too many open files` 로 죽었습니다. 2026-08-24 하루에
     8번 죽었습니다. 사이트 버그가 아니라 로컬 개발 서버만의 문제지만,
     팀이 측정하는 도중에 죽으면 "3D 병사가 안 고쳐졌다", "5분 버튼이 없다"
     같은 엉뚱한 결과가 나옵니다. 밤새 무인으로 도는 동안에는 더 위험합니다.

   설계 원칙
     1. 외부 패키지를 쓰지 않습니다. node: 기본 모듈만 씁니다.
        (설치할 게 없으니 설치 실패로 죽을 일도 없습니다)
     2. 파일 핸들을 절대 흘리지 않습니다. 이 파일의 존재 이유입니다.
        - 스트림은 error / end / close + 응답쪽 close / error 다섯 군데
          어디서 먼저 끝나든 openStreams 에서 빠지고 destroy() 됩니다.
        - cleanup() 은 몇 번 불려도 한 번만 동작합니다(closed 플래그).
        - 클라이언트가 도중에 끊어도(res 'close') 스트림을 destroy 합니다.
          이게 EMFILE 의 가장 흔한 원인입니다 — 브라우저가 이미지 로딩을
          취소하면 소스 스트림은 파이프에 물린 채 그대로 남습니다.
     3. 소켓도 쌓이지 않게 keepAlive/headers/request 타임아웃을 겁니다.
     4. 그래도 EMFILE 이 나면 죽지 말고 503 을 주고 계속 삽니다.

   MIME 타입이 진짜 위험한 부분입니다
     이 사이트는 <script type="importmap"> 과 three.js ES 모듈을 씁니다.
     .js 를 자바스크립트 MIME 으로 안 주면 모듈이 통째로 안 뜨고,
     화면은 반쯤 나오는데 콘솔에만 오류가 뜹니다 — "조용한 고장" 입니다.
     그래서 MIME 표는 아래에 명시적으로 박아 두고, 모르는 확장자는
     application/octet-stream 으로 떨어뜨립니다(추측하지 않습니다).

   되돌리기
     package.json 의 "dev" 를 "serve -l 3000" 으로 되돌리면 됩니다.
     옛 스크립트는 "dev:serve" 로 남겨 뒀습니다.
   ===================================================================== */

'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

/* 프로젝트 루트 = 이 파일이 있는 scripts/ 의 부모 */
const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT || process.argv[2] || 3000);
const HOST = process.env.HOST || '0.0.0.0';

/* ---------------------------------------------------------------------
   자바스크립트 MIME — 이 서버에서 제일 조심해야 하는 한 줄입니다.

   HTML 명세의 "JavaScript MIME type" 목록에 아래 이름들이 전부 들어 있고,
   그중 무엇을 줘도 <script type="module"> 과 importmap 은 똑같이 동작합니다.
   목록 밖의 값(예: text/plain)을 주면 모듈이 통째로 안 뜨고, 화면은 반쯤
   나오는데 콘솔에만 오류가 뜹니다 — 우리가 P1 으로 다루는 "조용한 고장".

   기본값을 application/javascript 로 둔 이유 (2026-08-24 실측):
     기존 serve 14.2.6 (로컬)          → application/javascript; charset=utf-8
     실제 배포 Vercel (라이브)          → application/javascript; charset=utf-8
   로컬 서버는 회원이 보는 것을 재현하는 도구입니다. 배포와 다른 MIME 을
   주면 로컬에서만 되거나 로컬에서만 안 되는 차이가 생기고, 팀 측정이
   배포와 어긋납니다. 그래서 배포값에 맞췄습니다.

   text/javascript 로 바꾸고 싶으면 아래 JS_MIME 한 줄만 바꾸면 됩니다.
   (RFC 9239 기준으로는 text/javascript 가 권장 표기입니다. 다만 지금
    배포가 application/javascript 를 주고 있어 그쪽에 맞춰 둡니다.)
   --------------------------------------------------------------------- */
const JS_MIME_ALLOWED = [
  'text/javascript',
  'application/javascript',
  'text/ecmascript',
  'application/ecmascript',
  'application/x-javascript',
  'text/x-javascript',
];
const JS_MIME = 'application/javascript; charset=utf-8';

/* ---------------------------------------------------------------------
   MIME 표 — 사이트가 실제로 쓰는 확장자는 전부 여기에 있어야 합니다.
   기준: 2026-08-24 기존 serve 14.2.6 의 응답과 109개 파일을 대조해
   맞췄습니다(.css/.png/.jpg/.glb/.json/.md 전부 동일).
   모르는 확장자는 추측하지 않고 application/octet-stream 으로 떨어집니다.
   --------------------------------------------------------------------- */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': JS_MIME,
  '.mjs': JS_MIME,
  '.cjs': JS_MIME,
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.bmp': 'image/bmp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.eot': 'application/vnd.ms-fontobject',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.wasm': 'application/wasm',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.xml': 'application/xml; charset=utf-8',
  '.pdf': 'application/pdf',
  '.sql': 'application/sql',
};
const DEFAULT_MIME = 'application/octet-stream';

function mimeFor(filePath) {
  return MIME[path.extname(filePath).toLowerCase()] || DEFAULT_MIME;
}

/* ---------------------------------------------------------------------
   열려 있는 스트림 추적 — 핸들이 새는지 눈으로 확인할 수 있게.
   /__devserver/health 를 열면 지금 몇 개가 열려 있는지 나옵니다.
   정상이면 요청이 끝난 뒤 0 으로 돌아옵니다.
   --------------------------------------------------------------------- */
const openStreams = new Set();
let served = 0;
let errors = 0;

/* ---------------------------------------------------------------------
   경로 탈출 차단
   ".." 이나 절대경로, 퍼센트 인코딩된 %2e%2e 로 ROOT 밖 파일을
   읽지 못하게 막습니다. decodeURIComponent 를 먼저 하고,
   resolve 한 결과가 ROOT 안인지로 판정합니다
   (문자열에서 ".." 를 지우는 방식은 우회가 쉬워 쓰지 않습니다).
   --------------------------------------------------------------------- */
function resolveSafePath(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch (e) {
    return { error: 400 }; // 깨진 퍼센트 인코딩
  }
  if (decoded.indexOf('\0') !== -1) return { error: 400 };

  // 윈도우 역슬래시도 구분자로 취급해서 ..\ 우회를 막습니다
  decoded = decoded.replace(/\\/g, '/');

  const rel = decoded.startsWith('/') ? decoded : '/' + decoded;
  const full = path.resolve(ROOT, '.' + rel);

  // ROOT 자신이거나 ROOT 아래여야 합니다
  if (full !== ROOT && !full.startsWith(ROOT + path.sep)) {
    return { error: 403 };
  }
  return { full: full };
}

function sendText(req, res, status, body, type) {
  const buf = Buffer.from(body, 'utf8');
  res.writeHead(status, {
    'Content-Type': type || 'text/html; charset=utf-8',
    'Content-Length': buf.length,
    'Cache-Control': 'no-store',
  });
  if (req && req.method === 'HEAD') return res.end();
  res.end(buf);
}

function send404(req, res, urlPath) {
  sendText(
    req,
    res,
    404,
    '<!doctype html><meta charset="utf-8"><title>404</title>' +
      '<body style="font:14px system-ui;background:#0A0F1C;color:#E7ECF5;padding:40px">' +
      '<h1 style="color:#F0506E">404</h1><p>없는 파일입니다: ' +
      String(urlPath).replace(/[<>&]/g, '') +
      '</p></body>'
  );
}

/* ---------------------------------------------------------------------
   파일 하나 보내기 — 핸들 관리가 전부입니다
   --------------------------------------------------------------------- */
function sendFile(req, res, filePath, stat) {
  const headers = {
    'Content-Type': mimeFor(filePath),
    'Content-Length': stat.size,
    'Last-Modified': stat.mtime.toUTCString(),
    // 개발 서버입니다. 캐시가 남으면 팀이 고친 화면 대신 옛 화면을 재고,
    // "안 고쳐졌다"는 잘못된 측정이 나옵니다. 그래서 무조건 no-store.
    'Cache-Control': 'no-store, must-revalidate',
    'Accept-Ranges': 'none',
  };

  if (req.method === 'HEAD') {
    res.writeHead(200, headers);
    res.end();
    return;
  }

  let stream;
  try {
    stream = fs.createReadStream(filePath);
  } catch (err) {
    errors++;
    sendText(req, res, 500, '500 read error');
    return;
  }

  openStreams.add(stream);

  let closed = false;
  const cleanup = function () {
    if (closed) return;
    closed = true;
    openStreams.delete(stream);
    // destroy() 는 fd 를 확실히 닫습니다. 이미 닫혔으면 no-op 입니다.
    if (!stream.destroyed) stream.destroy();
  };

  // 스트림쪽 — 정상 종료(end/close)와 오류(error) 양쪽 모두에서 정리
  stream.on('error', function (err) {
    errors++;
    cleanup();
    if (!res.headersSent) {
      if (err && err.code === 'EMFILE') {
        // 열린 파일이 한계에 닿았을 때 — 죽지 말고 503 을 주고 살아남습니다
        sendText(req, res, 503, '503 too many open files (일시적)');
      } else if (err && (err.code === 'ENOENT' || err.code === 'EISDIR')) {
        send404(req, res, req.url);
      } else {
        sendText(req, res, 500, '500 read error');
      }
    } else {
      res.destroy();
    }
  });
  stream.on('end', cleanup);
  stream.on('close', cleanup);

  // 응답쪽 — 브라우저가 도중에 취소하면 여기로 옵니다.
  // 이걸 안 잡으면 소스 스트림이 파이프에 물린 채 남아 fd 가 샙니다.
  res.on('close', cleanup);
  res.on('error', cleanup);

  res.writeHead(200, headers);
  stream.pipe(res);
}

/* --------------------------------------------------------------------- */
const server = http.createServer(function (req, res) {
  served++;

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8', Allow: 'GET, HEAD' });
    res.end('405 Method Not Allowed');
    return;
  }

  // 쿼리스트링/해시 제거
  let urlPath = String(req.url || '/').split('?')[0].split('#')[0];
  if (!urlPath.startsWith('/')) urlPath = '/' + urlPath;

  // 핸들이 새는지 확인용 (사이트 경로와 안 겹치게 __devserver 아래)
  if (urlPath === '/__devserver/health') {
    sendText(
      req,
      res,
      200,
      JSON.stringify({ ok: true, openStreams: openStreams.size, served: served, errors: errors }),
      'application/json; charset=utf-8'
    );
    return;
  }

  const safe = resolveSafePath(urlPath);
  if (safe.error === 400) return sendText(req, res, 400, '400 Bad Request');
  if (safe.error === 403) return sendText(req, res, 403, '403 Forbidden — 프로젝트 밖은 못 읽습니다');

  fs.stat(safe.full, function (err, stat) {
    if (err) return send404(req, res, urlPath);

    if (stat.isDirectory()) {
      // "/" 및 하위 디렉터리 → 그 안의 index.html
      const indexPath = path.join(safe.full, 'index.html');
      fs.stat(indexPath, function (err2, stat2) {
        if (err2 || !stat2.isFile()) return send404(req, res, urlPath);
        sendFile(req, res, indexPath, stat2);
      });
      return;
    }

    if (!stat.isFile()) return send404(req, res, urlPath);
    sendFile(req, res, safe.full, stat);
  });
});

/* 소켓이 쌓이지 않게 — 이것도 EMFILE 원인 중 하나입니다 */
server.keepAliveTimeout = 5000;
server.headersTimeout = 10000;
server.requestTimeout = 60000;

/* 잘못된 요청 하나로 서버가 죽지 않게 */
server.on('clientError', function (err, socket) {
  errors++;
  if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
  else socket.destroy();
});

server.on('error', function (err) {
  if (err && err.code === 'EADDRINUSE') {
    console.error('[dev-server] ' + PORT + ' 포트를 이미 누가 쓰고 있습니다.');
    process.exit(1);
  }
  console.error('[dev-server] 서버 오류:', err && err.message);
});

/* 직접 실행할 때만 포트를 엽니다.
   테스트가 require 해도 서버가 뜨지 않아야 합니다 —
   안 그러면 npm test 가 3000 포트를 뺏어서 팀이 쓰던 서버를 죽입니다. */
if (require.main === module) {
  server.listen(PORT, HOST, function () {
    console.log('[dev-server] http://localhost:' + PORT + '  (root: ' + ROOT + ')');
    console.log('[dev-server] 상태 확인: /__devserver/health');
  });
}

/* Ctrl+C 로 껐을 때 열린 스트림을 남기지 않습니다 */
function shutdown() {
  for (const s of openStreams) {
    try {
      s.destroy();
    } catch (e) {
      /* 이미 닫혔으면 무시 */
    }
  }
  openStreams.clear();
  server.close(function () {
    process.exit(0);
  });
  setTimeout(function () {
    process.exit(0);
  }, 2000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

module.exports = {
  server: server,
  MIME: MIME,
  JS_MIME: JS_MIME,
  JS_MIME_ALLOWED: JS_MIME_ALLOWED,
  resolveSafePath: resolveSafePath,
  mimeFor: mimeFor,
  ROOT: ROOT,
};
