from __future__ import annotations

import asyncio
import json
import os
import re
import time
from collections import deque
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from datetime import date
from typing import Any, Literal
from urllib.parse import urlparse

import httpx
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

# ============================================================================
# Configuration & Loopback Isolation
# ============================================================================

ALLOWED_OLLAMA_HOSTS = {"127.0.0.1", "localhost", "::1"}
DEFAULT_CORS_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://aaaaron-pro.github.io",  # GitHub Pages of AAAaron-pro/tw_travel_plan
]

CORE_REQUIRED_TRIP_FIELDS = [
    "origin",
    "destination",
    "startDate",
    "days",
    "budgetPerPersonTwd",
    "lodgingTier",
    "group",
    "preferredTransport",
    "pace",
]


def validate_loopback_ollama_url(raw_url: str) -> str:
    parsed = urlparse(raw_url.strip())
    if parsed.scheme not in {"http", "https"} or parsed.hostname not in ALLOWED_OLLAMA_HOSTS:
        raise ValueError(
            "OLLAMA_BASE_URL must target loopback (127.0.0.1, localhost, or ::1) only."
        )
    return raw_url.strip().rstrip("/")


def parse_cors_origins(raw_origins: str | None) -> list[str]:
    if raw_origins is None or not raw_origins.strip():
        return list(DEFAULT_CORS_ORIGINS)
    origins = [item.strip() for item in raw_origins.split(",") if item.strip()]
    if not origins or any(item == "*" for item in origins):
        raise ValueError("CORS_ORIGINS must explicitly list allowed origins; '*' is forbidden.")
    return origins


@dataclass(frozen=True)
class GatewaySettings:
    ollama_base_url: str = field(
        default_factory=lambda: validate_loopback_ollama_url(
            os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434")
        )
    )
    ollama_model: str = field(
        default_factory=lambda: os.getenv("OLLAMA_MODEL", "qwen3.5:4b")
    )
    ollama_num_ctx: int = field(
        default_factory=lambda: int(os.getenv("OLLAMA_NUM_CTX", "4096"))
    )
    ollama_timeout_seconds: float = field(
        default_factory=lambda: float(os.getenv("OLLAMA_TIMEOUT_SECONDS", "10.0"))
    )
    max_concurrent: int = 1
    max_waiting: int = 3
    # 前端 10 秒就放棄：排隊超過 5 秒就算排不到，別讓主機替已離開的人推論
    max_wait_seconds: float = 5.0
    rate_limit_requests: int = field(
        default_factory=lambda: int(os.getenv("RATE_LIMIT_REQUESTS", "20"))
    )
    rate_limit_window_seconds: int = field(
        default_factory=lambda: int(os.getenv("RATE_LIMIT_WINDOW_SECONDS", "60"))
    )
    cors_origins: list[str] = field(
        default_factory=lambda: parse_cors_origins(os.getenv("CORS_ORIGINS"))
    )
    trust_proxy_headers: bool = field(
        # 預設 true：閘道只綁 127.0.0.1、靠 cloudflared 對外，不讀 CF-Connecting-IP 會讓全站共用同一個限流額度
        default_factory=lambda: os.getenv("TRUST_PROXY_HEADERS", "true").lower() == "true"
    )

    def __post_init__(self) -> None:
        validate_loopback_ollama_url(self.ollama_base_url)
        if not self.cors_origins or any(origin == "*" for origin in self.cors_origins):
            raise ValueError("cors_origins must not contain wildcard '*'")


# ============================================================================
# Concurrency Guard (Semaphore(1) + Waiting Queue Cap of 3) & IP Rate Limiter
# ============================================================================


class QueueFullError(Exception):
    pass


class ConcurrencyGuard:
    def __init__(
        self, max_concurrent: int = 1, max_waiting: int = 3, max_wait_seconds: float = 5.0
    ) -> None:
        self.semaphore = asyncio.Semaphore(max_concurrent)
        self.max_concurrent = max_concurrent
        self.max_waiting = max_waiting
        self.max_wait_seconds = max_wait_seconds
        self.max_total = max_concurrent + max_waiting
        self.in_flight = 0
        self.active = 0

    @asynccontextmanager
    async def acquire_slot(self):
        if self.in_flight >= self.max_total:
            raise QueueFullError()
        self.in_flight += 1
        try:
            try:
                await asyncio.wait_for(self.semaphore.acquire(), timeout=self.max_wait_seconds)
            except asyncio.TimeoutError as exc:
                raise QueueFullError() from exc
            self.active += 1
            try:
                yield
            finally:
                self.active -= 1
                self.semaphore.release()
        finally:
            self.in_flight -= 1


