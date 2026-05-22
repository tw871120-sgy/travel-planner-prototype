let destinations = window.destinationDatabase || [];
const spotListEl = document.querySelector("#spot-list");
const formEl = document.querySelector("#planner-form");
const itineraryEl = document.querySelector("#itinerary");
const warningsEl = document.querySelector("#warnings");
const summaryEl = document.querySelector("#summary");
const spotSearchEl = document.querySelector("#spot-search");
const pageSizeEl = document.querySelector("#page-size");
const spotCountEl = document.querySelector("#spot-count");
const prevPageEl = document.querySelector("#prev-page");
const nextPageEl = document.querySelector("#next-page");
const pageInfoEl = document.querySelector("#page-info");
const selectedListEl = document.querySelector("#selected-list");
const clearSelectedEl = document.querySelector("#clear-selected");
const resetDefaultSelectedEl = document.querySelector("#reset-default-selected");
const weatherSummaryEl = document.querySelector("#weather-summary");
const weatherListEl = document.querySelector("#weather-list");
const outfitNoteEl = document.querySelector("#outfit-note");
const checklistSummaryEl = document.querySelector("#checklist-summary");
const checklistListEl = document.querySelector("#checklist-list");
const algorithmNotesEl = document.querySelector("#algorithm-notes");
const tabButtons = document.querySelectorAll(".tab-button");
const sheets = document.querySelectorAll(".sheet");
const planMapEl = document.querySelector("#plan-map");
const mapDayFilterEl = document.querySelector("#map-day-filter");
const mapZoomOutEl = document.querySelector("#map-zoom-out");
const mapZoomInEl = document.querySelector("#map-zoom-in");
const mapZoomResetEl = document.querySelector("#map-zoom-reset");

const dayColors = ["#27615c", "#b7472a", "#4d6f9f", "#8b5a2b", "#6b5fa7", "#2f7d4f"];

let currentPlan = null;
let currentSettings = null;
let currentPage = 1;
let weatherRequestId = 0;
let mapZoom = 1;
const destinationOverrides = {};
const dayOverrides = {};
const mealOverrides = {};
const manualDayAssignments = {};
const stableDayAssignments = {};
const manualDayOrders = {};
const checklistState = {};
const reservationState = {};
const defaultSelectedDestinationIds = [
  "osaka-dotonbori",
  "osaka-castle",
  "osaka-umeda-sky",
  "osaka-shinsekai",
  "osaka-kuromon",
  "osaka-namba-parks",
  "osaka-usj",
  "osaka-sumiyoshi",
  "osaka-shinsaibashi",
  "kyoto-kiyomizu",
  "kyoto-fushimi-inari",
];
const selectedStorageKey = "travelPlanner.selectedDestinationIds.v2";
const flightInputStorageKey = "travelPlanner.flightInputs.v1";

function loadSelectedDestinationIds() {
  const saved = localStorage.getItem(selectedStorageKey);
  if (!saved) return defaultSelectedDestinationIds;
  try {
    const parsed = JSON.parse(saved);
    if (Array.isArray(parsed)) return parsed.filter((id) => destinations.some((destination) => destination.id === id));
  } catch (error) {
    localStorage.removeItem(selectedStorageKey);
  }
  return defaultSelectedDestinationIds;
}

function saveSelectedDestinationIds() {
  localStorage.setItem(selectedStorageKey, JSON.stringify([...selectedDestinationIds]));
}

function flightInputFields() {
  return [
    "arrival-date",
    "arrival-time",
    "arrival-airport",
    "arrival-buffer",
    "arrival-flow",
    "hotel-buffer",
    "departure-date",
    "departure-flight-time",
    "departure-airport",
    "departure-buffer",
  ];
}

function loadFlightInputs() {
  try {
    const saved = JSON.parse(localStorage.getItem(flightInputStorageKey) || "{}");
    flightInputFields().forEach((id) => {
      const input = document.querySelector(`#${id}`);
      if (input && saved[id] !== undefined) input.value = saved[id];
    });
  } catch (error) {
    localStorage.removeItem(flightInputStorageKey);
  }
}

function saveFlightInputs() {
  const values = flightInputFields().reduce((state, id) => {
    const input = document.querySelector(`#${id}`);
    if (input) state[id] = input.value;
    return state;
  }, {});
  localStorage.setItem(flightInputStorageKey, JSON.stringify(values));
}

const selectedDestinationIds = new Set(loadSelectedDestinationIds());
let draggedDestination = null;

const cityNames = {
  osaka: "大阪",
  kyoto: "京都",
  tokyo: "東京",
  seoul: "首爾",
};

const airportProfiles = {
  KIX: { code: "KIX", name: "關西機場", city: "osaka", lat: 34.4347, lng: 135.2441, defaultToHotelMinutes: 75, defaultToCityCenterMinutes: 70 },
  ITM: { code: "ITM", name: "大阪伊丹機場", city: "osaka", lat: 34.7855, lng: 135.4382, defaultToHotelMinutes: 45, defaultToCityCenterMinutes: 40 },
  HND: { code: "HND", name: "羽田機場", city: "tokyo", lat: 35.5494, lng: 139.7798, defaultToHotelMinutes: 45, defaultToCityCenterMinutes: 40 },
  NRT: { code: "NRT", name: "成田機場", city: "tokyo", lat: 35.7720, lng: 140.3929, defaultToHotelMinutes: 90, defaultToCityCenterMinutes: 85 },
  ICN: { code: "ICN", name: "仁川機場", city: "seoul", lat: 37.4602, lng: 126.4407, defaultToHotelMinutes: 75, defaultToCityCenterMinutes: 70 },
};

const cityWeatherProfiles = {
  osaka: { cityName: "大阪", lat: 34.6937, lng: 135.5023 },
  kyoto: { cityName: "京都", lat: 35.0116, lng: 135.7681 },
  tokyo: { cityName: "東京", lat: 35.6762, lng: 139.6503 },
  seoul: { cityName: "首爾", lat: 37.5665, lng: 126.9780 },
};

const travelProfileLimits = {
  family: { label: "家庭 / 長輩", maxOutingMinutes: 600, maxSightseeingMinutes: 300, dinnerLatest: "19:30" },
  friends: { label: "朋友出遊", maxOutingMinutes: 720, maxSightseeingMinutes: 420, dinnerLatest: "20:30" },
  solo: { label: "獨旅", maxOutingMinutes: 780, maxSightseeingMinutes: 480, dinnerLatest: "21:00" },
  company: { label: "員工旅遊", maxOutingMinutes: 660, maxSightseeingMinutes: 360, dinnerLatest: "20:00" },
};

const paceLimitAdjustments = {
  relaxed: { outing: -60, sightseeing: -60, destinationDelta: -1 },
  balanced: { outing: 0, sightseeing: 0, destinationDelta: 0 },
  packed: { outing: 60, sightseeing: 60, destinationDelta: 1 },
};

const destinationDescriptions = {
  "osaka-dotonbori": "大阪經典美食街區，適合排在晚餐或夜景散步時段。",
  "osaka-castle": "大阪代表性歷史景點，適合與大阪城公園一起安排。",
  "osaka-umeda-sky": "梅田展望景點，傍晚或夜景時段體驗較好。",
  "osaka-shinsekai": "復古街區與串炸美食集中，適合接在天王寺周邊。",
  "osaka-kuromon": "市場型美食點，適合午餐或小吃，不宜排太晚。",
  "osaka-namba-parks": "難波商場與休息點，可作為逛街或雨天備案。",
  "osaka-usj": "大型主題樂園，通常需要預留一整天或大半天。",
  "osaka-sumiyoshi": "安靜的神社景點，位置較南，適合單獨成段安排。",
  "osaka-shinsaibashi": "大阪主要購物街區，適合與道頓堀、難波一起排。",
  "tokyo-sensoji": "東京經典寺院與街區景點，適合搭配晴空塔。",
  "tokyo-skytree": "東京展望景點，可接淺草或押上周邊。",
  "tokyo-shibuya": "東京代表性街區，適合購物、拍照與夜間散步。",
  "tokyo-meiji": "原宿旁的森林神社，適合安排較輕鬆的上午。",
  "tokyo-ginza": "高密度購物與餐飲區，適合午後或晚餐前後。",
  "tokyo-tsukiji": "市場美食點，早上到中午最適合。",
  "seoul-gyeongbok": "首爾代表宮殿景點，適合與北村韓屋村同天。",
  "seoul-bukchon": "韓屋街區，適合散步拍照但要注意居民區禮儀。",
  "seoul-myeongdong": "購物與美食集中區，適合傍晚到晚上。",
  "seoul-namsan": "首爾展望與夜景景點，常作為晚間行程。",
  "seoul-hongdae": "年輕商圈與美食街區，適合晚餐後散步。",
  "seoul-coex": "江南室內購物與拍照點，適合雨天或輕鬆行程。",
};

destinations.forEach((destination) => {
  destination.display.description ||= destinationDescriptions[destination.id] || "適合加入自由行規劃的候選景點。";
});

function switchTab(tabName) {
  tabButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === tabName);
  });
  sheets.forEach((sheet) => {
    sheet.classList.toggle("active", sheet.dataset.sheet === tabName);
  });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function selectedCities() {
  return [...document.querySelectorAll('[name="city"]:checked')].map((input) => input.value);
}

function destinationsForSelectedCities() {
  const cities = selectedCities();
  return destinations.filter((destination) => cities.includes(destination.location.city));
}

function filteredDestinations() {
  const query = spotSearchEl.value.trim().toLowerCase();
  const pool = destinationsForSelectedCities();
  if (!query) return pool;
  return pool.filter((destination) => {
    const searchable = [
      destination.name,
      destination.location.cityName,
      destination.location.area,
      destination.display.description,
      destination.category,
      ...destination.display.tags,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return searchable.includes(query);
  });
}

function renderSpots() {
  const visibleDestinations = filteredDestinations();
  const selectedCityNames = selectedCities().map((city) => cityNames[city]).join("、");
  spotSearchEl.placeholder = selectedCityNames ? `目前展示：${selectedCityNames}，可搜尋景點、區域或標籤` : "請先勾選目的地";
  const pageSize = Number(pageSizeEl.value);
  const totalPages = Math.max(1, Math.ceil(visibleDestinations.length / pageSize));
  currentPage = Math.min(currentPage, totalPages);
  const start = (currentPage - 1) * pageSize;
  const pageDestinations = visibleDestinations.slice(start, start + pageSize);

  spotCountEl.textContent = `符合條件 ${visibleDestinations.length} 個景點，每頁 ${pageSize} 筆，共 ${totalPages} 頁。`;
  pageInfoEl.textContent = `第 ${currentPage} / ${totalPages} 頁`;
  prevPageEl.disabled = currentPage <= 1;
  nextPageEl.disabled = currentPage >= totalPages;
  renderSelectedDestinations();

  spotListEl.innerHTML = pageDestinations.length
    ? pageDestinations
    .map((destination) => `
      <label class="spot-card ${selectedDestinationIds.has(destination.id) ? "selected" : ""}">
        <input type="checkbox" value="${destination.id}" ${selectedDestinationIds.has(destination.id) ? "checked" : ""} />
        <div>
          <h3>${destination.name}</h3>
          <p class="spot-meta">${destination.location.cityName} · ${destination.location.area} · ${destination.display.rating} 分 · 約 ${destination.planning.defaultStayMinutes} 分鐘</p>
          <p class="spot-description">${destination.display.description}</p>
        </div>
        <div class="tag-row">${destination.display.tags.map((tag) => `<span class="tag">${tag}</span>`).join("")}</div>
      </label>
    `)
    .join("")
    : `<div class="empty-results">找不到符合條件的景點。</div>`;

  document.querySelectorAll(".spot-card input").forEach((input) => {
    input.addEventListener("change", () => {
      if (input.checked) selectedDestinationIds.add(input.value);
      else selectedDestinationIds.delete(input.value);
      saveSelectedDestinationIds();
      input.closest(".spot-card").classList.toggle("selected", input.checked);
      renderSelectedDestinations();
    });
  });
}

function renderSelectedDestinations() {
  const selected = destinations.filter((destination) => selectedDestinationIds.has(destination.id));
  clearSelectedEl.disabled = selected.length === 0;
  selectedListEl.innerHTML = selected.length
    ? selected
      .map((destination) => `
        <span class="selected-chip">
          ${destination.name}
          <button type="button" aria-label="移除 ${destination.name}" data-remove-id="${destination.id}">×</button>
        </span>
      `)
      .join("")
    : `<span class="selected-empty">尚未選擇景點</span>`;

  selectedListEl.querySelectorAll("[data-remove-id]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedDestinationIds.delete(button.dataset.removeId);
      saveSelectedDestinationIds();
      renderSpots();
    });
  });
}

function getPreferences() {
  return [...document.querySelectorAll("[name='preference']:checked")].map((item) => item.value);
}

function distanceMinutes(a, b) {
  const lat = Math.abs(a.location.lat - b.location.lat) * 111;
  const lng = Math.abs(a.location.lng - b.location.lng) * 91;
  const km = Math.sqrt(lat * lat + lng * lng);
  return Math.max(8, Math.round(km * 8 + 6));
}

function timeToMinutes(value) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function minutesToClock(minutes) {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
}

function addMinutes(time, minutes) {
  return minutesToClock(timeToMinutes(time) + minutes);
}

