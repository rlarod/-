# 같은 함수가 여러 벌 있는 문제 — 조사 결과와 정리 제안

작성 2026-08-25 · 수리팀
배정: PM (P1 "랭킹 전원 0원" 원인 추적의 전제 작업)

> **이 문서는 제안입니다. 실행 가능한 정리 SQL은 일부러 만들지 않았습니다.**
> 어느 것이 맞는지는 `supabase/조사-함수중복-2026-08-25.sql` 결과를 봐야 압니다.
> 결과가 나온 뒤 이 문서의 "결과별 처방"대로 진행하면 됩니다.

---

## 1. 실제로 몇 벌인지 (직접 센 것)

`인계문서.md` 6번의 숫자와 실제가 다릅니다.
**주석(`--`)으로 봉인된 것은 실행되지 않으므로 "살아있는 벌"에서 뺐습니다.**

| 함수 / 뷰 | 인계문서 | 파일 수 | **살아있는 벌** | 봉인됨 |
|---|---|---|---|---|
| **`leaderboard` (뷰)** | 언급 없음 | **5** | **5** | 0 |
| `get_leaderboard` | 4 | 4 | **4** | 0 |
| `get_my_rank` | 언급 없음 | **4** | **4** | 0 |
| `check_chat_message` | 언급 없음 | **4** | **4** | 0 |
| `reset_season` | 3 | 3 | **3** | 0 |
| `force_starting_balance` | 언급 없음 | **2** | **2** | 0 |
| `claim_daily_recharge` | 언급 없음 | **2** | **2** | 0 |
| `rank_points_all` | 3 | 3 | 1 | 2 (봉인 완료) |
| `rank_points` | 언급 없음 | 2 | 1 | 1 (봉인 완료) |
| `tl_balance_info` | 2 | **4** | 1 | 3 (봉인 완료) |
| `tl_earned` | 언급 없음 | 3 | 1 | 2 (봉인 완료) |
| `tl_balance` | 언급 없음 | 3 | 1 | 2 (봉인 완료) |
| `tl_settle_all_past` | 언급 없음 | 2 | 1 | 1 (봉인 완료) |
| `tl_migrate_legacy` | 언급 없음 | 2 | 1 | 1 (봉인 완료) |

**정리하면:**

- **TL·계급 계열은 이미 잘 봉인돼 있습니다.** (`schema-tl-monthly.sql`,
  `schema-tl-hotdeal.sql`, `schema-rank-assets.sql`, `schema-rank-badges.sql`)
  → 손댈 것 없음
- **위험한 것은 랭킹 계열 3개 + 채팅 1개 + 지갑 2개입니다.**
  `leaderboard`(5) · `get_leaderboard`(4) · `get_my_rank`(4) ·
  `check_chat_message`(4) · `force_starting_balance`(2) · `claim_daily_recharge`(2)

### 인계문서가 틀린 곳

- `tl_balance_info` 는 "2개"가 아니라 파일 4개입니다 (다만 3개는 봉인돼 실질 1벌)
- **`leaderboard` 뷰가 5벌인데 인계문서에 아예 없습니다.** 실제 랭킹 숫자를
  만드는 것은 함수가 아니라 이 뷰입니다. 가장 중요한 게 빠져 있었습니다
- `get_my_rank` · `check_chat_message` 도 4벌인데 없습니다

---

## 2. `get_leaderboard` 4벌 대조 ★ (P1 직결)

### 먼저 알아야 할 것 — 함수는 계산을 안 합니다

네 벌 모두 본문이 사실상 같습니다.

```sql
select ... from public.leaderboard limit limit_count;
```

**즉 랭킹 숫자를 만드는 것은 `leaderboard` 뷰이고, 함수는 그중 어느 칸을
화면에 내려줄지만 정합니다.** 그래서 두 가지를 따로 봐야 합니다.

### 2-1. 네 벌이 내려주는 칸이 서로 다릅니다

