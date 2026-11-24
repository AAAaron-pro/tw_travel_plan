from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

import httpx
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))

from main import (  # noqa: E402
    GatewaySettings,
    SlidingWindowRateLimiter,
    create_app,
    parse_cors_origins,
    validate_loopback_ollama_url,
)


def make_summary_payload() -> dict:
    return {
        "origin": "taipei_keelung",
        "destination": "penghu",
        "startDate": "2026-12-11",
        "days": 3,
        "budget": {
            "originalTotalTwd": 36500,
            "discountedTotalTwd": 31900,
            "savedTotalTwd": 4600,
            "transportTwd": 14800,
            "lodgingTwd": 12000,
            "activityAndFoodTwd": 5100,
            "isOverBudget": False,
            "perIdentitySplit": [
                {
                    "identity": "adult",
                    "count": 2,
                    "totalPerPersonTwd": 7300,
                    "appliedDiscounts": ["離島回程免營業稅"],
                },
                {
                    "identity": "senior65Plus",
                    "count": 1,
                    "totalPerPersonTwd": 5100,
                    "appliedDiscounts": ["敬老 5 折"],
                },
            ],
        },
        "reviewWarnings": [
            {
                "severity": "amber",
                "code": "SEA_RISK",
                "dayIndex": 2,
                "message": "第 2 天浪高約 1.8 公尺已亮黃燈，備妥室內雨備。",
            }
        ],
    }


def test_loopback_and_cors_guards():
    assert validate_loopback_ollama_url("http://127.0.0.1:11434/") == "http://127.0.0.1:11434"
    assert validate_loopback_ollama_url("http://localhost:11434") == "http://localhost:11434"

    with pytest.raises(ValueError):
        validate_loopback_ollama_url("http://0.0.0.0:11434")

    with pytest.raises(ValueError):
        validate_loopback_ollama_url("https://example.com:11434")

    with pytest.raises(ValueError):
        parse_cors_origins("*")

    assert parse_cors_origins("https://demo.github.io,http://localhost:5173") == [
        "https://demo.github.io",
        "http://localhost:5173",
    ]


@pytest.mark.asyncio
async def test_parse_input_success_and_missing_fields():
    captured_requests: list[tuple[str, dict]] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content.decode("utf-8"))
        captured_requests.append((str(request.url), body))
        ollama_content = {
            "origin": "taipei_keelung",
            "destination": "penghu",
            "startDate": None,
            "days": 3,
            "budgetPerPersonTwd": None,
            "lodgingTier": "standard",
            "roomCount": 2,
            "group": {
                "adult": 2,
                "collegeStudent": 0,
                "senior65Plus": 1,
                "child3To12": 0,
                "infantUnder3": 0,
                "disabledWithCompanion": 0,
                "offshoreResident": False,
            },
            "passes": {"seniorCardCounty": "台北市", "tpassRegion": "north"},
            "preferredTransport": ["domestic_air", "ferry"],
            "pace": None,
            "avoidRainOutdoor": True,
        }
        return httpx.Response(
            200,
            json={"message": {"role": "assistant", "content": json.dumps(ollama_content)}},
        )

    mock_client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    settings = GatewaySettings(cors_origins=["https://team.github.io"])
    app = create_app(settings=settings, http_client=mock_client)

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        resp = await client.post(
            "/api/parse-input",
            json={"text": "我們兩位大人帶一位台北長輩下個月從台北去澎湖玩三天兩夜"},
            headers={"Origin": "https://team.github.io"},
        )

    await mock_client.aclose()

    assert resp.status_code == 200
    assert resp.headers.get("access-control-allow-origin") == "https://team.github.io"
    data = resp.json()
    assert data["parsed"]["origin"] == "taipei_keelung"
    assert data["parsed"]["destination"] == "penghu"
    assert data["parsed"]["days"] == 3
    assert data["missingFields"] == ["startDate", "budgetPerPersonTwd", "pace"]

    assert len(captured_requests) == 1
    target_url, sent_payload = captured_requests[0]
    assert target_url == "http://127.0.0.1:11434/api/chat"
    assert sent_payload["model"] == "qwen3.5:4b"
    assert sent_payload["format"] == "json"
    assert sent_payload["options"] == {"num_ctx": 4096}


@pytest.mark.asyncio
async def test_parse_input_rejects_over_500_chars_and_whitespace():
    called = False

    async def handler(_request: httpx.Request) -> httpx.Response:
        nonlocal called
        called = True
        return httpx.Response(200, json={"message": {"content": "{}"}})

    mock_client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    app = create_app(settings=GatewaySettings(), http_client=mock_client)

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        too_long = await client.post("/api/parse-input", json={"text": "旅" * 501})
        blank = await client.post("/api/parse-input", json={"text": "   "})

    await mock_client.aclose()

    assert too_long.status_code == 422
    assert blank.status_code == 422
    assert called is False


