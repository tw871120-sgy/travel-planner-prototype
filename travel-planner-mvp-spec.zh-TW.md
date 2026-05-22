# 旅遊規劃器 MVP 規格 v2

本文件基於原始 `spec.md` 收斂而成，目標是支援目前的網頁 MVP prototype，並保留未來擴充 API、LLM 與預約管理的空間。

產品方向：

> 這是一個旅遊規劃顧問，協助使用者把想去的景點轉成合理、可編輯的每日行程。它不是全自動旅行社，而是能給建議、能被調整的規劃助手。

## 1. 原 Spec 處理方式

| 原始項目 | MVP 處理 | 原因 | 狀態 |
| --- | --- | --- | --- |
| FE input | 保留並擴充 | prototype 已證明起床、早餐、梳妝、回住宿會直接影響行程品質。 | MVP |
| Destination DB | 保留，但重整 schema | 原欄位有價值，但需要把 location / planning / display 分清楚。 | MVP |
| KMeans | 改成較抽象的 day grouping | MVP 不應綁死單一聚類演算法；KMeans 未來可作為其中一種實作。 | MVP，可替換 |
| Rule engine | 保留，拆成 hard / soft rules | 時間、距離、用餐、可行性需要穩定檢查。 | MVP |
| Planning LLM | 改成 Advisor 角色 | LLM 負責解釋、建議、取捨，不應作為唯一 planner。 | MVP 先 mock，API later |
| Controller | 簡化 | 完整多輪 replan controller 之後有用，但 MVP 先用 deterministic replan + warnings。 | Later |
| Transportation calculate | 保留抽象層 | MVP 先估算交通時間，未來替換成 Google Maps API。 | Mock now，API later |
| Reservation management | 降級成預約提醒 | MVP 不需要完整預約管理。 | Later |
| PDF | 暫不做 | 驗證規劃價值不需要先匯出 PDF。 | Later |

## 2. MVP 使用者流程

1. 使用者輸入旅行基本資訊：
   - 目的地
   - 旅遊天數
   - 出發日期
   - 預設起床 / 梳妝 / 早餐 / 回住宿時間
   - 旅行節奏

2. 使用者從推薦景點池中選擇想去的地方。

3. 系統生成每日行程：
   - 將景點分配到各天
   - 排列每天景點順序
   - 建立時間軸：起床、出門、景點、用餐、回住宿
   - 檢查 rule violations
   - 顯示 advisor notes

4. 使用者編輯某一天：
   - 起床時間
   - 早餐是否吃、早餐時間
   - 景點固定抵達時間
   - 自訂停留時間

5. 系統只重排受影響的那一天。

6. 若有問題，系統顯示 warnings 與 advisor suggestions。

## 3. MVP Data Schema

### 3.1 TripInput

```ts
type TripInput = {
  destinationQuery: string;
  countryCode?: string;
  city?: string;
  kDays: number;
  startDate: string; // YYYY-MM-DD
  pace: "relaxed" | "balanced" | "packed";
  defaultRoutine: DayRoutineInput;
  preferences?: string[];
};
```

### 3.2 DayRoutineInput

```ts
type DayRoutineInput = {
  wakeTime?: string; // HH:mm。如果有 departureTime，可選填。
  departureTime: string; // HH:mm
  prepMinutes: number;
  breakfastMinutes: number; // 0 代表不吃早餐
  homeTime: string; // HH:mm
};
```

### 3.3 Destination

```ts
type Destination = {
  id: string;
  source: "mock" | "google_places" | "manual" | "ai_recommendation";
  sourcePlaceId?: string;
  name: string;
  location: {
    countryCode: string;
    countryName?: string;
    city: string;
    area?: string;
    address?: string;
    lat: number;
    lng: number;
  };
  category: "attraction" | "food" | "shopping" | "nature" | "culture" | "experience" | "hotel" | "transport";
  display: {
    rating?: number;
    tags: string[];
    priceHint?: number;
    description?: string;
  };
  planning: {
    defaultStayMinutes: number;
    importance?: 1 | 2 | 3 | 4 | 5;
    intensity?: "low" | "medium" | "high";
    openingHours?: OpeningHours[];
    bestTimeWindows?: TimeWindow[];
    needsReservation?: boolean;
    reservationInfo?: ReservationInfo;
    mealFriendly?: boolean;
  };
};
```