| 파일 | 줄 | 내려주는 칸 | 화면이 쓰는 `total_asset`·`profit_amount` |
|---|---|---|---|
| `schema.sql` | 70 | `nickname, roe_percent, balance` | **❌ 둘 다 없음** |
| `schema-ranking-fix.sql` | 46 | `nickname, roe_percent, total_asset, profit_amount` | ✅ 있음 |
| `schema-leaderboard-fix.sql` | 109 | `nickname, roe_percent, balance, total_asset, profit_amount` | ✅ 있음 |
| `schema-leaderboard-floor.sql` | 90 | `nickname, roe_percent, balance, total_asset, profit_amount` | ✅ 있음 (**정본**) |

`js/leaderboard.js` 는 `r.total_asset` / `r.profit_amount` / `r.roe_percent` 를
**그대로 표시만** 합니다(수정 금지 파일이라 읽기만 했습니다).

> **→ 칸이 없으면 화면에는 `0원` 이 아니라 `-` (하이픈) 이 찍힙니다.**
> `js/utils.js` 19번 줄에서 `formatCurrency(undefined)` 는 `"-"` 를 반환하고,
> `js/leaderboard.js` 57번 줄 `fmtSignedPercent(undefined)` 도 `"-"` 입니다.
> (처음에 "0원으로 찍힌다"고 적었다가 코드를 확인하고 정정했습니다.)

### ⚠ 그래서 이번 P1 은 "칸이 없는 문제"가 아닙니다

PM이 8/24 에 기록한 화면값은 **"총자산 100,000 / 수익금 +0원"** 입니다
(`supabase/조사-랭킹0원-2026-08-24.sql` 머리말).

- `100,000` 은 `starting_balance()` 값 그대로입니다
  (`schema-initial-balance.sql` 30번 줄)
- 즉 `total_asset` 과 `profit_amount` 가 **정상적으로 내려오고 있고**,
  `profit_amount` 값이 **진짜로 0** 이라는 뜻입니다
- 칸이 빠졌다면 `-` 로 보였어야 합니다

> **→ `schema.sql` / `schema-leaderboard-patch.sql` 판이 살아있을 가능성은
> 이 관찰만으로 사실상 배제됩니다.** 서버에는 `total_asset`·`profit_amount`
> 를 내려주는 판(ranking-fix / leaderboard-fix / floor 중 하나)이 올라가
> 있습니다. **원인은 함수의 칸이 아니라 뷰의 계산 쪽입니다.**
>
> 다만 이건 화면 기록에 기댄 추론이라, 조사 SQL 의 A·B·C 섹션으로
> **서버에 직접 확인**해야 확정입니다.