class SlidingWindowRateLimiter:
    def __init__(self, max_requests: int = 20, window_seconds: int = 60) -> None:
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._hits: dict[str, deque[float]] = {}

    def _prune_expired(self, current: float) -> None:
        cutoff = current - self.window_seconds
        stale_ips: list[str] = []
        for ip, window in self._hits.items():
            while window and window[0] <= cutoff:
                window.popleft()
            if not window:
                stale_ips.append(ip)
        for ip in stale_ips:
            del self._hits[ip]

    def check(self, client_ip: str, now: float | None = None) -> tuple[bool, int]:
        current = time.monotonic() if now is None else now
        self._prune_expired(current)
        window = self._hits.get(client_ip)
        if window is not None and len(window) >= self.max_requests:
            retry_after = max(1, int(self.window_seconds - (current - window[0])) + 1)
            return False, retry_after
        if window is None:
            window = deque()
            self._hits[client_ip] = window
        window.append(current)
        return True, 0


def extract_client_ip(request: Request, trust_proxy_headers: bool) -> str:
    peer_host = request.client.host if request.client else "unknown"
    if trust_proxy_headers and peer_host in {"127.0.0.1", "::1"}:
        cf_ip = request.headers.get("CF-Connecting-IP")
        if cf_ip:
            return cf_ip.strip()
        xff = request.headers.get("X-Forwarded-For")
        if xff:
            return xff.split(",")[0].strip()
    return peer_host


# ============================================================================
# Shared Contract Pydantic Models (Aligned with schema/trip.ts)
# ============================================================================

OriginRegion = Literal[
    "taipei_keelung",
    "taoyuan_hsinchu_miaoli",
    "taichung_changhua_nantou",
    "chiayi_yunlin",
    "tainan",
    "kaohsiung",
    "pingtung",
    "yilan_hualien_taitung",
]

RegionCode = Literal[
    "penghu",
    "xiaoliuqiu",
    "taipei",
    "tainan",
    "hualien_taitung",
    "kinmen",
    "matsu",
    "green_island",
    "orchid_island",
    "other_tw",
]

TransportPreference = Literal[
    "hsr",
    "tra",
    "domestic_air",
    "ferry",
    "taiwan_tourist_shuttle",
    "rental_car",
    "scooter",
    "youbike",
]

LodgingTier = Literal["budget", "standard", "premium", "none"]
PaceType = Literal["relaxed", "balanced", "packed"]
IdentityKey = Literal[
    "adult",
    "collegeStudent",
    "senior65Plus",
    "child3To12",
    "infantUnder3",
    "disabled",
    "disabledCompanion",
]


class ParsedIdentityCounts(BaseModel):
    model_config = ConfigDict(extra="ignore")

    adult: int = Field(default=0, ge=0)
    collegeStudent: int = Field(default=0, ge=0)
    senior65Plus: int = Field(default=0, ge=0)
    child3To12: int = Field(default=0, ge=0)
    infantUnder3: int = Field(default=0, ge=0)
    disabled: int = Field(default=0, ge=0)
    disabledCompanion: int = Field(default=0, ge=0)
    offshoreResidentCount: int = Field(default=0, ge=0)

    def total_people(self) -> int:
        return (
            self.adult
            + self.collegeStudent
            + self.senior65Plus
            + self.child3To12
            + self.infantUnder3
            + self.disabled
            + self.disabledCompanion
        )


class ParsedTravelPassOwned(BaseModel):
    model_config = ConfigDict(extra="ignore")

    seniorCardCounty: str | None = None
    tpassRegion: Literal["north", "central", "south", "east", "none"] | None = None

    @field_validator("seniorCardCounty", mode="before")
    @classmethod
    def normalize_empty_senior_card_county(cls, value: Any) -> Any:
        if isinstance(value, str):
            stripped = value.strip()
            return stripped if stripped else None
        return value