### 3.4 OpeningHours 與 TimeWindow

```ts
type OpeningHours = {
  dayOfWeek: number; // 0-6
  openTime: string; // HH:mm
  closeTime: string; // HH:mm
  isClosed?: boolean;
};

type TimeWindow = {
  label: string; // "sunrise", "night_view", "market_morning"
  earliestTime?: string; // HH:mm
  latestTime?: string; // HH:mm
  preferredTime?: string; // HH:mm
  reason?: string;
};
```

### 3.5 ReservationInfo

```ts
type ReservationInfo = {
  phone?: string;
  website?: string;
  note?: string;
};
```

### 3.6 User Overrides

```ts
type DayOverride = {
  dayIndex: number;
  wakeTime?: string;
  breakfastMinutes?: number;
};

type DestinationOverride = {
  destinationId: string;
  dayIndex: number;
  fixedArrivalTime?: string;
  customStayMinutes?: number;
  lockToDay?: boolean;
};
```

## 4. Planner Pipeline

### 4.1 MVP Pipeline

```text
TripInput + selected destinations
→ day grouping
→ day ordering
→ timeline build
→ rule check
→ advisor note
→ render itinerary
```

### 4.2 建議內部函式

```ts
groupDestinationsByDay(input, destinations): DayCandidate[]
orderDay(candidate, overrides): OrderedDay
buildTimeline(orderedDay, routine, overrides): TimelineDay
validateTimeline(timelineDay): RuleCheckResult
buildAdvisorNote(timelineDay, ruleCheck): AdvisorNote
```

目前 prototype 有部分 ordering 與 timeline logic 混在一起。正式實作應拆開，方便後續替換 API、演算法與 LLM。

### 4.3 Day Grouping Algorithm v1

本算法使用 heuristic points（啟發式分數點數），分數只用於比較方案，不代表真實時間、距離或金額。

核心原則：

```text
Algorithm 排行程，Rule-based 查問題，LLM 解釋與協商。
系統初排是 suggestion；只有使用者明確移動、鎖定時間或回填預約，才會變成 constraint。
```

#### 4.3.1 整體流程

1. 城市 / 區域 / 大景點分 bucket
   - 依 `location.city`、`location.area`、`planning.defaultStayMinutes`、`planning.intensity`、`category` 初步分組。
   - 大景點如主題樂園可獨立成 bucket，避免一開始就和一般市區景點混排。

2. bucket 內計算 `pairScore`
   - 判斷兩個景點是否適合同一天。
   - 距離是重要因素，但不單獨主導分組。

3. 用 `anchorScore` 選 day group anchor
   - anchor 是一天或一個 day group 的核心景點，不一定是最熱門，而是最難安排、最影響當天結構的點。
   - 大景點可獨立。
   - 偏遠點可獨立。
   - 有特殊推薦時段的點會提高優先度。
   - 若兩個高分點距離近、時段不衝突，不應強行拆成不同 group。

4. 用 `pairScore` 把剩餘景點分配到 group
   - 同城市、同區域、距離近、類型相容、時段相容加分。
   - 大景點與其他景點混排扣分。
   - 多個高強度景點放一起扣分。

5. 檢查容量
   - 景點數。
   - 景點停留時間。
   - 旅遊類型與旅行節奏上限。

6. 超載 / 空白天修正
   - 超載時，用 move scoring 搬走低風險景點。
   - 若使用者提供更多天數，且仍有空白天，則把過大的自然 group 拆開使用空白天。
   - 不移使用者指定點、已鎖定時間點、大景點 anchor。
   - 目標不是每天硬平均，而是避免少數天過度壓縮、其他天完全閒置。

7. `orderDay()` 每天內排序
   - `fixedArrivalTime` 先固定。
   - morning window 放前面。
   - meal / market window 靠近中午。
   - evening / night window 放後面。
   - flexible 景點用距離排序填中間。
   - 若距離排序和時段偏好衝突，先保留時段偏好，再由 `validateTimeline()` 提醒交通問題。

8. `buildTimeline()`
   - 用排序結果產生完整時間軸。
   - 加入起床、出門、第一站交通、景點、午餐、晚餐、回住宿。
   - 不會因為 `bestTimeWindows` 自動空等到推薦時間。

