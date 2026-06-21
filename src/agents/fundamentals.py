from langchain_core.messages import HumanMessage
from src.graph.state import AgentState, show_agent_reasoning
from src.utils.api_key import get_api_key_from_state
from src.utils.progress import progress
import json

from src.tools.api import get_earnings_digest, get_financial_metrics, search_line_items


##### Fundamental Agent #####
def fundamentals_analyst_agent(state: AgentState, agent_id: str = "fundamentals_analyst_agent"):
    """Analyzes fundamental data and generates trading signals for multiple tickers."""
    data = state["data"]
    end_date = data["end_date"]
    tickers = data["tickers"]
    api_key = get_api_key_from_state(state, "FINANCIAL_DATASETS_API_KEY")
    # Initialize fundamental analysis for each ticker
    fundamental_analysis = {}

    for ticker in tickers:
        progress.update_status(agent_id, ticker, "Fetching SEC EDGAR earnings")
        earnings = get_earnings_digest(
            ticker,
            end_date,
            state=state,
            agent_id=agent_id,
            use_llm=True,
        )

        progress.update_status(agent_id, ticker, "Fetching financial metrics")

        # Get the financial metrics
        financial_metrics = get_financial_metrics(
            ticker=ticker,
            end_date=end_date,
            period="ttm",
            limit=10,
            api_key=api_key,
        )

        if not financial_metrics:
            progress.update_status(agent_id, ticker, "No API metrics — using SEC/yfinance line items")
            line_items = search_line_items(
                ticker,
                ["revenue", "net_income", "earnings_per_share", "free_cash_flow", "total_debt"],
                end_date,
                period="ttm",
                limit=4,
                api_key=api_key,
            )
            latest = line_items[0] if line_items else None
            if not latest:
                fundamental_analysis[ticker] = {
                    "signal": "neutral",
                    "confidence": 0,
                    "reasoning": {
                        "data_gap": {
                            "signal": "neutral",
                            "details": "No financial metrics or line items available for this ticker.",
                        }
                    },
                }
                progress.update_status(agent_id, ticker, "Done", analysis=json.dumps(fundamental_analysis[ticker], indent=4))
                continue

            class _Metrics:
                pass

            metrics = _Metrics()
            metrics.return_on_equity = None
            metrics.net_margin = None
            metrics.operating_margin = None
            metrics.revenue_growth = None
            metrics.earnings_growth = None
            metrics.book_value_growth = None
            metrics.current_ratio = None
            metrics.debt_to_equity = None
            rev = latest.revenue
            ni = latest.net_income
            oi = latest.operating_income
            metrics.free_cash_flow_per_share = latest.free_cash_flow
            metrics.earnings_per_share = latest.earnings_per_share
            metrics.net_margin = (ni / rev) if rev and ni is not None else None
            metrics.operating_margin = (oi / rev) if rev and oi is not None else None
            metrics.price_to_earnings_ratio = None
            metrics.price_to_book_ratio = None
            metrics.price_to_sales_ratio = None
        else:
            metrics = financial_metrics[0]

        # Enrich metrics from SEC earnings digest when API data is sparse
        if earnings.available:
            if getattr(metrics, "earnings_per_share", None) is None and earnings.eps is not None:
                metrics.earnings_per_share = earnings.eps
            if getattr(metrics, "revenue_growth", None) is None and earnings.revenue_yoy_pct is not None:
                metrics.revenue_growth = earnings.revenue_yoy_pct
            if getattr(metrics, "earnings_growth", None) is None and earnings.eps_yoy_pct is not None:
                metrics.earnings_growth = earnings.eps_yoy_pct

        # Initialize signals list for different fundamental aspects
        signals = []
        reasoning = {}

        progress.update_status(agent_id, ticker, "Analyzing profitability")
        # 1. Profitability Analysis
        return_on_equity = metrics.return_on_equity
        net_margin = metrics.net_margin
        operating_margin = metrics.operating_margin

        thresholds = [
            (return_on_equity, 0.15),  # Strong ROE above 15%
            (net_margin, 0.20),  # Healthy profit margins
            (operating_margin, 0.15),  # Strong operating efficiency
        ]
        profitability_score = sum(metric is not None and metric > threshold for metric, threshold in thresholds)

        signals.append("bullish" if profitability_score >= 2 else "bearish" if profitability_score == 0 else "neutral")
        reasoning["profitability_signal"] = {
            "signal": signals[0],
            "details": (f"ROE: {return_on_equity:.2%}" if return_on_equity else "ROE: N/A") + ", " + (f"Net Margin: {net_margin:.2%}" if net_margin else "Net Margin: N/A") + ", " + (f"Op Margin: {operating_margin:.2%}" if operating_margin else "Op Margin: N/A"),
        }

        progress.update_status(agent_id, ticker, "Analyzing growth")
        # 2. Growth Analysis
        revenue_growth = metrics.revenue_growth
        earnings_growth = metrics.earnings_growth
        book_value_growth = metrics.book_value_growth

        thresholds = [
            (revenue_growth, 0.10),  # 10% revenue growth
            (earnings_growth, 0.10),  # 10% earnings growth
            (book_value_growth, 0.10),  # 10% book value growth
        ]
        growth_score = sum(metric is not None and metric > threshold for metric, threshold in thresholds)

        signals.append("bullish" if growth_score >= 2 else "bearish" if growth_score == 0 else "neutral")
        reasoning["growth_signal"] = {
            "signal": signals[1],
            "details": (f"Revenue Growth: {revenue_growth:.2%}" if revenue_growth else "Revenue Growth: N/A") + ", " + (f"Earnings Growth: {earnings_growth:.2%}" if earnings_growth else "Earnings Growth: N/A"),
        }

        progress.update_status(agent_id, ticker, "Analyzing financial health")
        # 3. Financial Health
        current_ratio = metrics.current_ratio
        debt_to_equity = metrics.debt_to_equity
        free_cash_flow_per_share = metrics.free_cash_flow_per_share
        earnings_per_share = metrics.earnings_per_share

        health_score = 0
        if current_ratio and current_ratio > 1.5:  # Strong liquidity
            health_score += 1
        if debt_to_equity and debt_to_equity < 0.5:  # Conservative debt levels
            health_score += 1
        if free_cash_flow_per_share and earnings_per_share and free_cash_flow_per_share > earnings_per_share * 0.8:  # Strong FCF conversion
            health_score += 1

        signals.append("bullish" if health_score >= 2 else "bearish" if health_score == 0 else "neutral")
        reasoning["financial_health_signal"] = {
            "signal": signals[2],
            "details": (f"Current Ratio: {current_ratio:.2f}" if current_ratio else "Current Ratio: N/A") + ", " + (f"D/E: {debt_to_equity:.2f}" if debt_to_equity else "D/E: N/A"),
        }

        progress.update_status(agent_id, ticker, "Analyzing valuation ratios")
        # 4. Price to X ratios
        pe_ratio = metrics.price_to_earnings_ratio
        pb_ratio = metrics.price_to_book_ratio
        ps_ratio = metrics.price_to_sales_ratio

        thresholds = [
            (pe_ratio, 25),  # Reasonable P/E ratio
            (pb_ratio, 3),  # Reasonable P/B ratio
            (ps_ratio, 5),  # Reasonable P/S ratio
        ]
        price_ratio_score = sum(metric is not None and metric > threshold for metric, threshold in thresholds)

        signals.append("bearish" if price_ratio_score >= 2 else "bullish" if price_ratio_score == 0 else "neutral")
        reasoning["price_ratios_signal"] = {
            "signal": signals[3],
            "details": (f"P/E: {pe_ratio:.2f}" if pe_ratio else "P/E: N/A") + ", " + (f"P/B: {pb_ratio:.2f}" if pb_ratio else "P/B: N/A") + ", " + (f"P/S: {ps_ratio:.2f}" if ps_ratio else "P/S: N/A"),
        }

        progress.update_status(agent_id, ticker, "Calculating final signal")
        # Determine overall signal
        bullish_signals = signals.count("bullish")
        bearish_signals = signals.count("bearish")

        if bullish_signals > bearish_signals:
            overall_signal = "bullish"
        elif bearish_signals > bullish_signals:
            overall_signal = "bearish"
        else:
            overall_signal = "neutral"

        # Calculate confidence level
        total_signals = len(signals)
        confidence = round(max(bullish_signals, bearish_signals) / total_signals, 2) * 100

        reasoning["sec_earnings"] = {
            "headline": earnings.headline,
            "summary": earnings.summary,
            "filing": f"{earnings.filing_form} ({earnings.filing_date})" if earnings.filing_form else None,
            "filing_form": earnings.filing_form,
            "filing_date": earnings.filing_date,
            "filing_url": earnings.filing_url,
            "source": earnings.source,
            "revenue": earnings.revenue,
            "revenue_prior": earnings.revenue_prior,
            "revenue_yoy_pct": earnings.revenue_yoy_pct,
            "eps": earnings.eps,
            "eps_prior": earnings.eps_prior,
            "eps_yoy_pct": earnings.eps_yoy_pct,
            "net_income": earnings.net_income,
            "management_tone": earnings.management_tone,
            "guidance": earnings.guidance,
            "one_time_items": earnings.one_time_items or [],
            "key_risks": earnings.key_risks or [],
            "quarters_reported": len(earnings.quarterly_history),
            "quarterly_history": [
                {
                    "period_end": q.period_end,
                    "fiscal_period": q.fiscal_period,
                    "form": q.form,
                    "revenue": q.revenue,
                    "net_income": q.net_income,
                    "eps": q.eps,
                }
                for q in earnings.quarterly_history[:6]
            ],
        }

        fundamental_analysis[ticker] = {
            "signal": overall_signal,
            "confidence": confidence,
            "reasoning": reasoning,
        }

        try:
            from src.utils.agent_artifacts import attach_artifacts

            artifacts = attach_artifacts(
                agent_id=agent_id,
                investor_name="Fundamentals Analyst",
                ticker=ticker,
                state=state,
                metrics_ctx={"ticker": ticker},
                reasoning_payload=reasoning,
            )
        except Exception as exc:
            progress.update_status(agent_id, ticker, f"Chart render skipped: {exc}")
            artifacts = []
        if artifacts:
            fundamental_analysis[ticker]["artifacts"] = artifacts

        progress.update_status(agent_id, ticker, "Done", analysis=json.dumps(fundamental_analysis[ticker], default=str))

    # Create the fundamental analysis message
    message = HumanMessage(
        content=json.dumps(fundamental_analysis),
        name=agent_id,
    )

    # Print the reasoning if the flag is set
    if state["metadata"]["show_reasoning"]:
        show_agent_reasoning(fundamental_analysis, "Fundamental Analysis Agent")

    # Add the signal to the analyst_signals list
    state["data"]["analyst_signals"][agent_id] = fundamental_analysis

    progress.update_status(agent_id, None, "Done")
    
    return {
        "messages": [message],
        "data": data,
    }
