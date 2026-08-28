/* tests/private-info.test.js
 * 고객 개인정보가 회원 표시정보와 분리돼 있는지 검증합니다 (5순위).
 *
 * 왜 필요한가
 *   profiles 는 닉네임 표시용이라 랭킹·게시판·채팅에서 조회됩니다.
 *   비회원도 읽을 수 있게 열어둔 상태입니다.
 *   여기에 전화번호가 섞이면 남의 번호가 그대로 노출됩니다.
 *   그래서 개인정보는 별도 테이블에 두고 본인·관리자만 봅니다.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const REPO = process.env.REPO || path.join(__dirname, "..");
let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log("  \u001b[32m✓\u001b[0m " + name); }
  else { fail++; console.log("  \u001b[31m✗\u001b[0m " + name + (detail ? " — " + detail : "")); }
}
const strip = (s) => s.split("\n").map((l) => l.replace(/--.*$/, "")).join("\n");

const priv = strip(fs.readFileSync(path.join(REPO, "supabase", "schema-private-info.sql"), "utf8"));
const base = strip(fs.readFileSync(path.join(REPO, "supabase", "schema.sql"), "utf8"));

console.log("\n개인정보 분리");

/* ---------- 분리돼 있는가 ---------- */
{
  ok("개인정보 전용 테이블을 만든다", /create table if not exists public\.customer_private_info/.test(priv));
  ok("profiles 에는 개인정보가 없다",
     !/create table if not exists public\.profiles[\s\S]{0,300}(phone|email|real_name)/.test(base));
  ok("profiles 를 건드리지 않는다", !/alter table public\.profiles/.test(priv));

  ["provider", "provider_user_id", "real_name", "email",
   "phone_number", "phone_verified", "phone_verified_at"].forEach((c) => {
    ok("칸이 있다: " + c, new RegExp("\\s" + c + "\\s").test(priv));
  });
}

/* ---------- 남의 정보를 못 보는가 ---------- */
{
  ok("RLS 를 켠다", /alter table public\.customer_private_info enable row level security/.test(priv));
  ok("본인만 읽는다", /cpi_select_own[\s\S]{0,120}auth\.uid\(\) = user_id/.test(priv));
  ok("관리자는 볼 수 있다", /cpi_select_admin[\s\S]{0,200}admin_users a where a\.user_id = auth\.uid\(\)/.test(priv));
  ok("본인만 만든다", /cpi_insert_own[\s\S]{0,120}auth\.uid\(\) = user_id/.test(priv));
  ok("본인만 고친다", /cpi_update_own[\s\S]{0,160}auth\.uid\(\) = user_id/.test(priv));
  ok("모두에게 여는 정책이 없다", !/using \(true\)/.test(priv));
}

/* ---------- 전화번호가 그대로 나가지 않는가 ---------- */
{
  ok("가리는 함수가 있다", /function public\.mask_phone/.test(priv));
  ok("본인 조회도 가려서 준다", /'phone_masked', public\.mask_phone\(r\.phone_number\)/.test(priv));
  ok("전체 번호를 그대로 주는 함수가 없다", !/'phone_number', r\.phone_number/.test(priv));

  /* 마스킹 규칙을 그대로 옮겨 확인합니다. */
  const mask = (p) => {
    if (!p || !String(p).trim()) return null;
    const d = String(p).replace(/\D/g, "");
    if (d.length < 8) return "***";
    return d.slice(0, 3) + "-****-" + d.slice(-4);
  };
  ok("010-1234-5678 -> 010-****-5678", mask("010-1234-5678") === "010-****-5678");
  ok("하이픈 없어도 같은 결과", mask("01012345678") === "010-****-5678");
  ok("짧은 값은 전부 가림", mask("123") === "***");
  ok("빈 값은 null", mask("") === null && mask(null) === null);
}

/* ---------- 중복 가입 방지 ---------- */
{
  ok("같은 소셜 계정으로 두 번 가입 불가", /idx_cpi_provider[\s\S]{0,160}unique|create unique index if not exists idx_cpi_provider/.test(priv));
  ok("인증된 전화번호 중복 불가", /idx_cpi_phone[\s\S]{0,160}phone_verified = true/.test(priv));
}

/* ---------- 탈퇴 시 정리 ---------- */
{
  ok("계정이 지워지면 개인정보도 함께 지워진다",
     /user_id\s+uuid primary key references auth\.users\(id\) on delete cascade/.test(priv));
  ok("삭제 정책을 따로 만들지 않는다", !/for delete/.test(priv));
}

/* ---------- 안전 ---------- */
{
  ok("기존 테이블을 지우지 않는다", !/drop table|truncate/i.test(priv));
  ok("갱신 시각을 자동 기록한다", /trg_touch_cpi/.test(priv));
  ok("없는 값을 지어내지 않는다(기본값 없음)",
     !/phone_number\s+text\s+not null default/.test(priv));
}

/* ---------- 화면 ---------- */
{
  const js = fs.readFileSync(path.join(REPO, "js", "my-private-info.js"), "utf8");
  const html = fs.readFileSync(path.join(REPO, "index.html"), "utf8");

  ok("마이페이지에 계정 정보 영역이 있다", /id="my-private-info"/.test(html));
  ok("스크립트가 연결됐다", /js\/my-private-info\.js/.test(html));
  ok("서버 함수로만 가져온다", /rpc\("my_private_info"\)/.test(js));
  ok("가려진 번호만 쓴다", /phone_masked/.test(js) && !/info\.phone_number/.test(js));
  ok("정보가 없으면 그대로 알린다", /등록되어 있지 않습니다/.test(js));
  ok("없는 값을 지어내지 않는다", !/010-|example@|기본값/.test(js.replace(/\/\*[\s\S]*?\*\//g, "")));
  ok("로그인 방식을 한글로 보여준다", /카카오/.test(js) && /네이버/.test(js));
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail === 0) console.log("전체 통과 ✅");
else { console.log("실패 있음 ❌"); process.exit(1); }
