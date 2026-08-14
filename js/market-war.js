/* =========================================================================
 * js/market-war.js — App.MarketWar
 * =========================================================================
 * 호가창/체결 데이터를 Three.js 기반 3D "전쟁터"로 시각화합니다. 데이터
 * 계층(구독 이벤트)은 이전과 동일 — 새 WebSocket을 열지 않습니다.
 *
 *   'orderbook:update' (js/orderbook.js가 방송, 이전 단계에서 1줄 추가됨)
 *   'trade:tick'        (js/websocket.js가 원래부터 방송하던 것, 무수정)
 *   'price:update'      (js/websocket.js가 원래부터 방송하던 것, 무수정)
 *   'currency:change'   (js/config.js가 원래부터 방송하던 것, 무수정)
 *
 * ── 이번 개편: "체결 1건 = 무기 1개" 구조 폐기 ──────────────────────
 * 승인받은 최종 설계대로 완전히 다시 짰습니다.
 *
 *   A. BACKGROUND WAR (체결과 무관하게 항상 작동)
 *      진영당 병력 = 기본 80명(BASE_GARRISON) + 호가 잔량 기반 추가
 *      0~120명(ORDERBOOK_BONUS_MAX), 최대 200명. 각 병사는
 *      "기지 출발 → 전선으로 걸어감 → 일정 시간 생존 → 사망(제거) →
 *      재보충" 순환을 개별적으로 반복합니다. 호가 잔량이 순간적으로
 *      줄어도 기본 80명은 항상 유지됩니다(전쟁이 꺼지지 않음).
 *
 *   B. MARKET COMBAT EVENTS (실시간 시장 강도로 추가 발생)
 *      BUY_INTENSITY / SELL_INTENSITY(0~100)를 계산합니다 — 개별
 *      체결 하나로 정하지 않고, 최근 체결의 (1) 상대적 크기(percentile),
 *      (2) 최근 빈도, (3) 같은 방향 연속성을 합산합니다. 상승은 빠르게,
 *      하락(감쇠)은 천천히(요청하신 그대로 RISE/DECAY 분리).
 *      Intensity 구간별로 무기 등급이 "누적"으로 열립니다(상위 등급이
 *      열려도 하위 등급이 꺼지지 않음) — 보병 총격은 EXTREME 상황에서도
 *      계속 쏘고 있습니다. 각 등급은 자기만의 쿨다운 타이머로 반복
 *      발사되며, 이 타이머는 체결 이벤트와 무관하게 매 프레임 확인되므로
 *      "체결이 없어도 전쟁은 계속"이 자연스럽게 성립합니다.
 *
 *   C. EXTREME(97+) 대규모 공습
 *      LOW→EXTREME로 "막 넘어가는 순간"에만 1회 발동(요청하신 엣지 트리거).
 *      EXTREME을 유지하는 동안은 반복 발동하지 않고, 다시 97 밑으로
 *      내려갔다가 재진입해야 다음 공습이 가능합니다. 최소 쿨다운도 둠.
 *
 * ── 튜닝값은 CFG 하나에 모아뒀습니다(요청하신 대로 설정 분리) ─────────
 *
 * ── 성능 ─────────────────────────────────────────────────────────
 *   - 병력: THREE.Points(진영당 드로우콜 1회, 최대 200개로 상한)
 *   - 무기 등급 스케줄러는 매 프레임이 아니라 등급별 쿨다운 타이머 기반
 *   - percentile 계산은 최근 80개만 유지하는 작은 배열 정렬(체결마다 1회)
 *   - 투사체/폭발/궤적/차량은 전부 고정 크기 오브젝트 풀 재사용
 *   - 탭 백그라운드면 렌더 중지, 지형/텍스처는 이전 단계와 동일하게 유지
 * ========================================================================= */

window.App = window.App || {};

