from fastapi import APIRouter, HTTPException, Request, Depends
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
import asyncio
import logging

from app.backend.auth.deps import hedge_fund_auth_dependencies, require_user, user_id_from_claims, _bearer
from app.backend.database import get_db

logger = logging.getLogger(__name__)

_SSE_HEADERS = {
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
    "Content-Encoding": "none",
}
from app.backend.models.schemas import (
    ErrorResponse,
    HedgeFundRequest,
    BacktestRequest,
    BacktestDayResult,
    BacktestPerformanceMetrics,
    ResolveTickersRequest,
    ResolveTickersResponse,
    AlpacaAccountRequest,
    AlpacaExecuteRequest,
    AlpacaStatusResponse,
    DebateInterjectionRequest,
    UserConsultationRequest,
    ShiftScheduleCreateRequest,
    ShiftScheduleUpdateRequest,
    SchedulerChatRequest,
    SchedulerPrefsUpdateRequest,
)
from app.backend.models.events import StartEvent, ProgressUpdateEvent, ErrorEvent, CompleteEvent
from app.backend.services.graph import create_graph, parse_hedge_fund_response, run_graph_async
from app.backend.services.portfolio import create_portfolio
from app.backend.services.backtest_service import BacktestService
from app.backend.services.alpaca_paper import (
    AlpacaPaperClient,
    alpaca_credential_source,
    compact_account,
    compact_position,
    is_alpaca_configured,
    is_alpaca_paper_disabled,
    run_alpaca_paper_execution,
)
from app.backend.services.shift_archive import archive_shift_to_supabase
from app.backend.services.entitlements import (
    can_run_shift,
    can_use_paper,
    can_use_scheduler,
    get_user_entitlements,
    increment_shift_count,
    paywall_detail,
)
from app.backend.services.memo_email import is_resend_configured, send_memo_digest
from app.backend.services.memo_document import build_memo_document
from src.utils.progress import progress
from src.utils.analysts import get_agents_list
from src.utils.persona_registry import build_registry, default_registry, load_packs_by_ids
from src.tools.api import get_macro_context
from src.utils.agent_artifacts import cleanup_old_runs, set_run_artifact_root
from src.utils.debate_interjections import bind_run, clear_run, push_interjection
from src.utils.live_run_registry import bind_session, clear_session, get_session
from src.utils.user_consultation import apply_user_consultation, mirror_progress_to_session
from src.utils.consultation import extract_base_agent_key
from src.utils.weather_report import build_weather_reports
from src.utils.ticker_resolve import (
    MAX_SHIFT_TICKERS,
    RESOLVER_MODEL,
    RESOLVER_PROVIDER,
    normalize_ticker_list,
    parse_direct_tickers,
    resolve_tickers_from_query,
)
from src.tools.providers.keys import active_keys_dict, merge_api_keys
import json
import os
import secrets

router = APIRouter(
    prefix="/hedge-fund",
    dependencies=hedge_fund_auth_dependencies(),
)

_SCORING_SECRET = (os.getenv("SCORING_CRON_SECRET") or "").strip()
_DIGEST_SECRET = (os.getenv("DIGEST_CRON_SECRET") or "").strip()
_SCHEDULE_SECRET = (os.getenv("SCHEDULE_CRON_SECRET") or "").strip()


def _is_scoring_production() -> bool:
    env = (os.getenv("ENV") or os.getenv("ENVIRONMENT") or "").strip().lower()
    if env == "production":
        return True
    return bool((os.getenv("SUPABASE_URL") or "").strip())


def _verify_scoring_cron(request: Request) -> None:
    if not _SCORING_SECRET:
        if _is_scoring_production():
            raise HTTPException(
                status_code=401,
                detail="SCORING_CRON_SECRET is required in production",
            )
        return
    header = request.headers.get("X-Scoring-Secret", "")
    if not secrets.compare_digest(header, _SCORING_SECRET):
        raise HTTPException(status_code=401, detail="Invalid scoring cron secret")


def _is_digest_production() -> bool:
    return _is_scoring_production()


def _verify_digest_cron(request: Request) -> None:
    if not _DIGEST_SECRET:
        if _is_digest_production():
            raise HTTPException(
                status_code=401,
                detail="DIGEST_CRON_SECRET is required in production",
            )
        return
    header = request.headers.get("X-Digest-Secret", "")
    if not secrets.compare_digest(header, _DIGEST_SECRET):
        raise HTTPException(status_code=401, detail="Invalid digest cron secret")


def _verify_schedule_cron(request: Request) -> None:
    if not _SCHEDULE_SECRET:
        if _is_scoring_production():
            raise HTTPException(
                status_code=401,
                detail="SCHEDULE_CRON_SECRET is required in production",
            )
        return
    header = request.headers.get("X-Schedule-Secret", "")
    if not secrets.compare_digest(header, _SCHEDULE_SECRET):
        raise HTTPException(status_code=401, detail="Invalid schedule cron secret")


def _require_scheduler(user_claims: dict | None) -> str:
    user_id = user_id_from_claims(user_claims)
    ok, msg = can_use_scheduler(user_id)
    if not ok:
        detail = paywall_detail(
            "scheduler_blocked",
            msg or "Schedule mode requires upgrade",
            "scheduler",
        )
        detail["entitlements"] = get_user_entitlements(user_id)
        raise HTTPException(status_code=402, detail=detail)
    return user_id


# Public / cron routes — no member JWT (included separately in routes/__init__.py)
public_router = APIRouter(prefix="/hedge-fund")


