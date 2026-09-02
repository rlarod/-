#!/usr/bin/env bash
# =========================================================================
# 수정 금지 파일 감시 — 파일이 바뀔 때마다 자동으로 돕니다
# =========================================================================
# 에이전트에게 "확인해줘" 라고 부탁하는 것만으로는 부족합니다. 사람도 AI도
# 바쁘면 잊습니다. 이 스크립트는 Claude Code 가 파일을 고칠 때마다 자동으로
# 실행돼서, 12개 파일 중 하나라도 바뀌면 그 자리에서 막습니다.
#
# .claude/settings.json 의 hooks 에 등록해서 씁니다.
# =========================================================================

set -u
cd "$(dirname "$0")/../.." || exit 0

# 기준값은 ★CLAUDE.md 의 기준 해시 표★ 한 곳에서만 읽습니다.
#
# ⚠️ 2026-09-02 차트팀 발견 — 여기에 값을 따로 적어뒀더니 낡았습니다.
#    2026-08-31 대표 결재로 js/trading.js 가 바뀌었는데 이 훅만 안 고쳐서,
#    ★모든 팀의 모든 파일 쓰기에서 "수정 금지 파일이 바뀌었습니다" 오탐★ 이 났습니다.
#    같은 값을 두 곳에 두면 반드시 어긋납니다. 그래서 읽어오게 바꿨습니다.
#
# CLAUDE.md 를 못 읽으면 ★막지 않습니다★ (조용히 통과).
# 잘못 막는 것보다 안 막는 게 낫습니다 — 어차피 npm test 의 봉인 48개가 또 봅니다.
EXPECTED=$(grep -E '^[0-9a-f]{32}  js/' CLAUDE.md 2>/dev/null)

if [ -z "$EXPECTED" ]; then
  exit 0
fi

COUNT=$(echo "$EXPECTED" | grep -c .)
if [ "$COUNT" -ne 12 ]; then
  echo "주의 — CLAUDE.md 기준 해시 표에서 12줄이 아니라 $COUNT 줄을 읽었습니다."
  echo "        표 형식이 깨졌는지 확인하세요. 이번에는 막지 않습니다."
  exit 0
fi
CHANGED=$(echo "$EXPECTED" | md5sum -c 2>/dev/null | grep -v ': OK$')

if [ -n "$CHANGED" ]; then
  echo "🚫 수정 금지 파일이 바뀌었습니다 — 되돌리세요."
  echo "$CHANGED"
  echo ""
  echo "이 12개는 한 글자도 고치면 안 됩니다."
  echo "필요한 동작은 별도 모듈을 만들어 우회하세요."
  echo "  · 함수 감싸기      js/social-login.js 가 App.Auth.init 을 가로챕니다"
  echo "  · DOM 후처리       js/cycle-pnl.js 가 마이페이지 숫자를 덮습니다"
  echo "  · 서버에서 막기    supabase-sync.js 를 못 고치니 트리거로 중복을 걸러냅니다"
  echo ""
  echo "되돌리기:  git checkout -- <파일>"
  exit 2   # Claude Code 가 이 메시지를 읽고 스스로 되돌립니다
fi

exit 0