참고로 `schema.sql` 을 통째로 다시 돌리면 58번 줄(`create or replace view
leaderboard`)에서 **Postgres 가 먼저 오류를 냅니다**("cannot change name of view
column"). 조용히 덮어쓰지는 못합니다.

### 2-2. 뒤에 있는 `leaderboard` 뷰 5벌이 **계산이 서로 다릅니다** ★★

여기가 진짜 차이입니다. 같은 회원이라도 어느 뷰가 살아있느냐에 따라
**순위와 금액이 통째로 달라집니다.**

| 파일 | 수익금 계산 | 총자산 | 정렬 | 손실 처리 |
|---|---|---|---|---|
| `schema.sql` (58) | 칸 자체가 없음 | 칸 없음 (`balance` 만) | `roe_percent` | 지갑 잔고 기준 |
| `schema-leaderboard-patch.sql` (17) | 칸 자체가 없음 | 칸 없음 | `balance` → `roe` | 지갑 잔고 기준 |
| `schema-ranking-fix.sql` (28) | `realized_pnl` **날것** | `initial + realized_pnl` | `roe` → 금액 → 자산 | **마이너스 그대로** |
| `schema-leaderboard-fix.sql` (64) | `greatest(0, realized_pnl)` | `initial + greatest(0,·)` | — | **0에서 끊음** |
| `schema-leaderboard-floor.sql` (67) | `ranking_profit` 뷰 (**누적 최저점 보정**) | `initial + ranking_profit` | `roe` → 금액 | **누적이 0 아래로 안 내려감** |

**세 가지가 근본적으로 다릅니다:**

1. **`schema.sql` / `schema-leaderboard-patch.sql`** — 지갑 잔고(`balance`)로
   순위를 냅니다. 포지션을 잡으면 증거금이 지갑에서 빠져 **거래 중인 사람만
   순위가 내려갔다가 청산하면 돌아옵니다.** 무료 충전도 그대로 더해져
   **충전만 받은 사람이 위로 올라갑니다.**
2. **`schema-ranking-fix.sql`** — 마이너스를 그대로 씁니다.
   원금을 다 잃고 무료 충전으로 또 잃으면 **-17,147% 같은 값**이 나옵니다
   (`schema-leaderboard-fix.sql` 주석에 실제로 그렇게 찍혔다고 기록돼 있습니다).
3. **`schema-leaderboard-floor.sql`** — 인계문서 3번의 확정 계산식입니다.

```
랭킹 수익금 = 거래를 시간 순으로 훑으며  누적 = max(0, 누적 + 이번손익)
```

`schema-leaderboard-fix.sql` 의 `greatest(0, realized_pnl)` 는 **합계에만**
바닥을 씌우는 것이고, floor 판은 **시간 순 누적의 최저점**을 보정합니다.
같은 사람이라도 값이 다르게 나옵니다.

> **정본은 `schema-leaderboard-floor.sql` 입니다.**
> 인계문서 3번 계산식과 일치하는 유일한 파일입니다.

### 2-3. floor 판에만 있는 또 하나의 0원 후보 ★

`schema-leaderboard-floor.sql` 38번 줄 `ranking_profit` 뷰에 이 조건이 있습니다.

```sql
where coalesce(t.cycle_no, 1) = coalesce(ta.cycle_no, 1)
```

**거래의 사이클 번호와 계좌의 사이클 번호가 다르면 그 거래는 랭킹에서 통째로
빠집니다.** `schema-trading-cycle.sql` 141번 줄에서 사이클을 닫을 때
`cycle_no = ta.cycle_no + 1` 로 계좌만 올립니다. 이때 **과거 거래는 옛 번호로
남으므로 정상 동작**이지만, 만약 계좌 번호만 올라가고 새 거래가 없으면
`ranking_profit` 이 **전원 0원**이 됩니다.

→ 조사 SQL 의 **F 섹션 "사이클 일치 / 불일치 건수"** 가 이걸 가립니다.
- 일치 0 · 불일치 많음 → **이게 원인입니다**
- 일치도 많음 → 원인이 아닙니다. 함수 칸(2-1)이나 데이터 쪽입니다

---

## 3. 나머지 중복들 (랭킹만큼 급하지 않지만 기록)

| 함수 | 살아있는 벌 | 무엇이 다른가 |
|---|---|---|
| `get_my_rank` | 4 | `get_leaderboard` 와 **똑같이** 4갈래로 갈립니다. 목록과 내 순위의 기준이 어긋나면 "목록엔 3등인데 내 순위는 5등"이 됩니다 (파일 주석에도 그 경고가 있습니다) |
| `check_chat_message` | 4 | `schema-chat-safety-patch` / `schema-admin-chat` / `schema-chat-event-exempt` / `schema-trade-events-chat` 순으로 기능이 쌓입니다. **마지막에 돌린 것 하나만 남으므로 앞 기능이 사라집니다** (예: 거래 이벤트 면제, 관리자 잠금) |
| `reset_season` | 3 | 시즌 초기화 내용이 다릅니다. **회원 데이터를 바꾸는 함수라 가장 위험합니다.** 이번 배정 범위 밖이라 대조하지 않았습니다 |
| `force_starting_balance` | 2 | `schema-initial-balance.sql` vs `지갑초기화-해결.sql`. **트리거로 붙어 있어** 어느 쪽이 붙었는지에 따라 지갑 초기화 동작이 달라집니다 (조사 SQL G 섹션에서 확인됩니다) |
| `claim_daily_recharge` | 2 | `schema-daily-recharge.sql` vs `schema-rank-1000.sql` |

---

## 4. 결과별 처방 — 조사 SQL 을 돌린 뒤 이대로 하시면 됩니다

`supabase/조사-함수중복-2026-08-25.sql` 결과의 **C 섹션**을 보고 고릅니다.

### 처방 ①  C-300 이 "옛날 버전" 또는 "중간 버전"

→ **`supabase/schema-leaderboard-floor.sql` 을 Run 하면 끝납니다.**

이 파일은 맨 앞에서 `drop view ... cascade` 로 옛 뷰와 딸린 함수를 걷어내고
정본으로 다시 만듭니다. **거래기록·회원 데이터는 건드리지 않습니다**
(뷰와 함수는 계산 로직일 뿐 데이터를 담지 않습니다).

> 단, 2-1 의 관찰대로라면 지금 서버는 "중간 버전"(ranking-fix 또는
> leaderboard-fix)일 가능성이 높습니다. 이 경우 floor 를 돌리면 **회원들의
> 랭킹 수익금·순위가 함께 바뀝니다.** 계산식이 다르기 때문입니다
> (2-2 표 참조). 값이 바뀌는 것 자체는 정상이며 인계문서 3번 확정식에
> 맞추는 것입니다. 다만 **누가 몇 위에서 몇 위로 바뀌었는지 실행 전후
> 기록이 필요합니다** (CLAUDE.md "기존 기록이 소급 변경되면" 항목).

### 처방 ②  C-310 이 "아니오"인데 C-300 은 "최신"

→ 뷰는 맞는데 함수만 옛 것입니다. 역시 **`schema-leaderboard-floor.sql`** 을
Run 하면 함수까지 같이 맞춰집니다.

### 처방 ③  C-300 "최신" · C-310 "예" 인데 F 의 "사이클 불일치"가 크고 "일치"가 0

→ **함수 중복 문제가 아닙니다.** 사이클 번호가 어긋난 것입니다.
이건 회원 거래기록에 손대는 일이라 **PM 지시 없이 진행하지 않습니다.**
결과를 PM에게 올리고 별건으로 배정받아야 합니다.

### 처방 ④  전부 정상이고 F 의 "0원이 아닌 사람 수"도 0

→ 랭킹 계산은 멀쩡한데 **바탕 데이터(`trades.pnl` 또는 `realized_pnl`)가
실제로 0** 인 것입니다. 이미 진행 중인 `supabase/조사2-랭킹0원-한번에.sql`
쪽 건입니다. **함수 중복 문제가 아닙니다.**

### 처방 ⑤  화면에 `0원` 이 아니라 `-` 로 보인다면

→ 그때는 **함수 칸이 빠진 것**이 맞습니다 (2-1 표의 `schema.sql` 판).
`schema-leaderboard-floor.sql` 을 Run 하면 해결됩니다.

### 처방 ⑥  D 섹션에 `get_leaderboard` 가 2벌 이상

Postgres 는 인자가 다르면 같은 이름도 따로 보관합니다
(`get_leaderboard(int)` 와 `get_leaderboard()` 는 별개).
화면은 `limit_count` 를 넘기므로 `(int)` 판이 불립니다.

→ 남는 쪽이 무엇인지 PM에게 보고하고 지시를 받습니다.
**임의로 `drop function` 하지 않습니다.**

---

## 5. 재발 방지 제안 (실행 아님 — 승인 필요)

지금은 **"어느 파일을 마지막에 돌렸느냐"에 서버 동작이 걸려 있습니다.**
아래 셋을 제안합니다. 어느 것도 아직 하지 않았습니다.

### 제안 A — 랭킹 옛 판 3개를 봉인한다 (권장)

`schema-rank-assets.sql` · `schema-tl-monthly.sql` 이 이미 쓰고 있는 방식
그대로, **본문을 주석으로 막고 파일은 남깁니다.** 지우지 않습니다.

봉인 대상 (정본 `schema-leaderboard-floor.sql` 제외):

| 파일 | 안에 든 것 | 봉인해도 되나 |
|---|---|---|
| `schema-leaderboard-patch.sql` | `leaderboard` 뷰, `get_my_rank` | ✅ 랭킹 전용 |
| `schema-leaderboard-fix.sql` | `leaderboard` 뷰, `get_leaderboard`, `get_my_rank` | ✅ 랭킹 전용 |
| `schema-ranking-fix.sql` | `leaderboard` 뷰, `get_leaderboard`, `get_my_rank` | ✅ 랭킹 전용 |
| `schema.sql` | **랭킹 + 테이블 전부** | ❌ **부분만** — 58~86줄(뷰·함수)만 막고 테이블 정의는 남겨야 합니다 |

> ⚠ `schema.sql` 은 전체 봉인하면 안 됩니다. 신규 환경 구축용 원본입니다.
> 해당 구간만 막고 "랭킹은 `schema-leaderboard-floor.sql` 을 보라"고 적는 방식을
> 제안합니다.

**되돌리기:** 주석만 도로 걷어내면 원상복구됩니다. 내용은 그대로 남습니다.

### 제안 B — `health-check.sql` 이 옛 파일을 가리키고 있습니다

`supabase/health-check.sql` 22·30번 줄이 `schema-leaderboard-fix.sql` 을
실행하라고 안내합니다. **지금 정본은 `schema-leaderboard-floor.sql` 입니다.**
안내대로 따르면 랭킹이 옛 계산식으로 되돌아갑니다.

→ 안내 문구를 정본으로 바꾸고, `ranking_profit` 뷰 존재 여부 검사를 추가하는 것을
제안합니다. **이번 배정 범위 밖이라 손대지 않았습니다.**

### 제안 C — 인계문서 6번의 숫자를 실제와 맞춘다

1번 표대로 고치고, **빠져 있는 `leaderboard` 뷰(5벌)를 추가**하는 것을 제안합니다.
이번 배정 범위 밖이라 손대지 않았습니다.

---

## 6. 다른 팀 조사 파일과의 관계 (겹침 주의)

작업 중 `supabase/조사3-랭킹0원-확정판.sql` · `supabase/조사4-랭킹0원-한판에.sql`
이 다른 팀에서 새로 만들어진 것을 확인했습니다. **일부 겹칩니다.**

| | 조사4 (다른 팀) | 조사-함수중복 (이 건) |
|---|---|---|
| `get_leaderboard` 정의 확인 | ✅ | ✅ |
| `force_starting_balance` 트리거 | ✅ | ✅ |
| 회원·계좌·거래 실측 | ✅ (자세함) | 건수만 |
| `leaderboard` **뷰의 칸 구성** | ❌ | ✅ |
| 어느 파일 버전이 올라가 있는지 판정 | ❌ | ✅ |
| 중복 함수 **전체** 개수 | ❌ | ✅ |
| `ranking_profit` · **사이클 번호 불일치** | ❌ | ✅ |

→ **둘 다 읽기 전용이라 같이 돌려도 안전합니다.** 다만 대표님께 두 번
부탁드리게 되므로, PM이 하나로 합칠지 판단해 주시면 좋겠습니다.

---

## 7. 이번에 하지 않은 것

- **정리 SQL 을 만들지 않았습니다.** 조사 결과를 봐야 어느 것이 맞는지 압니다
- **봉인을 실행하지 않았습니다.** 제안 A 는 승인 후 별건으로 진행합니다
- **`reset_season` 3벌은 대조하지 않았습니다.** 회원 데이터를 바꾸는 함수라
  범위 밖이고, 잘못 건드리면 시즌이 초기화됩니다
- **서버에 붙어 확인하지 못했습니다.** 위 표는 전부 **파일을 읽어서** 낸 것이고,
  **서버에 실제로 무엇이 들어 있는지는 조사 SQL 결과가 있어야 압니다**