function formatDuration(minutes) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} 分鐘`;
  if (!rest) return `${hours} 小時`;
  return `${hours} 小時 ${rest} 分鐘`;
}

function minutesBetween(startTime, endTime) {
  const start = timeToMinutes(startTime);
  let end = timeToMinutes(endTime);
  if (end < start) end += 1440;
  return end - start;
}

function isValidClock(value) {
  if (!/^\d{2}:\d{2}$/.test(value || "")) return false;
  const [hours, minutes] = value.split(":").map(Number);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

function airportProfile(code) {
  const normalized = (code || "").trim().toUpperCase();
  return airportProfiles[normalized] || {
    code: normalized || "AIRPORT",
    name: normalized || "機場",
    defaultToHotelMinutes: 70,
    defaultToCityCenterMinutes: 70,
  };
}

function timelineLimits(tripInput) {
  const profile = travelProfileLimits[tripInput.travelProfile] || travelProfileLimits.friends;
  const pace = paceLimitAdjustments[tripInput.pace] || paceLimitAdjustments.balanced;
  return {
    profileLabel: profile.label,
    maxOutingMinutes: tripInput.maxOutingMinutes || Math.max(360, profile.maxOutingMinutes + pace.outing),
    maxSightseeingMinutes: Math.max(180, profile.maxSightseeingMinutes + pace.sightseeing),
    dinnerLatest: profile.dinnerLatest,
    maxDestinations: Math.max(2, 4 + pace.destinationDelta),
  };
}

function dateToTripDay(tripInput, dateValue, fallbackDay) {
  if (!dateValue || !tripInput.startDate) return fallbackDay;
  const start = new Date(`${tripInput.startDate}T00:00:00`);
  const date = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(date.getTime())) return fallbackDay;
  const diff = Math.round((date - start) / 86400000) + 1;
  return Math.min(Math.max(diff, 1), tripInput.kDays);
}

function flightDayInfo(tripInput, dayIndex) {
  const inbound = tripInput.flights?.inbound;
  const outbound = tripInput.flights?.outbound;
  const inboundDay = inbound ? dateToTripDay(tripInput, inbound.date, 1) : null;
  let outboundDay = outbound ? dateToTripDay(tripInput, outbound.date, tripInput.kDays) : null;
  if (inbound && outbound && outboundDay === inboundDay) {
    const inboundReady = timeToMinutes(inbound.time) + (inbound.arrivalBufferMinutes || 0);
    const outboundLeave = timeToMinutes(outbound.time) - (outbound.airportBufferMinutes || 0);
    if (!outbound.date || outboundLeave <= inboundReady) outboundDay = tripInput.kDays;
  }
  return {
    inbound: inbound && inboundDay === dayIndex ? inbound : null,
    outbound: outbound && outboundDay === dayIndex ? outbound : null,
  };
}

function dayFlightBounds(tripInput, dayIndex) {
  const routine = tripInput.defaultRoutine;
  const flights = flightDayInfo(tripInput, dayIndex);
  let earliestStart = timeToMinutes(routine.departureTime);
  let latestEnd = timeToMinutes(routine.homeTime);

  if (flights.inbound?.time) {
    const airport = airportProfile(flights.inbound.airport);
    const arrivalFlow = flights.inbound.arrivalFlow || "hotel_first";
    const airportTransferMinutes = arrivalFlow === "hotel_first" ? airport.defaultToHotelMinutes : 0;
    const hotelBufferMinutes = arrivalFlow === "hotel_first" ? (flights.inbound.hotelBufferMinutes || 45) : 0;
    earliestStart = Math.max(
      earliestStart,
      timeToMinutes(flights.inbound.time) + (flights.inbound.arrivalBufferMinutes || 0) + airportTransferMinutes + hotelBufferMinutes,
    );
  }

  if (flights.outbound?.time) {
    const airport = airportProfile(flights.outbound.airport);
    const airportTransferMinutes = airport.defaultToHotelMinutes;
    latestEnd = Math.min(latestEnd, timeToMinutes(flights.outbound.time) - (flights.outbound.airportBufferMinutes || 0) - airportTransferMinutes);
  }

  return {
    ...flights,
    earliestStart,
    latestEnd,
    availableMinutes: Math.max(0, latestEnd - earliestStart),
  };
}

function limitsForDay(dayIndex, limits) {
  const tripInput = currentSettings?.tripInput;
  if (!tripInput || !dayIndex) return limits;
  const bounds = dayFlightBounds(tripInput, dayIndex);
  const defaultAvailable = Math.max(1, timeToMinutes(tripInput.defaultRoutine.homeTime) - timeToMinutes(tripInput.defaultRoutine.departureTime));
  const ratio = Math.min(1, bounds.availableMinutes / defaultAvailable);
  if (!bounds.inbound && !bounds.outbound) return limits;
  const mealReserve = (tripInput.defaultRoutine.lunchMinutes > 0 && bounds.earliestStart <= 780 && bounds.latestEnd >= 720 ? 80 : 0)
    + (tripInput.defaultRoutine.dinnerMinutes > 0 && bounds.earliestStart <= 1140 && bounds.latestEnd >= 1080 ? 80 : 0);
  const travelReserve = bounds.availableMinutes > 0 ? (tripInput.defaultRoutine.firstLegTransportMinutes || 20) + 25 : 0;
  const maxSightseeingMinutes = Math.max(0, Math.min(
    Math.floor(limits.maxSightseeingMinutes * ratio),
    bounds.availableMinutes - mealReserve - travelReserve,
  ));

  return {
    ...limits,
    maxOutingMinutes: Math.max(0, Math.min(limits.maxOutingMinutes, bounds.availableMinutes)),
    maxSightseeingMinutes,
    maxDestinations: maxSightseeingMinutes < 60 ? 0 : maxSightseeingMinutes < 150 ? 1 : Math.max(1, Math.floor(limits.maxDestinations * ratio)),
  };
}

function isFullPlanningDay(dayIndex, limits) {
  const tripInput = currentSettings?.tripInput;
  if (!tripInput) return true;
  const bounds = dayFlightBounds(tripInput, dayIndex);
  const dayLimits = limitsForDay(dayIndex, limits);
  if (!bounds.inbound && !bounds.outbound) return true;
  return dayLimits.maxDestinations >= 2 && dayLimits.maxSightseeingMinutes >= 180 && bounds.availableMinutes >= 360;
}

function effectivePlanningDays(days, limits) {
  return days.filter((day) => isFullPlanningDay(day.dayIndex, limits)).length || days.length;
}

function stayMinutes(destination) {
  return destinationOverrides[destination.id]?.customStayMinutes || destination.planning.defaultStayMinutes;
}

function breakfastMinutesForDay(dayIndex, fallback) {
  return dayOverrides[dayIndex]?.breakfastMinutes ?? fallback;
}

function mealOverrideForDay(dayIndex, mealType) {
  return mealOverrides[dayIndex]?.[mealType] || null;
}

function isLargeDestination(destination) {
  return destination.planning.defaultStayMinutes >= 300 || (destination.category === "experience" && destination.planning.intensity === "high");
}

function hasTimeWindow(destination) {
  return Boolean(destination.planning.bestTimeWindows?.length);
}

function timeWindowKind(destination) {
  const preferredTime = destination.planning.bestTimeWindows?.[0]?.preferredTime;
  if (!preferredTime) return "flexible";
  const minutes = timeToMinutes(preferredTime);
  if (minutes < 600) return "morning";
  if (minutes >= 1020) return "evening";
  return "daytime";
}

function preferredTimeMinutes(destination) {
  const preferredTime = destination.planning.bestTimeWindows?.[0]?.preferredTime;
  return preferredTime ? timeToMinutes(preferredTime) : null;
}

function timeWindowOrderRank(destination) {
  const preferred = preferredTimeMinutes(destination);
  if (preferred === null) return 2;
  if (preferred < 660) return 1;
  if (preferred >= 1020) return 4;
  return 2;
}

function orderByNearest(destinations, seed = null) {
  const remaining = [...destinations];
  const ordered = [];
  let current = seed;

  while (remaining.length) {
    const next = current
      ? remaining.sort((a, b) => distanceMinutes(current, a) - distanceMinutes(current, b))[0]
      : remaining.sort((a, b) => anchorScore(b, currentSettings.tripInput) - anchorScore(a, currentSettings.tripInput))[0];
    ordered.push(next);
    remaining.splice(remaining.indexOf(next), 1);
    current = next;
  }

  return ordered;
}

function orderByTimeWindowAndDistance(destinations) {
  if (destinations.length <= 1) return [...destinations];
  const early = destinations
    .filter((destination) => timeWindowOrderRank(destination) === 1)
    .sort((a, b) => preferredTimeMinutes(a) - preferredTimeMinutes(b));
  const late = destinations
    .filter((destination) => timeWindowOrderRank(destination) === 4)
    .sort((a, b) => preferredTimeMinutes(a) - preferredTimeMinutes(b));
  const middle = destinations.filter((destination) => !early.includes(destination) && !late.includes(destination));
  const middleOrdered = orderByNearest(middle, early[early.length - 1] || null);

  return [...early, ...middleOrdered, ...late];
}

function anchorScore(destination, tripInput) {
  let score = 0;
  score += (destination.planning.importance || 3) * 10;
  if (destination.planning.defaultStayMinutes >= 300) score += 40;
  else if (destination.planning.defaultStayMinutes >= 180) score += 20;
  if (destination.planning.intensity === "high") score += 20;
  else if (destination.planning.intensity === "medium") score += 10;
  if (hasTimeWindow(destination)) score += 20;
  if (destination.category === "experience") score += 20;
  if (destination.category === "culture") score += 10;
  if (destination.category === "photo" && hasTimeWindow(destination)) score += 15;
  if (destination.category === "food" && destination.planning.mealFriendly) score += 10;
  if (tripInput.preferences.includes(destination.category)) score += 10;
  return score;
}

function pairScore(a, b) {
  let score = 0;
  if (a.location.city === b.location.city) score += 30;
  else score -= 35;
  if (a.location.area === b.location.area) score += 20;

  const travel = distanceMinutes(a, b);
  if (travel <= 15) score += 35;
  else if (travel <= 25) score += 25;
  else if (travel <= 35) score += 12;
  else if (travel <= 50) score += 0;
  else if (travel <= 70) score -= 18;
  else score -= 35;

  if (a.category === b.category) score += 3;
  const sharedTags = a.display.tags.filter((tag) => b.display.tags.includes(tag));
  score += Math.min(sharedTags.length * 2, 6);
  if (a.planning.mealFriendly && b.planning.mealFriendly) score += 6;
  else if (a.planning.mealFriendly || b.planning.mealFriendly) score += 2;
  if (a.planning.intensity === "high" && b.planning.intensity === "high") score -= 20;
  if (isLargeDestination(a) || isLargeDestination(b)) score -= 25;
  if (timeWindowKind(a) !== "flexible" && timeWindowKind(a) === timeWindowKind(b)) score -= 10;
  return score;
}

function groupStayMinutes(group) {
  return group.reduce((sum, destination) => sum + stayMinutes(destination), 0);
}

function bucketKey(destination) {
  if (isLargeDestination(destination)) return `${destination.location.city}:large`;
  return `${destination.location.city}:city`;
}

function buildDayGroupsFromBucket(bucket, tripInput, limits) {
  const remaining = [...bucket].sort((a, b) => anchorScore(b, tripInput) - anchorScore(a, tripInput));
  const groups = [];

  while (remaining.length) {
    const anchor = remaining.shift();
    const group = [anchor];
    if (!isLargeDestination(anchor)) {
      const candidates = [...remaining].sort((a, b) => pairScore(anchor, b) - pairScore(anchor, a));
      candidates.forEach((candidate) => {
        if (!remaining.includes(candidate)) return;
        const projectedStay = groupStayMinutes(group) + stayMinutes(candidate);
        const compatible = pairScore(anchor, candidate) >= 10;
        const capacityOk = projectedStay <= limits.maxSightseeingMinutes;
        if (compatible && capacityOk) {
          group.push(candidate);
          remaining.splice(remaining.indexOf(candidate), 1);
        }
      });
    }
    groups.push({
      anchor,
      destinations: group,
      reason: isLargeDestination(anchor)
        ? `${anchor.name} 是大景點，先保護成獨立 day group。`
        : `${anchor.name} 的 anchorScore 較高，作為 ${anchor.location.cityName} group 核心。`,
    });
  }

  return groups;
}

function dayCompatibilityScore(day, group, limits) {
  const dayLimits = limitsForDay(day.dayIndex, limits);
  const existing = day.destinations;
  const projectedStay = day.totalStay + groupStayMinutes(group.destinations);
  const projectedCount = existing.length + group.destinations.length;
  if (dayLimits.maxDestinations === 0 && group.destinations.length) return -999;
  let score = existing.length ? 0 : 75;
  if (projectedCount <= dayLimits.maxDestinations) score += 20;
  else score -= (projectedCount - dayLimits.maxDestinations) * 35;
  if (projectedStay <= dayLimits.maxSightseeingMinutes) score += 35;
  else score -= Math.round((projectedStay - dayLimits.maxSightseeingMinutes) / 8);
  if (!existing.length) return score;

  const pairAverage = group.destinations.reduce((sum, destination) => {
    const best = Math.max(...existing.map((item) => pairScore(destination, item)));
    return sum + best;
  }, 0) / group.destinations.length;
  score += pairAverage;
  if (existing.some((item) => item.location.city !== group.anchor.location.city)) score -= 25;
  if (existing.some((item) => isLargeDestination(item)) || group.destinations.some((item) => isLargeDestination(item))) score -= 35;
  return score;
}

function splitGroupForAvailableDays(group, availableSlots, limits, tripInput) {
  if (availableSlots <= 1 || group.destinations.length <= 1) return [group];
  if (isLargeDestination(group.anchor)) return [group];

  const shouldSplit = group.destinations.length > limits.maxDestinations || groupStayMinutes(group.destinations) > limits.maxSightseeingMinutes * 0.75;
  if (!shouldSplit) return [group];

  const ordered = [...group.destinations].sort((a, b) => anchorScore(b, tripInput) - anchorScore(a, tripInput));
  const result = [];
  while (ordered.length && result.length < availableSlots) {
    const anchor = ordered.shift();
    const destinations = [anchor];
    const candidates = [...ordered].sort((a, b) => pairScore(anchor, b) - pairScore(anchor, a));
    candidates.forEach((candidate) => {
      if (!ordered.includes(candidate)) return;
      const projectedStay = groupStayMinutes(destinations) + stayMinutes(candidate);
      const projectedCount = destinations.length + 1;
      if (pairScore(anchor, candidate) >= 10 && projectedStay <= limits.maxSightseeingMinutes * 0.75 && projectedCount <= Math.max(2, limits.maxDestinations - 1)) {
        destinations.push(candidate);
        ordered.splice(ordered.indexOf(candidate), 1);
      }
    });
    result.push({
      anchor,
      destinations,
      reason: `${anchor.name} 作為拆分後 group 核心，避免單日塞太滿。`,
    });
  }

  if (ordered.length) {
    result[result.length - 1].destinations.push(...ordered);
  }

  return result;
}

function improveOverloadedDays(days, limits) {
  for (let round = 0; round < 2; round += 1) {
    days.forEach((day) => {
      const dayLimits = limitsForDay(day.dayIndex, limits);
      const overloaded = day.destinations.length > dayLimits.maxDestinations || groupStayMinutes(day.destinations) > dayLimits.maxSightseeingMinutes;
      if (!overloaded) return;
      const movable = [...day.destinations]
        .filter((destination) => !manualDayAssignments[destination.id] && !isLargeDestination(destination))
        .sort((a, b) => anchorScore(a, currentSettings.tripInput) - anchorScore(b, currentSettings.tripInput));
      const candidate = movable[0];
      if (!candidate) return;
      const targets = days
        .filter((target) => target.dayIndex !== day.dayIndex)
        .map((target) => ({
          target,
          score: dayCompatibilityScore(target, { anchor: candidate, destinations: [candidate] }, limits),
        }))
        .sort((a, b) => b.score - a.score);
      const best = targets[0];
      if (!best || best.score < 10) return;
      day.destinations = day.destinations.filter((destination) => destination.id !== candidate.id);
      day.totalStay = groupStayMinutes(day.destinations);
      best.target.destinations.push(candidate);
      best.target.totalStay = groupStayMinutes(best.target.destinations);
    });
  }
}

function spreadToEmptyDays(days, selectedDestinations, tripInput) {
  const targetUsedDays = Math.min(days.length, selectedDestinations.length);
  while (days.filter((day) => day.destinations.length > 0).length < targetUsedDays) {
    const emptyDay = days.find((day) => day.destinations.length === 0);
    const donor = [...days]
      .filter((day) => day.destinations.length > 1)
      .sort((a, b) => b.destinations.length - a.destinations.length || groupStayMinutes(b.destinations) - groupStayMinutes(a.destinations))[0];
    if (!emptyDay || !donor) return;

    const movable = [...donor.destinations]
      .filter((destination) => !manualDayAssignments[destination.id] && !isLargeDestination(destination))
      .sort((a, b) => anchorScore(a, tripInput) - anchorScore(b, tripInput));
    const candidate = movable[0] || donor.destinations[donor.destinations.length - 1];
    if (!candidate) return;

    donor.destinations = donor.destinations.filter((destination) => destination.id !== candidate.id);
    donor.totalStay = groupStayMinutes(donor.destinations);
    emptyDay.destinations.push(candidate);
    emptyDay.totalStay = groupStayMinutes(emptyDay.destinations);
    emptyDay.reasons.push(`${candidate.name} 從 Day ${donor.dayIndex} 拆出，避免 ${donor.dayIndex} 天過滿並使用空白天。`);
  }
}

function estimateDayTransportMinutes(destinations) {
  if (destinations.length <= 1) return 0;
  const ordered = orderByTimeWindowAndDistance(destinations);
  return ordered.reduce((sum, destination, index) => {
    if (index === 0) return sum;
    return sum + distanceMinutes(ordered[index - 1], destination);
  }, 0);
}

function hasStrongTimeWindow(destination) {
  const preferred = preferredTimeMinutes(destination);
  if (preferred === null) return false;
  return preferred < 540 || preferred >= 1020;
}

function isUserConstrainedDestination(destination) {
  const reservation = reservationState[destination.id];
  return Boolean(
    manualDayAssignments[destination.id]
    || destinationOverrides[destination.id]?.fixedArrivalTime
    || reservation?.locked
  );
}

function isStandaloneDayDestination(destination) {
  return Boolean(
    isLargeDestination(destination)
    || stayMinutes(destination) >= 180
    || isUserConstrainedDestination(destination)
    || hasStrongTimeWindow(destination)
  );
}

function dayHasCapacityFor(day, additions, limits) {
  const dayLimits = limitsForDay(day.dayIndex, limits);
  const projected = [...day.destinations, ...additions];
  return projected.length <= dayLimits.maxDestinations
    && groupStayMinutes(projected) <= dayLimits.maxSightseeingMinutes
    && estimateDayTransportMinutes(projected) <= Math.max(45, dayLimits.maxOutingMinutes * 0.25);
}

function wouldBecomeBadThinDay(day, removedDestinations) {
  const removedIds = new Set(removedDestinations.map((destination) => destination.id));
  const remaining = day.destinations.filter((destination) => !removedIds.has(destination.id));
  if (remaining.length !== 1) return false;
  return !isStandaloneDayDestination(remaining[0]);
}

function dayPairAverage(destination, day) {
  if (!day.destinations.length) return 0;
  return day.destinations.reduce((sum, item) => sum + pairScore(destination, item), 0) / day.destinations.length;
}

function validateGroupQuality(days, limits, selectedDestinations = []) {
  const warnings = [];
  const usedDays = days.filter((day) => day.destinations.length);
  const planningDays = effectivePlanningDays(days, limits);
  const selectedStayMinutes = groupStayMinutes(selectedDestinations);
  const minimumDestinationCount = Math.max(1, Math.ceil(planningDays * 0.8));
  const minimumStayMinutes = planningDays * 120;

  if (selectedDestinations.length < minimumDestinationCount || selectedStayMinutes < minimumStayMinutes) {
    warnings.push({
      ruleCode: "not_enough_destinations",
      dayIndex: null,
      message: `目前選擇的景點量可能不足以支撐 ${days.length} 天，建議減少天數、加入更多景點，或保留空白天作為休息日。`,
    });
  }

  warnings
    .filter((warning) => warning.ruleCode === "not_enough_destinations")
    .forEach((warning) => {
      warning.message = `目前選擇的景點量或總停留時間可能不足以支撐 ${planningDays} 個完整遊玩日，建議減少天數、加入更多景點，或保留航班日 / 空白天作為休息日。`;
    });

  days.forEach((day) => {
    const dayLimits = limitsForDay(day.dayIndex, limits);
    const stay = groupStayMinutes(day.destinations);
    const transport = estimateDayTransportMinutes(day.destinations);

    if (!day.destinations.length) {
      warnings.push({
        ruleCode: "empty_day",
        dayIndex: day.dayIndex,
        message: `Day ${day.dayIndex}：目前沒有景點，可作為休息日，或加入更多景點後再重新分配。`,
      });
      return;
    }

    if (day.destinations.length === 1 && !isStandaloneDayDestination(day.destinations[0])) {
      warnings.push({
        ruleCode: "thin_day",
        dayIndex: day.dayIndex,
        destinationIds: [day.destinations[0].id],
        message: `Day ${day.dayIndex}：只有 ${day.destinations[0].name}，行程偏薄，建議合併到相近區域或加入附近景點。`,
      });
    }

    if (day.destinations.length > dayLimits.maxDestinations || stay > dayLimits.maxSightseeingMinutes || transport > Math.max(60, dayLimits.maxOutingMinutes * 0.3)) {
      warnings.push({
        ruleCode: "overloaded_day",
        dayIndex: day.dayIndex,
        message: `Day ${day.dayIndex}：景點量、停留時間或交通時間偏高，可能需要移走低優先景點。`,
      });
    }

    if (day.destinations.length > 1) {
      day.destinations.forEach((destination) => {
        const nearest = Math.min(...day.destinations
          .filter((item) => item.id !== destination.id)
          .map((item) => distanceMinutes(destination, item)));
        if (nearest > 45) {
          warnings.push({
            ruleCode: "isolated_destination",
            dayIndex: day.dayIndex,
            destinationIds: [destination.id],
            message: `Day ${day.dayIndex}：${destination.name} 和同天其他景點距離偏遠，可能需要換天或獨立安排。`,
          });
        }
      });
    }

    const cities = new Set(day.destinations.map((destination) => destination.location.city));
    if (cities.size > 1 && !day.destinations.some(isUserConstrainedDestination)) {
      warnings.push({
        ruleCode: "cross_city_day",
        dayIndex: day.dayIndex,
        message: `Day ${day.dayIndex}：同一天跨城市較多，交通風險偏高。`,
      });
    }

    const largeDestinations = day.destinations.filter(isLargeDestination);
    if (largeDestinations.length && day.destinations.length - largeDestinations.length > 2) {
      warnings.push({
        ruleCode: "overloaded_anchor_day",
        dayIndex: day.dayIndex,
        destinationIds: largeDestinations.map((destination) => destination.id),
        message: `Day ${day.dayIndex}：大景點日又安排了多個普通景點，可能太滿。`,
      });
    }
  });

  if (!usedDays.length && selectedDestinations.length) {
    warnings.push({
      ruleCode: "empty_plan",
      dayIndex: null,
      message: "目前沒有成功分配景點，請確認目的地和景點選擇。",
    });
  }

  return warnings;
}

function moveScore(candidate, targetDay, sourceDay, limits, movedDestinationIds) {
  if (isUserConstrainedDestination(candidate) || movedDestinationIds.has(candidate.id)) return -999;

  let score = 0;
  score += hasTimeWindow(candidate) ? 8 : 0;
  score += dayHasCapacityFor(targetDay, [candidate], limits) ? 30 : -80;
  score += targetDay.destinations.length ? dayPairAverage(candidate, targetDay) : (isStandaloneDayDestination(candidate) ? 12 : -18);

  const sourceLimits = limitsForDay(sourceDay.dayIndex, limits);
  const sourceWasOverloaded = sourceDay.destinations.length > sourceLimits.maxDestinations || groupStayMinutes(sourceDay.destinations) > sourceLimits.maxSightseeingMinutes;
  if (sourceWasOverloaded) score += 20;
  if (!targetDay.destinations.length && !isStandaloneDayDestination(candidate)) score -= 25;
  if (wouldBecomeBadThinDay(sourceDay, [candidate])) score -= 35;
  if (targetDay.destinations.some((item) => item.location.city !== candidate.location.city)) score -= 35;
  if (targetDay.destinations.some(isLargeDestination) || isLargeDestination(candidate)) score -= 25;

  return score;
}

function clusterScore(cluster, targetDay, sourceDay, limits, movedDestinationIds) {
  if (cluster.some((destination) => isUserConstrainedDestination(destination) || movedDestinationIds.has(destination.id))) return -999;
  if (!dayHasCapacityFor(targetDay, cluster, limits)) return -999;
  if (wouldBecomeBadThinDay(sourceDay, cluster)) return -999;

  const compatibility = targetDay.destinations.length
    ? cluster.reduce((sum, destination) => sum + dayPairAverage(destination, targetDay), 0) / cluster.length
    : pairScore(cluster[0], cluster[1] || cluster[0]);
  const sourceLimits = limitsForDay(sourceDay.dayIndex, limits);
  const sourceWasOverloaded = sourceDay.destinations.length > sourceLimits.maxDestinations || groupStayMinutes(sourceDay.destinations) > sourceLimits.maxSightseeingMinutes;
  return compatibility + (sourceWasOverloaded ? 20 : 0) + (cluster.length > 1 ? 20 : 0);
}

function createMoveRepair(sourceDay, targetDay, destinations, score, reason) {
  return {
    type: destinations.length > 1 ? "move_cluster" : "move_destination",
    sourceDay,
    targetDay,
    destinations,
    score,
    reason,
  };
}

function bestMergeRepair(problem, days, limits, movedDestinationIds) {
  const sourceDay = days.find((day) => day.dayIndex === problem.dayIndex);
  const candidate = sourceDay?.destinations.find((destination) => problem.destinationIds?.includes(destination.id));
  if (!sourceDay || !candidate || isUserConstrainedDestination(candidate) || movedDestinationIds.has(candidate.id)) return null;

  return days
    .filter((day) => day.dayIndex !== sourceDay.dayIndex)
    .map((targetDay) => createMoveRepair(
      sourceDay,
      targetDay,
      [candidate],
      moveScore(candidate, targetDay, sourceDay, limits, movedDestinationIds),
      `${candidate.name} moved from thin Day ${sourceDay.dayIndex} to Day ${targetDay.dayIndex}.`,
    ))
    .filter((repair) => repair.score >= 12)
    .sort((a, b) => b.score - a.score)[0] || null;
}

function bestMiniClusterRepair(problem, days, limits, movedDestinationIds) {
  const thinDay = days.find((day) => day.dayIndex === problem.dayIndex);
  const anchor = thinDay?.destinations[0];
  if (!thinDay || !anchor) return null;

  return days
    .filter((day) => day.dayIndex !== thinDay.dayIndex && day.destinations.length > 2)
    .flatMap((donorDay) => donorDay.destinations
      .filter((destination) => !isLargeDestination(destination) && !isUserConstrainedDestination(destination) && !movedDestinationIds.has(destination.id))
      .map((companion) => createMoveRepair(
        donorDay,
        thinDay,
        [companion],
        pairScore(anchor, companion) + (donorDay.destinations.length > limits.maxDestinations ? 20 : 0) - (wouldBecomeBadThinDay(donorDay, [companion]) ? 50 : 0),
        `${companion.name} paired with ${anchor.name} to avoid a thin day.`,
      )))
    .filter((repair) => repair.score >= 18 && dayHasCapacityFor(repair.targetDay, repair.destinations, limits))
    .sort((a, b) => b.score - a.score)[0] || null;
}

function bestEmptyDayRepair(problem, days, limits, movedDestinationIds) {
  const targetDay = days.find((day) => day.dayIndex === problem.dayIndex);
  if (!targetDay) return null;

  const repairs = [];
  days
    .filter((day) => day.dayIndex !== targetDay.dayIndex && day.destinations.length > 2)
    .forEach((donorDay) => {
      const donorLimits = limitsForDay(donorDay.dayIndex, limits);
      const donorOverloaded = donorDay.destinations.length > donorLimits.maxDestinations
        || groupStayMinutes(donorDay.destinations) > donorLimits.maxSightseeingMinutes
        || estimateDayTransportMinutes(donorDay.destinations) > Math.max(60, donorLimits.maxOutingMinutes * 0.3);
      const movable = donorDay.destinations
        .filter((destination) => !isLargeDestination(destination) && !isUserConstrainedDestination(destination) && !movedDestinationIds.has(destination.id));
      movable.forEach((candidate) => {
        const companion = movable
          .filter((destination) => destination.id !== candidate.id)
          .sort((a, b) => pairScore(candidate, b) - pairScore(candidate, a))[0];
        const cluster = companion ? [candidate, companion] : [candidate];
        if (cluster.length === 1 && !isStandaloneDayDestination(candidate)) return;
        const baseScore = clusterScore(cluster, targetDay, donorDay, limits, movedDestinationIds);
        const reliefScore = donorOverloaded ? 35 : 0;
        const sourceAfter = donorDay.destinations.filter((destination) => !cluster.some((item) => item.id === destination.id));
        const sourceStillUseful = sourceAfter.length === 0 || sourceAfter.length >= 2 || sourceAfter.some(isStandaloneDayDestination);
        repairs.push(createMoveRepair(
          donorDay,
          targetDay,
          cluster,
          baseScore + reliefScore - (sourceStillUseful ? 0 : 30),
          `Day ${targetDay.dayIndex} filled with a safe ${cluster.length > 1 ? "mini-cluster" : "standalone destination"}.`,
        ));
      });
    });

  return repairs
    .filter((repair) => repair.score >= 15)
    .sort((a, b) => b.score - a.score)[0] || null;
}

function bestOverloadRepair(problem, days, limits, movedDestinationIds) {
  const sourceDay = days.find((day) => day.dayIndex === problem.dayIndex);
  if (!sourceDay) return null;

  const movable = sourceDay.destinations
    .filter((destination) => !isLargeDestination(destination) && !isUserConstrainedDestination(destination) && !movedDestinationIds.has(destination.id))
    .sort((a, b) => anchorScore(a, currentSettings.tripInput) - anchorScore(b, currentSettings.tripInput));

  return movable
    .flatMap((candidate) => days
      .filter((day) => day.dayIndex !== sourceDay.dayIndex)
      .filter((day) => day.destinations.length > 0 || isStandaloneDayDestination(candidate))
      .map((targetDay) => createMoveRepair(
        sourceDay,
        targetDay,
        [candidate],
        moveScore(candidate, targetDay, sourceDay, limits, movedDestinationIds),
        `${candidate.name} moved out of overloaded Day ${sourceDay.dayIndex}.`,
      )))
    .filter((repair) => repair.score >= 12)
    .sort((a, b) => b.score - a.score)[0] || null;
}

function bestIsolatedRepair(problem, days, limits, movedDestinationIds) {
  const sourceDay = days.find((day) => day.dayIndex === problem.dayIndex);
  const candidate = sourceDay?.destinations.find((destination) => problem.destinationIds?.includes(destination.id));
  if (!sourceDay || !candidate || isUserConstrainedDestination(candidate) || movedDestinationIds.has(candidate.id)) return null;

  const currentScore = dayPairAverage(candidate, {
    destinations: sourceDay.destinations.filter((destination) => destination.id !== candidate.id),
  });

  return days
    .filter((day) => day.dayIndex !== sourceDay.dayIndex && day.destinations.length > 0)
    .map((targetDay) => createMoveRepair(
      sourceDay,
      targetDay,
      [candidate],
      moveScore(candidate, targetDay, sourceDay, limits, movedDestinationIds) - currentScore,
      `${candidate.name} moved from isolated Day ${sourceDay.dayIndex} to Day ${targetDay.dayIndex}.`,
    ))
    .filter((repair) => repair.score >= 12)
    .sort((a, b) => b.score - a.score)[0] || null;
}

function findSafeRepairs(problems, days, limits, movedDestinationIds) {
  const repairs = problems
    .map((problem) => {
      if (problem.ruleCode === "thin_day") return bestMergeRepair(problem, days, limits, movedDestinationIds) || bestMiniClusterRepair(problem, days, limits, movedDestinationIds);
      if (problem.ruleCode === "empty_day") return bestEmptyDayRepair(problem, days, limits, movedDestinationIds);
      if (problem.ruleCode === "overloaded_day" || problem.ruleCode === "overloaded_anchor_day") return bestOverloadRepair(problem, days, limits, movedDestinationIds);
      if (problem.ruleCode === "isolated_destination") return bestIsolatedRepair(problem, days, limits, movedDestinationIds);
      return null;
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);

  return repairs[0] ? [repairs[0]] : [];
}

function applyRepairs(repairs, movedDestinationIds) {
  repairs.forEach((repair) => {
    const movingIds = new Set(repair.destinations.map((destination) => destination.id));
    repair.sourceDay.destinations = repair.sourceDay.destinations.filter((destination) => !movingIds.has(destination.id));
    repair.targetDay.destinations.push(...repair.destinations);
    repair.sourceDay.totalStay = groupStayMinutes(repair.sourceDay.destinations);
    repair.targetDay.totalStay = groupStayMinutes(repair.targetDay.destinations);
    repair.destinations.forEach((destination) => movedDestinationIds.add(destination.id));
    repair.targetDay.reasons.push(repair.reason);
  });
}

function autoRepairDayGroups(days, limits, selectedDestinations) {
  const movedDestinationIds = new Set();
  const shouldRepairEmptyDays = selectedDestinations.length >= days.length * 2;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const problems = validateGroupQuality(days, limits, selectedDestinations)
      .filter((problem) => problem.ruleCode !== "not_enough_destinations")
      .filter((problem) => shouldRepairEmptyDays || problem.ruleCode !== "empty_day");
    const repairs = findSafeRepairs(problems, days, limits, movedDestinationIds);
    if (!repairs.length) break;
    applyRepairs(repairs, movedDestinationIds);
  }

  return validateGroupQuality(days, limits, selectedDestinations)
    .filter((warning) => warning.ruleCode !== "empty_day" || selectedDestinations.length >= days.length * 2);
}

function dominantCityRank(day, tripInput) {
  if (!day.destinations.length) return 999;
  const cityOrder = tripInput.destinationCities || [];
  const counts = day.destinations.reduce((map, destination) => {
    map[destination.location.city] = (map[destination.location.city] || 0) + 1;
    return map;
  }, {});
  const city = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  const index = cityOrder.indexOf(city);
  return index === -1 ? 500 : index;
}

function normalizeGeneratedDayOrder(days, tripInput) {
  if (tripInput.flights?.inbound || tripInput.flights?.outbound) return;
  if (Object.keys(manualDayAssignments).length || Object.keys(stableDayAssignments).length) return;
  const ordered = [...days].sort((a, b) => {
    const aCityRank = dominantCityRank(a, tripInput);
    const bCityRank = dominantCityRank(b, tripInput);
    if (aCityRank !== bCityRank) return aCityRank - bCityRank;
    if (!a.destinations.length || !b.destinations.length) return b.destinations.length - a.destinations.length;
    return a.dayIndex - b.dayIndex;
  });
  ordered.forEach((day, index) => {
    day.dayIndex = index + 1;
  });
  days.splice(0, days.length, ...ordered);
}

function optimizeLocalPairing(days, limits) {
  for (let round = 0; round < 2; round += 1) {
    const repairs = days
      .flatMap((sourceDay) => sourceDay.destinations
        .filter((destination) => !isLargeDestination(destination) && !isUserConstrainedDestination(destination))
        .flatMap((destination) => {
          const remainingSource = {
            ...sourceDay,
            destinations: sourceDay.destinations.filter((item) => item.id !== destination.id),
          };
          const currentScore = dayPairAverage(destination, remainingSource);
          const sourceIsLoosePair = sourceDay.destinations.length === 2 && currentScore < 5;
          if (wouldBecomeBadThinDay(sourceDay, [destination]) && !sourceIsLoosePair) return [];
          return days
            .filter((targetDay) => targetDay.dayIndex !== sourceDay.dayIndex && targetDay.destinations.length > 0)
            .filter((targetDay) => dayHasCapacityFor(targetDay, [destination], limits))
            .map((targetDay) => {
              const targetScore = dayPairAverage(destination, targetDay);
              return createMoveRepair(
                sourceDay,
                targetDay,
                [destination],
                targetScore - currentScore,
                `${destination.name} moved to Day ${targetDay.dayIndex} because its nearby cluster is more compatible.`,
              );
            });
        }))
      .filter((repair) => repair.score >= 8)
      .sort((a, b) => b.score - a.score);

    const best = repairs[0];
    if (!best) return;
    applyRepairs([best], new Set());
  }
}

function fillRemainingEmptyDays(days, limits) {
  const emptyDays = days.filter((day) => !day.destinations.length);
  emptyDays.forEach((emptyDay) => {
    const isolatedRepairs = validateGroupQuality(days, limits)
      .filter((warning) => warning.ruleCode === "isolated_destination")
      .flatMap((warning) => {
        const sourceDay = days.find((day) => day.dayIndex === warning.dayIndex);
        const isolated = sourceDay?.destinations.find((destination) => warning.destinationIds?.includes(destination.id));
        if (!sourceDay || !isolated || isUserConstrainedDestination(isolated)) return [];

        return days
          .flatMap((companionDay) => companionDay.destinations.map((companion) => ({ companionDay, companion })))
          .filter(({ companion }) => companion.id !== isolated.id && !isLargeDestination(companion) && !isUserConstrainedDestination(companion))
          .map(({ companionDay, companion }) => {
            const cluster = [isolated, companion];
            const sourceAfter = sourceDay.destinations.filter((destination) => !cluster.some((item) => item.id === destination.id));
            const companionSourceAfter = companionDay.dayIndex === sourceDay.dayIndex
              ? sourceAfter
              : companionDay.destinations.filter((destination) => destination.id !== companion.id);
            const sourceStillUseful = sourceAfter.length === 0 || sourceAfter.length >= 2 || sourceAfter.some(isStandaloneDayDestination);
            const companionSourceStillUseful = companionSourceAfter.length === 0 || companionSourceAfter.length >= 2 || companionSourceAfter.some(isStandaloneDayDestination);
            if (!sourceStillUseful || !companionSourceStillUseful || !dayHasCapacityFor(emptyDay, cluster, limits)) return null;
            const proximityScore = pairScore(isolated, companion) - distanceMinutes(isolated, companion) * 0.2;
            return {
              repair: createMoveRepair(
                sourceDay,
                emptyDay,
                [isolated],
                proximityScore + 40,
                `${isolated.name} moved out as an isolated destination.`,
              ),
              companionRepair: companionDay.dayIndex === sourceDay.dayIndex
                ? null
                : createMoveRepair(
                  companionDay,
                  emptyDay,
                  [companion],
                  proximityScore,
                  `${companion.name} paired with ${isolated.name} after final balance.`,
                ),
              score: proximityScore,
            };
          })
          .filter(Boolean);
      })
      .sort((a, b) => b.score - a.score);

    if (isolatedRepairs[0]) {
      const repairs = [isolatedRepairs[0].repair, isolatedRepairs[0].companionRepair].filter(Boolean);
      applyRepairs(repairs, new Set());
      return;
    }

    const donors = days
      .filter((day) => day.dayIndex !== emptyDay.dayIndex && day.destinations.length >= 4)
      .sort((a, b) => {
        const aWarnings = validateGroupQuality([a], limits).length;
        const bWarnings = validateGroupQuality([b], limits).length;
        return bWarnings - aWarnings
          || b.destinations.length - a.destinations.length
          || groupStayMinutes(b.destinations) - groupStayMinutes(a.destinations);
      });

    const repairs = donors.flatMap((donorDay) => {
      const movable = donorDay.destinations
        .filter((destination) => !isLargeDestination(destination) && !isUserConstrainedDestination(destination));
      return movable.flatMap((candidate) => movable
        .filter((companion) => companion.id !== candidate.id)
        .map((companion) => {
          const cluster = [candidate, companion];
          const sourceAfter = donorDay.destinations.filter((destination) => !cluster.some((item) => item.id === destination.id));
          const sourceStillUseful = sourceAfter.length === 0 || sourceAfter.length >= 2 || sourceAfter.some(isStandaloneDayDestination);
          if (!sourceStillUseful || !dayHasCapacityFor(emptyDay, cluster, limits)) return null;
          return createMoveRepair(
            donorDay,
            emptyDay,
            cluster,
            pairScore(candidate, companion) + (donorDay.destinations.length > limits.maxDestinations ? 25 : 0),
            `Day ${emptyDay.dayIndex} filled after final balance with ${candidate.name} and ${companion.name}.`,
          );
        }));
    })
      .filter(Boolean)
      .filter((repair) => repair.score >= 10)
      .sort((a, b) => b.score - a.score);

    if (repairs[0]) applyRepairs([repairs[0]], new Set());
  });
}

function rebalanceFlightConstrainedDays(days, limits) {
  days.forEach((day) => {
    const dayLimits = limitsForDay(day.dayIndex, limits);
    if (!day.destinations.length) return;
    const isOverFlightCapacity = day.destinations.length > dayLimits.maxDestinations
      || groupStayMinutes(day.destinations) > dayLimits.maxSightseeingMinutes;
    if (!isOverFlightCapacity) return;

    const movable = [...day.destinations]
      .filter((destination) => !isUserConstrainedDestination(destination))
      .sort((a, b) => anchorScore(a, currentSettings.tripInput) - anchorScore(b, currentSettings.tripInput));

    movable.forEach((candidate) => {
      const currentLimits = limitsForDay(day.dayIndex, limits);
      const stillOver = day.destinations.length > currentLimits.maxDestinations
        || groupStayMinutes(day.destinations) > currentLimits.maxSightseeingMinutes;
      if (!stillOver) return;

      const targetCandidates = days
        .filter((targetDay) => targetDay.dayIndex !== day.dayIndex)
        .map((targetDay) => ({
          day: targetDay,
          hasCapacity: dayHasCapacityFor(targetDay, [candidate], limits),
          hasFlightBoundary: Boolean(dayFlightBounds(currentSettings.tripInput, targetDay.dayIndex).inbound || dayFlightBounds(currentSettings.tripInput, targetDay.dayIndex).outbound),
          score: dayCompatibilityScore(targetDay, { anchor: candidate, destinations: [candidate] }, limits),
        }));
      const target = targetCandidates
        .filter((item) => item.hasCapacity)
        .sort((a, b) => b.score - a.score)[0]?.day
        || targetCandidates
          .filter((item) => !item.hasFlightBoundary)
          .sort((a, b) => b.score - a.score)[0]?.day
        || targetCandidates
        .sort((a, b) => b.score - a.score)[0]?.day;

      if (!target) return;
      day.destinations = day.destinations.filter((destination) => destination.id !== candidate.id);
      target.destinations.push(candidate);
      day.totalStay = groupStayMinutes(day.destinations);
      target.totalStay = groupStayMinutes(target.destinations);
      target.reasons.push(`${candidate.name} moved away from a flight-constrained day.`);
    });
  });
}

function rememberDayOrder(dayIndex, destinationIds) {
  manualDayOrders[dayIndex] = destinationIds.filter((id) => selectedDestinationIds.has(id));
}

function getManualDayOrder(dayIndex) {
  return manualDayOrders[dayIndex] || [];
}

function pruneManualPlanState(kDays) {
  Object.keys(manualDayAssignments).forEach((destinationId) => {
    const dayIndex = manualDayAssignments[destinationId];
    if (!selectedDestinationIds.has(destinationId) || dayIndex < 1 || dayIndex > kDays) {
      delete manualDayAssignments[destinationId];
    }
  });

  Object.keys(stableDayAssignments).forEach((destinationId) => {
    const dayIndex = stableDayAssignments[destinationId];
    if (!selectedDestinationIds.has(destinationId) || dayIndex < 1 || dayIndex > kDays) {
      delete stableDayAssignments[destinationId];
    }
  });

  Object.keys(manualDayOrders).forEach((dayIndex) => {
    if (Number(dayIndex) > kDays) {
      delete manualDayOrders[dayIndex];
      return;
    }
    manualDayOrders[dayIndex] = manualDayOrders[dayIndex].filter((id) => selectedDestinationIds.has(id));
  });
}

function clearManualPlanState() {
  Object.keys(manualDayAssignments).forEach((key) => delete manualDayAssignments[key]);
  Object.keys(stableDayAssignments).forEach((key) => delete stableDayAssignments[key]);
  Object.keys(manualDayOrders).forEach((key) => delete manualDayOrders[key]);
}

function clearPlanEditState() {
  clearManualPlanState();
  Object.keys(destinationOverrides).forEach((key) => delete destinationOverrides[key]);
  Object.keys(dayOverrides).forEach((key) => delete dayOverrides[key]);
  Object.keys(mealOverrides).forEach((key) => delete mealOverrides[key]);
}

function capturePlanAsManualState(plan) {
  clearManualPlanState();
  plan.days.forEach((day) => {
    const ids = day.destinations.map((destination) => destination.id);
    rememberDayOrder(day.dayIndex, ids);
  });
}

function groupDestinationsByDay(selectedDestinations, kDays) {
  const tripInput = currentSettings?.tripInput || buildTripInput();
  const limits = timelineLimits(tripInput);
  pruneManualPlanState(kDays);
  const days = Array.from({ length: kDays }, (_, index) => ({
    dayIndex: index + 1,
    destinations: [],
    totalStay: 0,
    reasons: [],
  }));

  const selectedById = new Map(selectedDestinations.map((destination) => [destination.id, destination]));
  const seededAssignments = {
    ...stableDayAssignments,
    ...manualDayAssignments,
  };
  Object.entries(seededAssignments).forEach(([destinationId, dayIndex]) => {
    const destination = selectedById.get(destinationId);
    if (destination && days[dayIndex - 1]) {
      days[dayIndex - 1].destinations.push(destination);
      const reason = manualDayAssignments[destinationId]
        ? `${destination.name} 由使用者指定 Day ${dayIndex}。`
        : `${destination.name} 暫時保留在 Day ${dayIndex}，避免手調後整體跳動。`;
      days[dayIndex - 1].reasons.push(reason);
    }
  });

  days.forEach((day) => {
    day.totalStay = groupStayMinutes(day.destinations);
  });

  const buckets = selectedDestinations
    .filter((destination) => !seededAssignments[destination.id])
    .reduce((map, destination) => {
      const key = bucketKey(destination);
      map[key] ||= [];
      map[key].push(destination);
      return map;
    }, {});

  const rawDayGroups = Object.values(buckets)
    .flatMap((bucket) => buildDayGroupsFromBucket(bucket, tripInput, limits))
    .sort((a, b) => groupStayMinutes(b.destinations) - groupStayMinutes(a.destinations) || anchorScore(b.anchor, tripInput) - anchorScore(a.anchor, tripInput));
  const freeDaySlots = Math.max(1, Math.min(kDays, selectedDestinations.length) - days.filter((day) => day.destinations.length).length);
  const dayGroups = rawDayGroups.flatMap((group, index) => splitGroupForAvailableDays(group, Math.max(1, freeDaySlots - index), limits, tripInput));

  dayGroups.forEach((group) => {
    const emptyDays = days.filter((day) => day.destinations.length === 0);
    const shouldUseEmptyDay = emptyDays.length > 0 && days.filter((day) => day.destinations.length > 0).length < Math.min(kDays, selectedDestinations.length, dayGroups.length);
    const candidates = shouldUseEmptyDay ? emptyDays : days;
    const target = candidates
      .map((day) => ({
        day,
        score: dayCompatibilityScore(day, group, limits),
      }))
      .sort((a, b) => b.score - a.score || a.day.totalStay - b.day.totalStay)[0].day;
    target.destinations.push(...group.destinations);
    target.totalStay = groupStayMinutes(target.destinations);
    target.reasons.push(group.reason);
  });

  improveOverloadedDays(days, limits);
  autoRepairDayGroups(days, limits, selectedDestinations);
  optimizeLocalPairing(days, limits);
  autoRepairDayGroups(days, limits, selectedDestinations);
  fillRemainingEmptyDays(days, limits);
  rebalanceFlightConstrainedDays(days, limits);
  normalizeGeneratedDayOrder(days, tripInput);
  const groupWarnings = validateGroupQuality(days, limits, selectedDestinations)
    .filter((warning) => warning.ruleCode !== "empty_day" || selectedDestinations.length >= days.length * 2);

  days.forEach((day) => {
    const order = getManualDayOrder(day.dayIndex);
    if (!order.length) return;
    day.destinations.sort((a, b) => {
      const aIndex = order.indexOf(a.id);
      const bIndex = order.indexOf(b.id);
      if (aIndex === -1 && bIndex === -1) return 0;
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    });
  });

  const result = days.map((day) => ({
    dayIndex: day.dayIndex,
    destinations: day.destinations,
    reasons: day.reasons,
    groupWarnings: groupWarnings.filter((warning) => warning.dayIndex === day.dayIndex),
  }));
  result.groupWarnings = groupWarnings.filter((warning) => warning.dayIndex === null);
  return result;
}

function orderDay(dayCandidate) {
  const fixedDestination = dayCandidate.destinations.find((destination) => destinationOverrides[destination.id]?.fixedArrivalTime);
  const manualOrder = getManualDayOrder(dayCandidate.dayIndex);
  const hasManualOrder = manualOrder.some((id) => dayCandidate.destinations.some((destination) => destination.id === id));
  if (!fixedDestination && hasManualOrder) {
    return {
      dayIndex: dayCandidate.dayIndex,
      destinations: [...dayCandidate.destinations].sort((a, b) => {
        const aIndex = manualOrder.indexOf(a.id);
        const bIndex = manualOrder.indexOf(b.id);
        if (aIndex === -1 && bIndex === -1) return a.location.lng - b.location.lng || a.location.lat - b.location.lat;
        if (aIndex === -1) return 1;
        if (bIndex === -1) return -1;
        return aIndex - bIndex;
      }),
      fixedDestination: null,
    };
  }

  if (!fixedDestination) {
    return {
      dayIndex: dayCandidate.dayIndex,
      destinations: orderByTimeWindowAndDistance(dayCandidate.destinations),
      fixedDestination: null,
    };
  }

  const fixedTime = timeToMinutes(destinationOverrides[fixedDestination.id].fixedArrivalTime);
  const defaultDeparture = timeToMinutes(currentSettings.tripInput.defaultRoutine.departureTime);
  const before = [];
  const after = [];

  dayCandidate.destinations
    .filter((destination) => destination.id !== fixedDestination.id)
    .sort((a, b) => distanceMinutes(a, fixedDestination) - distanceMinutes(b, fixedDestination))
    .forEach((destination) => {
      const canFitBefore = defaultDeparture + stayMinutes(destination) + distanceMinutes(destination, fixedDestination) + 20 < fixedTime;
      if (canFitBefore && before.length < 2) before.push(destination);
      else after.push(destination);
    });

  return {
    dayIndex: dayCandidate.dayIndex,
    destinations: [
      ...orderByTimeWindowAndDistance(before),
      fixedDestination,
      ...orderByTimeWindowAndDistance(after),
    ],
    fixedDestination,
  };
}

function createMealItem(mealType, startMinutes, dayIndex) {
  const label = mealType === "lunch" ? "午餐 / 休息" : "晚餐 / 休息";
  const override = mealOverrideForDay(dayIndex, mealType);
  const routine = currentSettings?.tripInput.defaultRoutine || {};
  const defaultMealMinutes = mealType === "dinner" ? routine.dinnerMinutes ?? 60 : routine.lunchMinutes ?? 60;
  const mealMinutes = override?.mealMinutes ?? defaultMealMinutes;
  const finalStartMinutes = override?.startTime ? timeToMinutes(override.startTime) : startMinutes;
  return {
    type: "meal",
    dayIndex,
    mealType,
    time: minutesToClock(finalStartMinutes),
    startTime: minutesToClock(finalStartMinutes),
    endTime: minutesToClock(finalStartMinutes + 20 + mealMinutes),
    name: label,
    meta: `預留 20 分鐘交通/找餐廳 + ${mealMinutes} 分鐘用餐，之後可替換成實際餐廳位置`,
    bufferMinutes: 20,
    mealMinutes,
    duration: 20 + mealMinutes,
  };
}

function buildTimeline(orderedDay, tripInput) {
  const routine = tripInput.defaultRoutine;
  const dayIndex = orderedDay.dayIndex;
  const flightBounds = dayFlightBounds(tripInput, dayIndex);
  const arrivalAirport = airportProfile(flightBounds.inbound?.airport);
  const firstLegTransportMinutes = flightBounds.inbound?.arrivalFlow === "direct_to_spot"
    ? arrivalAirport.defaultToCityCenterMinutes
    : routine.firstLegTransportMinutes ?? 20;
  const breakfastMinutes = breakfastMinutesForDay(dayIndex, routine.breakfastMinutes);
  const fixedTime = orderedDay.fixedDestination ? destinationOverrides[orderedDay.fixedDestination.id]?.fixedArrivalTime : null;
  const routineDepartureTime = flightBounds.inbound ? minutesToClock(flightBounds.earliestStart) : routine.departureTime;
  const defaultDepartureTime = fixedTime && timeToMinutes(fixedTime) < timeToMinutes(routineDepartureTime) ? fixedTime : routineDepartureTime;
  const defaultWakeTime = minutesToClock(timeToMinutes(defaultDepartureTime) - routine.prepMinutes - breakfastMinutes);
  const overriddenWakeTime = dayOverrides[dayIndex]?.wakeTime;
  const overriddenDepartureTime = overriddenWakeTime
    ? minutesToClock(timeToMinutes(overriddenWakeTime) + routine.prepMinutes + breakfastMinutes)
    : null;
  const shouldPullEarlierForFixedTime = fixedTime && overriddenDepartureTime && timeToMinutes(fixedTime) < timeToMinutes(overriddenDepartureTime);
  const departureTime = shouldPullEarlierForFixedTime ? fixedTime : overriddenDepartureTime || defaultDepartureTime;
  const wakeTime = shouldPullEarlierForFixedTime
    ? minutesToClock(timeToMinutes(departureTime) - routine.prepMinutes - breakfastMinutes)
    : overriddenWakeTime || defaultWakeTime;

  const items = [
    {
      type: "wake",
      dayIndex,
      time: wakeTime,
      startTime: wakeTime,
      endTime: departureTime,
      name: "建議起床",
      meta: `梳妝打扮 ${routine.prepMinutes} 分鐘${breakfastMinutes ? ` · 早餐 ${breakfastMinutes} 分鐘` : " · 不吃早餐"}`,
    },
    {
      type: "departure",
      time: departureTime,
      startTime: departureTime,
      endTime: departureTime,
      name: "出門",
      meta: `${buildDepartureMeta(departureTime, routine.departureTime, orderedDay.fixedDestination)}${orderedDay.destinations.length ? ` · 預估 ${firstLegTransportMinutes} 分鐘到第一站` : ""}`,
    },
  ];

  if (flightBounds.inbound) {
    const arrivalMinutes = timeToMinutes(flightBounds.inbound.time);
    const arrivalReadyMinutes = arrivalMinutes + (flightBounds.inbound.arrivalBufferMinutes || 0);
    const hotelTransferMinutes = arrivalAirport.defaultToHotelMinutes;
    const hotelBufferMinutes = flightBounds.inbound.hotelBufferMinutes || 45;
    const hotelReadyMinutes = arrivalReadyMinutes + hotelTransferMinutes + hotelBufferMinutes;
    items.splice(0, 1,
      {
        type: "flight",
        dayIndex,
        time: flightBounds.inbound.time,
        startTime: flightBounds.inbound.time,
        endTime: flightBounds.inbound.time,
        name: "抵達航班",
        meta: `${flightBounds.inbound.airport || "抵達機場"} · 預留 ${flightBounds.inbound.arrivalBufferMinutes || 0} 分鐘入境 / 行李 / 進市區`,
      },
      {
        type: "flight_buffer",
        dayIndex,
        time: minutesToClock(arrivalMinutes + (flightBounds.inbound.arrivalBufferMinutes || 0)),
        startTime: flightBounds.inbound.time,
        endTime: minutesToClock(arrivalMinutes + (flightBounds.inbound.arrivalBufferMinutes || 0)),
        name: "入境與移動 buffer",
        meta: "這段時間不排景點，避免 Day 1 過滿。",
      },
    );
    if (flightBounds.inbound.arrivalFlow !== "direct_to_spot") {
      items.splice(2, 0, {
        type: "hotel_buffer",
        dayIndex,
        time: minutesToClock(hotelReadyMinutes),
        startTime: minutesToClock(arrivalReadyMinutes),
        endTime: minutesToClock(hotelReadyMinutes),
        name: "前往住宿 / 放行李",
        meta: `${arrivalAirport.name} 到住宿約 ${hotelTransferMinutes} 分鐘 · 放行李 / check-in ${hotelBufferMinutes} 分鐘`,
      });
    }
    const departureItem = items.find((item) => item.type === "departure");
    if (departureItem) {
      departureItem.name = "開始行程";
      departureItem.meta = `抵達後開始可排行程${orderedDay.destinations.length ? ` · 預估 ${firstLegTransportMinutes} 分鐘到第一站` : ""}`;
    }
  }

  if (flightBounds.inbound) {
    const departureItem = items.find((item) => item.type === "departure");
    if (departureItem) {
      departureItem.name = "開始行程";
      departureItem.meta = `${flightBounds.inbound.arrivalFlow === "direct_to_spot" ? "抵達後直接前往第一站" : "從住宿出發開始行程"}${orderedDay.destinations.length ? ` · 預估 ${firstLegTransportMinutes} 分鐘到第一站` : ""}`;
    }
  }

  let cursor = timeToMinutes(departureTime);
  let totalTransportMinutes = 0;
  let totalStayMinutes = 0;
  let totalMealMinutes = 0;

  orderedDay.destinations.forEach((destination, index) => {
    const override = destinationOverrides[destination.id];

    if (index === 0) {
      totalTransportMinutes += firstLegTransportMinutes;
      cursor += firstLegTransportMinutes;
    } else {
      const from = orderedDay.destinations[index - 1];
      const travelMinutes = distanceMinutes(from, destination);
      totalTransportMinutes += travelMinutes;
      cursor += travelMinutes;
    }

    if (override?.fixedArrivalTime) {
      cursor = Math.max(cursor, timeToMinutes(override.fixedArrivalTime));
    }

    if (routine.lunchMinutes > 0 && cursor >= 690 && cursor <= 840 && !items.some((item) => item.mealType === "lunch") && !override?.fixedArrivalTime && (!flightBounds.outbound || cursor + 80 <= flightBounds.latestEnd)) {
      const meal = createMealItem("lunch", cursor, dayIndex);
      items.push(meal);
      cursor = timeToMinutes(meal.endTime);
      totalMealMinutes += meal.duration;
    }

    if (routine.dinnerMinutes > 0 && cursor >= 1080 && !items.some((item) => item.mealType === "dinner") && !override?.fixedArrivalTime && (!flightBounds.outbound || cursor + 80 <= flightBounds.latestEnd)) {
      const meal = createMealItem("dinner", cursor, dayIndex);
      items.push(meal);
      cursor = timeToMinutes(meal.endTime);
      totalMealMinutes += meal.duration;
    }

    const duration = stayMinutes(destination);
    const bestTimeWindow = destination.planning.bestTimeWindows?.[0] || null;
    items.push({
      type: "destination",
      destinationId: destination.id,
      time: minutesToClock(cursor),
      startTime: minutesToClock(cursor),
      endTime: minutesToClock(cursor + duration),
      name: destination.name,
      meta: `${destination.location.area} · 停留 ${duration} 分鐘 · 預估 ¥${destination.display.priceHint || 0}${override?.fixedArrivalTime ? " · 固定時間" : ""}`,
      stayMinutes: duration,
      areaLabel: destination.location.area,
      priceHint: destination.display.priceHint || 0,
      bestTimeWindow,
      isFixedTime: Boolean(override?.fixedArrivalTime),
    });
    cursor += duration;
    totalStayMinutes += duration;
  });

  if (routine.lunchMinutes > 0 && cursor <= 840 && timeToMinutes(routine.homeTime) >= 720 && !items.some((item) => item.mealType === "lunch") && (!flightBounds.outbound || Math.max(cursor, 720) + 80 <= flightBounds.latestEnd)) {
    const meal = createMealItem("lunch", Math.max(cursor, 720), dayIndex);
    items.push(meal);
    cursor = timeToMinutes(meal.endTime);
    totalMealMinutes += meal.duration;
  }

  if (routine.dinnerMinutes > 0 && timeToMinutes(routine.homeTime) >= 1080 && !items.some((item) => item.mealType === "dinner") && (!flightBounds.outbound || Math.max(cursor, 1080) + 80 <= flightBounds.latestEnd)) {
    const meal = createMealItem("dinner", Math.max(cursor, 1080), dayIndex);
    items.push(meal);
    cursor = timeToMinutes(meal.endTime);
    totalMealMinutes += meal.duration;
  }

  const returnBuffer = orderedDay.destinations.length ? 25 : 0;
  const returnTime = minutesToClock(cursor + returnBuffer);
  const departureMinutes = timeToMinutes(departureTime);
  const outingMinutes = (flightBounds.outbound ? Math.max(cursor, flightBounds.latestEnd) : cursor + returnBuffer) - departureMinutes;
  items.push({
    type: "return_home",
    time: returnTime,
    startTime: returnTime,
    endTime: returnTime,
    name: "回住宿",
    meta: `目標 ${routine.homeTime} 前回到住宿`,
  });

  if (flightBounds.outbound) {
    const outboundAirport = airportProfile(flightBounds.outbound.airport);
    const airportTravelMinutes = outboundAirport.defaultToHotelMinutes;
    const airportLeaveTime = minutesToClock(flightBounds.latestEnd);
    const airportArrivalTime = minutesToClock(flightBounds.latestEnd + airportTravelMinutes);
    items.pop();
    items.push({
      type: "airport_departure",
      time: airportLeaveTime,
      startTime: airportLeaveTime,
      endTime: airportArrivalTime,
      name: "前往機場",
      meta: `${flightBounds.outbound.airport || "出發機場"} · 起飛 ${flightBounds.outbound.time} 前預留 ${flightBounds.outbound.airportBufferMinutes || 0} 分鐘`,
    });
    items[items.length - 1].name = "前往機場";
    items[items.length - 1].meta = `從住宿 / 最後一站到 ${outboundAirport.name} 約 ${airportTravelMinutes} 分鐘`;
    items.push({
      type: "airport_buffer",
      time: airportArrivalTime,
      startTime: airportArrivalTime,
      endTime: flightBounds.outbound.time,
      name: "機場報到 buffer",
      meta: `起飛 ${flightBounds.outbound.time} 前預留 ${flightBounds.outbound.airportBufferMinutes || 0} 分鐘`,
    });
    items.push({
      type: "flight",
      time: flightBounds.outbound.time,
      startTime: flightBounds.outbound.time,
      endTime: flightBounds.outbound.time,
      name: "回程航班",
      meta: flightBounds.outbound.airport || "出發機場",
    });
  }

  return {
    dayIndex,
    routine: { ...routine, wakeTime, breakfastMinutes },
    destinations: orderedDay.destinations,
    fixedDestination: orderedDay.fixedDestination,
    flightBounds,
    items,
    stats: {
      totalStayMinutes,
      totalTransportMinutes,
      totalMealMinutes,
      estimatedReturnTime: flightBounds.outbound ? minutesToClock(flightBounds.latestEnd) : returnTime,
      activeMinutes: cursor - departureMinutes,
      outingMinutes,
      sightseeingMinutes: totalStayMinutes,
    },
  };
}

function buildDepartureMeta(departureTime, defaultDepartureTime, fixedDestination) {
  if (departureTime === defaultDepartureTime) return "從住宿出發";
  if (fixedDestination) return `為了 ${fixedDestination.name} 提前出門`;
  return "依照你調整的起床時間出門";
}

function validateTimeline(timelineDay, tripInput) {
  const hardViolations = [];
  const softWarnings = [];
  const limits = timelineLimits(tripInput);
  const dayLimits = limitsForDay(timelineDay.dayIndex, limits);
  const maxDestinations = dayLimits.maxDestinations;

  timelineDay.destinations.forEach((destination) => {
    if (!destination.location.lat || !destination.location.lng || !destination.location.city || !destination.location.countryCode) {
      hardViolations.push({
        ruleCode: "missing_required_location",
        message: `${destination.name} 缺少必要地理資料，無法可靠排程。`,
        destinationIds: [destination.id],
      });
    }
  });

  if (timelineDay.destinations.length > maxDestinations) {
    softWarnings.push({
      ruleCode: "too_many_destinations",
      message: `Day ${timelineDay.dayIndex}：安排了 ${timelineDay.destinations.length} 個點，超過目前節奏建議的 ${maxDestinations} 個。`,
    });
  }

  timelineDay.destinations.forEach((destination, index) => {
    if (index === 0) return;
    const previous = timelineDay.destinations[index - 1];
    const travel = distanceMinutes(previous, destination);
    if (travel > 35) {
      softWarnings.push({
        ruleCode: "long_transport",
        message: `Day ${timelineDay.dayIndex}：${previous.name} 到 ${destination.name} 約 ${travel} 分鐘，可能偏遠。`,
      });
    }
  });

  const airportDepartureItem = timelineDay.items.find((item) => item.type === "airport_departure");
  const lastDestinationItem = [...timelineDay.items].reverse().find((item) => item.type === "destination");
  if (airportDepartureItem && lastDestinationItem && timeToMinutes(lastDestinationItem.endTime) > timeToMinutes(airportDepartureItem.startTime)) {
    hardViolations.push({
      ruleCode: "flight_departure_conflict",
      message: `Day ${timelineDay.dayIndex}：最後一個景點 ${lastDestinationItem.endTime} 結束，已經晚於 ${airportDepartureItem.startTime} 前往機場。`,
    });
  }

  const homeTime = timeToMinutes(tripInput.defaultRoutine.homeTime);
  const returnTime = timeToMinutes(timelineDay.stats.estimatedReturnTime);
  if (!airportDepartureItem && returnTime > homeTime) {
    hardViolations.push({
      ruleCode: "return_after_home_time",
      message: `Day ${timelineDay.dayIndex}：預估 ${timelineDay.stats.estimatedReturnTime} 回住宿，晚於你設定的 ${tripInput.defaultRoutine.homeTime}。`,
    });
  }

  if (timeToMinutes(timelineDay.routine.wakeTime) < 360) {
    softWarnings.push({
      ruleCode: "early_wake_up",
      message: `Day ${timelineDay.dayIndex}：${timelineDay.routine.wakeTime} 起床偏早，建議前一晚不要排太滿。`,
    });
  }

  if (timelineDay.stats.outingMinutes > dayLimits.maxOutingMinutes) {
    softWarnings.push({
      ruleCode: "outing_too_long",
      message: `Day ${timelineDay.dayIndex}：外出約 ${formatDuration(timelineDay.stats.outingMinutes)}，超過「${limits.profileLabel}」建議上限 ${formatDuration(dayLimits.maxOutingMinutes)}。`,
    });
  }

  if (timelineDay.stats.sightseeingMinutes > dayLimits.maxSightseeingMinutes) {
    softWarnings.push({
      ruleCode: "sightseeing_too_long",
      message: `Day ${timelineDay.dayIndex}：景點停留約 ${formatDuration(timelineDay.stats.sightseeingMinutes)}，可能比「${limits.profileLabel}」適合的遊玩負荷高。`,
    });
  }

  const dinnerItem = timelineDay.items.find((item) => item.mealType === "dinner");
  if (dinnerItem && timeToMinutes(dinnerItem.startTime) > timeToMinutes(limits.dinnerLatest)) {
    softWarnings.push({
      ruleCode: "late_dinner",
      message: `Day ${timelineDay.dayIndex}：晚餐安排在 ${dinnerItem.startTime}，對「${limits.profileLabel}」可能偏晚。`,
    });
  }

  timelineDay.items
    .filter((item) => item.type === "destination" && item.bestTimeWindow?.preferredTime && !destinationOverrides[item.destinationId]?.fixedArrivalTime)
    .forEach((item) => {
      const preferred = timeToMinutes(item.bestTimeWindow.preferredTime);
      const actual = timeToMinutes(item.startTime);
      const drift = Math.abs(actual - preferred);
      if (drift > 120) {
        softWarnings.push({
          ruleCode: "missed_best_time_window",
          message: `Day ${timelineDay.dayIndex}：${item.name} 建議 ${item.bestTimeWindow.preferredTime}${item.bestTimeWindow.reason ? ` ${item.bestTimeWindow.reason}` : ""}，但目前 ${item.startTime} 抵達，體驗可能不符預期。`,
        });
      }
    });

  if (timelineDay.fixedDestination) {
    const fixedTime = destinationOverrides[timelineDay.fixedDestination.id]?.fixedArrivalTime;
    const departureTime = timelineDay.items.find((item) => item.type === "departure")?.time;
    if (fixedTime && departureTime && timeToMinutes(fixedTime) < timeToMinutes(tripInput.defaultRoutine.departureTime)) {
      softWarnings.push({
        ruleCode: "early_departure_for_fixed_time",
        message: `Day ${timelineDay.dayIndex}：因為 ${timelineDay.fixedDestination.name} 固定 ${fixedTime}，建議這天提前到 ${departureTime} 出門。`,
      });
    }
  }

  return {
    hardViolations,
    softWarnings,
    hasIssue: hardViolations.length > 0 || softWarnings.length > 0,
  };
}

function buildAdvisorNote(timelineDay, ruleCheck) {
  if (!timelineDay.fixedDestination && !ruleCheck.hasIssue) return null;

  const issueCount = ruleCheck.hardViolations.length + ruleCheck.softWarnings.length;
  if (timelineDay.fixedDestination) {
    const severity = ruleCheck.hardViolations.length ? "critical" : issueCount ? "warning" : "info";
    const summary = issueCount
      ? `已把 ${timelineDay.fixedDestination.name} 當成 Day ${timelineDay.dayIndex} 的錨點重排，但仍有 ${issueCount} 個需要取捨的地方。`
      : `已把 ${timelineDay.fixedDestination.name} 當成 Day ${timelineDay.dayIndex} 的錨點，這天目前看起來可行。`;
    return {
      severity,
      summary,
      suggestions: issueCount ? ["可刪掉較低優先級景點", "可調整起床或回住宿時間", "可把偏遠景點移到其他天"] : ["保留目前安排"],
    };
  }

  return {
    severity: ruleCheck.hardViolations.length ? "critical" : "warning",
    summary: `Day ${timelineDay.dayIndex} 有 ${issueCount} 個行程提醒，建議調整後再確認。`,
    suggestions: ["檢查交通時間", "減少當天景點數", "調整用餐或回住宿時間"],
  };
}

function destinationTimeDrift(destinationId, dayCandidate, tripInput) {
  const timelineDay = buildTimeline(orderDay(dayCandidate), tripInput);
  const item = timelineDay.items.find((timelineItem) => timelineItem.type === "destination" && timelineItem.destinationId === destinationId);
  if (!item?.bestTimeWindow?.preferredTime) return null;
  return Math.abs(timeToMinutes(item.startTime) - timeToMinutes(item.bestTimeWindow.preferredTime));
}

function repairBestTimeWindows(dayCandidates, tripInput) {
  const limits = timelineLimits(tripInput);
  const movedDestinationIds = new Set();

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const repairs = dayCandidates.flatMap((sourceDay) => {
      const timelineDay = buildTimeline(orderDay(sourceDay), tripInput);
      return timelineDay.items
        .filter((item) => item.type === "destination" && item.bestTimeWindow?.preferredTime)
        .map((item) => {
          const destination = sourceDay.destinations.find((candidate) => candidate.id === item.destinationId);
          const currentDrift = Math.abs(timeToMinutes(item.startTime) - timeToMinutes(item.bestTimeWindow.preferredTime));
          if (!destination || currentDrift <= 120 || isUserConstrainedDestination(destination) || movedDestinationIds.has(destination.id)) return null;

          return dayCandidates
            .filter((targetDay) => targetDay.dayIndex !== sourceDay.dayIndex)
            .filter((targetDay) => targetDay.destinations.length > 0)
            .map((targetDay) => {
              if (!dayHasCapacityFor(targetDay, [destination], limits)) return null;
              if (wouldBecomeBadThinDay(sourceDay, [destination])) return null;
              if (targetDay.destinations.some((targetDestination) => targetDestination.location.city !== destination.location.city)) return null;

              const projectedTarget = {
                ...targetDay,
                destinations: [...targetDay.destinations, destination],
              };
              const projectedSource = {
                ...sourceDay,
                destinations: sourceDay.destinations.filter((sourceDestination) => sourceDestination.id !== destination.id),
              };
              const newDrift = destinationTimeDrift(destination.id, projectedTarget, tripInput);
              if (newDrift === null) return null;
              const timeFitGain = currentDrift - newDrift;
              const pairCompatibility = dayPairAverage(destination, targetDay);
              const currentDayDamage = projectedSource.destinations.length === 0 ? 25 : 0;
              const score = timeFitGain + pairCompatibility - currentDayDamage;

              return {
                sourceDay,
                targetDay,
                destination,
                score,
                timeFitGain,
                newDrift,
              };
            })
            .filter(Boolean)
            .sort((a, b) => b.score - a.score)[0] || null;
        })
        .filter(Boolean);
    })
      .sort((a, b) => b.score - a.score);

    const best = repairs[0];
    if (!best || best.timeFitGain < 90 || best.score < 80) break;
    best.sourceDay.destinations = best.sourceDay.destinations.filter((destination) => destination.id !== best.destination.id);
    best.targetDay.destinations.push(best.destination);
    best.sourceDay.totalStay = groupStayMinutes(best.sourceDay.destinations);
    best.targetDay.totalStay = groupStayMinutes(best.targetDay.destinations);
    best.targetDay.reasons.push(`${best.destination.name} moved closer to its recommended time window.`);
    movedDestinationIds.add(best.destination.id);
  }
}

function refreshDayCandidateWarnings(dayCandidates, limits, selectedDestinations) {
  const groupWarnings = validateGroupQuality(dayCandidates, limits, selectedDestinations)
    .filter((warning) => warning.ruleCode !== "empty_day" || selectedDestinations.length >= dayCandidates.length * 2);
  dayCandidates.forEach((day) => {
    day.groupWarnings = groupWarnings.filter((warning) => warning.dayIndex === day.dayIndex);
  });
  dayCandidates.groupWarnings = groupWarnings.filter((warning) => warning.dayIndex === null);
}

function createPlan(tripInput, selectedDestinations) {
  const dayCandidates = groupDestinationsByDay(selectedDestinations, tripInput.kDays);
  repairBestTimeWindows(dayCandidates, tripInput);
  refreshDayCandidateWarnings(dayCandidates, timelineLimits(tripInput), selectedDestinations);
  const globalGroupWarnings = dayCandidates.groupWarnings || [];
  const days = dayCandidates.map((candidate) => {
    const orderedDay = orderDay(candidate);
    const timelineDay = buildTimeline(orderedDay, tripInput);
    const ruleCheck = validateTimeline(timelineDay, tripInput);
    ruleCheck.softWarnings.unshift(...(candidate.groupWarnings || []));
    ruleCheck.hasIssue = ruleCheck.hasIssue || Boolean(candidate.groupWarnings?.length);
    const advisorNote = buildAdvisorNote(timelineDay, ruleCheck);
    return { ...timelineDay, reasons: candidate.reasons || [], ruleCheck, advisorNote };
  });

  return {
    tripInput,
    days,
    warnings: [
      ...globalGroupWarnings.filter((warning) => warning.dayIndex === null).map((warning) => warning.message),
      ...days.flatMap((day) => [
      ...day.ruleCheck.hardViolations.map((item) => item.message),
      ...day.ruleCheck.softWarnings.map((item) => item.message),
      ]),
    ],
  };
}

function renderPlan(plan, selectedCount) {
  warningsEl.innerHTML = plan.warnings.map((warning) => `<div class="warning">${warning}</div>`).join("");
  summaryEl.textContent = `已選 ${selectedCount} 個景點，產生 ${plan.days.length} 天行程草稿。`;
  itineraryEl.className = "itinerary";
  itineraryEl.innerHTML = plan.days
    .map((day) => `
      <article class="day">
        <header class="day-header">
          <h3>Day ${day.dayIndex}</h3>
          <p class="day-meta">外出約 ${formatDuration(day.stats.outingMinutes)} · 景點約 ${formatDuration(day.stats.sightseeingMinutes)} · 交通約 ${day.stats.totalTransportMinutes} 分鐘</p>
        </header>
        <div class="schedule">
          ${day.items.map((item) => renderTimelineItem(day, item)).join("")}
          ${day.advisorNote ? `<p class="ai-note">AI 顧問：${day.advisorNote.summary} ${day.advisorNote.suggestions.join("、")}。</p>` : ""}
        </div>
      </article>
    `)
    .join("");
  renderAlgorithmNotes(plan);
  renderPlanMap(plan);
  bindScheduleEditors();
  renderSupportPanels(plan);
}

function renderPlanMap(plan) {
  if (!planMapEl || !mapDayFilterEl) return;
  if (!plan) {
    mapDayFilterEl.innerHTML = `<option value="all">全部天數</option>`;
    planMapEl.className = "plan-map empty";
    planMapEl.innerHTML = "<p>生成行程後顯示景點分布。</p>";
    return;
  }
  const selectedDay = mapDayFilterEl.value || "all";
  const points = plan.days.flatMap((day) => day.destinations.map((destination) => ({ dayIndex: day.dayIndex, destination })));
  if (!points.length) {
    planMapEl.className = "plan-map empty";
    planMapEl.innerHTML = "<p>生成行程後顯示景點分布。</p>";
    return;
  }

  mapDayFilterEl.innerHTML = [
    `<option value="all">全部天數</option>`,
    ...plan.days.map((day) => `<option value="${day.dayIndex}" ${String(day.dayIndex) === selectedDay ? "selected" : ""}>Day ${day.dayIndex}</option>`),
  ].join("");

  const lats = points.map((point) => point.destination.location.lat);
  const lngs = points.map((point) => point.destination.location.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const latRange = Math.max(maxLat - minLat, 0.01);
  const lngRange = Math.max(maxLng - minLng, 0.01);

  const pointMarkup = points.map((point) => {
    const { destination, dayIndex } = point;
    const x = 8 + ((destination.location.lng - minLng) / lngRange) * 84;
    const y = 8 + (1 - (destination.location.lat - minLat) / latRange) * 84;
    const isVisible = selectedDay === "all" || selectedDay === String(dayIndex);
    const color = dayColors[(dayIndex - 1) % dayColors.length];
    const size = isLargeDestination(destination) ? "24px" : "18px";
    const badge = destination.planning.bestTimeWindows?.length ? "★" : dayIndex;
    const labelSide = x > 72 ? "left" : "right";
    return `
      <div class="map-point ${isLargeDestination(destination) ? "large" : ""} ${isVisible ? "" : "dimmed"}"
        style="--x:${x}%; --y:${y}%; --color:${color}; --size:${size};"
        title="Day ${dayIndex} · ${destination.name}">
        ${badge}
      </div>
      <div class="map-label ${labelSide === "left" ? "label-left" : ""} ${isVisible ? "" : "dimmed"}" style="--x:${x}%; --y:${y}%;">${destination.name}</div>
    `;
  }).join("");

  const legend = plan.days
    .filter((day) => day.destinations.length)
    .map((day) => `<span><i class="legend-dot" style="--color:${dayColors[(day.dayIndex - 1) % dayColors.length]}"></i>Day ${day.dayIndex} · ${day.destinations.length} 點</span>`)
    .join("");
  const canvasWidth = Math.round(900 * mapZoom);
  const canvasHeight = Math.round(620 * mapZoom);

  planMapEl.className = "plan-map";
  planMapEl.innerHTML = `
    <div class="map-scroll" aria-label="可捲動景點分布圖">
      <div class="map-canvas" style="width:max(${canvasWidth}px, 140%); height:${canvasHeight}px;">${pointMarkup}</div>
    </div>
    <div class="map-legend">${legend}<span>★ 建議時段</span><span>可縮放、拖曳與捲動</span></div>
  `;
  updateMapZoomLabel();
  bindMapPanning();
}

function setMapZoom(nextZoom) {
  mapZoom = Math.min(2.2, Math.max(0.7, Number(nextZoom.toFixed(2))));
  if (currentPlan) renderPlanMap(currentPlan);
  else updateMapZoomLabel();
}

function updateMapZoomLabel() {
  if (mapZoomResetEl) mapZoomResetEl.textContent = `${Math.round(mapZoom * 100)}%`;
}

function bindMapPanning() {
  const scrollEl = planMapEl?.querySelector(".map-scroll");
  if (!scrollEl) return;
  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let scrollLeft = 0;
  let scrollTop = 0;

  scrollEl.addEventListener("pointerdown", (event) => {
    isDragging = true;
    scrollEl.setPointerCapture(event.pointerId);
    startX = event.clientX;
    startY = event.clientY;
    scrollLeft = scrollEl.scrollLeft;
    scrollTop = scrollEl.scrollTop;
    scrollEl.classList.add("dragging");
  });

  scrollEl.addEventListener("pointermove", (event) => {
    if (!isDragging) return;
    event.preventDefault();
    scrollEl.scrollLeft = scrollLeft - (event.clientX - startX);
    scrollEl.scrollTop = scrollTop - (event.clientY - startY);
  });

  scrollEl.addEventListener("pointerup", (event) => {
    isDragging = false;
    scrollEl.releasePointerCapture(event.pointerId);
    scrollEl.classList.remove("dragging");
  });

  scrollEl.addEventListener("pointercancel", () => {
    isDragging = false;
    scrollEl.classList.remove("dragging");
  });
}

function renderAlgorithmNotes(plan) {
  if (!algorithmNotesEl) return;
  const sample = plan.days.flatMap((day) => day.destinations).find((destination) => isLargeDestination(destination)) || plan.days.flatMap((day) => day.destinations)[0];
  const sampleData = sample
    ? {
      id: sample.id,
      name: sample.name,
      location: sample.location,
      category: sample.category,
      display: { tags: sample.display.tags, rating: sample.display.rating, priceHint: sample.display.priceHint },
      planning: sample.planning,
      reservation: sample.reservation || null,
    }
    : null;

  algorithmNotesEl.innerHTML = `
    <div class="algorithm-grid">
      <section>
        <h3>分組流程</h3>
        <ol>
          <li>城市 / 區域 / 大景點先分 bucket。</li>
          <li>bucket 內用 anchorScore 選 day group 核心。</li>
          <li>用 pairScore 把剩餘景點分到最適合的 group。</li>
          <li>檢查容量，超載時用 moveScore 搬移低 anchorScore 景點。</li>
          <li>每天內再 orderDay，早市靠前、夜景靠後，接著 buildTimeline + validateTimeline。</li>
        </ol>
      </section>
      <section>
        <h3>實際規則</h3>
        <p><strong>anchorScore</strong>：importance、停留時間、intensity、bestTimeWindows、category、偏好相符。大景點與時段特殊點會被優先安置。</p>
        <p><strong>pairScore</strong>：city、area、lat/lng 距離、category/tags、mealFriendly、time window 相容性、是否高強度或大景點。</p>
      </section>
      <section>
        <h3>本次分組原因</h3>
        <ul>
          ${plan.days.map((day) => `<li>Day ${day.dayIndex}：${day.reasons.length ? day.reasons.join(" ") : "依容量與距離分配。"}</li>`).join("")}
        </ul>
      </section>
      <section>
        <h3>假資料樣貌</h3>
        <pre>${JSON.stringify(sampleData, null, 2)}</pre>
      </section>
    </div>
  `;
}

function renderSupportPanels(plan) {
  if (!weatherListEl || !checklistListEl) return;
  if (!plan) {
    weatherSummaryEl.textContent = "生成行程後，依目的地抓每日天氣並給穿搭提醒。";
    weatherListEl.className = "weather-list empty";
    weatherListEl.innerHTML = "<p>尚未產生天氣提示。</p>";
    outfitNoteEl.textContent = "";
    checklistSummaryEl.textContent = "需要預約、雨備與行程風險會整理在這裡。";
    checklistListEl.className = "checklist-list empty";
    checklistListEl.innerHTML = "<p>尚未產生檢查項目。</p>";
    return;
  }

  renderChecklist(plan, null);
  renderWeatherLoading(plan);
  loadWeatherForecast(plan);
}

function primaryWeatherCity(plan) {
  const destinationsInPlan = plan.days.flatMap((day) => day.destinations);
  const cityCounts = destinationsInPlan.reduce((counts, destination) => {
    counts[destination.location.city] = (counts[destination.location.city] || 0) + 1;
    return counts;
  }, {});
  const city = Object.entries(cityCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || selectedCities()[0] || "osaka";
  return cityWeatherProfiles[city] || cityWeatherProfiles.osaka;
}

function renderWeatherLoading(plan) {
  const city = primaryWeatherCity(plan);
  const weatherWindow = weatherDateWindow(plan);
  weatherSummaryEl.textContent = `正在取得 ${city.cityName} ${weatherWindow.label} 的天氣，用來輔助穿搭與雨備。`;
  weatherListEl.className = "weather-list";
  weatherListEl.innerHTML = plan.days
    .map((day) => `
      <article class="weather-card loading">
        <h3>Day ${day.dayIndex}</h3>
        <p>讀取天氣中...</p>
      </article>
    `)
    .join("");
  outfitNoteEl.textContent = "";
}

async function loadWeatherForecast(plan) {
  const requestId = ++weatherRequestId;
  const city = primaryWeatherCity(plan);
  const weatherWindow = weatherDateWindow(plan);
  let forecast;
  let source = "open-meteo";

  try {
    forecast = await fetchWeatherForecast(city, weatherWindow);
  } catch (error) {
    forecast = mockWeatherForecast(city, weatherWindow);
    source = "mock";
  }

  if (requestId !== weatherRequestId) return;
  renderWeather(plan, forecast, city, source, weatherWindow);
  renderChecklist(plan, forecast);
}

function dateString(date) {
  return date.toISOString().slice(0, 10);
}

function parseDateOnly(value) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function daysBetweenInclusive(startDate, endDate) {
  return Math.max(1, Math.round((endDate - startDate) / 86400000) + 1);
}

function weatherDateWindow(plan) {
  const tripInput = currentSettings?.tripInput;
  const inboundDate = parseDateOnly(tripInput?.flights?.inbound?.date);
  const outboundDate = parseDateOnly(tripInput?.flights?.outbound?.date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const planDayCount = plan?.days.length || 1;
  let startDate;
  let endDate;

  if (inboundDate && outboundDate && outboundDate >= inboundDate) {
    startDate = inboundDate;
    endDate = outboundDate;
  } else if (inboundDate) {
    startDate = inboundDate;
    endDate = addDays(inboundDate, Math.max(planDayCount - 1, 0));
  } else if (outboundDate) {
    endDate = outboundDate;
    startDate = addDays(outboundDate, -Math.max(planDayCount - 1, 0));
  } else {
    startDate = today;
    endDate = addDays(today, Math.max(planDayCount - 1, 0));
  }

  const dayCount = daysBetweenInclusive(startDate, endDate);
  const sourceLabel = inboundDate || outboundDate ? "航班日期區間" : "最近可預報日期";
  return {
    startDate: dateString(startDate),
    endDate: dateString(endDate),
    dayCount,
    label: `${dateString(startDate)} 至 ${dateString(endDate)}`,
    sourceLabel,
  };
}

function canUseForecastApi(weatherWindow) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = parseDateOnly(weatherWindow.startDate);
  const end = parseDateOnly(weatherWindow.endDate);
  if (!start || !end) return false;
  const maxForecastDate = addDays(today, 15);
  return start >= today && end <= maxForecastDate;
}

async function fetchWeatherForecast(city, weatherWindow) {
  if (!canUseForecastApi(weatherWindow)) throw new Error("Weather range outside forecast window");
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", city.lat);
  url.searchParams.set("longitude", city.lng);
  url.searchParams.set("daily", "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max");
  url.searchParams.set("timezone", "auto");
  url.searchParams.set("start_date", weatherWindow.startDate);
  url.searchParams.set("end_date", weatherWindow.endDate);

  const response = await fetch(url.toString());
  if (!response.ok) throw new Error("Weather request failed");
  const data = await response.json();
  return Array.from({ length: data.daily.time.length }, (_, index) => ({
    dayIndex: index + 1,
    date: data.daily.time[index],
    code: data.daily.weather_code[index],
    tempMax: Math.round(data.daily.temperature_2m_max[index]),
    tempMin: Math.round(data.daily.temperature_2m_min[index]),
    rainChance: data.daily.precipitation_probability_max[index] ?? 0,
  }));
}

function mockWeatherForecast(city, weatherWindow) {
  const baseTemp = city.cityName === "首爾" ? 18 : city.cityName === "東京" ? 22 : 24;
  const startDate = parseDateOnly(weatherWindow.startDate) || new Date();
  return Array.from({ length: weatherWindow.dayCount }, (_, index) => ({
    dayIndex: index + 1,
    date: dateString(addDays(startDate, index)),
    code: index % 3 === 1 ? 61 : index % 3 === 2 ? 3 : 1,
    tempMax: baseTemp + (index % 2),
    tempMin: baseTemp - 6,
    rainChance: index % 3 === 1 ? 70 : index % 3 === 2 ? 35 : 15,
  }));
}

function weatherLabel(code) {
  if ([0, 1].includes(code)) return "晴朗";
  if ([2, 3].includes(code)) return "多雲";
  if (code >= 51 && code <= 67) return "可能下雨";
  if (code >= 80 && code <= 99) return "陣雨";
  return "天氣穩定";
}

function outfitAdviceForForecast(forecast) {
  const maxRain = Math.max(...forecast.map((day) => day.rainChance));
  const minTemp = Math.min(...forecast.map((day) => day.tempMin));
  const maxTemp = Math.max(...forecast.map((day) => day.tempMax));
  const advice = ["好走鞋"];

  if (maxRain >= 60) advice.push("折疊傘或輕便雨衣");
  if (minTemp <= 16) advice.push("薄外套");
  if (maxTemp >= 27) advice.push("透氣上衣與防曬");
  if (maxRain < 40 && maxTemp < 27 && minTemp > 16) advice.push("可多帶一件薄襯衫應付室內外溫差");

  return advice;
}

function renderWeather(plan, forecast, city, source, weatherWindow) {
  const fallbackNote = source === "mock" ? "目前用模擬天氣或日期超出可預報範圍，之後可直接換成正式 API。" : "資料來源：Open-Meteo，無需 API key。";
  weatherSummaryEl.textContent = `${city.cityName} ${weatherWindow.sourceLabel} ${weatherWindow.label}，共 ${forecast.length} 天，${fallbackNote}`;
  weatherListEl.className = "weather-list";
  weatherListEl.innerHTML = forecast
    .map((weather, index) => {
      return `
        <article class="weather-card">
          <div>
            <h3>Day ${index + 1}</h3>
            <p>${weather.date}</p>
          </div>
          <strong>${weatherLabel(weather.code)}</strong>
          <p>${weather.tempMin}-${weather.tempMax}°C · 降雨 ${weather.rainChance}%</p>
        </article>
      `;
    })
    .join("");
  outfitNoteEl.textContent = `穿搭建議：${outfitAdviceForForecast(forecast).join("、")}。`;
}

function reservationForDestination(destination) {
  if (destination.reservation) return destination.reservation;
  if (destination.planning.needsReservation) {
    return {
      required: true,
      type: "ticket",
      status: "needed",
      suggestedTime: destination.planning.bestTimeWindows?.[0]?.preferredTime || "09:00",
      note: "此景點標記為需要預約，請確認票券、營業時間或入場規則。",
      lockTimeline: true,
    };
  }
  return null;
}

function reservationTypeLabel(type) {
  return {
    ticket: "票券",
    restaurant: "餐廳",
    activity: "活動",
    transport: "交通",
    hotel: "住宿",
  }[type] || "預約";
}

function reservationStatusLabel(status) {
  return {
    needed: "待處理",
    booked: "已預約",
    optional: "可選",
    skipped: "略過",
    not_available: "不可預約",
  }[status] || "待處理";
}

function checklistItemsForPlan(plan, forecast) {
  const items = [];
  plan.days.forEach((day) => {
    day.destinations
      .filter((destination) => reservationForDestination(destination))
      .forEach((destination) => {
        const reservation = reservationForDestination(destination);
        const state = reservationState[destination.id] || {};
        const status = state.status || reservation.status || "needed";
        items.push({
          id: `reservation-${day.dayIndex}-${destination.id}`,
          kind: "reservation",
          destinationId: destination.id,
          dayIndex: day.dayIndex,
          label: `${destination.name}`,
          reservation,
          status,
          scheduledTime: state.scheduledTime || reservation.suggestedTime || day.items.find((item) => item.destinationId === destination.id)?.startTime || "",
          locked: state.locked ?? reservation.lockTimeline ?? false,
        });
      });

    if (day.ruleCheck.hardViolations.length || day.ruleCheck.softWarnings.length) {
      items.push({
        id: `timeline-${day.dayIndex}`,
        kind: "basic",
        label: `Day ${day.dayIndex}：有 ${day.ruleCheck.hardViolations.length + day.ruleCheck.softWarnings.length} 個行程提醒，出發前再檢查一次。`,
      });
    }

    const weather = forecast?.[day.dayIndex - 1];
    if (weather?.rainChance >= 50) {
      items.push({
        id: `rain-${day.dayIndex}`,
        kind: "basic",
        label: `Day ${day.dayIndex}：降雨機率 ${weather.rainChance}%，準備雨具或雨天備案。`,
      });
    }
  });

  if (!items.length) {
    items.push({
      id: "basic-pack",
      kind: "basic",
      label: "確認護照/證件、充電器、行動電源與住宿交通資訊。",
    });
  }

  return items;
}

function renderChecklist(plan, forecast) {
  const items = checklistItemsForPlan(plan, forecast);
  const reservationCount = items.filter((item) => item.kind === "reservation").length;
  checklistSummaryEl.textContent = `目前整理 ${items.length} 個行前檢查項目，其中 ${reservationCount} 個和預約相關。`;
  checklistListEl.className = "checklist-list";
  checklistListEl.innerHTML = items
    .map((item) => (item.kind === "reservation" ? renderReservationChecklistItem(item) : renderBasicChecklistItem(item)))
    .join("");

  checklistListEl.querySelectorAll("input").forEach((input) => {
    input.addEventListener("change", (event) => {
      checklistState[event.target.dataset.checklistId] = event.target.checked;
    });
  });

  checklistListEl.querySelectorAll(".reservation-status-input").forEach((select) => {
    select.addEventListener("change", (event) => {
      const destinationId = event.target.dataset.destinationId;
      reservationState[destinationId] = {
        ...reservationState[destinationId],
        status: event.target.value,
      };
      renderChecklist(plan, forecast);
    });
  });

  checklistListEl.querySelectorAll(".reservation-time-input").forEach((input) => {
    input.addEventListener("change", (event) => {
      const destinationId = event.target.dataset.destinationId;
      reservationState[destinationId] = {
        ...reservationState[destinationId],
        scheduledTime: event.target.value,
      };
    });
  });

  checklistListEl.querySelectorAll(".reservation-lock-input").forEach((input) => {
    input.addEventListener("change", (event) => {
      const destinationId = event.target.dataset.destinationId;
      reservationState[destinationId] = {
        ...reservationState[destinationId],
        locked: event.target.checked,
      };
      if (event.target.checked) {
        destinationOverrides[destinationId] = {
          ...destinationOverrides[destinationId],
          fixedArrivalTime: reservationState[destinationId].scheduledTime || event.target.dataset.scheduledTime,
        };
        regeneratePlan();
      }
    });
  });
}

function renderBasicChecklistItem(item) {
  return `
    <label class="checklist-item">
      <input type="checkbox" data-checklist-id="${item.id}" ${checklistState[item.id] ? "checked" : ""} />
      <span>${item.label}</span>
    </label>
  `;
}

function renderReservationChecklistItem(item) {
  return `
    <article class="checklist-item reservation-item">
      <input type="checkbox" data-checklist-id="${item.id}" ${checklistState[item.id] ? "checked" : ""} />
      <div class="reservation-body">
        <div class="reservation-title-row">
          <strong>Day ${item.dayIndex} · ${item.label}</strong>
          <span class="reservation-badge">${reservationTypeLabel(item.reservation.type)}</span>
          <span class="reservation-badge ${item.reservation.required ? "required" : "optional"}">${item.reservation.required ? "需要預約" : "建議預留"}</span>
        </div>
        <p>${item.reservation.note}</p>
        <div class="reservation-controls">
          <label>
            <span>狀態</span>
            <select class="reservation-status-input" data-destination-id="${item.destinationId}">
              ${["needed", "booked", "optional", "skipped", "not_available"].map((status) => `<option value="${status}" ${status === item.status ? "selected" : ""}>${reservationStatusLabel(status)}</option>`).join("")}
            </select>
          </label>
          <label>
            <span>預約時間</span>
            <input class="reservation-time-input" type="text" inputmode="numeric" pattern="^\\d{2}:\\d{2}$" data-destination-id="${item.destinationId}" value="${item.scheduledTime}" />
          </label>
          <label class="reservation-lock">
            <input class="reservation-lock-input" type="checkbox" data-destination-id="${item.destinationId}" data-scheduled-time="${item.scheduledTime}" ${item.locked ? "checked" : ""} />
            <span>鎖定行程時間</span>
          </label>
        </div>
      </div>
    </article>
  `;
}

function renderTimelineItem(day, item) {
  const isDestination = item.type === "destination";
  const isWake = item.type === "wake";
  const editableClass = isDestination || isWake ? "editable" : "";
  const dataAttrs = isDestination
    ? `data-day="${day.dayIndex}" data-destination-id="${item.destinationId}" draggable="true"`
    : isWake
      ? `data-day="${day.dayIndex}" data-routine="wake"`
      : "";

  return `
    <div class="schedule-item ${editableClass}" ${dataAttrs}>
      ${isDestination ? `<button type="button" class="drag-handle" aria-label="拖移 ${item.name}">⋮⋮</button>` : `<div></div>`}
      <div class="time">${item.time}</div>
      <div>
        <h3>${item.name}</h3>
        <p class="summary-line">${item.meta}</p>
      </div>
      ${isDestination ? renderQuickActions(day, item) : `<div></div>`}
      ${isDestination ? renderDestinationEditor(day, item) : ""}
      ${isWake ? renderWakeEditor(day, item) : ""}
    </div>
  `;
}

function renderQuickActions(day, item) {
  const totalDays = currentPlan?.days.length || currentSettings?.tripInput.kDays || 1;
  return `
    <div class="quick-actions">
      <button type="button" class="icon-button quick-up" title="上移" aria-label="上移 ${item.name}">↑</button>
      <button type="button" class="icon-button quick-down" title="下移" aria-label="下移 ${item.name}">↓</button>
      <select class="quick-day-input" title="移到哪一天" aria-label="移動 ${item.name} 到哪一天">
        ${Array.from({ length: totalDays }, (_, index) => {
          const dayIndex = index + 1;
          return `<option value="${dayIndex}" ${dayIndex === day.dayIndex ? "selected" : ""}>Day ${dayIndex}</option>`;
        }).join("")}
      </select>
      <button type="button" class="icon-button danger quick-remove" title="移除" aria-label="移除 ${item.name}">×</button>
    </div>
  `;
}

function renderDestinationEditor(day, item) {
  return "";
  const override = destinationOverrides[item.destinationId];
  const totalDays = currentPlan?.days.length || currentSettings?.tripInput.kDays || 1;
  return `
    <div class="edit-box">
      <label>
        <span>固定抵達時間</span>
        <input type="time" class="arrival-input" value="${override?.fixedArrivalTime || item.startTime}" />
      </label>
      <label>
        <span>停留時間</span>
        <input type="text" inputmode="numeric" class="duration-input" value="${item.stayMinutes}" />
      </label>
      <div class="edit-actions">
        <button type="button" class="apply-edit">重排當天</button>
        <button type="button" class="secondary clear-edit">清除固定</button>
      </div>
      <div class="manual-actions">
        <button type="button" class="secondary move-up">上移</button>
        <button type="button" class="secondary move-down">下移</button>
        <label>
          <span>移到</span>
          <select class="move-day-input">
            ${Array.from({ length: totalDays }, (_, index) => {
              const dayIndex = index + 1;
              return `<option value="${dayIndex}" ${dayIndex === day.dayIndex ? "selected" : ""}>Day ${dayIndex}</option>`;
            }).join("")}
          </select>
        </label>
        <button type="button" class="secondary move-day">移動</button>
        <button type="button" class="secondary remove-destination">移除</button>
      </div>
    </div>
  `;
}

function renderWakeEditor(day, item) {
  const breakfastMinutes = breakfastMinutesForDay(day.dayIndex, currentSettings.tripInput.defaultRoutine.breakfastMinutes);
  return `
    <div class="edit-box">
      <label>
        <span>起床時間</span>
        <input type="time" class="wake-input" value="${dayOverrides[day.dayIndex]?.wakeTime || item.startTime}" />
      </label>
      <label>
        <span>早餐</span>
        <select class="breakfast-input">
          <option value="0" ${breakfastMinutes === 0 ? "selected" : ""}>不吃早餐</option>
          <option value="30" ${breakfastMinutes === 30 ? "selected" : ""}>30 分鐘</option>
          <option value="45" ${breakfastMinutes === 45 ? "selected" : ""}>45 分鐘</option>
          <option value="60" ${breakfastMinutes === 60 ? "selected" : ""}>60 分鐘</option>
        </select>
      </label>
      <div class="edit-actions">
        <button type="button" class="apply-day-edit">更新當天</button>
        <button type="button" class="secondary clear-day-edit">恢復建議</button>
      </div>
    </div>
  `;
}

function currentDayIds(dayIndex) {
  return currentPlan?.days.find((day) => day.dayIndex === dayIndex)?.destinations.map((destination) => destination.id) || [];
}

function freezeCurrentPlanDayAssignments() {
  currentPlan?.days.forEach((day) => {
    day.destinations.forEach((destination) => {
      if (!manualDayAssignments[destination.id]) {
        stableDayAssignments[destination.id] = day.dayIndex;
      }
    });
    rememberDayOrder(day.dayIndex, day.destinations.map((destination) => destination.id));
  });
}

function moveWithinDay(destinationId, direction) {
  freezeCurrentPlanDayAssignments();
  const dayIndex = Number(manualDayAssignments[destinationId]) || currentPlan?.days.find((day) => day.destinations.some((destination) => destination.id === destinationId))?.dayIndex;
  if (!dayIndex) return;
  const ids = currentDayIds(dayIndex);
  const index = ids.indexOf(destinationId);
  const targetIndex = index + direction;
  if (index < 0 || targetIndex < 0 || targetIndex >= ids.length) return;
  [ids[index], ids[targetIndex]] = [ids[targetIndex], ids[index]];
  ids.forEach((id) => {
    manualDayAssignments[id] = dayIndex;
  });
  rememberDayOrder(dayIndex, ids);
  regeneratePlan();
}

function moveToDay(destinationId, targetDayIndex) {
  const sourceDayIndex = currentPlan?.days.find((day) => day.destinations.some((destination) => destination.id === destinationId))?.dayIndex;
  if (!sourceDayIndex || sourceDayIndex === targetDayIndex) return;

  freezeCurrentPlanDayAssignments();
  manualDayAssignments[destinationId] = targetDayIndex;
  rememberDayOrder(sourceDayIndex, currentDayIds(sourceDayIndex).filter((id) => id !== destinationId));
  rememberDayOrder(targetDayIndex, [...currentDayIds(targetDayIndex).filter((id) => id !== destinationId), destinationId]);
  regeneratePlan();
}

function reorderByDrag(sourceDayIndex, destinationId, targetDestinationId) {
  freezeCurrentPlanDayAssignments();
  if (!sourceDayIndex || !destinationId || !targetDestinationId || destinationId === targetDestinationId) return;
  const ids = currentDayIds(sourceDayIndex);
  const fromIndex = ids.indexOf(destinationId);
  const toIndex = ids.indexOf(targetDestinationId);
  if (fromIndex < 0 || toIndex < 0) return;
  const [moved] = ids.splice(fromIndex, 1);
  ids.splice(toIndex, 0, moved);
  ids.forEach((id) => {
    manualDayAssignments[id] = sourceDayIndex;
  });
  rememberDayOrder(sourceDayIndex, ids);
  regeneratePlan();
}

function removeDestinationFromPlan(destinationId) {
  selectedDestinationIds.delete(destinationId);
  saveSelectedDestinationIds();
  delete manualDayAssignments[destinationId];
  delete stableDayAssignments[destinationId];
  delete destinationOverrides[destinationId];
  Object.keys(manualDayOrders).forEach((dayIndex) => {
    manualDayOrders[dayIndex] = manualDayOrders[dayIndex].filter((id) => id !== destinationId);
  });
  if (currentSettings) {
    currentSettings.selectedDestinations = currentSettings.selectedDestinations.filter((destination) => destination.id !== destinationId);
  }
  renderSpots();
  regeneratePlan();
}

function bindScheduleEditors() {
  document.querySelectorAll(".schedule-item.editable").forEach((item) => {
    item.addEventListener("click", (event) => {
      if (event.target.closest("button") || event.target.closest("input") || event.target.closest("select") || item.classList.contains("drag-over")) return;
      item.classList.toggle("open");
    });
  });

  document.querySelectorAll(".schedule-item[draggable='true']").forEach((item) => {
    const handle = item.querySelector(".drag-handle");
    if (handle) {
      handle.setAttribute("draggable", "true");
      handle.addEventListener("dragstart", (event) => {
        draggedDestination = {
          dayIndex: Number(item.dataset.day),
          destinationId: item.dataset.destinationId,
        };
        event.dataTransfer.effectAllowed = "move";
      });
    }

    item.addEventListener("dragstart", (event) => {
      if (!event.target.closest(".drag-handle")) {
        event.preventDefault();
        return;
      }
      draggedDestination = {
        dayIndex: Number(item.dataset.day),
        destinationId: item.dataset.destinationId,
      };
      event.dataTransfer.effectAllowed = "move";
    });

    item.addEventListener("dragover", (event) => {
      if (!draggedDestination || Number(item.dataset.day) !== draggedDestination.dayIndex) return;
      event.preventDefault();
      item.classList.add("drag-over");
    });

    item.addEventListener("dragleave", () => {
      item.classList.remove("drag-over");
    });

    item.addEventListener("drop", (event) => {
      event.preventDefault();
      item.classList.remove("drag-over");
      if (!draggedDestination || Number(item.dataset.day) !== draggedDestination.dayIndex) return;
      reorderByDrag(draggedDestination.dayIndex, draggedDestination.destinationId, item.dataset.destinationId);
      draggedDestination = null;
    });

    item.addEventListener("dragend", () => {
      item.classList.remove("drag-over");
      draggedDestination = null;
    });
  });

  document.querySelectorAll(".apply-edit").forEach((button) => {
    button.addEventListener("click", (event) => {
      const item = event.target.closest(".schedule-item");
      const destinationId = item.dataset.destinationId;
      destinationOverrides[destinationId] = {
        fixedArrivalTime: item.querySelector(".arrival-input").value,
        customStayMinutes: Number(item.querySelector(".duration-input").value),
      };
      regeneratePlan();
    });
  });

  document.querySelectorAll(".clear-edit").forEach((button) => {
    button.addEventListener("click", (event) => {
      const item = event.target.closest(".schedule-item");
      delete destinationOverrides[item.dataset.destinationId];
      regeneratePlan();
    });
  });

  document.querySelectorAll(".quick-up").forEach((button) => {
    button.addEventListener("click", (event) => {
      const item = event.target.closest(".schedule-item");
      moveWithinDay(item.dataset.destinationId, -1);
    });
  });

  document.querySelectorAll(".quick-down").forEach((button) => {
    button.addEventListener("click", (event) => {
      const item = event.target.closest(".schedule-item");
      moveWithinDay(item.dataset.destinationId, 1);
    });
  });

  document.querySelectorAll(".quick-day-input").forEach((select) => {
    select.addEventListener("change", (event) => {
      const item = event.target.closest(".schedule-item");
      moveToDay(item.dataset.destinationId, Number(event.target.value));
    });
  });

  document.querySelectorAll(".quick-remove").forEach((button) => {
    button.addEventListener("click", (event) => {
      const item = event.target.closest(".schedule-item");
      removeDestinationFromPlan(item.dataset.destinationId);
    });
  });

  document.querySelectorAll(".move-up").forEach((button) => {
    button.addEventListener("click", (event) => {
      const item = event.target.closest(".schedule-item");
      moveWithinDay(item.dataset.destinationId, -1);
    });
  });

  document.querySelectorAll(".move-down").forEach((button) => {
    button.addEventListener("click", (event) => {
      const item = event.target.closest(".schedule-item");
      moveWithinDay(item.dataset.destinationId, 1);
    });
  });

  document.querySelectorAll(".move-day").forEach((button) => {
    button.addEventListener("click", (event) => {
      const item = event.target.closest(".schedule-item");
      moveToDay(item.dataset.destinationId, Number(item.querySelector(".move-day-input").value));
    });
  });

  document.querySelectorAll(".remove-destination").forEach((button) => {
    button.addEventListener("click", (event) => {
      const item = event.target.closest(".schedule-item");
      removeDestinationFromPlan(item.dataset.destinationId);
    });
  });

  document.querySelectorAll(".apply-day-edit").forEach((button) => {
    button.addEventListener("click", (event) => {
      const item = event.target.closest(".schedule-item");
      const dayIndex = Number(item.dataset.day);
      dayOverrides[dayIndex] = {
        wakeTime: item.querySelector(".wake-input").value,
        breakfastMinutes: Number(item.querySelector(".breakfast-input").value),
      };
      regeneratePlan();
    });
  });

  document.querySelectorAll(".clear-day-edit").forEach((button) => {
    button.addEventListener("click", (event) => {
      const item = event.target.closest(".schedule-item");
      delete dayOverrides[Number(item.dataset.day)];
      regeneratePlan();
    });
  });
}

function regeneratePlan() {
  if (!currentSettings) return;
  if (!currentSettings.selectedDestinations.length) {
    currentPlan = null;
    summaryEl.textContent = "請至少選一個景點。";
    warningsEl.innerHTML = "";
    itineraryEl.className = "itinerary empty";
    itineraryEl.innerHTML = "<p>還沒有可安排的景點。</p>";
    return;
  }
  currentPlan = createPlan(currentSettings.tripInput, currentSettings.selectedDestinations);
  renderPlan(currentPlan, currentSettings.selectedDestinations.length);
}

function buildTripInput() {
  const cities = selectedCities();
  const arrivalTime = document.querySelector("#arrival-time")?.value;
  const departureFlightTime = document.querySelector("#departure-flight-time")?.value;
  const arrivalDate = document.querySelector("#arrival-date").value;
  const departureDate = document.querySelector("#departure-date").value;
  return {
    destinationQuery: cities.map((city) => cityNames[city]).join(" + "),
    city: cities.join(","),
    cities,
    kDays: Number(document.querySelector("#days").value),
    pace: document.querySelector("#pace").value,
    travelProfile: document.querySelector("#travel-profile").value,
    maxOutingMinutes: document.querySelector("#outing-limit").value === "auto" ? null : Number(document.querySelector("#outing-limit").value),
    startDate: arrivalDate || new Date().toISOString().slice(0, 10),
    defaultRoutine: {
      departureTime: document.querySelector("#start-time").value,
      firstLegTransportMinutes: 20,
      prepMinutes: Number(document.querySelector("#prep-time").value),
      breakfastMinutes: Number(document.querySelector("#breakfast-time").value),
      lunchMinutes: Number(document.querySelector("#lunch-time").value),
      dinnerMinutes: Number(document.querySelector("#dinner-time").value),
      homeTime: document.querySelector("#return-time").value,
    },
    flights: {
      inbound: isValidClock(arrivalTime)
        ? {
          date: arrivalDate,
          time: arrivalTime,
          airport: document.querySelector("#arrival-airport").value.trim(),
          arrivalBufferMinutes: Number(document.querySelector("#arrival-buffer").value),
          arrivalFlow: document.querySelector("#arrival-flow")?.value || "hotel_first",
          hotelBufferMinutes: Number(document.querySelector("#hotel-buffer")?.value || 45),
        }
        : null,
      outbound: isValidClock(departureFlightTime)
        ? {
          date: departureDate,
          time: departureFlightTime,
          airport: document.querySelector("#departure-airport").value.trim(),
          airportBufferMinutes: Number(document.querySelector("#departure-buffer").value),
        }
        : null,
    },
    preferences: getPreferences(),
  };
}

document.querySelectorAll('[name="city"]').forEach((input) => {
  input.addEventListener("change", () => {
    currentPage = 1;
    renderSpots();
  });
});

spotSearchEl.addEventListener("input", () => {
  currentPage = 1;
  renderSpots();
});

pageSizeEl.addEventListener("change", () => {
  currentPage = 1;
  renderSpots();
});

tabButtons.forEach((button) => {
  button.addEventListener("click", () => switchTab(button.dataset.tab));
});

document.querySelector("#go-spots")?.addEventListener("click", () => switchTab("spots"));
document.querySelector("#hero-start")?.addEventListener("click", () => switchTab("settings"));
document.querySelector("#hero-inspiration")?.addEventListener("click", () => switchTab("spots"));

mapDayFilterEl?.addEventListener("change", () => {
  if (currentPlan) renderPlanMap(currentPlan);
});

mapZoomOutEl?.addEventListener("click", () => setMapZoom(mapZoom - 0.2));
mapZoomInEl?.addEventListener("click", () => setMapZoom(mapZoom + 0.2));
mapZoomResetEl?.addEventListener("click", () => setMapZoom(1));

loadFlightInputs();
flightInputFields().forEach((id) => {
  document.querySelector(`#${id}`)?.addEventListener("input", saveFlightInputs);
  document.querySelector(`#${id}`)?.addEventListener("change", saveFlightInputs);
});