9. `validateTimeline()`
   - Rule-based 檢查硬限制。
   - 另外檢查 soft preference。
   - 例如：「梅田藍天大廈建議 18:00 夜景，但目前 09:50 抵達，體驗可能不符預期。」

10. LLM Advisor
   - 根據 warning 解釋問題。
   - 提供修改建議。
   - 例如：「建議把梅田藍天大廈移到晚餐前，或與 Day 1 的晚間點交換。」

#### 4.3.2 anchorScore

`anchorScore` 用來判斷一個景點是否適合成為 day group 的核心。

```text
anchorScore(destination)
= importanceScore
+ stayDurationScore
+ intensityScore
+ timeWindowScore
+ categoryScore
+ preferenceScore
```

計分：

| 項目 | 使用資料 | 分數 | 邏輯 |
| --- | --- | --- | --- |
| importanceScore | `planning.importance` | `importance * 10` | 重要度越高，越應該先安置。 |
| stayDurationScore | `planning.defaultStayMinutes` | `>= 300` 分鐘 `+40`；`>= 180` 分鐘 `+20` | 停留越久，越難塞進既有行程。 |
| intensityScore | `planning.intensity` | `high +20`；`medium +10` | 高強度景點會影響當天負荷。 |
| timeWindowScore | `planning.bestTimeWindows` | 有推薦時段 `+20` | 有日出、夜景、市場早上等時段特性時，較需要優先安置。這不是檢查當天是否有空。 |
| categoryScore | `category`、`planning.mealFriendly` | `experience +20`；`culture +10`；`photo + bestTimeWindows +15`；`food + mealFriendly +10` | 類型代表景點對行程結構的影響。例如大型體驗常吃掉大段時間，文化核心常適合當白天主軸，夜景展望會影響傍晚安排。 |
| preferenceScore | `preferences` | 符合使用者偏好 `+10` | 使用者勾選的偏好類別提高優先度。 |

例子：

```text
日本環球影城：
importance 5 => +50
stay 420 => +40
intensity high => +20
category experience => +20
anchorScore = 130
```

```text
黑門市場：
importance 3 => +30
stay 75 => +0
intensity medium => +10
bestTimeWindows 10:00 => +20
food + mealFriendly => +10
若使用者偏好 food => +10
anchorScore = 80
```

#### 4.3.3 pairScore

`pairScore` 用來判斷兩個景點是否適合同一天。

```text
pairScore(a, b)
= cityScore
+ areaScore
+ distanceScore
+ categoryScore
+ tagScore
+ mealFriendlyScore
- highIntensityPenalty
- largeDestinationPenalty
- timeWindowConflictPenalty
```

計分：

| 項目 | 使用資料 | 分數 | 邏輯 |
| --- | --- | --- | --- |
| cityScore | `location.city` | 同城市 `+30`；不同城市 `-35` | 跨城市通常不適合同一天，除非使用者明確安排。 |
| areaScore | `location.area` | 同區域 `+20` | 同區域代表可自然串成半日或一日路線。 |
| distanceScore | `location.lat/lng` 推估交通 | `<=15` 分 `+30`；`<=25` 分 `+20`；`<=35` 分 `+10`；`>35` 分 `-20` | 交通越短越適合同一天。 |
| categoryScore | `category` | 同類型 `+5` | 同類型代表使用情境接近，例如兩個文化點或兩個購物點，因此小幅加分。分數刻意較低，避免同類型因素壓過距離、區域、容量與時間限制。 |
| tagScore | `display.tags` | 每個共同 tag `+4`，最多 `+12` | tag 是比 category 更細的語意。例如 `美食`、`街區`、`夜景`、`好拍`。共同 tag 越多，代表體驗語境越接近，因此加分；但設上限，避免 tag 數量過度主導分組。 |
| mealFriendlyScore | `planning.mealFriendly` | 任一景點 mealFriendly `+5` | 有餐食友善點時，較容易和午餐 / 晚餐時間銜接。 |
| highIntensityPenalty | `planning.intensity` | 兩個都是 high `-20` | 避免一天排太多高強度活動。 |
| largeDestinationPenalty | `isLargeDestination()` | 任一景點是大景點 `-25` | 大景點通常需要大段時間，不適合和太多一般景點混排。 |
| timeWindowConflictPenalty | `planning.bestTimeWindows` | 兩個都有非 flexible 且同時段類型 `-10` | 例如兩個都想排傍晚，可能互相競爭黃金時段。 |