def _hydrate_request_api_keys(request_data, db: Session | None = None) -> None:
    """Merge .env + request overrides so every agent sees the full key set."""
    explicit = request_data.api_keys
    request_data.api_keys = active_keys_dict(merge_api_keys(explicit))


def _prepare_shift_tickers(request_data: HedgeFundRequest) -> list[str]:
    tickers = normalize_ticker_list(request_data.tickers, max_count=MAX_SHIFT_TICKERS)
    if tickers:
        return tickers

    query = (request_data.ticker_query or "").strip()
    if not query:
        raise HTTPException(status_code=400, detail="Provide tickers or a natural-language request.")

    direct = parse_direct_tickers(query, max_count=MAX_SHIFT_TICKERS)
    if direct is not None:
        return direct

    resolved = resolve_tickers_from_query(
        query,
        model_name=RESOLVER_MODEL,
        model_provider=RESOLVER_PROVIDER.value,
        api_keys=request_data.api_keys,
        max_tickers=MAX_SHIFT_TICKERS,
    )
    return resolved.tickers


@router.post(
    "/resolve-tickers",
    response_model=ResolveTickersResponse,
    responses={
        400: {"model": ErrorResponse, "description": "Invalid request"},
        500: {"model": ErrorResponse, "description": "Resolution failed"},
    },
)
async def resolve_tickers(
    request_data: ResolveTickersRequest,
):
    try:
        _hydrate_request_api_keys(request_data)

        query = request_data.query.strip()
        direct = parse_direct_tickers(query, max_count=request_data.max_tickers)
        if direct is not None:
            return ResolveTickersResponse(
                tickers=direct,
                rationale="Parsed ticker symbols from your input.",
                direct=True,
            )

        result = resolve_tickers_from_query(
            request_data.query.strip(),
            model_name=RESOLVER_MODEL,
            model_provider=RESOLVER_PROVIDER.value,
            api_keys=request_data.api_keys,
            max_tickers=request_data.max_tickers,
        )
        return ResolveTickersResponse(
            tickers=result.tickers,
            rationale=result.rationale,
            direct=False,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Ticker resolution failed")
        raise HTTPException(status_code=500, detail=f"Ticker resolution failed: {exc}") from exc


@router.post(
    path="/run",
    responses={
        200: {"description": "Successful response with streaming updates"},
        400: {"model": ErrorResponse, "description": "Invalid request parameters"},
        402: {"description": "Paywall — upgrade required"},
        500: {"model": ErrorResponse, "description": "Internal server error"},
    },
)
async def run(
    request_data: HedgeFundRequest,
    request: Request,
    db: Session = Depends(get_db),
    user_claims: dict | None = Depends(require_user),
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
):
    try:
        _hydrate_request_api_keys(request_data)
        access_token = credentials.credentials if credentials else None
        shift_user_id = user_id_from_claims(user_claims)

        analyst_nodes = [
            n for n in request_data.graph_nodes
            if getattr(n, "id", None) not in ("portfolio_manager", "risk_manager")
        ]
        roster_size = len(analyst_nodes)

        shift_ok, shift_msg, shift_paywall = can_run_shift(
            shift_user_id,
            roster_size=roster_size,
        )
        if not shift_ok:
            detail = shift_paywall or paywall_detail(
                "shift_blocked",
                shift_msg or "Shift not allowed on current plan",
                "shift",
            )
            detail["entitlements"] = get_user_entitlements(shift_user_id)
            raise HTTPException(status_code=402, detail=detail)

        if request_data.execute_alpaca_paper:
            paper_ok, paper_msg = can_use_paper(shift_user_id)
            if not paper_ok:
                detail = paywall_detail(
                    "paper_blocked",
                    paper_msg or "Paper trading requires upgrade",
                    "paper",
                )
                detail["entitlements"] = get_user_entitlements(shift_user_id)
                raise HTTPException(status_code=402, detail=detail)

        shift_tickers = _prepare_shift_tickers(request_data)
        request_data.tickers = shift_tickers

        analyst_registry = default_registry()
        if request_data.persona_pack_ids:
            try:
                packs = load_packs_by_ids(request_data.persona_pack_ids)
            except KeyError as exc:
                raise HTTPException(status_code=400, detail=str(exc)) from exc
            except ValueError as exc:
                raise HTTPException(status_code=400, detail=str(exc)) from exc
            analyst_registry = build_registry(packs)

        # Create the portfolio
        portfolio = create_portfolio(
            request_data.initial_cash,
            request_data.margin_requirement,
            shift_tickers,
            request_data.portfolio_positions,
        )

        # Construct agent graph using the React Flow graph structure
        graph = create_graph(
            graph_nodes=request_data.graph_nodes,
            graph_edges=request_data.graph_edges,
            analyst_registry=analyst_registry,
        )
        graph = graph.compile()

        # Log a test progress update for debugging
        progress.update_status("system", None, "Preparing hedge fund run")

        # Convert model_provider to string if it's an enum
        model_provider = request_data.model_provider
        if hasattr(model_provider, "value"):
            model_provider = model_provider.value

        # Function to detect client disconnection
        async def wait_for_disconnect():
            """Wait for client disconnect and return True when it happens"""
            try:
                while True:
                    message = await request.receive()
                    if message["type"] == "http.disconnect":
                        return True
            except Exception:
                return True

        # Set up streaming response
        async def event_generator():
            # Queue for progress updates (graph runs in a thread pool — use threadsafe enqueue).
            progress_queue: asyncio.Queue = asyncio.Queue()
            loop = asyncio.get_running_loop()
            run_task = None
            disconnect_task = None
            live_session = None

            def progress_handler(
                agent_name,
                ticker,
                status,
                analysis,
                timestamp,
                signal=None,
                confidence=None,
                thesis_summary=None,
                token_usage=None,
            ):
                if live_session and status and str(status).lower() in ("done", "revised (chair consult)"):
                    try:
                        mirror_progress_to_session(live_session, agent_name, ticker, analysis)
                    except Exception:
                        logger.exception("Failed to mirror progress to live session")

                if live_session and agent_name:
                    base = extract_base_agent_key(str(agent_name))
                    if agent_name == "debate_chamber" or base == "debate_chamber":
                        live_session.set_phase("debate")
                    elif base == "portfolio_manager":
                        live_session.set_phase("pm")

                event = ProgressUpdateEvent(
                    agent=agent_name,
                    ticker=ticker,
                    status=status,
                    timestamp=timestamp,
                    analysis=analysis,
                    signal=signal,
                    confidence=confidence,
                    thesis_summary=thesis_summary,
                    token_usage=token_usage,
                )

                def _enqueue() -> None:
                    try:
                        progress_queue.put_nowait(event)
                    except Exception:
                        logger.exception("Failed to enqueue progress for %s", agent_name)

                loop.call_soon_threadsafe(_enqueue)

            # Register our handler with the progress tracker
            progress.register_handler(progress_handler)
            progress.reset_run()
            from src.tools.providers.sec_edgar_earnings import clear_earnings_digest_cache

            clear_earnings_digest_cache()

            # Scope agent-generated chart artifacts to this shift and sweep stale runs.
            run_id = secrets.token_hex(6)
            shift_user_id = user_id_from_claims(user_claims)
            set_run_artifact_root(run_id, shift_user_id, access_token)
            bind_run(run_id)
            live_session = bind_session(
                run_id,
                tickers=request_data.tickers,
                request=request_data,
            )
            try:
                cleanup_old_runs()
            except Exception as exc:
                logger.warning("Artifact cleanup failed: %s", exc)

            try:
                # Let the client know the stream is live before any blocking setup work.
                yield StartEvent(run_id=run_id).to_sse()
                progress.update_status("system", None, "Warming up shift…")

                macro = await loop.run_in_executor(
                    None,
                    lambda: get_macro_context(request_data.end_date, request_data.api_keys),
                )
                if macro.get("available"):
                    progress.update_status(
                        "macro_feed",
                        None,
                        macro.get("summary", {}).get("headline", "Macro snapshot loaded"),
                        analysis=json.dumps(macro, default=str)[:4000],
                    )
                else:
                    progress.update_status(
                        "macro_feed",
                        None,
                        macro.get("message", "Macro feed unavailable"),
                    )

                # Start the graph execution in a background task
                run_task = asyncio.create_task(
                    run_graph_async(
                        graph=graph,
                        portfolio=portfolio,
                        tickers=request_data.tickers,
                        start_date=request_data.start_date,
                        end_date=request_data.end_date,
                        model_name=request_data.model_name,
                        model_provider=model_provider,
                        request=request_data,  # Pass the full request for agent-specific model access
                        run_id=run_id,
                        analyst_registry=analyst_registry,
                    )
                )

                # Start the disconnect detection task
                disconnect_task = asyncio.create_task(wait_for_disconnect())

                # Stream progress updates until run_task completes or client disconnects
                while not run_task.done():
                    # Check if client disconnected
                    if disconnect_task.done():
                        print("Client disconnected, cancelling hedge fund execution")
                        run_task.cancel()
                        try:
                            await run_task
                        except asyncio.CancelledError:
                            pass
                        return

                    # Either get a progress update or wait a bit
                    try:
                        event = await asyncio.wait_for(progress_queue.get(), timeout=1.0)
                        yield event.to_sse()
                    except asyncio.TimeoutError:
                        # Just continue the loop
                        pass

                # Flush any progress still in the queue after the graph finishes
                while not progress_queue.empty():
                    event = progress_queue.get_nowait()
                    yield event.to_sse()

                # Get the final result
                try:
                    result = await run_task
                except asyncio.CancelledError:
                    print("Task was cancelled")
                    return
                except Exception as exc:
                    logger.exception("Hedge fund run failed")
                    yield ErrorEvent(message=str(exc)).to_sse()
                    return

                if not result or not result.get("messages"):
                    yield ErrorEvent(message="Failed to generate hedge fund decisions").to_sse()
                    return

                decisions = parse_hedge_fund_response(result.get("messages", [])[-1].content)
                analyst_signals = result.get("data", {}).get("analyst_signals", {})
                chair_impact = None
                debate_rounds = result.get("data", {}).get("debate_rounds", [])

                if live_session:
                    from src.utils.consultation_propagation import reconcile_chair_impact

                    reconcile_out = reconcile_chair_impact(
                        live_session,
                        result,
                        initial_decisions=decisions,
                        request=request_data,
                    )
                    if reconcile_out:
                        chair_impact = reconcile_out.get("chair_impact")
                        decisions = reconcile_out.get("decisions", decisions)
                        debate_rounds = reconcile_out.get("debate_rounds", debate_rounds)
                    analyst_signals = live_session.merge_into(analyst_signals)

                complete_payload = {
                    "decisions": decisions,
                    "analyst_signals": analyst_signals,
                    "current_prices": result.get("data", {}).get("current_prices", {}),
                    "ticker_dossiers": result.get("data", {}).get("ticker_dossiers", {}),
                    "risk_pipeline": result.get("data", {}).get("risk_pipeline", {}),
                    "shift_artifacts": result.get("data", {}).get("shift_artifacts", {}),
                    "debate_rounds": debate_rounds,
                }
                from src.utils.token_usage import tracker as token_tracker

                complete_payload["token_usage"] = token_tracker.snapshot()
                if chair_impact:
                    complete_payload["chair_impact"] = chair_impact
                try:
                    complete_payload["weather_reports"] = build_weather_reports(
                        tickers=request_data.tickers,
                        analyst_signals=complete_payload["analyst_signals"],
                        decisions=complete_payload["decisions"],
                        dossiers=complete_payload["ticker_dossiers"],
                        risk_pipeline=complete_payload["risk_pipeline"],
                    )
                except Exception as exc:
                    logger.warning("Weather report synthesis failed: %s", exc)

                try:
                    complete_payload["memo_document"] = build_memo_document(
                        complete_payload,
                        run_id=run_id,
                        tickers=request_data.tickers,
                        shift_id=run_id,
                    )
                except Exception as exc:
                    logger.warning("Memo document build failed: %s", exc)

                if request_data.execute_alpaca_paper:
                    if is_alpaca_paper_disabled():
                        complete_payload["paper_trading"] = {
                            "enabled": False,
                            "skipped_reason": "Alpaca paper execution disabled by operator",
                            "shift_id": run_id,
                            "orders": [],
                            "account": None,
                            "positions": [],
                        }
                    elif not is_alpaca_configured(request_data.api_keys):
                        complete_payload["paper_trading"] = {
                            "enabled": False,
                            "skipped_reason": (
                                "Alpaca paper keys missing — set ALPACA_API_KEY_ID and "
                                "ALPACA_API_SECRET_KEY in .env or pass them in api_keys"
                            ),
                            "shift_id": run_id,
                            "orders": [],
                            "account": None,
                            "positions": [],
                        }
                    else:
                        progress.update_status(
                            "paper_desk",
                            None,
                            "Submitting boss decisions to Alpaca paper…",
                        )
                        try:
                            paper = await run_alpaca_paper_execution(
                                decisions,
                                request_data.api_keys,
                                current_prices=complete_payload.get("current_prices"),
                                shift_id=run_id,
                            )
                            complete_payload["paper_trading"] = paper
                            n_ok = sum(
                                1
                                for o in paper.get("orders", [])
                                if o.get("status") not in ("failed", "skipped")
                                and o.get("order_id")
                            )
                            progress.update_status(
                                "paper_desk",
                                None,
                                f"Alpaca paper: {n_ok} order(s) submitted",
                            )
                        except Exception as exc:
                            logger.exception("Alpaca paper execution failed")
                            complete_payload["paper_trading"] = {
                                "enabled": False,
                                "skipped_reason": str(exc),
                                "shift_id": run_id,
                                "orders": [],
                                "account": None,
                                "positions": [],
                            }

                if request_data.send_memo_email and (request_data.digest_email or "").strip():
                    progress.update_status(
                        "memo_desk",
                        None,
                        f"Mailing boss memo to {request_data.digest_email.strip()}…",
                    )
                    if not is_resend_configured(request_data.api_keys):
                        complete_payload["memo_email"] = {
                            "enabled": True,
                            "sent": False,
                            "to": request_data.digest_email.strip(),
                            "error": (
                                "RESEND_API_KEY missing — set in .env or pass in api_keys"
                            ),
                        }
                    else:
                        try:
                            memo_result = await send_memo_digest(
                                to_email=request_data.digest_email.strip(),
                                complete_payload=complete_payload,
                                tickers=request_data.tickers,
                                api_keys=request_data.api_keys,
                            )
                            complete_payload["memo_email"] = memo_result
                            if memo_result.get("sent"):
                                progress.update_status(
                                    "memo_desk",
                                    None,
                                    f"Boss memo emailed to {memo_result.get('to')}",
                                )
                            else:
                                progress.update_status(
                                    "memo_desk",
                                    None,
                                    f"Memo email failed: {memo_result.get('error', 'unknown')}",
                                )
                        except Exception as exc:
                            logger.exception("Memo email failed")
                            complete_payload["memo_email"] = {
                                "enabled": True,
                                "sent": False,
                                "to": request_data.digest_email.strip(),
                                "error": str(exc),
                            }

                if shift_user_id:
                    increment_shift_count(shift_user_id)
                    archive_shift_to_supabase(
                        user_id=shift_user_id,
                        run_id=run_id,
                        tickers=request_data.tickers,
                        model=request_data.model_name,
                        initial_cash=float(request_data.initial_cash),
                        analyst_count=len(request_data.graph_nodes),
                        payload=complete_payload,
                    )

                # Send the final result
                final_data = CompleteEvent(data=complete_payload)
                yield final_data.to_sse()

            except asyncio.CancelledError:
                print("Event generator cancelled")
                return
            finally:
                # Clean up
                progress.unregister_handler(progress_handler)
                set_run_artifact_root(None, None, None)
                from app.backend.services.supabase_client import set_user_access_token

                set_user_access_token(None)
                clear_run(run_id)
                clear_session(run_id)
                if run_task and not run_task.done():
                    run_task.cancel()
                    try:
                        await run_task
                    except asyncio.CancelledError:
                        pass
                if disconnect_task and not disconnect_task.done():
                    disconnect_task.cancel()

        # Return a streaming response
        return StreamingResponse(
            event_generator(), media_type="text/event-stream", headers=_SSE_HEADERS
        )

    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"An error occurred while processing the request: {str(e)}")