prevPageEl.addEventListener("click", () => {
  currentPage = Math.max(1, currentPage - 1);
  renderSpots();
});

nextPageEl.addEventListener("click", () => {
  currentPage += 1;
  renderSpots();
});

clearSelectedEl.addEventListener("click", () => {
  selectedDestinationIds.clear();
  saveSelectedDestinationIds();
  renderSpots();
});

resetDefaultSelectedEl?.addEventListener("click", () => {
  selectedDestinationIds.clear();
  defaultSelectedDestinationIds.forEach((id) => selectedDestinationIds.add(id));
  saveSelectedDestinationIds();
  currentPage = 1;
  renderSpots();
});

formEl.addEventListener("submit", (event) => {
  event.preventDefault();
  saveFlightInputs();
  const tripInput = buildTripInput();
  const selectedCitySet = new Set(selectedCities());
  const selectedDestinations = destinations
    .filter((destination) => selectedCitySet.has(destination.location.city))
    .filter((destination) => selectedDestinationIds.has(destination.id))
    .sort((a, b) => Number(tripInput.preferences.includes(b.category)) - Number(tripInput.preferences.includes(a.category)));

  if (!selectedDestinations.length) {
    summaryEl.textContent = "請至少選一個景點。";
    warningsEl.innerHTML = "";
    itineraryEl.className = "itinerary empty";
    itineraryEl.innerHTML = "<p>還沒有可安排的景點。</p>";
    if (algorithmNotesEl) algorithmNotesEl.innerHTML = "";
    renderPlanMap(null);
    renderSupportPanels(null);
    return;
  }

  currentSettings = { tripInput, selectedDestinations };
  clearPlanEditState();
  currentPlan = createPlan(tripInput, selectedDestinations);
  capturePlanAsManualState(currentPlan);
  renderPlan(currentPlan, selectedDestinations.length);
  switchTab("itinerary");
});

