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

# 2026-08-20 기준값. 이 12개는 어떤 경우에도 바뀌면 안 됩니다.
# bash 는 변수명에 한글을 못 씁니다.
read -r -d '' EXPECTED <<'EOF'
33250202c00b097ff8344ae2ee64cbe7  js/trading.js
333fc427e75b47b306699c92aa4e7b50  js/ui.js
9cec9a7257eb54f379bf72e14e21e463  js/auth.js
faddcbbc34b5165177ff26cb978040f8  js/supabase-sync.js
a93dfaa7f82ce72a914b270acb3650bb  js/chat.js
62e839f06e0565cca5d9216e484b6031  js/leaderboard.js
424e4c63ec1cd24681c4f27f60aee2fa  js/admin.js
9c5fbf13ced09ca2f348e48f87c78224  js/season.js
8b847bd8f5d8231b8dd329f8b15dbe37  js/board.js
fa5f77dc5108133128f85ba5ab3f096e  js/orderbook.js
02ddcb000d577131f797143d08c09123  js/chart.js
1a914631175760e0b0cb5144bc11b59e  js/websocket.js
EOF

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