@router.post(
    path="/backtest",
    responses={
        200: {"description": "Successful response with streaming backtest updates"},
        400: {"model": ErrorResponse, "description": "Invalid request parameters"},
        500: {"model": ErrorResponse, "description": "Internal server error"},
    },
)
async def backtest(request_data: BacktestRequest, request: Request, db: Session = Depends(get_db)):
    """Run a continuous backtest over a time period with streaming updates."""
    try:
        _hydrate_request_api_keys(request_data, db)

        # Convert model_provider to string if it's an enum
        model_provider = request_data.model_provider
        if hasattr(model_provider, "value"):
            model_provider = model_provider.value

        # Create the portfolio (same as /run endpoint)
        portfolio = create_portfolio(
            request_data.initial_capital, 
            request_data.margin_requirement, 
            request_data.tickers, 
            request_data.portfolio_positions
        )

        # Construct agent graph using the React Flow graph structure (same as /run endpoint)
        graph = create_graph(graph_nodes=request_data.graph_nodes, graph_edges=request_data.graph_edges)
        graph = graph.compile()

        # Create backtest service with the compiled graph
        backtest_service = BacktestService(
            graph=graph,
            portfolio=portfolio,
            tickers=request_data.tickers,
            start_date=request_data.start_date,
            end_date=request_data.end_date,
            initial_capital=request_data.initial_capital,
            model_name=request_data.model_name,
            model_provider=model_provider,
            request=request_data,  # Pass the full request for agent-specific model access
        )

        # Function to detect client disconnection
        async def wait_for_disconnect():
            """Wait for client disconnect and return True when it happens"""
            try:
                while True:
                    message = await request.receive()
                    if message["type"] == "http.disconnect":
                        return True
            except Exception:
                return True

        # Set up streaming response
        async def event_generator():
            progress_queue = asyncio.Queue()
            backtest_task = None
            disconnect_task = None

            # Global progress handler to capture individual agent updates during backtest
            def progress_handler(
                agent_name,
                ticker,
                status,
                analysis,
                timestamp,
                signal=None,
                confidence=None,
                thesis_summary=None,
                token_usage=None,
            ):
                event = ProgressUpdateEvent(
                    agent=agent_name,
                    ticker=ticker,
                    status=status,
                    timestamp=timestamp,
                    analysis=analysis,
                    signal=signal,
                    confidence=confidence,
                    thesis_summary=thesis_summary,
                    token_usage=token_usage,
                )
                progress_queue.put_nowait(event)

            # Progress callback to handle backtest-specific updates
            def progress_callback(update):
                if update["type"] == "progress":
                    import json
                    event = ProgressUpdateEvent(
                        agent="backtest",
                        ticker=None,
                        status=f"Processing {update['current_date']} ({update['current_step']}/{update['total_dates']})",
                        timestamp=update.get("current_date"),
                        analysis=json.dumps({
                            "progress": update.get("progress"),
                            "current_date": update.get("current_date"),
                        }),
                    )
                    progress_queue.put_nowait(event)
                elif update["type"] == "backtest_result":
                    # Convert day result to a streaming event
                    backtest_result = BacktestDayResult(**update["data"])
                    
                    # Send the full day result data as JSON in the analysis field
                    import json
                    analysis_data = json.dumps(update["data"])
                    
                    event = ProgressUpdateEvent(
                        agent="backtest",
                        ticker=None,
                        status=f"Completed {backtest_result.date} - Portfolio: ${backtest_result.portfolio_value:,.2f}",
                        timestamp=None,
                        analysis=analysis_data
                    )
                    progress_queue.put_nowait(event)

            # Register our handler with the progress tracker to capture agent updates
            progress.register_handler(progress_handler)
            
            try:
                # Start the backtest in a background task
                backtest_task = asyncio.create_task(
                    backtest_service.run_backtest_async(progress_callback=progress_callback)
                )
                
                # Start the disconnect detection task
                disconnect_task = asyncio.create_task(wait_for_disconnect())
                
                # Send initial message
                yield StartEvent().to_sse()

                # Stream progress updates until backtest_task completes or client disconnects
                while not backtest_task.done():
                    # Check if client disconnected
                    if disconnect_task.done():
                        print("Client disconnected, cancelling backtest execution")
                        backtest_task.cancel()
                        try:
                            await backtest_task
                        except asyncio.CancelledError:
                            pass
                        return

                    # Either get a progress update or wait a bit
                    try:
                        event = await asyncio.wait_for(progress_queue.get(), timeout=1.0)
                        yield event.to_sse()
                    except asyncio.TimeoutError:
                        # Just continue the loop
                        pass

                # Get the final result
                try:
                    result = await backtest_task
                except asyncio.CancelledError:
                    print("Backtest task was cancelled")
                    return

                if not result:
                    yield ErrorEvent(message="Failed to complete backtest").to_sse()
                    return

                # Send the final result
                performance_metrics = BacktestPerformanceMetrics(**result["performance_metrics"])
                final_data = CompleteEvent(
                    data={
                        "performance_metrics": performance_metrics.model_dump(),
                        "final_portfolio": result["final_portfolio"],
                        "total_days": len(result["results"]),
                        "portfolio_curve": result.get("portfolio_curve", []),
                        "benchmark": result.get("benchmark", {}),
                        "daily_results": result.get("results", [])[-30:],
                    }
                )
                yield final_data.to_sse()

            except asyncio.CancelledError:
                print("Backtest event generator cancelled")
                return
            finally:
                # Clean up
                progress.unregister_handler(progress_handler)
                if backtest_task and not backtest_task.done():
                    backtest_task.cancel()
                    try:
                        await backtest_task
                    except asyncio.CancelledError:
                        pass
                if disconnect_task and not disconnect_task.done():
                    disconnect_task.cancel()

        # Return a streaming response
        return StreamingResponse(
            event_generator(), media_type="text/event-stream", headers=_SSE_HEADERS
        )

    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"An error occurred while processing the backtest request: {str(e)}")