renderSpots();

function renderTimelineItem(day, item) {
  const isDestination = item.type === "destination";
  const isWake = item.type === "wake";
  const editableClass = isDestination || isWake ? "editable" : "";
  const dataAttrs = isDestination
    ? `data-day="${day.dayIndex}" data-destination-id="${item.destinationId}" draggable="true"`
    : isWake
      ? `data-day="${day.dayIndex}" data-routine="wake"`
      : item.type === "meal"
        ? `data-day="${day.dayIndex}" data-meal-type="${item.mealType}"`
        : "";

  return `
    <div class="schedule-item ${editableClass}" ${dataAttrs}>
      ${isDestination ? `<div class="drag-handle" aria-label="拖移 ${item.name}" title="拖移排序">⋮⋮</div>` : `<div></div>`}
      ${renderTimeCell(item)}
      <div>
        <h3>${item.name}</h3>
        ${renderItemMeta(item)}
      </div>
      ${isDestination ? renderQuickActions(day, item) : `<div></div>`}
      ${isDestination ? renderDestinationEditor(day, item) : ""}
      ${isWake ? renderWakeEditor(day, item) : ""}
    </div>
  `;
}

function renderTimeCell(item) {
  if (item.type === "destination") {
    return `<input type="text" inputmode="numeric" pattern="^\\d{2}:\\d{2}$" class="inline-time destination-time-input" value="${item.startTime}" aria-label="編輯 ${item.name} 抵達時間" />`;
  }
  if (item.type === "meal") {
    return `<input type="text" inputmode="numeric" pattern="^\\d{2}:\\d{2}$" class="inline-time meal-time-input" value="${item.startTime}" aria-label="編輯 ${item.name} 時間" />`;
  }
  return `<div class="time">${item.time}</div>`;
}