`categoryScore` 和 `tagScore` 的差別：

```text
category 是主類型，只能有一個，代表景點的大方向。
tags 是細部語意，可以有多個，代表景點的體驗特徵。
```

例子：

```text
道頓堀：
category = food
tags = ["美食", "夜景"]

黑門市場：
category = food
tags = ["市場", "美食"]

pairScore 中：
同 category food => +5
共同 tag 美食 => +4
```

這表示它們不只同屬美食，也共享「美食」體驗語境，因此更適合同一天。

#### 4.3.4 move scoring

move scoring 用來判斷某個景點從原本那天移到目標 day 是否合理。

```text
moveScore(candidate, targetDay)
= targetDayAvailability
+ capacityFit
+ pairCompatibility
- crossCityPenalty
- largeDestinationMixPenalty
```

使用者指定 / 鎖定時間不進候選，因此不是扣分，而是直接不移。

計分：

| 項目 | 分數 | 邏輯 |
| --- | --- | --- |
| targetDayAvailability | 目標 day 空白 `+75` | 鼓勵使用空白天，避免少數天過度壓縮。 |
| capacityFit | 放入後不超過 `maxSightseeingMinutes` 則 `+35`；超過則每 10 分鐘扣 1 分 | 放入後仍可玩，才適合移動。 |
| pairCompatibility | candidate / group 與目標 day 既有景點的最佳 `pairScore` 平均 | 越能和目標 day 既有景點自然結合，分數越高。空白 day 為 0。 |
| crossCityPenalty | 若目標 day 已有不同城市景點 `-25` | 避免不必要跨城市混排。 |
| largeDestinationMixPenalty | 若目標 day 已有大景點，或 candidate / group 有大景點 `-35` | 避免破壞大景點的一日結構。 |

候選景點選擇：

```text
先排除使用者指定點、鎖定時間點、大景點。
再依 anchorScore 由低到高排序。
anchorScore 越低，越優先被移走。
```

## 5. Timeline Schema

```ts
type TimelineDay = {
  dayIndex: number;
  date: string;
  routine: DayRoutineInput;
  items: TimelineItem[];
  stats: {
    totalStayMinutes: number;
    totalTransportMinutes: number;
    totalMealMinutes: number;
    estimatedReturnTime: string;
  };
  ruleCheck: RuleCheckResult;
  advisorNote?: AdvisorNote;
};
```

```ts
type TimelineItem =
  | WakeItem
  | DepartureItem
  | DestinationItem
  | MealPlaceholderItem
  | TransportItem
  | ReturnHomeItem;
```

```ts
type DestinationItem = {
  type: "destination";
  destinationId: string;
  name: string;
  startTime: string;
  endTime: string;
  stayMinutes: number;
  isFixedTime?: boolean;
};

type MealPlaceholderItem = {
  type: "meal";
  mealType: "breakfast" | "lunch" | "dinner";
  startTime: string;
  endTime: string;
  bufferMinutes: number; // 交通 / 找餐廳緩衝
  mealMinutes: number;
  restaurantDestinationId?: string; // MVP 可為空
};
```

## 6. Rule-Based Checks

### 6.1 Hard Rules

Hard rules 是 deterministic checks，應由程式穩定檢查。

| Rule code | 說明 | MVP 行為 |
| --- | --- | --- |
| missing_required_location | 景點缺 lat/lng/city/country | 阻擋規劃 |
| duplicate_destination | 同一天出現重複景點 | warning 或 dedupe |
| invalid_time_format | 時間欄位格式錯誤 | 阻擋規劃 |
| fixed_time_unreachable | 固定抵達時間來不及 | warning，保留使用者選擇 |
| outside_opening_hours | 景點被排在營業時間外 | warning |
| return_after_home_time | 預估回住宿晚於 homeTime | warning |
| too_many_destinations | 當天景點數超過旅行節奏上限 | warning |

### 6.2 Soft Rules

Soft rules 可先由程式偵測，再交給 AI 解釋與建議。

| Rule code | 說明 | MVP 行為 |
| --- | --- | --- |
| long_transport | 兩景點間交通時間過長 | warning |
| day_too_tiring | 當天總活動時間過高 | warning |
| meal_too_early_or_late | 午餐 / 晚餐時間不自然 | warning |
| early_wake_up | 起床時間過早 | warning |
| island_destination | 某景點離當天其他點太遠 | warning |