@router.get(
    path="/agents",
    responses={
        200: {"description": "List of available agents"},
        500: {"model": ErrorResponse, "description": "Internal server error"},
    },
)
async def get_agents():
    """Get the list of available agents."""
    try:
        return {"agents": get_agents_list()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve agents: {str(e)}")


@router.get(
    path="/paper-account",
    responses={
        200: {"description": "Alpaca paper account snapshot"},
        503: {"model": ErrorResponse, "description": "Alpaca not configured"},
    },
)
async def get_paper_account():
    """Read current Alpaca paper equity, cash, and open positions."""
    client = AlpacaPaperClient.from_api_keys()
    if not client:
        raise HTTPException(
            status_code=503,
            detail=(
                "Alpaca paper API keys not configured. "
                "Set ALPACA_API_KEY_ID and ALPACA_API_SECRET_KEY in .env"
            ),
        )
    try:
        return await client.get_account_snapshot()
    except Exception as e:
        logger.exception("Failed to fetch Alpaca paper account")
        raise HTTPException(status_code=502, detail=f"Alpaca API error: {e}") from e


@router.get(
    path="/alpaca/status",
    response_model=AlpacaStatusResponse,
    responses={
        200: {"description": "Whether Alpaca paper credentials are available (no secrets)"},
    },
)
async def get_alpaca_status():
    """Check server-side Alpaca paper configuration."""
    disabled = is_alpaca_paper_disabled()
    if disabled:
        return AlpacaStatusResponse(configured=False, source="none", disabled=True)
    source = alpaca_credential_source(None)
    return AlpacaStatusResponse(
        configured=source != "none",
        source=source,
        disabled=False,
    )


@router.post(
    path="/alpaca/status",
    response_model=AlpacaStatusResponse,
    responses={
        200: {"description": "Whether Alpaca paper credentials are available (no secrets)"},
    },
)
async def post_alpaca_status(request_data: AlpacaAccountRequest):
    """Check Alpaca paper configuration including request api_keys."""
    disabled = is_alpaca_paper_disabled()
    if disabled:
        return AlpacaStatusResponse(configured=False, source="none", disabled=True)
    keys = active_keys_dict(merge_api_keys(request_data.api_keys))
    source = alpaca_credential_source(keys)
    return AlpacaStatusResponse(
        configured=source != "none",
        source=source,
        disabled=False,
    )


@router.post(
    path="/alpaca/account",
    responses={
        200: {"description": "Alpaca paper account snapshot with positions and orders"},
        503: {"model": ErrorResponse, "description": "Alpaca not configured"},
        502: {"model": ErrorResponse, "description": "Alpaca API error"},
    },
)
async def post_alpaca_account(request_data: AlpacaAccountRequest):
    """Read Alpaca paper account — uses request api_keys or server .env."""
    keys = active_keys_dict(merge_api_keys(request_data.api_keys))
    client = AlpacaPaperClient.from_api_keys(keys)
    if not client:
        raise HTTPException(
            status_code=503,
            detail=(
                "Alpaca paper API keys not configured. "
                "Set ALPACA_API_KEY_ID and ALPACA_API_SECRET_KEY in .env or pass api_keys"
            ),
        )
    try:
        return await client.get_account_snapshot()
    except Exception as e:
        logger.exception("Failed to fetch Alpaca account")
        raise HTTPException(status_code=502, detail=f"Alpaca API error: {e}") from e


@router.post(
    path="/alpaca/execute",
    responses={
        200: {"description": "Alpaca paper orders submitted from boss memo"},
        402: {"description": "Paywall — upgrade required"},
        503: {"model": ErrorResponse, "description": "Alpaca not configured"},
        502: {"model": ErrorResponse, "description": "Alpaca API error"},
    },
)
async def post_alpaca_execute(
    request_data: AlpacaExecuteRequest,
    user_claims: dict | None = Depends(require_user),
):
    """Submit boss memo decisions to Alpaca paper after shift completes."""
    user_id = user_id_from_claims(user_claims)
    paper_ok, paper_msg = can_use_paper(user_id)
    if not paper_ok:
        detail = paywall_detail(
            "paper_blocked",
            paper_msg or "Paper trading requires upgrade",
            "paper",
        )
        detail["entitlements"] = get_user_entitlements(user_id)
        raise HTTPException(status_code=402, detail=detail)

    if is_alpaca_paper_disabled():
        return {
            "enabled": False,
            "skipped_reason": "Alpaca paper execution disabled by operator",
            "shift_id": request_data.shift_id,
            "orders": [],
            "account": None,
            "positions": [],
        }

    keys = active_keys_dict(merge_api_keys(request_data.api_keys))
    if not is_alpaca_configured(keys):
        raise HTTPException(
            status_code=503,
            detail=(
                "Alpaca paper keys missing — set ALPACA_API_KEY_ID and "
                "ALPACA_API_SECRET_KEY in .env or pass them in api_keys"
            ),
        )

    try:
        return await run_alpaca_paper_execution(
            request_data.decisions,
            keys,
            current_prices=request_data.current_prices,
            shift_id=request_data.shift_id,
        )
    except Exception as e:
        logger.exception("Alpaca paper execution failed")
        raise HTTPException(status_code=502, detail=f"Alpaca API error: {e}") from e


@router.post(
    path="/debate-interject",
    responses={
        200: {"description": "Chair interjection queued for live debate"},
        400: {"model": ErrorResponse, "description": "Invalid request"},
        409: {"model": ErrorResponse, "description": "No active shift for this run"},
    },
)
async def debate_interject(body: DebateInterjectionRequest):
    """Let the user take the floor during an active debate round."""
    ok = push_interjection(
        run_id=body.run_id.strip(),
        ticker=body.ticker,
        text=body.message,
        chair_name=body.chair_name or "Chair",
    )
    if not ok:
        raise HTTPException(
            status_code=409,
            detail="No active shift accepts interjections for this run_id",
        )
    return {"queued": True, "ticker": body.ticker.strip().upper()}


@router.post(
    path="/user-consultation",
    responses={
        200: {"description": "Agent revised thesis from chair @mention"},
        400: {"model": ErrorResponse, "description": "Invalid request"},
        409: {"model": ErrorResponse, "description": "No active shift or agent not ready"},
    },
)
async def user_consultation(body: UserConsultationRequest):
    """@mention an agent mid-shift; they revise thesis and stream a diff."""
    session = get_session(body.run_id.strip())
    if not session:
        raise HTTPException(
            status_code=409,
            detail="No active shift accepts consultations for this run_id",
        )
    loop = asyncio.get_running_loop()
    try:
        result = await loop.run_in_executor(
            None,
            lambda: apply_user_consultation(
                run_id=body.run_id.strip(),
                ticker=body.ticker,
                message=body.message,
                chair_name=body.chair_name or "Chair",
            ),
        )
    except ValueError as exc:
        code = str(exc)
        if code == "mention_required":
            raise HTTPException(status_code=400, detail="Message must start with @AgentName") from exc
        if code == "agent_not_ready":
            raise HTTPException(
                status_code=409,
                detail="That agent has not finished their thesis for this ticker yet",
            ) from exc
        if code == "ticker_not_in_shift":
            raise HTTPException(status_code=400, detail="Ticker not in this shift") from exc
        raise HTTPException(status_code=400, detail=code) from exc
    except Exception as exc:
        logger.exception("User consultation failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return {
        "ok": True,
        "material": result.get("material", False),
        "propagation_queued": result.get("propagation_queued", False),
        "phase": result.get("phase", "analysis"),
        **result,
    }


@public_router.get(
    path="/agents/scorecards",
    responses={
        200: {"description": "Rolled agent accuracy scorecards"},
    },
)
async def get_agent_scorecards(
    keys: str | None = None,
    min_n: int = 0,
    sort: str = "direction_hit_rate",
    order: str = "desc",
    limit: int = 100,
):
    """Public agent scorecards (direction hit rate, target accuracy)."""
    from app.backend.services.scoring_service import fetch_agent_scorecards

    key_list = [k.strip() for k in (keys or "").split(",") if k.strip()] or None
    cards = fetch_agent_scorecards(
        key_list,
        min_n=min_n,
        sort=sort,
        order=order,
        limit=limit,
    )
    return {
        "scorecards": cards,
        "meta": {"sort": sort, "min_n": min_n, "count": len(cards)},
    }


@public_router.get(
    path="/agents/leaderboard",
    responses={
        200: {"description": "Ranked agent leaderboard"},
        400: {"model": ErrorResponse, "description": "Invalid query parameters"},
        503: {"model": ErrorResponse, "description": "Supabase unreachable"},
    },
)
async def get_agent_leaderboard(
    tier: str = "all",
    sort: str = "direction_hit_rate",
    order: str = "desc",
    min_n: int = 10,
    limit: int = 50,
    offset: int = 0,
):
    """Public ranked leaderboard with tier filters."""
    from app.backend.services.scoring_service import fetch_leaderboard

    try:
        return fetch_leaderboard(
            tier=tier,
            sort=sort,
            order=order,
            min_n=min_n,
            limit=limit,
            offset=offset,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@public_router.post(
    path="/scoring/run",
    responses={
        200: {"description": "Scoring job completed"},
        401: {"model": ErrorResponse, "description": "Invalid cron secret"},
    },
)
async def run_scoring_job(request: Request):
    """Score due target outcomes and refresh agent scorecards (cron/admin)."""
    _verify_scoring_cron(request)
    from app.backend.services.scoring_service import run_scoring_cycle

    loop = asyncio.get_running_loop()
    summary = await loop.run_in_executor(None, run_scoring_cycle)
    return summary


@public_router.post(
    path="/digest/run",
    responses={
        200: {"description": "Watchlist digest job completed"},
        400: {"model": ErrorResponse, "description": "Invalid cadence"},
        401: {"model": ErrorResponse, "description": "Invalid cron secret"},
    },
)
async def run_digest_job(request: Request):
    """Batch daily/weekly watchlist digest notifications (cron/admin)."""
    _verify_digest_cron(request)
    body: dict = {}
    try:
        raw = await request.body()
        if raw:
            body = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Invalid JSON body") from exc

    cadence = str((body or {}).get("cadence") or "daily").strip().lower()
    if cadence not in ("daily", "weekly"):
        raise HTTPException(status_code=400, detail="cadence must be daily or weekly")

    from app.backend.services.watchlist_digest_service import run_digest_cycle

    loop = asyncio.get_running_loop()
    try:
        summary = await loop.run_in_executor(
            None,
            lambda: run_digest_cycle(cadence=cadence),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return summary


@router.post(
    path="/posts/{post_id}/link-outcomes",
    responses={
        200: {"description": "Outcomes linked to post"},
        400: {"model": ErrorResponse, "description": "Invalid request"},
    },
)
async def link_post_outcomes(
    post_id: str,
    request: Request,
    claims: dict | None = Depends(require_user),
):
    """Link target_outcomes rows to a published post by shift_id."""
    body = await request.json()
    shift_id = (body or {}).get("shift_id")
    if not shift_id:
        raise HTTPException(status_code=400, detail="shift_id required")

    user_id = user_id_from_claims(claims)
    from app.backend.services.scoring_service import link_outcomes_to_post

    linked = link_outcomes_to_post(
        post_id=post_id,
        shift_id=str(shift_id),
        user_id=user_id,
    )
    return {"linked": linked, "post_id": post_id, "shift_id": shift_id}


@router.get("/schedules")
async def list_user_schedules(claims: dict | None = Depends(require_user)):
    user_id = _require_scheduler(claims)
    from app.backend.services.schedule_service import list_schedules, suggest_schedules

    return {
        "schedules": list_schedules(user_id),
        "suggestions": suggest_schedules(user_id),
    }


@router.get("/schedules/active")
async def list_active_server_shifts(claims: dict | None = Depends(require_user)):
    user_id = _require_scheduler(claims)
    from app.backend.services.schedule_service import get_active_server_runs

    return {"active": get_active_server_runs(user_id)}


@router.get("/schedules/calendar.ics")
async def export_schedule_calendar(claims: dict | None = Depends(require_user)):
    user_id = _require_scheduler(claims)
    from app.backend.services.schedule_service import build_ics_calendar
    from fastapi.responses import PlainTextResponse

    return PlainTextResponse(
        build_ics_calendar(user_id),
        media_type="text/calendar",
        headers={"Content-Disposition": 'attachment; filename="floor-schedule.ics"'},
    )


@router.post("/schedules")
async def create_user_schedule(
    body: ShiftScheduleCreateRequest,
    claims: dict | None = Depends(require_user),
):
    user_id = _require_scheduler(claims)
    from app.backend.services.schedule_service import create_schedule

    try:
        row = create_schedule(user_id, body.model_dump(exclude_none=True))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return row


@router.patch("/schedules/{schedule_id}")
async def patch_user_schedule(
    schedule_id: str,
    body: ShiftScheduleUpdateRequest,
    claims: dict | None = Depends(require_user),
):
    user_id = _require_scheduler(claims)
    from app.backend.services.schedule_service import update_schedule

    row = update_schedule(
        user_id,
        schedule_id,
        body.model_dump(exclude_none=True),
    )
    if not row:
        raise HTTPException(status_code=404, detail="Schedule not found")
    return row


@router.delete("/schedules/{schedule_id}")
async def remove_user_schedule(
    schedule_id: str,
    claims: dict | None = Depends(require_user),
):
    user_id = _require_scheduler(claims)
    from app.backend.services.schedule_service import delete_schedule

    if not delete_schedule(user_id, schedule_id):
        raise HTTPException(status_code=404, detail="Schedule not found")
    return {"deleted": True}


@router.get("/scheduler/prefs")
async def get_scheduler_preferences(claims: dict | None = Depends(require_user)):
    user_id = _require_scheduler(claims)
    from app.backend.services.schedule_service import get_scheduler_prefs

    return get_scheduler_prefs(user_id)


@router.patch("/scheduler/prefs")
async def patch_scheduler_preferences(
    body: SchedulerPrefsUpdateRequest,
    claims: dict | None = Depends(require_user),
):
    user_id = _require_scheduler(claims)
    from app.backend.services.schedule_service import set_scheduler_prefs

    return set_scheduler_prefs(user_id, body.model_dump(exclude_none=True))


@router.post("/scheduler/chat")
async def scheduler_chat(
    body: SchedulerChatRequest,
    claims: dict | None = Depends(require_user),
):
    user_id = _require_scheduler(claims)
    from src.utils.scheduler_agent import run_scheduler_chat

    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(
        None,
        lambda: run_scheduler_chat(
            user_id,
            body.message,
            conversation_id=body.conversation_id,
        ),
    )


@public_router.post(
    path="/schedules/run",
    responses={
        200: {"description": "Schedule cron completed"},
        401: {"model": ErrorResponse, "description": "Invalid cron secret"},
    },
)
async def run_schedule_job(request: Request):
    """Fire due scheduled shifts (cron/admin)."""
    _verify_schedule_cron(request)
    from app.backend.services.schedule_runner_service import run_schedule_cycle

    loop = asyncio.get_running_loop()
    summary = await loop.run_in_executor(None, run_schedule_cycle)
    return summary