function renderItemMeta(item) {
  if (item.type === "destination") {
    const bestTimeText = item.bestTimeWindow?.preferredTime
      ? ` · 建議 ${item.bestTimeWindow.preferredTime}${item.bestTimeWindow.reason ? ` ${item.bestTimeWindow.reason}` : ""}`
      : "";
    return `
      <p class="summary-line inline-meta">
        ${item.areaLabel || ""} · 停留
        <input type="text" inputmode="numeric" class="inline-duration destination-duration-input" value="${item.stayMinutes}" aria-label="編輯 ${item.name} 停留時間" />
        分鐘 · 預估 ¥${item.priceHint || 0}${bestTimeText}
      </p>
      <label class="inline-lock">
        <input type="checkbox" class="destination-lock-input" ${item.isFixedTime ? "checked" : ""} />
        <span>鎖定抵達時間</span>
      </label>
    `;
  }
  if (item.type === "meal") {
    return `
      <p class="summary-line inline-meta">
        預留 20 分鐘交通/找餐廳 +
        <input type="text" inputmode="numeric" class="inline-duration meal-duration-input" value="${item.mealMinutes}" aria-label="編輯 ${item.name} 用餐時間" />
        分鐘用餐，之後可替換成實際餐廳位置
      </p>
    `;
  }
  return `<p class="summary-line">${item.meta}</p>`;
}

