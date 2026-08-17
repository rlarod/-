# 주문창 회귀 테스트

컨테이너가 세션마다 초기화되기 때문에, 테스트를 저장소에 함께 보관합니다.

## 실행

```bash
npm install jsdom     # 최초 1회
node tests/order-panel.test.js
```

## 검사 항목

1. **보호 대상 핵심 파일 무결성** — trading.js / ui.js / auth.js / supabase-sync.js /
   chat.js / leaderboard.js / admin.js / season.js / board.js / orderbook.js /
   chart.js / websocket.js 의 md5가 baseline과 같은지 확인합니다.
   이 파일들을 의도적으로 바꾼 경우에만 테스트 상단의 `PROTECTED` 해시를 갱신하세요.
2. **개미톡 주문창 레이아웃** — 필수 요소 존재 + 위→아래 DOM 순서
3. **기능 보존** — 화면에서 숨긴 요소(증거금 입력, 레버리지 슬라이더, TP/SL,
   미체결 카드 등)가 DOM/코드에 그대로 살아있는지
4. **주문가격** — 시장가/지정가 전환, Last 버튼, ± 호가 스텝
5. **수량 → 증거금 역산** — 수량 × 가격 ÷ 레버리지, 10/25/50/75/100% 연동
6. **실제 거래 로직 연동** — LONG/SHORT/시장가/지정가/TP·SL (실제 trading.js 사용)
7. **수익률 핵심 원칙** — 초기자산 100,000 USDT, 진입만으로는 실현손익 불변
   (총자산은 실거래소와 동일하게 진입 taker 수수료만큼만 감소), 청산 시에만 확정 반영
8. **알림음 / 프로모션 / 종목 스트립** — 준비중 항목에 가짜 수치가 없는지

네트워크(WebSocket / Supabase / 차트 라이브러리)만 스텁이고,
거래 계산은 전부 실제 `js/trading.js`를 그대로 실행합니다.