@pytest.mark.asyncio
async def test_summarize_enforces_150_chars_and_anti_fabrication_prompt():
    captured_payload: dict = {}

    async def handler(request: httpx.Request) -> httpx.Response:
        nonlocal captured_payload
        captured_payload = json.loads(request.content.decode("utf-8"))
        # Simulate an overly verbose model output (>150 chars)
        verbose_reply = "這趟台北飛澎湖 3 天 2 夜共 3 位旅客，套用敬老 5 折與離島免稅後總計 NT$ 31,900，比原價省下 NT$ 4,600。" + ("建議攜帶防風外套並留意船班公告。" * 6)
        return httpx.Response(200, json={"message": {"content": verbose_reply}})

    mock_client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    app = create_app(settings=GatewaySettings(), http_client=mock_client)

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        resp = await client.post("/api/summarize", json=make_summary_payload())

    await mock_client.aclose()

    assert resp.status_code == 200
    body = resp.json()
    assert len(body["summary"]) <= 150
    assert body["charCount"] == len(body["summary"])
    assert body["summary"].endswith("…")
    assert captured_payload["model"] == "qwen3.5:4b"
    assert captured_payload["options"] == {"num_ctx": 4096}
    system_msg = captured_payload["messages"][0]["content"]
    assert "嚴禁捏造" in system_msg


@pytest.mark.asyncio
async def test_concurrency_guard_semaphore_and_queue_cap_3():
    first_started = asyncio.Event()
    release_first = asyncio.Event()
    call_counter = 0

    async def handler(_request: httpx.Request) -> httpx.Response:
        nonlocal call_counter
        call_counter += 1
        current = call_counter
        if current == 1:
            first_started.set()
            await release_first.wait()
        return httpx.Response(200, json={"message": {"content": "台北飛澎湖總計 NT$ 31,900，已省 NT$ 4,600。"}})

    mock_client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    settings = GatewaySettings(
        cors_origins=["https://team.github.io"],
        rate_limit_requests=50,
    )
    app = create_app(settings=settings, http_client=mock_client)

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        payload = make_summary_payload()
        # Request 1 enters Semaphore(1) and pauses
        task1 = asyncio.create_task(client.post("/api/summarize", json=payload))
        await first_started.wait()

        # Requests 2, 3, 4 fill the waiting queue of size 3 (total in_flight = 4)
        queued_tasks = [
            asyncio.create_task(client.post("/api/summarize", json=payload))
            for _ in range(3)
        ]
        await asyncio.sleep(0.05)

        # Request 5 must immediately receive HTTP 429 JSON with CORS header
        resp5 = await client.post(
            "/api/summarize",
            json=payload,
            headers={"Origin": "https://team.github.io"},
        )
        assert resp5.status_code == 429
        assert resp5.json()["error"] == "queue_full"
        assert resp5.json()["maxWaiting"] == 3
        assert resp5.headers.get("access-control-allow-origin") == "https://team.github.io"

        # Unblock Request 1 and confirm all 4 queued/active requests complete cleanly
        release_first.set()
        results = await asyncio.gather(task1, *queued_tasks)
        assert all(r.status_code == 200 for r in results)

    await mock_client.aclose()


@pytest.mark.asyncio
async def test_per_ip_rate_limit_and_cors_rejection():
    async def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"message": {"content": "精簡導讀：總計 NT$ 31,900。"}})

    mock_client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    settings = GatewaySettings(
        cors_origins=["https://allowed.github.io"],
        rate_limit_requests=2,
        rate_limit_window_seconds=60,
    )
    app = create_app(settings=settings, http_client=mock_client)

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        payload = make_summary_payload()
        r1 = await client.post(
            "/api/summarize",
            json=payload,
            headers={"Origin": "https://allowed.github.io"},
        )
        r2 = await client.post(
            "/api/summarize",
            json=payload,
            headers={"Origin": "https://allowed.github.io"},
        )
        r3 = await client.post(
            "/api/summarize",
            json=payload,
            headers={"Origin": "https://evil.example.com"},
        )

    await mock_client.aclose()

    assert r1.status_code == 200
    assert r1.headers.get("access-control-allow-origin") == "https://allowed.github.io"
    assert r2.status_code == 200
    assert r3.status_code == 429
    assert "Retry-After" in r3.headers
    assert r3.headers.get("access-control-allow-origin") is None


