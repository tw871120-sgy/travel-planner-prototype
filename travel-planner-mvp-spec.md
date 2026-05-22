# Travel Planner MVP Spec v2

This spec is based on the original `spec.md`, but narrowed for an MVP web prototype.

The product direction is:

> A travel planning assistant that helps users turn selected places into a reasonable, editable day-by-day itinerary. It is not fully automatic; it behaves like a planning consultant.

## 1. Spec Review

| Original area | MVP decision | Reason | Status |
| --- | --- | --- | --- |
| FE input | Keep and expand | The current prototype proves daily routine settings affect itinerary quality. | MVP |
| Destination DB | Keep, but restructure | Current fields are useful, but need clearer location/planning/display grouping. | MVP |
| KMeans | Generalize to day grouping | MVP should not depend on one clustering algorithm. KMeans can be one implementation later. | MVP, replaceable |
| Rule engine | Keep, split hard/soft | Rules are needed for reliable time, distance, meals, and feasibility checks. | MVP |
| Planning LLM | Change role to Advisor | LLM should explain and suggest tradeoffs, not be the only planner. | MVP mock, API later |
| Controller | Simplify | Full replan controller is useful later, but MVP can use deterministic replan + warnings. | Later |
| Transportation calculate | Keep abstraction | MVP can use estimated travel time; later replace with Google Maps API. | Mock now, API later |
| Reservation management | Reduce to reminders | Full reservation tracking is not needed for initial flow. | Later |
| PDF | Exclude | Export is not required to validate planning value. | Later |

## 2. MVP User Flow

1. User enters trip basics:
   - destination
   - travel days
   - start date
   - default wake/prep/breakfast/home time
   - pace preference

2. User selects places from a recommended place pool.

3. System generates a day-by-day itinerary:
   - groups places by day
   - orders places within each day
   - creates a timeline with wake up, departure, places, meals, and return to accommodation
   - checks rule violations
   - shows advisor notes

4. User edits a day:
   - wake time
   - breakfast yes/no and duration
   - fixed arrival time for a place
   - custom stay duration

5. System replans only the affected day.

6. If there are issues, system shows warnings and advisor suggestions.

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
  wakeTime?: string; // HH:mm. Optional if departureTime exists.
  departureTime: string; // HH:mm
  prepMinutes: number;
  breakfastMinutes: number; // 0 means no breakfast
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

### 3.4 OpeningHours and TimeWindow

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

### 4.1 Current MVP Pipeline

```text
TripInput + selected destinations
→ day grouping
→ day ordering
→ timeline build
→ rule check
→ advisor note
→ render itinerary
```

### 4.2 Recommended Internal Functions

```ts
groupDestinationsByDay(input, destinations): DayCandidate[]
orderDay(candidate, overrides): OrderedDay
buildTimeline(orderedDay, routine, overrides): TimelineDay
validateTimeline(timelineDay): RuleCheckResult
buildAdvisorNote(timelineDay, ruleCheck): AdvisorNote
```

The prototype currently mixes some ordering and timeline logic together. The formal implementation should separate them.

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
  bufferMinutes: number; // traffic / finding restaurant
  mealMinutes: number;
  restaurantDestinationId?: string; // empty in MVP
};
```

## 6. Rule-Based Checks

### 6.1 Hard Rules

Hard rules are deterministic and should be checked by code.

| Rule code | Description | MVP behavior |
| --- | --- | --- |
| missing_required_location | Destination missing lat/lng/city/country | Block planning |
| duplicate_destination | Same destination appears twice in same day | Warn or dedupe |
| invalid_time_format | Invalid HH:mm field | Block planning |
| fixed_time_unreachable | Fixed arrival time cannot be reached | Warning, keep user choice |
| outside_opening_hours | Destination scheduled outside opening hours | Warning |
| return_after_home_time | Estimated return later than home time | Warning |
| too_many_destinations | Day has more places than pace allows | Warning |

### 6.2 Soft Rules

Soft rules can be checked by code first, then explained by AI.

| Rule code | Description | MVP behavior |
| --- | --- | --- |
| long_transport | Transport between two destinations is long | Warning |
| day_too_tiring | Total active time is high | Warning |
| meal_too_early_or_late | Lunch/dinner is outside normal time | Warning |
| early_wake_up | Wake time is very early | Warning |
| island_destination | One place is far from the rest of the day | Warning |

## 7. Meal Handling

Meals are placeholders in MVP.

### 7.1 Breakfast

Breakfast is a day-level routine setting.

- `breakfastMinutes = 0` means no breakfast.
- User can override breakfast per day.
- Breakfast affects wake/departure time.

### 7.2 Lunch and Dinner

Lunch and dinner are timeline placeholders.

MVP behavior:

```text
meal placeholder = 20 min transport/finding restaurant buffer + 60 min meal
```

Later behavior:

```text
replace placeholder with real restaurant destination
calculate actual transport using API
validate opening hours and reservation need
```

## 8. LLM Advisor Boundary

The LLM should not be the sole planner in MVP.

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

### 8.3 Current Prototype Status

Current advisor notes are mocked from rule results.

Production behavior should call an LLM with:

- timeline
- rule violations
- fixed-time constraints
- user preferences
- possible actions

The LLM should explain tradeoffs and propose actions. The system should still validate any proposed action with rules before applying it.

## 9. API Integration Plan

API should come after schema and MVP flow are stable.

### 9.1 Google Places

Use for:

- place search
- place details
- address
- lat/lng
- rating
- opening hours
- phone/website when available

Map to `Destination`.

### 9.2 Google Maps Routes / Distance Matrix

Use for:

- travel time between timeline items
- transport mode candidates
- replacing mock `distanceMinutes`

Map to transport items and rule checks.

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

These are intentionally delayed:

- full reservation management
- PDF export
- user login
- database persistence
- Google API production integration
- automatic alarm setting
- fully autonomous multi-step LLM replan controller
- full restaurant recommendation and booking flow

## 12. Next Development Tasks

Recommended order:

1. Refactor mock data to `Destination` schema.
2. Refactor planner into `groupDestinationsByDay`, `buildTimeline`, `validateTimeline`.
3. Update UI to render schema-based timeline items.
4. Replace mock advisor note with structured `AdvisorInput` and mocked `AdvisorOutput`.
5. Add Google Places mapping behind a feature flag or mocked adapter.
