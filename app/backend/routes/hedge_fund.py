from fastapi import APIRouter, HTTPException, Request, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
import asyncio
import logging

from app.backend.database import get_db

logger = logging.getLogger(__name__)
from app.backend.models.schemas import (
    ErrorResponse,
    HedgeFundRequest,
    BacktestRequest,
    BacktestDayResult,
    BacktestPerformanceMetrics,
    ResolveTickersRequest,
    ResolveTickersResponse,
    DebateInterjectionRequest,
)
from app.backend.models.events import StartEvent, ProgressUpdateEvent, ErrorEvent, CompleteEvent
from app.backend.services.graph import create_graph, parse_hedge_fund_response, run_graph_async
from app.backend.services.portfolio import create_portfolio
from app.backend.services.backtest_service import BacktestService
from app.backend.services.api_key_service import ApiKeyService
from app.backend.services.alpaca_paper import (
    AlpacaPaperClient,
    compact_account,
    compact_position,
    is_alpaca_configured,
    run_alpaca_paper_execution,
)
from app.backend.services.memo_email import is_resend_configured, send_memo_digest
from src.utils.progress import progress
from src.utils.analysts import get_agents_list
from src.tools.api import get_macro_context
from src.utils.agent_artifacts import cleanup_old_runs, set_run_artifact_root
from src.utils.debate_interjections import bind_run, clear_run, push_interjection
from src.utils.weather_report import build_weather_reports
from src.utils.ticker_resolve import (
    MAX_SHIFT_TICKERS,
    RESOLVER_MODEL,
    RESOLVER_PROVIDER,
    normalize_ticker_list,
    parse_direct_tickers,
    resolve_tickers_from_query,
)
import json
import secrets

router = APIRouter(prefix="/hedge-fund")


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
    db: Session = Depends(get_db),
):
    try:
        if not request_data.api_keys:
            api_key_service = ApiKeyService(db)
            request_data.api_keys = api_key_service.get_api_keys_dict()

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
        500: {"model": ErrorResponse, "description": "Internal server error"},
    },
)
async def run(request_data: HedgeFundRequest, request: Request, db: Session = Depends(get_db)):
    try:
        # Hydrate API keys from database if not provided
        if not request_data.api_keys:
            api_key_service = ApiKeyService(db)
            request_data.api_keys = api_key_service.get_api_keys_dict()

        shift_tickers = _prepare_shift_tickers(request_data)
        request_data.tickers = shift_tickers

        # Create the portfolio
        portfolio = create_portfolio(request_data.initial_cash, request_data.margin_requirement, shift_tickers, request_data.portfolio_positions)

        # Construct agent graph using the React Flow graph structure
        graph = create_graph(
            graph_nodes=request_data.graph_nodes,
            graph_edges=request_data.graph_edges
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

            def progress_handler(
                agent_name,
                ticker,
                status,
                analysis,
                timestamp,
                signal=None,
                confidence=None,
                thesis_summary=None,
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
            set_run_artifact_root(run_id)
            bind_run(run_id)
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
                complete_payload = {
                    "decisions": decisions,
                    "analyst_signals": result.get("data", {}).get("analyst_signals", {}),
                    "current_prices": result.get("data", {}).get("current_prices", {}),
                    "ticker_dossiers": result.get("data", {}).get("ticker_dossiers", {}),
                    "risk_pipeline": result.get("data", {}).get("risk_pipeline", {}),
                    "shift_artifacts": result.get("data", {}).get("shift_artifacts", {}),
                }
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

                if request_data.execute_alpaca_paper:
                    if not is_alpaca_configured(request_data.api_keys):
                        complete_payload["paper_trading"] = {
                            "enabled": False,
                            "skipped_reason": (
                                "Alpaca paper keys missing — set ALPACA_API_KEY_ID and "
                                "ALPACA_API_SECRET_KEY in .env or pass them in api_keys"
                            ),
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

                # Send the final result
                final_data = CompleteEvent(data=complete_payload)
                yield final_data.to_sse()

            except asyncio.CancelledError:
                print("Event generator cancelled")
                return
            finally:
                # Clean up
                progress.unregister_handler(progress_handler)
                set_run_artifact_root(None)
                clear_run(run_id)
                if run_task and not run_task.done():
                    run_task.cancel()
                    try:
                        await run_task
                    except asyncio.CancelledError:
                        pass
                if disconnect_task and not disconnect_task.done():
                    disconnect_task.cancel()

        # Return a streaming response
        return StreamingResponse(event_generator(), media_type="text/event-stream")

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
        # Hydrate API keys from database if not provided
        if not request_data.api_keys:
            api_key_service = ApiKeyService(db)
            request_data.api_keys = api_key_service.get_api_keys_dict()

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
                )
                progress_queue.put_nowait(event)

            # Progress callback to handle backtest-specific updates
            def progress_callback(update):
                if update["type"] == "progress":
                    event = ProgressUpdateEvent(
                        agent="backtest",
                        ticker=None,
                        status=f"Processing {update['current_date']} ({update['current_step']}/{update['total_dates']})",
                        timestamp=None,
                        analysis=None
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
        return StreamingResponse(event_generator(), media_type="text/event-stream")

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
        account = await client.get_account()
        positions = await client.get_positions()
        return {
            "account": compact_account(account),
            "positions": [compact_position(p) for p in positions],
        }
    except Exception as e:
        logger.exception("Failed to fetch Alpaca paper account")
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