## 7. 用餐處理

MVP 中，餐食先作為 placeholder。

### 7.1 早餐

早餐是 day-level routine setting。

- `breakfastMinutes = 0` 代表不吃早餐。
- 使用者可以每天單獨覆寫早餐設定。
- 早餐會影響起床與出門時間。

### 7.2 午餐與晚餐

午餐與晚餐是 timeline placeholder。

MVP 行為：

```text
meal placeholder = 20 分鐘交通/找餐廳緩衝 + 60 分鐘用餐
```

未來行為：

```text
用真實餐廳 destination 替換 placeholder
使用 API 計算實際交通時間
檢查營業時間與是否需要預約
```

## 8. LLM Advisor 邊界

MVP 中，LLM 不應是唯一 planner。

### 8.1 LLM Input

```ts
type AdvisorInput = {
  tripInput: TripInput;
  day: TimelineDay;
  ruleViolations: RuleViolation[];
  userOverrides: {
    dayOverrides: DayOverride[];
    destinationOverrides: DestinationOverride[];
  };
};
```

### 8.2 LLM Output

```ts
type AdvisorNote = {
  severity: "info" | "warning" | "critical";
  summary: string;
  suggestions: string[];
  suggestedActions?: AdvisorAction[];
};
```

```ts
type AdvisorAction =
  | { type: "remove_destination"; destinationId: string; reason: string }
  | { type: "move_destination"; destinationId: string; targetDayIndex: number; reason: string }
  | { type: "adjust_wake_time"; dayIndex: number; wakeTime: string; reason: string }
  | { type: "extend_home_time"; dayIndex: number; homeTime: string; reason: string };
```

### 8.3 目前 Prototype 狀態

目前 advisor note 是根據 rule result 產生的 mock 文案。

正式行為應將以下資料傳給 LLM：

- timeline
- rule violations
- fixed-time constraints
- user preferences
- possible actions

LLM 負責解釋取捨與提出 action。系統套用 action 前仍要再跑 rule validation。

## 9. API Integration Plan

API 建議在 schema 與 MVP flow 穩定後再接。

### 9.1 Google Places

用途：

- place search
- place details
- address
- lat/lng
- rating
- opening hours
- phone/website when available

Mapping target：`Destination`

### 9.2 Google Maps Routes / Distance Matrix

用途：

- timeline items 之間的交通時間
- 交通方式候選
- 替換 mock `distanceMinutes`

Mapping target：transport items and rule checks

## 10. Acceptance Criteria

### 10.1 Generate Itinerary

Given selected destinations and trip input:

- system creates `kDays` itinerary days
- each selected destination appears once
- each day contains wake up, departure, destination items, and return home
- lunch/dinner placeholders appear when the day crosses meal windows
- warnings are shown if rules are violated

### 10.2 Edit Wake and Breakfast

Given a generated day:

- user can edit wake time
- user can set breakfast to no breakfast
- only that day is recalculated
- departure time updates based on wake + prep + breakfast
- other days remain unchanged

### 10.3 Edit Destination Time

Given a destination in a day:

- user can set fixed arrival time
- user can change stay duration
- only that day is recalculated
- fixed destination keeps the selected time
- wake/departure may be pulled earlier if needed
- warnings are shown if the day becomes unreasonable

### 10.4 Meal Placeholder

Given a day that crosses meal time:

- lunch/dinner placeholder is inserted
- placeholder includes restaurant/transport buffer
- placeholder can later be replaced by a real restaurant destination

### 10.5 Advisor Note

Given rule warnings:

- advisor note summarizes why the day may be problematic
- advisor suggests concrete tradeoffs
- advisor does not silently modify itinerary without validation

## 11. Non-MVP

以下項目先延後：

- 完整預約管理
- PDF export
- user login
- database persistence
- Google API production integration
- automatic alarm setting
- fully autonomous multi-step LLM replan controller
- full restaurant recommendation and booking flow

## 12. Next Development Tasks

建議開發順序：

1. Refactor mock data to `Destination` schema.
2. Refactor planner into `groupDestinationsByDay`, `buildTimeline`, `validateTimeline`.
3. Update UI to render schema-based timeline items.
4. Replace mock advisor note with structured `AdvisorInput` and mocked `AdvisorOutput`.
5. Add Google Places mapping behind a feature flag or mocked adapter.