function renderQuickActions(day, item) {
  const totalDays = currentPlan?.days.length || currentSettings?.tripInput.kDays || 1;
  return `
    <div class="quick-actions">
      <button type="button" class="icon-button quick-up" title="上移" aria-label="上移 ${item.name}">↑</button>
      <button type="button" class="icon-button quick-down" title="下移" aria-label="下移 ${item.name}">↓</button>
      <select class="quick-day-input" title="移到哪一天" aria-label="移動 ${item.name} 到哪一天">
        ${Array.from({ length: totalDays }, (_, index) => {
          const dayIndex = index + 1;
          return `<option value="${dayIndex}" ${dayIndex === day.dayIndex ? "selected" : ""}>Day ${dayIndex}</option>`;
        }).join("")}
      </select>
      <button type="button" class="icon-button danger quick-remove" title="移除" aria-label="移除 ${item.name}">×</button>
    </div>
  `;
}

function bindScheduleEditors() {
  document.querySelectorAll(".schedule-item.editable").forEach((item) => {
    item.addEventListener("click", (event) => {
      if (event.target.closest("button") || event.target.closest("input") || event.target.closest("select") || item.classList.contains("drag-over")) return;
      item.classList.toggle("open");
    });
  });

  document.querySelectorAll(".schedule-item[draggable='true']").forEach((item) => {
    const handle = item.querySelector(".drag-handle");
    if (handle) {
      handle.setAttribute("draggable", "true");
      handle.addEventListener("dragstart", (event) => {
        draggedDestination = {
          dayIndex: Number(item.dataset.day),
          destinationId: item.dataset.destinationId,
        };
        event.dataTransfer.effectAllowed = "move";
      });
    }
    item.addEventListener("dragover", (event) => {
      if (!draggedDestination || Number(item.dataset.day) !== draggedDestination.dayIndex) return;
      event.preventDefault();
      item.classList.add("drag-over");
    });
    item.addEventListener("dragleave", () => item.classList.remove("drag-over"));
    item.addEventListener("drop", (event) => {
      event.preventDefault();
      item.classList.remove("drag-over");
      if (!draggedDestination || Number(item.dataset.day) !== draggedDestination.dayIndex) return;
      reorderByDrag(draggedDestination.dayIndex, draggedDestination.destinationId, item.dataset.destinationId);
      draggedDestination = null;
    });
    item.addEventListener("dragend", () => {
      item.classList.remove("drag-over");
      draggedDestination = null;
    });
  });

  document.querySelectorAll(".destination-time-input").forEach((input) => {
    input.addEventListener("change", (event) => {
      const item = event.target.closest(".schedule-item");
      const destinationId = item.dataset.destinationId;
      const previous = destinationOverrides[destinationId] || {};
      destinationOverrides[destinationId] = {
        ...previous,
        preferredArrivalTime: event.target.value,
        ...(previous.fixedArrivalTime ? { fixedArrivalTime: event.target.value } : {}),
      };
      if (previous.fixedArrivalTime) regeneratePlan();
    });
  });

  document.querySelectorAll(".destination-lock-input").forEach((input) => {
    input.addEventListener("change", (event) => {
      const item = event.target.closest(".schedule-item");
      const destinationId = item.dataset.destinationId;
      const timeInput = item.querySelector(".destination-time-input");
      const previous = destinationOverrides[destinationId] || {};
      if (event.target.checked) {
        const currentDayIndex = Number(item.dataset.day);
        if (currentDayIndex) manualDayAssignments[destinationId] = currentDayIndex;
        destinationOverrides[destinationId] = {
          ...previous,
          preferredArrivalTime: timeInput.value,
          fixedArrivalTime: timeInput.value,
        };
      } else {
        const { fixedArrivalTime, ...rest } = previous;
        destinationOverrides[destinationId] = rest;
      }
      regeneratePlan();
    });
  });

  document.querySelectorAll(".destination-duration-input").forEach((input) => {
    input.addEventListener("change", (event) => {
      const item = event.target.closest(".schedule-item");
      const destinationId = item.dataset.destinationId;
      destinationOverrides[destinationId] = {
        ...destinationOverrides[destinationId],
        customStayMinutes: Number(event.target.value),
      };
      regeneratePlan();
    });
  });

  document.querySelectorAll(".meal-time-input").forEach((input) => {
    input.addEventListener("change", (event) => {
      const item = event.target.closest(".schedule-item");
      const dayIndex = Number(item.dataset.day);
      const mealType = item.dataset.mealType;
      mealOverrides[dayIndex] ||= {};
      mealOverrides[dayIndex][mealType] = {
        ...mealOverrides[dayIndex][mealType],
        startTime: event.target.value,
      };
      regeneratePlan();
    });
  });

  document.querySelectorAll(".meal-duration-input").forEach((input) => {
    input.addEventListener("change", (event) => {
      const item = event.target.closest(".schedule-item");
      const dayIndex = Number(item.dataset.day);
      const mealType = item.dataset.mealType;
      mealOverrides[dayIndex] ||= {};
      mealOverrides[dayIndex][mealType] = {
        ...mealOverrides[dayIndex][mealType],
        mealMinutes: Number(event.target.value),
      };
      regeneratePlan();
    });
  });

  document.querySelectorAll(".apply-edit").forEach((button) => {
    button.addEventListener("click", (event) => {
      const item = event.target.closest(".schedule-item");
      const destinationId = item.dataset.destinationId;
      destinationOverrides[destinationId] = {
        fixedArrivalTime: item.querySelector(".arrival-input").value,
        customStayMinutes: Number(item.querySelector(".duration-input").value),
      };
      regeneratePlan();
    });
  });

  document.querySelectorAll(".clear-edit").forEach((button) => {
    button.addEventListener("click", (event) => {
      const item = event.target.closest(".schedule-item");
      delete destinationOverrides[item.dataset.destinationId];
      regeneratePlan();
    });
  });

  document.querySelectorAll(".quick-up").forEach((button) => {
    button.addEventListener("click", (event) => moveWithinDay(event.target.closest(".schedule-item").dataset.destinationId, -1));
  });
  document.querySelectorAll(".quick-down").forEach((button) => {
    button.addEventListener("click", (event) => moveWithinDay(event.target.closest(".schedule-item").dataset.destinationId, 1));
  });
  document.querySelectorAll(".quick-day-input").forEach((select) => {
    select.addEventListener("change", (event) => moveToDay(event.target.closest(".schedule-item").dataset.destinationId, Number(event.target.value)));
  });
  document.querySelectorAll(".quick-remove").forEach((button) => {
    button.addEventListener("click", (event) => removeDestinationFromPlan(event.target.closest(".schedule-item").dataset.destinationId));
  });

  document.querySelectorAll(".apply-day-edit").forEach((button) => {
    button.addEventListener("click", (event) => {
      const item = event.target.closest(".schedule-item");
      const dayIndex = Number(item.dataset.day);
      dayOverrides[dayIndex] = {
        wakeTime: item.querySelector(".wake-input").value,
        breakfastMinutes: Number(item.querySelector(".breakfast-input").value),
      };
      regeneratePlan();
    });
  });

  document.querySelectorAll(".clear-day-edit").forEach((button) => {
    button.addEventListener("click", (event) => {
      const item = event.target.closest(".schedule-item");
      delete dayOverrides[Number(item.dataset.day)];
      regeneratePlan();
    });
  });
}