@pytest.mark.asyncio
async def test_ollama_timeout_returns_504():
    async def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("timeout", request=request)

    mock_client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    app = create_app(settings=GatewaySettings(), http_client=mock_client)

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        resp = await client.post("/api/summarize", json=make_summary_payload())

    await mock_client.aclose()
    assert resp.status_code == 504


@pytest.mark.asyncio
@pytest.mark.parametrize("raw_county", ["", "   "])
async def test_parse_input_normalizes_empty_senior_card_county_to_none(raw_county: str):
    async def handler(_request: httpx.Request) -> httpx.Response:
        ollama_content = {
            "origin": "taipei_keelung",
            "destination": "penghu",
            "startDate": "2026-12-11",
            "days": 3,
            "budgetPerPersonTwd": 9000,
            "lodgingTier": "standard",
            "group": {"adult": 2, "offshoreResident": False},
            "passes": {"seniorCardCounty": raw_county, "tpassRegion": "none"},
            "preferredTransport": ["domestic_air"],
            "pace": "relaxed",
        }
        return httpx.Response(
            200,
            json={"message": {"role": "assistant", "content": json.dumps(ollama_content)}},
        )

    mock_client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    app = create_app(settings=GatewaySettings(), http_client=mock_client)

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        resp = await client.post("/api/parse-input", json={"text": "台北去澎湖三天兩夜"})

    await mock_client.aclose()

    assert resp.status_code == 200
    assert resp.json()["parsed"]["passes"]["seniorCardCounty"] is None


@pytest.mark.asyncio
async def test_parse_input_rejects_impossible_calendar_date_with_502():
    async def handler(_request: httpx.Request) -> httpx.Response:
        ollama_content = {
            "origin": "taipei_keelung",
            "destination": "penghu",
            "startDate": "2026-02-30",
            "days": 3,
        }
        return httpx.Response(
            200,
            json={"message": {"role": "assistant", "content": json.dumps(ollama_content)}},
        )

    mock_client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    app = create_app(settings=GatewaySettings(), http_client=mock_client)

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        resp = await client.post("/api/parse-input", json={"text": "二月三十日去澎湖"})

    await mock_client.aclose()

    assert resp.status_code == 502


@pytest.mark.asyncio
async def test_trust_proxy_headers_honors_cf_connecting_ip_only_for_loopback_peers():
    async def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"message": {"content": "精簡導讀：總計 NT$ 31,900。"}})

    mock_client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    settings = GatewaySettings(
        rate_limit_requests=1,
        rate_limit_window_seconds=60,
        trust_proxy_headers=True,
    )
    app = create_app(settings=settings, http_client=mock_client)
    payload = make_summary_payload()

    # Loopback peer (127.0.0.1) honors CF-Connecting-IP per distinct client
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app, client=("127.0.0.1", 12345)),
        base_url="http://testserver",
    ) as loopback_client:
        r_ip1_first = await loopback_client.post(
            "/api/summarize",
            json=payload,
            headers={"CF-Connecting-IP": "203.0.113.10"},
        )
        r_ip1_second = await loopback_client.post(
            "/api/summarize",
            json=payload,
            headers={"CF-Connecting-IP": "203.0.113.10"},
        )
        r_ip2_first = await loopback_client.post(
            "/api/summarize",
            json=payload,
            headers={"CF-Connecting-IP": "203.0.113.20"},
        )

    # Non-loopback peer (198.51.100.50) cannot spoof CF-Connecting-IP to bypass its own limit
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app, client=("198.51.100.50", 12345)),
        base_url="http://testserver",
    ) as remote_client:
        r_remote_first = await remote_client.post(
            "/api/summarize",
            json=payload,
            headers={"CF-Connecting-IP": "203.0.113.30"},
        )
        r_remote_spoofed = await remote_client.post(
            "/api/summarize",
            json=payload,
            headers={"CF-Connecting-IP": "203.0.113.99"},
        )

    await mock_client.aclose()

    assert r_ip1_first.status_code == 200
    assert r_ip1_second.status_code == 429
    assert r_ip2_first.status_code == 200
    assert r_remote_first.status_code == 200
    assert r_remote_spoofed.status_code == 429


def test_rate_limiter_prunes_expired_ip_deques():
    limiter = SlidingWindowRateLimiter(max_requests=2, window_seconds=60)
    assert limiter.check("198.51.100.1", now=0.0) == (True, 0)
    assert limiter.check("198.51.100.2", now=10.0) == (True, 0)
    assert set(limiter._hits.keys()) == {"198.51.100.1", "198.51.100.2"}

    # After 60s from first IP and 60s from second IP, expired buckets are deleted
    assert limiter.check("198.51.100.3", now=75.0) == (True, 0)
    assert list(limiter._hits.keys()) == ["198.51.100.3"]