class ParsedTripInput(BaseModel):
    model_config = ConfigDict(extra="ignore")

    origin: OriginRegion | None = None
    destination: RegionCode | None = None
    startDate: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    days: int | None = Field(default=None, ge=1, le=30)
    budgetPerPersonTwd: int | None = Field(default=None, ge=0)
    lodgingTier: LodgingTier | None = None
    roomCount: int | None = Field(default=None, ge=1)
    group: ParsedIdentityCounts | None = None
    passes: ParsedTravelPassOwned | None = None
    preferredTransport: list[TransportPreference] | None = None
    pace: PaceType | None = None
    avoidRainOutdoor: bool | None = None

    @field_validator("startDate")
    @classmethod
    def validate_start_date_calendar(cls, value: str | None) -> str | None:
        if value is None:
            return None
        date.fromisoformat(value)
        return value


class ParseInputRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=500)

    @field_validator("text")
    @classmethod
    def reject_whitespace_only(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("輸入內容不可為空白")
        return stripped


class ParseInputResponse(BaseModel):
    parsed: ParsedTripInput
    missingFields: list[str]


class SummarizeIdentityShare(BaseModel):
    identity: IdentityKey
    count: int = Field(..., ge=1)
    totalPerPersonTwd: int = Field(..., ge=0)
    appliedDiscounts: list[str] = Field(default_factory=list)


class WeekdayShiftSavingHint(BaseModel):
    suggestedStartDate: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    estimatedSaveTwd: int = Field(..., ge=0)
    reason: str = Field(..., min_length=1)


class SummarizeBudget(BaseModel):
    originalTotalTwd: int = Field(..., ge=0)
    discountedTotalTwd: int = Field(..., ge=0)
    savedTotalTwd: int = Field(..., ge=0)
    transportTwd: int = Field(..., ge=0)
    lodgingTwd: int = Field(..., ge=0)
    activityAndFoodTwd: int = Field(..., ge=0)
    isOverBudget: bool
    weekdayShiftSavingHint: WeekdayShiftSavingHint | None = None
    perIdentitySplit: list[SummarizeIdentityShare] = Field(..., min_length=1)
    roundingRemainderTwd: int


class SummarizeWarning(BaseModel):
    severity: Literal["red", "amber", "info"]
    code: Literal[
        "CLOSED_DAY",
        "TIGHT_TRANSFER",
        "OVER_BUDGET",
        "SEA_RISK",
        "HOLIDAY_SURGE",
    ]
    message: str = Field(..., min_length=1)
    dayIndex: int | None = Field(default=None, ge=1)


class SummarizeRequest(BaseModel):
    origin: OriginRegion
    destination: RegionCode
    startDate: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    days: int = Field(..., ge=1, le=30)
    budget: SummarizeBudget
    reviewWarnings: list[SummarizeWarning] = Field(default_factory=list)


class SummarizeResponse(BaseModel):
    summary: str = Field(..., min_length=1, max_length=150)
    charCount: int = Field(..., ge=1, le=150)


# ============================================================================
# Prompts & Helper Logic
# ============================================================================

PARSE_SYSTEM_PROMPT = (
    "你是台灣旅遊條件結構化解析器。請將旅客的口語需求精準轉成單一 JSON 物件，"
    "僅能使用下列欄位與合法列舉值，未提到的欄位請填 null，嚴禁猜測或編造數值：\n"
    "- origin: taipei_keelung | taoyuan_hsinchu_miaoli | taichung_changhua_nantou | "
    "chiayi_yunlin | tainan | kaohsiung | pingtung | yilan_hualien_taitung\n"
    "- destination: penghu | xiaoliuqiu | taipei | tainan | hualien_taitung | "
    "kinmen | matsu | green_island | orchid_island | other_tw\n"
    "- startDate: YYYY-MM-DD 格式字串\n"
    "- days: 1 到 30 的整數\n"
    "- budgetPerPersonTwd: 每人預算整數（新台幣）\n"
    "- lodgingTier: budget | standard | premium | none\n"
    "- roomCount: 房間數整數\n"
    "- group: 各身分人數整數 {adult, collegeStudent, senior65Plus, child3To12, infantUnder3, "
    "disabled（身心障礙者）, disabledCompanion（必要陪伴者）, "
    "offshoreResidentCount（設籍澎金馬等離島的人數）}\n"
    "- passes: {seniorCardCounty, tpassRegion (north|central|south|east|none)}\n"
    "- preferredTransport: 陣列，元素為 hsr | tra | domestic_air | ferry | "
    "taiwan_tourist_shuttle | rental_car | scooter | youbike\n"
    "- pace: relaxed | balanced | packed\n"
    "- avoidRainOutdoor: 布林值"
)

SUMMARIZE_SYSTEM_PROMPT = (
    "你是台灣旅遊規劃結果導讀員。請完全依據輸入 JSON 中的確定性數字與警告，"
    "以自然、親切的台灣繁體中文口語寫出總結導讀。\n"
    "嚴格規則：\n"
    "1. 總字數必須在 150 個字元以內（含標點與數字）。\n"
    "2. 嚴禁捏造或猜測任何未出現在輸入 JSON 中的車次、航班、船班時間、票價、折扣或金額。\n"
    "3. 若有海象風險（SEA_RISK）或改平日省錢提示，請用白話提醒。\n"
    "4. 禁止使用任何誇飾套話或翻譯腔，直接講重點。"
)


def compute_missing_fields(parsed: ParsedTripInput) -> list[str]:
    missing: list[str] = []
    for field_name in CORE_REQUIRED_TRIP_FIELDS:
        value = getattr(parsed, field_name)
        if value is None:
            missing.append(field_name)
        elif field_name == "group" and isinstance(value, ParsedIdentityCounts):
            if value.total_people() <= 0:
                missing.append(field_name)
        elif field_name == "preferredTransport" and isinstance(value, list):
            if len(value) == 0:
                missing.append(field_name)
    return missing


THINK_BLOCK_RE = re.compile(r"<think>.*?(</think>|$)", re.DOTALL)
NUMBER_RE = re.compile(r"\d[\d,]*(?:\.\d+)?")


def clamp_summary(raw_text: str, max_chars: int = 150) -> str:
    cleaned = THINK_BLOCK_RE.sub(" ", raw_text)
    cleaned = cleaned.strip().strip('"').strip("'").replace("\r", " ").replace("\n", " ")
    cleaned = " ".join(cleaned.split())
    if not cleaned:
        raise ValueError("Ollama returned empty summary text")
    if len(cleaned) <= max_chars:
        return cleaned
    head = cleaned[:max_chars]
    # 切在最後一個句號，避免把「NT$ 31,900」切成「NT$ 31,9…」
    sentence_end = max(head.rfind(mark) for mark in "。！？")
    if sentence_end >= 0:
        return head[: sentence_end + 1]
    return cleaned[: max_chars - 1] + "…"


def find_ungrounded_numbers(summary: str, source_json: str) -> list[str]:
    """Numbers in the summary that never appear in the deterministic input it was written from."""
    allowed = {n.replace(",", "") for n in NUMBER_RE.findall(source_json)}
    return [n for n in NUMBER_RE.findall(summary) if n.replace(",", "") not in allowed]


# ============================================================================
# FastAPI App Factory
# ============================================================================


def create_app(
    settings: GatewaySettings | None = None,
    http_client: httpx.AsyncClient | None = None,
) -> FastAPI:
    cfg = settings or GatewaySettings()
    guard = ConcurrencyGuard(
        max_concurrent=cfg.max_concurrent,
        max_waiting=cfg.max_waiting,
        max_wait_seconds=cfg.max_wait_seconds,
    )
    rate_limiter = SlidingWindowRateLimiter(
        max_requests=cfg.rate_limit_requests,
        window_seconds=cfg.rate_limit_window_seconds,
    )
    owns_client = http_client is None
    client = http_client or httpx.AsyncClient(timeout=cfg.ollama_timeout_seconds)

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        try:
            yield
        finally:
            if owns_client:
                await client.aclose()

    app = FastAPI(
        title="台灣國內與離島旅遊規劃主機閘道",
        version="0.1.0",
        lifespan=lifespan,
    )

    @app.exception_handler(QueueFullError)
    async def queue_full_handler(_request: Request, _exc: QueueFullError):
        return JSONResponse(
            status_code=429,
            content={
                "error": "queue_full",
                "detail": "目前主機推論排隊人數已滿，請改用表單模式繼續規劃。",
                "maxWaiting": cfg.max_waiting,
            },
        )

    async def enforce_rate_limit(request: Request) -> None:
        client_ip = extract_client_ip(request, cfg.trust_proxy_headers)
        allowed, retry_after = rate_limiter.check(client_ip)
        if not allowed:
            raise HTTPException(
                status_code=429,
                detail="請求過於頻繁，請稍後再試或切換離線表單模式。",
                headers={"Retry-After": str(retry_after)},
            )

    async def call_ollama_chat(
        *,
        request: Request,
        system_prompt: str,
        user_content: str,
        json_mode: bool,
    ) -> str:
        payload: dict[str, Any] = {
            "model": cfg.ollama_model,
            "stream": False,
            # Qwen 系列預設會先「思考」：吃掉 10 秒推論時間，還可能把 <think> 文字回給前端
            "think": False,
            "options": {"num_ctx": cfg.ollama_num_ctx},
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content},
            ],
        }
        if json_mode:
            payload["format"] = "json"

        endpoint = f"{cfg.ollama_base_url}/api/chat"
        try:
            async with guard.acquire_slot():
                if await request.is_disconnected():
                    raise HTTPException(status_code=499, detail="旅客已離開，略過推論。")
                resp = await client.post(
                    endpoint,
                    json=payload,
                    timeout=cfg.ollama_timeout_seconds,
                )
        except QueueFullError:
            raise
        except httpx.TimeoutException as exc:
            raise HTTPException(
                status_code=504,
                detail="主機推論逾時，已退回確定性規則流程。",
            ) from exc
        except httpx.RequestError as exc:
            raise HTTPException(
                status_code=502,
                detail="主機推論服務暫時無法連線。",
            ) from exc

        if resp.status_code != 200:
            raise HTTPException(
                status_code=502,
                detail="主機推論服務回應異常。",
            )

        try:
            body = resp.json()
            content = body["message"]["content"]
            if not isinstance(content, str):
                raise ValueError("Invalid message.content type")
            return content
        except (ValueError, KeyError, TypeError) as exc:
            raise HTTPException(
                status_code=502,
                detail="主機回應格式無法解析。",
            ) from exc

    @app.get("/health")
    async def health() -> dict[str, Any]:
        return {
            "status": "ok",
            "model": cfg.ollama_model,
            "numCtx": cfg.ollama_num_ctx,
            "maxWaiting": cfg.max_waiting,
            "active": guard.active,
            "waiting": max(0, guard.in_flight - guard.active),
        }

    @app.post(
        "/api/parse-input",
        response_model=ParseInputResponse,
        dependencies=[Depends(enforce_rate_limit)],
    )
    async def parse_input(req: ParseInputRequest, request: Request) -> ParseInputResponse:
        raw_json = await call_ollama_chat(
            request=request,
            system_prompt=PARSE_SYSTEM_PROMPT,
            user_content=req.text,
            json_mode=True,
        )
        try:
            data = json.loads(raw_json)
            if not isinstance(data, dict):
                raise ValueError("Ollama JSON must be an object")
            try:
                parsed = ParsedTripInput.model_validate(data)
            except ValidationError as exc:
                # 小模型常只猜錯一兩格：丟掉出錯的欄位，交給 missingFields 讓使用者補
                bad_keys = {err["loc"][0] for err in exc.errors() if err["loc"]}
                parsed = ParsedTripInput.model_validate(
                    {k: v for k, v in data.items() if k not in bad_keys}
                )
        except Exception as exc:
            raise HTTPException(
                status_code=502,
                detail="主機解析出的旅遊條件未通過欄位驗證。",
            ) from exc

        missing = compute_missing_fields(parsed)
        return ParseInputResponse(parsed=parsed, missingFields=missing)

    @app.post(
        "/api/summarize",
        response_model=SummarizeResponse,
        dependencies=[Depends(enforce_rate_limit)],
    )
    async def summarize(req: SummarizeRequest, request: Request) -> SummarizeResponse:
        user_payload = json.dumps(req.model_dump(mode="json"), ensure_ascii=False)
        raw_text = await call_ollama_chat(
            request=request,
            system_prompt=SUMMARIZE_SYSTEM_PROMPT,
            user_content=user_payload,
            json_mode=False,
        )
        try:
            summary = clamp_summary(raw_text, max_chars=150)
        except ValueError as exc:
            raise HTTPException(
                status_code=502,
                detail="主機產出的導讀內容為空。",
            ) from exc

        # 專案鐵律：導讀不能出現輸入裡沒有的數字，有就整段作廢，前端改用規則版文案
        if find_ungrounded_numbers(summary, user_payload):
            raise HTTPException(
                status_code=502,
                detail="主機導讀出現輸入以外的數字，已退回規則文案。",
            )

        return SummarizeResponse(summary=summary, charCount=len(summary))

    # Outermost middleware so CORS headers are attached even on 422 / 429 / 502 / 504 responses
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cfg.cors_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Content-Type"],
    )

    return app


app = create_app()