App.MarketWar = (function () {
  "use strict";

  const COLOR_BUY = 0xf6465d;
  const COLOR_SELL = 0x3b82f6;
  const MAP_HALF_WIDTH = 26;
  const MAP_HALF_DEPTH = 20;
  const BANDS_PER_SIDE = 5;

  /* ---------------- 설정값 (전부 여기서만 조정) ---------------- */
  const CFG = {
    BASE_GARRISON: 80,
    ORDERBOOK_BONUS_MAX: 120,
    SOLDIER_WALK_MAX_SPEED: 1.9, // 월드 단위/초 — 개인별로 walkSpeedMult(0.85~1.15)를 곱해서 씀
    SOLDIER_DECEL_START_DIST: 2.0, // 목표지점과 이 거리 이하로 가까워지면 감속 시작
    SOLDIER_LIFESPAN_MIN_MS: 9000,
    SOLDIER_LIFESPAN_MAX_MS: 20000,
    SOLDIER_RESPAWN_MIN_MS: 600,
    SOLDIER_RESPAWN_MAX_MS: 2200,

    INTENSITY_DECAY_PER_SEC: 4.5,
    PERCENTILE_WINDOW: 80,
    FREQ_WINDOW_MS: 5000,
    STREAK_WINDOW: 8,
    PERCENTILE_GAIN: 20,
    FREQUENCY_GAIN: 10,
    STREAK_GAIN: 8,

    EXTREME_THRESHOLD: 97,
    ASSAULT_COOLDOWN_MS: 15000,

    TIERS: [
      { key: "infantry", min: 0, cooldown: 900, variance: 500 },
      { key: "heavyGunfire", min: 20, cooldown: 480, variance: 260 },
      { key: "grenade", min: 35, cooldown: 1900, variance: 700 },
      { key: "artillery", min: 50, cooldown: 2600, variance: 1000 },
      { key: "tank", min: 65, cooldown: 4200, variance: 1400 },
      { key: "helicopter", min: 75, cooldown: 6200, variance: 1800 },
      { key: "jet", min: 85, cooldown: 8200, variance: 2200 },
      { key: "missile", min: 92, cooldown: 5200, variance: 1600 },
    ],
  };

  const MAX_UNITS_PER_SIDE = CFG.BASE_GARRISON + CFG.ORDERBOOK_BONUS_MAX; // 논리적 정원(80~200) — 체결강도와 무관한 상시 병력 로직은 그대로 유지
  const MAX_SOLDIER_INSTANCES_PER_SIDE = 50; // 실제 3D 모델(스키닝 메쉬)로 렌더되는 상한 — 성능 때문에 정원과 별개로 클램프
  const SOLDIER_MODEL_URL = "assets/soldier.glb";
  const SOLDIER_TARGET_HEIGHT = 0.62; // 월드 단위 기준 병사 키 — 로딩 후 실제 모델 크기에 맞춰 자동 스케일
  const SOLDIER_BONE_NAMES = [
    "hips", "spine", "chest", "neck", "head",
    "upleg.L", "leg.L", "foot.L", "upleg.R", "leg.R", "foot.R",
    "shoulder.L", "arm.L", "forearm.L", "hand.L",
    "shoulder.R", "arm.R", "forearm.R", "hand.R",
  ];
  const MAX_PROJECTILES = 30;
  const MAX_EXPLOSIONS = 20;
  const MAX_TRAILS = 14;
  const MAX_VEHICLES = 10;
  const MAX_MUZZLE_FLASHES = 20;
  const FEED_MAX_ITEMS = 6;

  let renderer = null;
  let scene = null;
  let camera = null;
  let canvas = null;
  let wrapEl = null;
  let running = false;
  let rafId = null;
  let isMobile = false;
  let lastFrameTime = 0;

  let latestBids = [];
  let latestAsks = [];
  let currentPrice = null;
  let priceText = "-";
  let centerPrice = null;
  const HALF_RANGE_RATIO = 0.0008;
  const WORLD_HALF_WIDTH = 9;

  let buyDepthPeak = 0.00001;
  let sellDepthPeak = 0.00001;

  let buyIntensity = 0;
  let sellIntensity = 0;
  let combinedQtyWindow = [];
  let buyTradeTimes = [];
  let sellTradeTimes = [];
  let directionHistory = [];
  let buyWasExtreme = false;
  let sellWasExtreme = false;
  let buyLastAssaultAt = 0;
  let sellLastAssaultAt = 0;

  const buyTierNextFire = {};
  const sellTierNextFire = {};

  let soldierTemplate = null; // GLTFLoader가 로드한 원본(화면엔 안 그림, 복제 원본으로만 씀)
  let modelReady = false;
  let buySoldiers = [];
  let sellSoldiers = [];
  let frontLineObj = null;
  let shakeAmount = 0;

  const projectilePool = [];
  const explosionPool = [];
  const trailPool = [];
  const vehiclePool = [];
  const muzzleFlashPool = [];

  const orbit = { theta: 0, phi: 1.21, radius: 21.4, target: null, dragging: false, lastX: 0, lastY: 0 };
  const PHI_MIN = 0.32;
  const PHI_MAX = 1.5;
  const RADIUS_MIN = 8;
  const RADIUS_MAX = 42;

  function el(id) {
    return document.getElementById(id);
  }
  function pseudoRandom(i, seed) {
    const x = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453;
    return x - Math.floor(x);
  }
  function priceToX(price) {
    if (centerPrice === null || centerPrice <= 0) return 0;
    const halfRange = centerPrice * HALF_RANGE_RATIO;
    const t = (price - centerPrice) / halfRange;
    return Math.max(-WORLD_HALF_WIDTH * 1.3, Math.min(WORLD_HALF_WIDTH * 1.3, t * WORLD_HALF_WIDTH));
  }
  function bandX(rank, isBuy) {
    const step = (5.5 - 1.2) / BANDS_PER_SIDE;
    const dist = 1.2 + rank * step;
    return isBuy ? -dist : dist;
  }
  function baseX(isBuy) {
    return isBuy ? -MAP_HALF_WIDTH + 5 : MAP_HALF_WIDTH - 5;
  }

  /* ================= A. BACKGROUND WAR ================= */

  // GLTFLoader/SkeletonUtils는 index.html의 ES모듈 브릿지가 로드를 마쳐야 전역에 생깁니다.
  function loadSoldierModel(onDone) {
    if (typeof GLTFLoader === "undefined" || typeof THREE.Box3 === "undefined") {
      console.warn("[market-war.js] GLTFLoader를 찾을 수 없어 병사 모델을 표시할 수 없습니다(나머지 기능은 정상 동작).");
      onDone(false);
      return;
    }
    const loader = new GLTFLoader();
    loader.load(
      SOLDIER_MODEL_URL,
      (gltf) => {
        // 원본 파일의 스케일이 일정치 않을 수 있어서(변환 파이프라인 특성), 실제 로드된
        // 바운딩박스를 재서 원하는 키에 맞게 자동으로 스케일을 계산합니다.
        const box = new THREE.Box3().setFromObject(gltf.scene);
        const size = new THREE.Vector3();
        box.getSize(size);
        const scaleFactor = size.y > 0.0001 ? SOLDIER_TARGET_HEIGHT / size.y : 1;
        gltf.scene.scale.setScalar(scaleFactor);
        const box2 = new THREE.Box3().setFromObject(gltf.scene);
        gltf.scene.position.y -= box2.min.y; // 발이 y=0에 오도록 보정
        soldierTemplate = gltf.scene;
        modelReady = true;
        onDone(true);
      },
      undefined,
      (err) => {
        console.warn("[market-war.js] 병사 모델(soldier.glb) 로딩 실패 — 나머지 기능은 정상 동작합니다.", err);
        onDone(false);
      }
    );
  }

  // 진영별 색 구분: 원본 텍스처를 크게 해치지 않도록 재질 색을 35%만 팀컬러 쪽으로 섞습니다.
  // 재질을 복제해서 씁니다 — 복제 안 하면 병사 1명 색을 바꿀 때 템플릿을 공유하는 다른
  // 모든 인스턴스 색까지 같이 바뀌어버립니다.
  function tintSoldierMaterials(root, colorHex) {
    const teamColor = new THREE.Color(colorHex);
    root.traverse((obj) => {
      if (!obj.isMesh || !obj.material) return;
      const applyTint = (m) => {
        const c = m.clone();
        if (c.color) c.color.lerp(teamColor, 0.35);
        return c;
      };
      obj.material = Array.isArray(obj.material) ? obj.material.map(applyTint) : applyTint(obj.material);
    });
  }

  function buildSoldierPool(list, isBuy, count) {
    for (let i = 0; i < count; i++) {
      const clone = SkeletonUtils.clone(soldierTemplate);
      tintSoldierMaterials(clone, isBuy ? COLOR_BUY : COLOR_SELL);
      const group = new THREE.Group();
      group.add(clone);
      group.visible = false;
      scene.add(group);

      const bones = {};
      const baseRot = {};
      SOLDIER_BONE_NAMES.forEach((n) => {
        const bone = clone.getObjectByName(n);
        bones[n] = bone || null;
        if (bone) baseRot[n] = { x: bone.rotation.x, y: bone.rotation.y, z: bone.rotation.z };
      });

      list.push({
        active: false,
        group,
        bones,
        baseRot,
        isBuy,
        rank: i % BANDS_PER_SIDE,
        x: 0,
        z: 0,
        targetX: 0,
        state: "idle", // idle(대기)|walk|combat|hit|fall|dead
        walkPhaseOffset: pseudoRandom(i, 101) * Math.PI * 2,
        walkSpeedMult: 0.85 + pseudoRandom(i, 102) * 0.3,
        postureJitter: (pseudoRandom(i, 103) - 0.5) * 0.15,
        nextShotAt: 0,
        shootKickUntil: 0,
        hitStartAt: 0,
        fallStartAt: 0,
        deathAt: 0,
        respawnAt: 0,
      });
    }
  }

  function targetPopulation(depthTotal, peakRef) {
    const ratio = peakRef > 0 ? Math.min(1, depthTotal / peakRef) : 0;
    return CFG.BASE_GARRISON + Math.round(ratio * CFG.ORDERBOOK_BONUS_MAX);
  }

  // 본 회전을 "덮어쓰지" 않고 바인드 포즈(baseRot) 기준으로 더합니다 — 그래야 원본 자세가
  // 안 깨집니다.
  function setBoneEuler(s, name, dx, dy, dz) {
    const b = s.bones[name];
    if (!b) return;
    const base = s.baseRot[name];
    b.rotation.set(base.x + (dx || 0), base.y + (dy || 0), base.z + (dz || 0));
  }

  function faceWorldX(s, targetWorldX) {
    const look = new THREE.Vector3(targetWorldX, s.group.position.y, s.group.position.z);
    s.group.lookAt(look);
  }

  /* ---- 걷기: 양팔/양다리 반대 위상 + hips 보브 + 몸통 카운터 트위스트 + 도착 감속 ---- */
  function animateWalkBones(s, now, ampFactor) {
    const t = (now / 1000) * 6 * s.walkSpeedMult + s.walkPhaseOffset;
    const swing = Math.sin(t) * 0.5 * ampFactor;
    const swingOpp = Math.sin(t + Math.PI) * 0.5 * ampFactor;
    setBoneEuler(s, "upleg.L", swing);
    setBoneEuler(s, "upleg.R", swingOpp);
    setBoneEuler(s, "leg.L", Math.max(0, -swingOpp) * 0.8);
    setBoneEuler(s, "leg.R", Math.max(0, -swing) * 0.8);
    setBoneEuler(s, "arm.L", swingOpp * 0.6);
    setBoneEuler(s, "arm.R", swing * 0.6);
    setBoneEuler(s, "chest", 0, Math.sin(t + Math.PI) * 0.08, 0);
    setBoneEuler(s, "spine", 0, 0, Math.sin(t) * 0.04 * ampFactor);
  }

  function updateWalkState(s, now, dt) {
    const dx = s.targetX - s.x;
    const dist = Math.abs(dx);
    const decelStartDist = CFG.SOLDIER_DECEL_START_DIST;
    const speedFactor = dist < decelStartDist ? Math.max(0.15, dist / decelStartDist) : 1;
    const maxSpeed = CFG.SOLDIER_WALK_MAX_SPEED * s.walkSpeedMult;
    const moveAmount = maxSpeed * speedFactor * dt;

    if (dist <= moveAmount || dist < 0.05) {
      s.x = s.targetX;
    } else {
      s.x += Math.sign(dx) * moveAmount;
    }
    s.group.position.set(s.x, 0, s.z);
    if (dist > 0.05) faceWorldX(s, s.targetX);

    animateWalkBones(s, now, Math.max(0.15, speedFactor));

    if (s.x === s.targetX) {
      s.state = "combat";
      s.nextShotAt = now + 400 + pseudoRandom(Math.floor(now / 300) + s.rank, 55) * 1200;
    }
  }

  /* ---- 전투: 조준 고정 + 숨쉬기 + 불규칙 사격 간격(체결강도가 참여도/빈도를 조절) ---- */
  function updateCombatState(s, now) {
    faceWorldX(s, priceToX(currentPrice !== null ? currentPrice : centerPrice || 0));

    const kicking = now < s.shootKickUntil;
    const kickT = kicking ? 1 - (s.shootKickUntil - now) / 150 : 0;
    const kick = kicking ? Math.sin(Math.min(1, kickT) * Math.PI) * 0.35 : 0;

    setBoneEuler(s, "shoulder.R", -0.25 + s.postureJitter, 0, 0);
    setBoneEuler(s, "arm.R", -1.05 + s.postureJitter - kick, 0.12, 0);
    setBoneEuler(s, "forearm.R", -0.25 - kick * 0.6, 0, 0);
    setBoneEuler(s, "chest", Math.sin(now / 600 + s.walkPhaseOffset) * 0.02, 0, 0);
    setBoneEuler(s, "head", 0, Math.sin(now / 900 + s.walkPhaseOffset) * 0.05, 0);

    const intensity = s.isBuy ? buyIntensity : sellIntensity;
    const participation = 0.3 + Math.min(0.7, intensity / 100);
    if (now >= s.nextShotAt) {
      const roll = pseudoRandom(Math.floor(now / 50) + s.rank, 66);
      if (roll < participation) fireSoldierShot(s, now);
      const baseDelay = 2200 - intensity * 12;
      s.nextShotAt = now + Math.max(400, baseDelay) + pseudoRandom(Math.floor(now / 50) + s.rank, 77) * 500;
    }
  }

  function fireSoldierShot(s, now) {
    s.shootKickUntil = now + 150;
    const handBone = s.bones["hand.R"];
    const pos = new THREE.Vector3(s.x, 1, s.z);
    if (handBone) handBone.getWorldPosition(pos);
    spawnMuzzleFlash(pos);
    spawnProjectileAction(s.isBuy, "gun", { x: pos.x, z: pos.z });
  }

  /* ---- 피격 → 비틀거림 → 쓰러짐 → 잔존 → 제거 ---- */
  function maybeGetHit(s, now, dt) {
    if (s.state !== "combat") return;
    const enemyIntensity = s.isBuy ? sellIntensity : buyIntensity;
    const hitChancePerSec = 0.01 + (enemyIntensity / 100) * 0.05;
    if (pseudoRandom(Math.floor(now / 80) + s.rank * 7, 88) < hitChancePerSec * dt) {
      s.state = "hit";
      s.hitStartAt = now;
    }
  }

  function updateHitState(s, now) {
    const elapsed = now - s.hitStartAt;
    const t = Math.min(1, elapsed / 400);
    setBoneEuler(s, "chest", -0.3 * (1 - t), 0, 0);
    s.group.rotation.z = Math.sin(elapsed / 40) * 0.15 * (1 - t);
    if (elapsed >= 400) {
      s.state = "fall";
      s.fallStartAt = now;
    }
  }

  function updateFallState(s, now) {
    const elapsed = now - s.fallStartAt;
    const t = Math.min(1, elapsed / 600);
    s.group.rotation.x = t * (Math.PI / 2);
    s.group.rotation.z *= 1 - t;
    s.group.position.y = -t * 0.12;
    if (elapsed >= 600) {
      s.state = "dead";
      s.deathAt = now + 3000 + pseudoRandom(Math.floor(now / 500) + s.rank, 99) * 3000;
    }
  }

  function activateSoldier(s, now) {
    s.active = true;
    s.state = "walk";
    s.group.visible = true;
    s.group.rotation.set(0, 0, 0);
    s.group.position.y = 0;
    s.x = baseX(s.isBuy);
    s.z = (pseudoRandom(s.rank + Math.floor(now / 900), 91) - 0.5) * MAP_HALF_DEPTH * 1.7;
    s.targetX = bandX(s.rank, s.isBuy) + (pseudoRandom(Math.floor(now / 500) + s.rank, 92) - 0.5) * 1.0;
    s.group.position.set(s.x, 0, s.z);
  }

  function deactivateSoldier(s, now) {
    s.active = false;
    s.state = "idle";
    s.group.visible = false;
    s.group.rotation.set(0, 0, 0);
    s.group.position.y = 0;
    s.respawnAt = now + CFG.SOLDIER_RESPAWN_MIN_MS + pseudoRandom(Math.floor(now / 700) + s.rank, 111) * (CFG.SOLDIER_RESPAWN_MAX_MS - CFG.SOLDIER_RESPAWN_MIN_MS);
  }

  // 정원(체결강도와 무관, 기존 로직 그대로)은 논리적으로 최대 200명까지지만, 실제 3D
  // 모델은 성능 때문에 MAX_SOLDIER_INSTANCES_PER_SIDE(50)로 별도 클램프합니다.
  function updateSoldierPopulation(list, isBuy, now, dt, logicalTarget) {
    if (!list.length) return; // 모델이 아직 로딩 중이면 조용히 스킵
    const visibleTarget = Math.min(logicalTarget, MAX_SOLDIER_INSTANCES_PER_SIDE);
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      const shouldBeActive = i < visibleTarget;
      if (!shouldBeActive) {
        if (s.active) {
          s.active = false;
          s.group.visible = false;
        }
        continue;
      }
      if (!s.active) {
        if (s.respawnAt === 0 || now >= s.respawnAt) activateSoldier(s, now);
        continue;
      }
      switch (s.state) {
        case "walk":
          updateWalkState(s, now, dt);
          break;
        case "combat":
          updateCombatState(s, now);
          maybeGetHit(s, now, dt);
          break;
        case "hit":
          updateHitState(s, now);
          break;
        case "fall":
          updateFallState(s, now);
          break;
        case "dead":
          if (now >= s.deathAt) deactivateSoldier(s, now);
          break;
      }
    }
    void isBuy;
  }

  function pickArrivedSoldier(list, isBuy) {
    const candidates = list.filter((s) => s.active && (s.state === "combat" || s.state === "hit"));
    if (candidates.length === 0) return { x: bandX(0, isBuy), z: 0 };
    const pick = candidates[Math.floor(pseudoRandom(Date.now() % 500, 7) * candidates.length)];
    return { x: pick.x, z: pick.z };
  }

  /* ================= B. INTENSITY 엔진 ================= */
  function onTradeTick(payload) {
    if (payload.symbol !== App.Config.getActiveSymbol()) return;
    const isBuy = !payload.isBuyerMaker;
    const now = Date.now();

    combinedQtyWindow.push(payload.qty);
    if (combinedQtyWindow.length > CFG.PERCENTILE_WINDOW) combinedQtyWindow.shift();
    const percentile = calcPercentile(payload.qty);

    const timesArr = isBuy ? buyTradeTimes : sellTradeTimes;
    timesArr.push(now);
    while (timesArr.length && timesArr[0] < now - CFG.FREQ_WINDOW_MS) timesArr.shift();
    const frequencyScore = Math.min(100, (timesArr.length / 12) * 100);

    directionHistory.push(isBuy ? "buy" : "sell");
    if (directionHistory.length > CFG.STREAK_WINDOW) directionHistory.shift();
    let streak = 0;
    for (let i = directionHistory.length - 1; i >= 0; i--) {
      if (directionHistory[i] === (isBuy ? "buy" : "sell")) streak++;
      else break;
    }
    const streakScore = Math.min(100, (streak / CFG.STREAK_WINDOW) * 100);

    const delta =
      (percentile / 100) * CFG.PERCENTILE_GAIN + (frequencyScore / 100) * CFG.FREQUENCY_GAIN + (streakScore / 100) * CFG.STREAK_GAIN;

    if (isBuy) buyIntensity = Math.min(100, buyIntensity + delta);
    else sellIntensity = Math.min(100, sellIntensity + delta);

    updatePowerBarDom();
    updateHudStatus();
  }

  function calcPercentile(qty) {
    if (combinedQtyWindow.length < 5) return 50;
    const sorted = combinedQtyWindow.slice().sort((a, b) => a - b);
    let idx = sorted.findIndex((v) => v >= qty);
    if (idx === -1) idx = sorted.length;
    return (idx / sorted.length) * 100;
  }

  function decayIntensity(dt) {
    const d = CFG.INTENSITY_DECAY_PER_SEC * dt;
    buyIntensity = Math.max(0, buyIntensity - d);
    sellIntensity = Math.max(0, sellIntensity - d);
  }

  /* ================= C. 무기 등급 스케줄러 ================= */
  function updateWeaponScheduler(now) {
    runTiersForSide(now, buyIntensity, true, buyTierNextFire);
    runTiersForSide(now, sellIntensity, false, sellTierNextFire);
    checkExtremeTransition(true, buyIntensity, now);
    checkExtremeTransition(false, sellIntensity, now);
  }

  function runTiersForSide(now, intensity, isBuy, nextFireMap) {
    CFG.TIERS.forEach((tier) => {
      if (intensity < tier.min) return;
      const nextAt = nextFireMap[tier.key] || 0;
      if (now < nextAt) return;
      fireTierAction(tier.key, isBuy);
      nextFireMap[tier.key] = now + tier.cooldown + pseudoRandom(now % 977, tier.min) * tier.variance;
    });
  }

  function fireTierAction(tierKey, isBuy) {
    const soldiers = isBuy ? buySoldiers : sellSoldiers;
    const origin = pickArrivedSoldier(soldiers, isBuy);
    switch (tierKey) {
      case "infantry":
      case "heavyGunfire":
        spawnProjectileAction(isBuy, "gun", origin);
        break;
      case "grenade":
        spawnProjectileAction(isBuy, "grenade", origin);
        break;
      case "artillery":
        spawnProjectileAction(isBuy, "artillery", origin);
        break;
      case "missile":
        spawnProjectileAction(isBuy, "missile", origin);
        break;
      case "tank":
        spawnVehicle(isBuy, "tank");
        break;
      case "helicopter":
        spawnVehicle(isBuy, "helicopter");
        break;
      case "jet":
        spawnVehicle(isBuy, "jet");
        break;
    }
  }

  function checkExtremeTransition(isBuy, intensity, now) {
    const wasExtreme = isBuy ? buyWasExtreme : sellWasExtreme;
    const nowExtreme = intensity >= CFG.EXTREME_THRESHOLD;
    if (nowExtreme && !wasExtreme) {
      const lastAt = isBuy ? buyLastAssaultAt : sellLastAssaultAt;
      if (now - lastAt >= CFG.ASSAULT_COOLDOWN_MS) {
        triggerMassiveAssault(isBuy);
        if (isBuy) buyLastAssaultAt = now;
        else sellLastAssaultAt = now;
      }
    }
    if (isBuy) buyWasExtreme = nowExtreme;
    else sellWasExtreme = nowExtreme;
  }

  function triggerMassiveAssault(isBuy) {
    const soldiers = isBuy ? buySoldiers : sellSoldiers;
    for (let i = 0; i < 4; i++) {
      const origin = pickArrivedSoldier(soldiers, isBuy);
      spawnProjectileAction(isBuy, i % 2 === 0 ? "missile" : "artillery", origin);
    }
    spawnVehicle(isBuy, "jet");
    spawnVehicle(isBuy, "helicopter");
    spawnVehicle(isBuy, "tank");
    shakeAmount = Math.min(9, shakeAmount + 7);
    logFeed(isBuy, "extreme", 0);
  }

  const feedItems = [];
  const FEED_LABEL = {
    grenade: "수류탄전 시작",
    artillery: "포격 시작",
    tank: "탱크 출격",
    helicopter: "공격헬기 출격",
    jet: "전투기 출격",
    missile: "미사일 공격",
    extreme: "MASSIVE ASSAULT",
  };
  function logFeed(isBuy, key, qty) {
    const label = FEED_LABEL[key] || key;
    const suffix = qty ? " (" + qty.toFixed(3) + " BTC)" : "";
    feedItems.unshift({ time: Date.now(), isBuy, text: (isBuy ? "BUY " : "SELL ") + label + suffix });
    if (feedItems.length > FEED_MAX_ITEMS) feedItems.length = FEED_MAX_ITEMS;
    renderFeedDom();
  }
  function renderFeedDom() {
    const feedEl = el("mw-feed");
    if (!feedEl) return;
    feedEl.innerHTML = feedItems
      .map((it) => {
        const t = new Date(it.time);
        const timeStr = String(t.getHours()).padStart(2, "0") + ":" + String(t.getMinutes()).padStart(2, "0") + ":" + String(t.getSeconds()).padStart(2, "0");
        const cls = it.isBuy ? "mw-feed-buy" : "mw-feed-sell";
        return '<div class="mw-feed-item ' + cls + '"><span class="mw-feed-time">' + timeStr + "</span><span>" + it.text + "</span></div>";
      })
      .join("");
  }

  function updatePowerBarDom() {
    const total = buyIntensity + sellIntensity;
    const buyPct = total > 0 ? (buyIntensity / total) * 100 : 50;
    const sellPct = 100 - buyPct;
    const buyEl = el("mw-power-buy");
    const sellEl = el("mw-power-sell");
    const buyPctEl = el("mw-buy-pct");
    const sellPctEl = el("mw-sell-pct");
    if (buyEl) buyEl.style.width = buyPct + "%";
    if (sellEl) sellEl.style.width = sellPct + "%";
    if (buyPctEl) buyPctEl.textContent = Math.round(buyIntensity) + "%";
    if (sellPctEl) sellPctEl.textContent = Math.round(sellIntensity) + "%";
  }

  function updateHudStatus() {
    const statusEl = el("mw-hud-status");
    if (!statusEl) return;
    const top = Math.max(buyIntensity, sellIntensity);
    const leader = buyIntensity >= sellIntensity ? "BUY" : "SELL";
    let text;
    if (top >= CFG.EXTREME_THRESHOLD) text = leader + " EXTREME ASSAULT";
    else if (top >= 65) text = leader + " HEAVY OFFENSIVE";
    else if (top >= 35) text = leader + " ESCALATING";
    else text = "CONTESTED";
    statusEl.textContent = text;
  }

  function onPriceUpdate(payload) {
    if (payload.symbol !== App.Config.getActiveSymbol()) return;
    currentPrice = payload.price;
    priceText = App.Utils.formatCurrencyPlain(payload.price);
    if (centerPrice === null) centerPrice = currentPrice;
    const priceEl = el("mw-hud-price");
    if (priceEl) priceEl.textContent = priceText;
  }
  function onCurrencyChange() {
    /* 다음 price:update 때 priceText가 새 통화로 자연스럽게 갱신됩니다. */
  }

  function onOrderbookUpdate(payload) {
    latestBids = payload.bids || [];
    latestAsks = payload.asks || [];
    const buyDepth = latestBids.reduce((s, b) => s + b.qty, 0);
    const sellDepth = latestAsks.reduce((s, a) => s + a.qty, 0);
    buyDepthPeak = Math.max(buyDepth, buyDepthPeak * 0.999);
    sellDepthPeak = Math.max(sellDepth, sellDepthPeak * 0.999);
  }

  /* ================= 공격 액션(투사체/차량) ================= */
  const KIND_PROFILE = {
    gun: { speed: 0.05, arc: 0.15, scale: 0.55, trail: false },
    grenade: { speed: 0.03, arc: 0.9, scale: 0.8, trail: true },
    artillery: { speed: 0.026, arc: 1.5, scale: 1.1, trail: true },
    missile: { speed: 0.018, arc: 2.6, scale: 1.6, trail: true },
  };

  function spawnProjectileAction(isBuy, kind, origin) {
    const slot = projectilePool.find((p) => !p.active);
    if (!slot) return;
    const profile = KIND_PROFILE[kind];
    const targetX = priceToX(currentPrice !== null ? currentPrice : centerPrice || 0);

    slot.active = true;
    slot.isBuy = isBuy;
    slot.kind = kind;
    slot.x = origin.x;
    slot.z = origin.z;
    slot.targetX = targetX;
    slot.progress = 0;
    slot.speed = profile.speed;
    slot.arcHeight = profile.arc;
    slot.scale = profile.scale;
    slot.mesh.material.color.setHex(isBuy ? COLOR_BUY : COLOR_SELL);
    slot.mesh.scale.setScalar(profile.scale);
    slot.mesh.visible = true;

    if (profile.trail) spawnTrail(slot);
  }

  function spawnTrail(p) {
    const slot = trailPool.find((t) => !t.active);
    if (!slot) return;
    const points = [];
    for (let i = 0; i <= 9; i++) {
      const t = i / 9;
      const x = p.x + (p.targetX - p.x) * t;
      const y = 0.3 + Math.sin(t * Math.PI) * p.arcHeight;
      points.push(new THREE.Vector3(x, y, p.z));
    }
    slot.line.geometry.setFromPoints(points);
    slot.active = true;
    slot.life = 1;
    slot.line.material.opacity = 0.5;
    slot.line.visible = true;
  }

  function spawnExplosion(x, z, isBuy, scale) {
    const slot = explosionPool.find((e) => !e.active);
    if (!slot) return;
    slot.active = true;
    slot.life = 1;
    slot.scale = scale;
    slot.mesh.position.set(x, 0.4, z);
    slot.mesh.material.color.setHex(isBuy ? COLOR_BUY : COLOR_SELL);
    slot.mesh.material.opacity = 0.8;
    slot.mesh.scale.setScalar(0.1);
    slot.mesh.visible = true;
  }

  // 총구 화염 — 아주 짧게(3~4프레임) 반짝이는 작은 평면. 사격 순간 병사 손 위치에서 발생.
  function spawnMuzzleFlash(pos) {
    const slot = muzzleFlashPool.find((m) => !m.active);
    if (!slot) return;
    slot.active = true;
    slot.life = 1;
    slot.mesh.position.copy(pos);
    slot.mesh.material.opacity = 1;
    slot.mesh.visible = true;
  }
  function updateMuzzleFlashes() {
    muzzleFlashPool.forEach((m) => {
      if (!m.active) return;
      m.life -= 0.35;
      if (m.life <= 0) {
        m.active = false;
        m.mesh.visible = false;
        return;
      }
      m.mesh.material.opacity = m.life;
      m.mesh.lookAt(camera.position);
    });
  }

  const VEHICLE_PROFILE = {
    tank: { y: 0.3, approachSpeed: 0.012, retreatSpeed: 0.02, size: [0.9, 0.5, 0.5] },
    helicopter: { y: 2.6, approachSpeed: 0.02, retreatSpeed: 0.03, size: [0.8, 0.3, 0.8] },
    jet: { y: 4.2, approachSpeed: 0.045, retreatSpeed: 0.06, size: [1.2, 0.25, 0.5] },
  };

  function spawnVehicle(isBuy, type) {
    const slot = vehiclePool.find((v) => !v.active);
    if (!slot) return;
    const profile = VEHICLE_PROFILE[type];
    slot.active = true;
    slot.type = type;
    slot.isBuy = isBuy;
    slot.state = "approach";
    slot.fired = false;
    slot.startX = baseX(isBuy);
    const frontX = priceToX(currentPrice !== null ? currentPrice : centerPrice || 0);
    slot.approachTargetX = frontX - (isBuy ? 1.5 : -1.5);
    slot.z = (pseudoRandom(Date.now() % 700, 13) - 0.5) * MAP_HALF_DEPTH * 1.4;
    slot.mesh.scale.set(profile.size[0], profile.size[1], profile.size[2]);
    slot.mesh.material.color.setHex(isBuy ? COLOR_BUY : COLOR_SELL);
    slot.mesh.position.set(slot.startX, profile.y, slot.z);
    slot.mesh.visible = true;
  }

  function updateVehicles() {
    vehiclePool.forEach((v) => {
      if (!v.active) return;
      const profile = VEHICLE_PROFILE[v.type];
      if (v.state === "approach") {
        v.mesh.position.x += (v.approachTargetX - v.mesh.position.x) * profile.approachSpeed;
        const done = Math.abs(v.mesh.position.x - v.approachTargetX) < 0.3;
        if (done && !v.fired) {
          v.fired = true;
          spawnProjectileAction(v.isBuy, v.type === "tank" ? "artillery" : "missile", { x: v.mesh.position.x, z: v.mesh.position.z });
          v.state = "retreat";
        }
      } else if (v.state === "retreat") {
        v.mesh.position.x += (v.startX - v.mesh.position.x) * profile.retreatSpeed;
        if (Math.abs(v.mesh.position.x - v.startX) < 0.5) {
          v.active = false;
          v.mesh.visible = false;
        }
      }
    });
  }

  /* ================= 절차적 텍스처 (장식 전용) ================= */
  function makeSkyTexture() {
    const c = document.createElement("canvas");
    c.width = 2;
    c.height = 256;
    const ctx = c.getContext("2d");
    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, "#080a12");
    grad.addColorStop(0.55, "#141a2c");
    grad.addColorStop(1, "#33415a");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 2, 256);
    return new THREE.CanvasTexture(c);
  }
  function makeGroundTexture() {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 256;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#28331f";
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 1600; i++) {
      const x = pseudoRandom(i, 201) * 256;
      const y = pseudoRandom(i, 202) * 256;
      const light = pseudoRandom(i, 203);
      ctx.fillStyle = light > 0.5 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.09)";
      const s = 1.5 + pseudoRandom(i, 204) * 2.5;
      ctx.fillRect(x, y, s, s);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(16, 12);
    return tex;
  }

  /* ---------------- Three.js 초기화 ---------------- */
  function setupScene() {
    scene = new THREE.Scene();
    scene.background = makeSkyTexture();
    scene.fog = new THREE.Fog(0x141a2c, 20, 46);

    orbit.target = new THREE.Vector3(0, 0, -3);
    camera = new THREE.PerspectiveCamera(52, 1, 0.1, 100);
    updateCameraFromOrbit();

    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });

    scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.7);
    dirLight.position.set(6, 14, 8);
    scene.add(dirLight);

    buildGround();
    buildForest();
    buildTerrainFeatures();
    buildBase(-MAP_HALF_WIDTH + 5, COLOR_BUY);
    buildBase(MAP_HALF_WIDTH - 5, COLOR_SELL);
    buildFrontLine();
    buildPools();
  }

  function buildGround() {
    const groundTex = makeGroundTexture();
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(MAP_HALF_WIDTH * 2, MAP_HALF_DEPTH * 2, 1, 1),
      new THREE.MeshStandardMaterial({ map: groundTex, roughness: 1 })
    );
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    const buyGround = new THREE.Mesh(
      new THREE.PlaneGeometry(MAP_HALF_WIDTH, MAP_HALF_DEPTH * 2),
      new THREE.MeshStandardMaterial({ color: COLOR_BUY, transparent: true, opacity: 0.16, roughness: 1 })
    );
    buyGround.rotation.x = -Math.PI / 2;
    buyGround.position.set(-MAP_HALF_WIDTH / 2, 0.01, 0);
    scene.add(buyGround);
    const sellGround = new THREE.Mesh(
      new THREE.PlaneGeometry(MAP_HALF_WIDTH, MAP_HALF_DEPTH * 2),
      new THREE.MeshStandardMaterial({ color: COLOR_SELL, transparent: true, opacity: 0.16, roughness: 1 })
    );
    sellGround.rotation.x = -Math.PI / 2;
    sellGround.position.set(MAP_HALF_WIDTH / 2, 0.01, 0);
    scene.add(sellGround);
  }

  function buildForest() {
    const TREE_COUNT = 220;
    const treeGeo = new THREE.ConeGeometry(0.22, 0.7, 6);
    const treeMesh = new THREE.InstancedMesh(treeGeo, new THREE.MeshStandardMaterial({ color: 0x24361f, roughness: 1 }), TREE_COUNT);
    const obj = new THREE.Object3D();
    let placed = 0;
    for (let i = 0; i < TREE_COUNT * 2 && placed < TREE_COUNT; i++) {
      const x = (pseudoRandom(i, 61) - 0.5) * MAP_HALF_WIDTH * 1.9;
      const z = (pseudoRandom(i, 62) - 0.5) * MAP_HALF_DEPTH * 1.9;
      if (Math.abs(z - 6) < 1.3) continue;
      if (Math.abs(x) < 4.5) continue;
      obj.position.set(x, 0.35, z);
      obj.scale.setScalar(0.7 + pseudoRandom(i, 63) * 0.7);
      obj.updateMatrix();
      treeMesh.setMatrixAt(placed, obj.matrix);
      placed++;
    }
    for (; placed < TREE_COUNT; placed++) {
      obj.position.set(0, -50, 0);
      obj.updateMatrix();
      treeMesh.setMatrixAt(placed, obj.matrix);
    }
    treeMesh.instanceMatrix.needsUpdate = true;
    scene.add(treeMesh);
  }

  function buildTerrainFeatures() {
    const road = new THREE.Mesh(new THREE.PlaneGeometry(MAP_HALF_WIDTH * 2, 1.4), new THREE.MeshStandardMaterial({ color: 0x33363f, roughness: 1 }));
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0.02, 6);
    scene.add(road);
    for (let i = -MAP_HALF_WIDTH; i <= MAP_HALF_WIDTH; i += 1.4) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.1), new THREE.MeshBasicMaterial({ color: 0xdedede }));
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(i, 0.03, 6);
      scene.add(dash);
    }
    const pond = new THREE.Mesh(new THREE.CircleGeometry(2.4, 24), new THREE.MeshStandardMaterial({ color: 0x2f6f9e, roughness: 0.25, metalness: 0.1 }));
    pond.rotation.x = -Math.PI / 2;
    pond.position.set(-17, 0.03, -10);
    scene.add(pond);
    for (let i = 0; i < 6; i++) {
      const hill = new THREE.Mesh(
        new THREE.SphereGeometry(1.1 + pseudoRandom(i, 71) * 0.9, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: 0x22331f, roughness: 1 })
      );
      hill.position.set(-8 - pseudoRandom(i, 72) * 14, 0, -14 + pseudoRandom(i, 73) * 26);
      scene.add(hill);
    }
    for (let i = 0; i < 6; i++) {
      const hill = new THREE.Mesh(
        new THREE.SphereGeometry(1.1 + pseudoRandom(i, 74) * 0.9, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: 0x1a2a3a, roughness: 1 })
      );
      hill.position.set(8 + pseudoRandom(i, 75) * 14, 0, -14 + pseudoRandom(i, 76) * 26);
      scene.add(hill);
    }
  }

  function buildBase(x, color) {
    const group = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const bx = (pseudoRandom(i, 81) - 0.5) * 3;
      const bz = -10 + (pseudoRandom(i, 82) - 0.5) * 3;
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.9), new THREE.MeshStandardMaterial({ color: 0x3a3f4d }));
      body.position.set(bx, 0.3, bz);
      group.add(body);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(0.7, 0.5, 4), new THREE.MeshStandardMaterial({ color }));
      roof.rotation.y = Math.PI / 4;
      roof.position.set(bx, 0.85, bz);
      group.add(roof);
    }
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.2, 6), new THREE.MeshStandardMaterial({ color: 0x888888 }));
    pole.position.set(0, 1.1, -12);
    group.add(pole);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.55), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
    flag.position.set(0.45, 2, -12);
    group.add(flag);
    group.position.x = x;
    scene.add(group);
  }

  function buildFrontLine() {
    const points = [];
    const SEGMENTS = 24;
    for (let i = 0; i <= SEGMENTS; i++) {
      const z = -MAP_HALF_DEPTH + (i / SEGMENTS) * MAP_HALF_DEPTH * 2;
      const wobble = Math.sin(i * 0.7) * 0.35;
      points.push(new THREE.Vector3(wobble, 0.05, z));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({ color: 0xe3b341, transparent: true, opacity: 0.85 });
    frontLineObj = new THREE.Line(geo, mat);
    frontLineObj.userData.basePoints = points.map((p) => p.clone());
    scene.add(frontLineObj);
  }

  function buildPools() {
    const projGeo = new THREE.SphereGeometry(0.14, 8, 8);
    for (let i = 0; i < MAX_PROJECTILES; i++) {
      const mesh = new THREE.Mesh(projGeo, new THREE.MeshBasicMaterial({ color: COLOR_BUY }));
      mesh.visible = false;
      scene.add(mesh);
      projectilePool.push({ mesh, active: false });
    }
    const explGeo = new THREE.SphereGeometry(1, 10, 10);
    for (let i = 0; i < MAX_EXPLOSIONS; i++) {
      const mesh = new THREE.Mesh(explGeo, new THREE.MeshBasicMaterial({ color: COLOR_BUY, transparent: true, opacity: 0.8 }));
      mesh.visible = false;
      scene.add(mesh);
      explosionPool.push({ mesh, active: false });
    }
    for (let i = 0; i < MAX_TRAILS; i++) {
      const geo = new THREE.BufferGeometry().setFromPoints(new Array(10).fill(0).map(() => new THREE.Vector3()));
      const mat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 });
      const line = new THREE.Line(geo, mat);
      line.visible = false;
      scene.add(line);
      trailPool.push({ line, active: false, life: 0 });
    }
    const vehicleGeo = new THREE.BoxGeometry(1, 1, 1);
    for (let i = 0; i < MAX_VEHICLES; i++) {
      const mesh = new THREE.Mesh(vehicleGeo, new THREE.MeshStandardMaterial({ color: COLOR_BUY }));
      mesh.visible = false;
      scene.add(mesh);
      vehiclePool.push({ mesh, active: false, type: null, state: null });
    }
    const flashGeo = new THREE.PlaneGeometry(0.22, 0.22);
    for (let i = 0; i < MAX_MUZZLE_FLASHES; i++) {
      const mesh = new THREE.Mesh(flashGeo, new THREE.MeshBasicMaterial({ color: 0xfff2a0, transparent: true, opacity: 0, side: THREE.DoubleSide }));
      mesh.visible = false;
      scene.add(mesh);
      muzzleFlashPool.push({ mesh, active: false, life: 0 });
    }
  }

  /* ---------------- 궤도 카메라(드래그=회전, 휠=줌) ---------------- */
  function updateCameraFromOrbit() {
    const x = orbit.radius * Math.sin(orbit.phi) * Math.sin(orbit.theta);
    const y = orbit.radius * Math.cos(orbit.phi);
    const z = orbit.radius * Math.sin(orbit.phi) * Math.cos(orbit.theta);
    camera.position.set(orbit.target.x + x, orbit.target.y + y, orbit.target.z + z);
    camera.lookAt(orbit.target);
  }
  function bindOrbitControls() {
    canvas.addEventListener("pointerdown", (e) => {
      orbit.dragging = true;
      orbit.lastX = e.clientX;
      orbit.lastY = e.clientY;
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch (err) {
        /* noop */
      }
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!orbit.dragging) return;
      const dx = e.clientX - orbit.lastX;
      const dy = e.clientY - orbit.lastY;
      orbit.lastX = e.clientX;
      orbit.lastY = e.clientY;
      orbit.theta -= dx * 0.006;
      orbit.phi = Math.max(PHI_MIN, Math.min(PHI_MAX, orbit.phi - dy * 0.006));
    });
    const endDrag = () => {
      orbit.dragging = false;
    };
    canvas.addEventListener("pointerup", endDrag);
    canvas.addEventListener("pointercancel", endDrag);
    canvas.addEventListener("pointerleave", endDrag);
    canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        orbit.radius = Math.max(RADIUS_MIN, Math.min(RADIUS_MAX, orbit.radius + e.deltaY * 0.02));
      },
      { passive: false }
    );
  }

  function resize() {
    if (!renderer || !wrapEl) return;
    const rect = wrapEl.getBoundingClientRect();
    const pr = Math.min(isMobile ? 1.5 : 2, window.devicePixelRatio || 1);
    renderer.setPixelRatio(pr);
    renderer.setSize(rect.width, rect.height, false);
    camera.aspect = rect.width / Math.max(1, rect.height);
    camera.updateProjectionMatrix();
  }

  function updateRecenter() {
    if (currentPrice === null) return;
    if (centerPrice === null) {
      centerPrice = currentPrice;
      return;
    }
    centerPrice += (currentPrice - centerPrice) * 0.01;
  }

  function updateProjectiles() {
    projectilePool.forEach((p) => {
      if (!p.active) return;
      p.progress += p.speed;
      const arc = Math.sin(Math.min(1, p.progress) * Math.PI) * p.arcHeight;
      const x = p.x + (p.targetX - p.x) * Math.min(1, p.progress);
      p.mesh.position.set(x, 0.3 + arc, p.z);
      if (p.progress >= 1) {
        spawnExplosion(p.targetX, p.z, p.isBuy, p.scale);
        p.active = false;
        p.mesh.visible = false;
      }
    });
  }
  function updateExplosions() {
    explosionPool.forEach((e) => {
      if (!e.active) return;
      e.life -= 0.06;
      if (e.life <= 0) {
        e.active = false;
        e.mesh.visible = false;
        return;
      }
      const s = (1 - e.life) * 1.4 * e.scale + 0.15;
      e.mesh.scale.setScalar(s);
      e.mesh.material.opacity = Math.max(0, e.life) * 0.8;
    });
  }
  function updateTrails() {
    trailPool.forEach((t) => {
      if (!t.active) return;
      t.life -= 0.045;
      if (t.life <= 0) {
        t.active = false;
        t.line.visible = false;
        return;
      }
      t.line.material.opacity = Math.max(0, t.life) * 0.5;
    });
  }
  function updateFrontLine() {
    const frontX = priceToX(currentPrice !== null ? currentPrice : centerPrice || 0);
    const positions = frontLineObj.geometry.attributes.position;
    const base = frontLineObj.userData.basePoints;
    for (let i = 0; i < base.length; i++) {
      positions.setX(i, base[i].x + frontX);
    }
    positions.needsUpdate = true;
  }

  function drawFrame() {
    const now = Date.now();
    const dt = lastFrameTime ? Math.min(0.1, (now - lastFrameTime) / 1000) : 0.016;
    lastFrameTime = now;

    updateRecenter();
    updateFrontLine();
    decayIntensity(dt);
    updateWeaponScheduler(now);

    const buyTarget = targetPopulation(latestBids.reduce((s, b) => s + b.qty, 0), buyDepthPeak);
    const sellTarget = targetPopulation(latestAsks.reduce((s, a) => s + a.qty, 0), sellDepthPeak);
    updateSoldierPopulation(buySoldiers, true, now, dt, buyTarget);
    updateSoldierPopulation(sellSoldiers, false, now, dt, sellTarget);

    updateProjectiles();
    updateExplosions();
    updateTrails();
    updateVehicles();
    updateMuzzleFlashes();
    updateCameraFromOrbit();

    if (shakeAmount > 0.01) {
      camera.position.x += (pseudoRandom(now % 1000, 55) - 0.5) * shakeAmount * 0.02;
      camera.position.y += (pseudoRandom(now % 1000, 56) - 0.5) * shakeAmount * 0.02;
      shakeAmount *= 0.9;
    } else {
      shakeAmount = 0;
    }

    renderer.render(scene, camera);
  }

  function loop() {
    if (!running) return;
    try {
      drawFrame();
    } catch (err) {
      console.error("[market-war.js] drawFrame 에러(다음 프레임은 계속 시도합니다):", err);
    }
    rafId = requestAnimationFrame(loop);
  }
  function start() {
    if (running) return;
    running = true;
    rafId = requestAnimationFrame(loop);
  }
  function stop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
  }
  function onVisibilityChange() {
    if (document.visibilityState === "hidden") stop();
    else start();
  }

  function init() {
    if (typeof THREE === "undefined") {
      console.warn("[market-war.js] Three.js 로드 실패 — MARKET WAR를 건너뜁니다(기존 기능에는 영향 없음).");
      return;
    }
    canvas = el("mw-canvas");
    wrapEl = canvas ? canvas.parentElement : null;
    if (!canvas || !wrapEl) return;

    isMobile = window.innerWidth < 600;

    setupScene();
    bindOrbitControls();
    resize();
    setTimeout(resize, 60);
    setTimeout(resize, 300);
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", onVisibilityChange);

    App.Bus.on("orderbook:update", onOrderbookUpdate);
    App.Bus.on("trade:tick", onTradeTick);
    App.Bus.on("price:update", onPriceUpdate);
    App.Bus.on("currency:change", onCurrencyChange);

    start(); // 지형/카메라 등은 바로 렌더 시작 — 병사 모델은 로딩되는 대로 나중에 나타남

    function beginLoadingSoldiers() {
      loadSoldierModel((ok) => {
        if (!ok) return;
        try {
          buildSoldierPool(buySoldiers, true, MAX_SOLDIER_INSTANCES_PER_SIDE);
          buildSoldierPool(sellSoldiers, false, MAX_SOLDIER_INSTANCES_PER_SIDE);
        } catch (err) {
          console.error("[market-war.js] 병사 풀 생성 중 에러 — 병사가 안 보일 수 있습니다:", err);
        }
      });
    }
    if (typeof GLTFLoader !== "undefined" && typeof SkeletonUtils !== "undefined") {
      beginLoadingSoldiers();
    } else {
      // index.html의 ES모듈 브릿지가 아직 로드를 안 끝냈을 수 있어서 이벤트로 기다립니다.
      window.addEventListener("three-addons-ready", beginLoadingSoldiers, { once: true });
      setTimeout(function () {
        if (!modelReady) beginLoadingSoldiers();
      }, 500); // 혹시 이벤트를 놓쳤을 때의 안전장치
    }
  }

  // 전쟁터가 별도 페이지로 분리되면서, 부팅 시점엔 이 패널이 숨겨져
  // 있을 수 있습니다(display:none인 동안엔 getBoundingClientRect()가
  // 0x0을 반환해서 캔버스가 찌그러진 채로 시작함) — 탭을 눌러서 실제로
  // 보이게 된 다음 이 resize를 다시 호출하면 정상 크기로 잡힙니다.
  return { init, resize };
})();
