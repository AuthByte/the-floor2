"""Constants and utilities related to analysts configuration."""

from src.agents import portfolio_manager
from src.agents.aswath_damodaran import aswath_damodaran_agent
from src.agents.ben_graham import ben_graham_agent
from src.agents.bill_ackman import bill_ackman_agent
from src.agents.carl_icahn import carl_icahn_agent
from src.agents.cathie_wood import cathie_wood_agent
from src.agents.charlie_munger import charlie_munger_agent
from src.agents.fundamentals import fundamentals_analyst_agent
from src.agents.michael_burry import michael_burry_agent
from src.agents.phil_fisher import phil_fisher_agent
from src.agents.peter_lynch import peter_lynch_agent
from src.agents.sentiment import sentiment_analyst_agent
from src.agents.stanley_druckenmiller import stanley_druckenmiller_agent
from src.agents.george_soros import george_soros_agent
from src.agents.technicals import technical_analyst_agent
from src.agents.valuation import valuation_analyst_agent
from src.agents.warren_buffett import warren_buffett_agent
from src.agents.rakesh_jhunjhunwala import rakesh_jhunjhunwala_agent
from src.agents.mohnish_pabrai import mohnish_pabrai_agent
from src.agents.nassim_taleb import nassim_taleb_agent
from src.agents.news_sentiment import news_sentiment_agent
from src.agents.growth_agent import growth_analyst_agent
from src.agents.howard_marks import howard_marks_agent
from src.agents.jim_simons import jim_simons_agent
from src.agents.joel_greenblatt import joel_greenblatt_agent
from src.agents.john_templeton import john_templeton_agent
from src.agents.li_lu import li_lu_agent
from src.agents.masayoshi_son import masayoshi_son_agent
from src.agents.paul_tudor_jones import paul_tudor_jones_agent
from src.agents.ray_dalio import ray_dalio_agent
from src.agents.seth_klarman import seth_klarman_agent
from src.agents.david_einhorn import david_einhorn_agent
from src.agents.unknown_unknowns import unknown_unknowns_agent
from src.agents.supply_chain_cartographer import supply_chain_cartographer_agent
from src.agents.opportunity_cost import opportunity_cost_agent
from src.agents.insider_activity_desk import insider_activity_desk_agent
from src.agents.ripple_desk import ripple_desk_agent
from src.agents.bastion_moat import bastion_moat_agent
from src.agents.quant_desk import (
    quant_mean_reversion_agent,
    quant_momentum_agent,
    quant_pead_agent,
    quant_volatility_agent,
)

# Define analyst configuration - single source of truth
ANALYST_CONFIG = {
    "aswath_damodaran": {
        "display_name": "Aswath Damodaran",
        "description": "The Dean of Valuation",
        "investing_style": "Focuses on intrinsic value and financial metrics to assess investment opportunities through rigorous valuation analysis.",
        "agent_func": aswath_damodaran_agent,
        "type": "analyst",
        "order": 0,
    },
    "ben_graham": {
        "display_name": "Ben Graham",
        "description": "The Father of Value Investing",
        "investing_style": "Emphasizes a margin of safety and invests in undervalued companies with strong fundamentals through systematic value analysis.",
        "agent_func": ben_graham_agent,
        "type": "analyst",
        "order": 1,
    },
    "bill_ackman": {
        "display_name": "Bill Ackman",
        "description": "The Activist Investor",
        "investing_style": "Seeks to influence management and unlock value through strategic activism and contrarian investment positions.",
        "agent_func": bill_ackman_agent,
        "type": "analyst",
        "order": 2,
    },
    "cathie_wood": {
        "display_name": "Cathie Wood",
        "description": "The Queen of Growth Investing",
        "investing_style": "Focuses on disruptive innovation and growth, investing in companies that are leading technological advancements and market disruption.",
        "agent_func": cathie_wood_agent,
        "type": "analyst",
        "order": 3,
    },
    "charlie_munger": {
        "display_name": "Charlie Munger",
        "description": "The Rational Thinker",
        "investing_style": "Advocates for value investing with a focus on quality businesses and long-term growth through rational decision-making.",
        "agent_func": charlie_munger_agent,
        "type": "analyst",
        "order": 4,
    },
    "michael_burry": {
        "display_name": "Michael Burry",
        "description": "The Big Short Contrarian",
        "investing_style": "Makes contrarian bets, often shorting overvalued markets and investing in undervalued assets through deep fundamental analysis.",
        "agent_func": michael_burry_agent,
        "type": "analyst",
        "order": 5,
    },
    "mohnish_pabrai": {
        "display_name": "Mohnish Pabrai",
        "description": "The Dhandho Investor",
        "investing_style": "Focuses on value investing and long-term growth through fundamental analysis and a margin of safety.",
        "agent_func": mohnish_pabrai_agent,
        "type": "analyst",
        "order": 6,
    },
    "nassim_taleb": {
        "display_name": "Nassim Taleb",
        "description": "The Black Swan Risk Analyst",
        "investing_style": "Focuses on tail risk, antifragility, and asymmetric payoffs. Uses barbell strategy, avoids fragile companies via negativa, and seeks convex positions with limited downside and unlimited upside.",
        "agent_func": nassim_taleb_agent,
        "type": "analyst",
        "order": 7,
    },
    "peter_lynch": {
        "display_name": "Peter Lynch",
        "description": "The 10-Bagger Investor",
        "investing_style": "Invests in companies with understandable business models and strong growth potential using the 'buy what you know' strategy.",
        "agent_func": peter_lynch_agent,
        "type": "analyst",
        "order": 8,
    },
    "phil_fisher": {
        "display_name": "Phil Fisher",
        "description": "The Scuttlebutt Investor",
        "investing_style": "Emphasizes investing in companies with strong management and innovative products, focusing on long-term growth through scuttlebutt research.",
        "agent_func": phil_fisher_agent,
        "type": "analyst",
        "order": 9,
    },
    "rakesh_jhunjhunwala": {
        "display_name": "Rakesh Jhunjhunwala",
        "description": "The Big Bull Of India",
        "investing_style": "Leverages macroeconomic insights to invest in high-growth sectors, particularly within emerging markets and domestic opportunities.",
        "agent_func": rakesh_jhunjhunwala_agent,
        "type": "analyst",
        "order": 10,
    },
    "stanley_druckenmiller": {
        "display_name": "Stanley Druckenmiller",
        "description": "The Macro Investor",
        "investing_style": "Focuses on macroeconomic trends, making large bets on currencies, commodities, and interest rates through top-down analysis.",
        "agent_func": stanley_druckenmiller_agent,
        "type": "analyst",
        "order": 11,
    },
    "george_soros": {
        "display_name": "George Soros",
        "description": "The Reflexivity Trader",
        "investing_style": "Exploits reflexive feedback loops between market prices and fundamentals, seeking asymmetric macro and equity bets when narratives shift.",
        "agent_func": george_soros_agent,
        "type": "analyst",
        "order": 11.5,
    },
    "jim_simons": {
        "display_name": "Jim Simons",
        "description": "The Quantitative Scientist",
        "investing_style": "Looks for statistically persistent price, anomaly, volatility, and liquidity signals using systematic quantitative analysis.",
        "agent_func": jim_simons_agent,
        "type": "analyst",
        "order": 12,
    },
    "howard_marks": {
        "display_name": "Howard Marks",
        "description": "The Cycle Risk Philosopher",
        "investing_style": "Emphasizes credit quality, cycle awareness, downside protection, and valuation only when it compensates for risk.",
        "agent_func": howard_marks_agent,
        "type": "analyst",
        "order": 13,
    },
    "seth_klarman": {
        "display_name": "Seth Klarman",
        "description": "The Deep Value Guardian",
        "investing_style": "Demands margin of safety through asset backing, free cash flow yield, low expectations, and balance-sheet protection.",
        "agent_func": seth_klarman_agent,
        "type": "analyst",
        "order": 14,
    },
    "john_templeton": {
        "display_name": "John Templeton",
        "description": "The Global Contrarian",
        "investing_style": "Searches for bargains at points of pessimism where improving fundamentals support long-term recovery.",
        "agent_func": john_templeton_agent,
        "type": "analyst",
        "order": 15,
    },
    "joel_greenblatt": {
        "display_name": "Joel Greenblatt",
        "description": "The Magic Formula Investor",
        "investing_style": "Combines earnings yield and return on capital to find good businesses at bargain prices.",
        "agent_func": joel_greenblatt_agent,
        "type": "analyst",
        "order": 16,
    },
    "ray_dalio": {
        "display_name": "Ray Dalio",
        "description": "The All-Weather Macro Builder",
        "investing_style": "Evaluates businesses through macro balance, deleveraging resilience, cash-flow durability, and risk parity instincts.",
        "agent_func": ray_dalio_agent,
        "type": "analyst",
        "order": 17,
    },
    "paul_tudor_jones": {
        "display_name": "Paul Tudor Jones",
        "description": "The Disciplined Macro Trader",
        "investing_style": "Prioritizes trend, drawdown stops, volatility regime, and catalyst momentum over static valuation narratives.",
        "agent_func": paul_tudor_jones_agent,
        "type": "analyst",
        "order": 18,
    },
    "carl_icahn": {
        "display_name": "Carl Icahn",
        "description": "The Corporate Raider",
        "investing_style": "Seeks activist situations where undervaluation, capital structure, capital returns, insider signals, or governance pressure can unlock value.",
        "agent_func": carl_icahn_agent,
        "type": "analyst",
        "order": 19,
    },
    "li_lu": {
        "display_name": "Li Lu",
        "description": "The Quality Value Compounder",
        "investing_style": "Looks for long-term compounding, strong returns on capital, conservative leverage, and value discipline.",
        "agent_func": li_lu_agent,
        "type": "analyst",
        "order": 20,
    },
    "masayoshi_son": {
        "display_name": "Masayoshi Son",
        "description": "The Visionary Convexity Investor",
        "investing_style": "Balances growth acceleration, reinvestment, and TAM narrative momentum against valuation and volatility risk.",
        "agent_func": masayoshi_son_agent,
        "type": "analyst",
        "order": 21,
    },
    "supply_chain_cartographer": {
        "display_name": "Supply Chain Cartographer",
        "description": "The Supply Web Mapper",
        "investing_style": "Builds multi-tier supplier/customer graphs per company, flags single-source chokepoints and geographic concentration, and judges supply resilience.",
        "agent_func": supply_chain_cartographer_agent,
        "type": "analyst",
        "order": 21.1,
    },
    "opportunity_cost": {
        "display_name": "Opportunity Cost",
        "description": "The Capital Tradeoff Desk",
        "investing_style": "Measures what investors give up by allocating here vs cash, index beta, sector peers, and higher-conviction alternatives.",
        "agent_func": opportunity_cost_agent,
        "type": "analyst",
        "order": 21.2,
    },
    "ripple_desk": {
        "display_name": "Ripple Desk",
        "description": "Second-Order Effects Specialist",
        "investing_style": "Asks 'then what?' — traces 3-5 step cascades from consensus trades to hidden beneficiaries, bottlenecks, and better risk/reward nodes several hops away.",
        "agent_func": ripple_desk_agent,
        "type": "analyst",
        "order": 21.3,
    },
    "bastion_moat": {
        "display_name": "Bastion",
        "description": "The Moat Fortress Index",
        "investing_style": "Scores switching costs, network effects, and moat durability — especially for software and platforms. Bearish when advantages are narrative-only.",
        "agent_func": bastion_moat_agent,
        "type": "analyst",
        "order": 21.4,
    },
    "david_einhorn": {
        "display_name": "David Einhorn",
        "description": "The Forensic Short Seller",
        "investing_style": "Hunts accounting aggressiveness, weak cash conversion, insider selling, and balance-sheet stress — often building asymmetric short theses when the market prices perfection.",
        "agent_func": david_einhorn_agent,
        "type": "analyst",
        "order": 21.5,
    },
    "unknown_unknowns": {
        "display_name": "Unknown Unknowns",
        "description": "The Red-Team Thesis Assassin",
        "investing_style": "Assigned to attack every consensus thesis. Cannot agree with the desk majority. Hunts hidden risks, accounting concerns, concentration risk, disruptive technology, and regulatory threats that bull cases ignore.",
        "agent_func": unknown_unknowns_agent,
        "type": "analyst",
        "order": 21.6,
    },
    "quant_pead": {
        "display_name": "PEAD Model",
        "description": "Post-Earnings Announcement Drift",
        "investing_style": "Pure quant view on fresh earnings surprises — drift signal from BEAT/MISS filings in the post-announcement window.",
        "agent_func": quant_pead_agent,
        "type": "analyst",
        "order": 21.7,
    },
    "quant_momentum": {
        "display_name": "Momentum Model",
        "description": "12-1 Month Momentum",
        "investing_style": "Blends 12-month and 1-month price momentum into a conviction score — trend-following quant desk.",
        "agent_func": quant_momentum_agent,
        "type": "analyst",
        "order": 21.8,
    },
    "quant_mean_reversion": {
        "display_name": "Mean Reversion Model",
        "description": "Short-Horizon Mean Reversion",
        "investing_style": "Fades stretched moves vs the 20-day mean — contrarian quant overlay.",
        "agent_func": quant_mean_reversion_agent,
        "type": "analyst",
        "order": 21.9,
    },
    "quant_volatility": {
        "display_name": "Volatility Model",
        "description": "Volatility Regime",
        "investing_style": "Scores realized volatility and drift — favors stable uptrends, penalizes chaotic tape.",
        "agent_func": quant_volatility_agent,
        "type": "analyst",
        "order": 22.0,
    },
    "warren_buffett": {
        "display_name": "Warren Buffett",
        "description": "The Oracle of Omaha",
        "investing_style": "Seeks companies with strong fundamentals and competitive advantages through value investing and long-term ownership.",
        "agent_func": warren_buffett_agent,
        "type": "analyst",
        "order": 22,
    },
    "technical_analyst": {
        "display_name": "Technical Analyst",
        "description": "Chart Pattern Specialist",
        "investing_style": "Focuses on chart patterns and market trends to make investment decisions, often using technical indicators and price action analysis.",
        "agent_func": technical_analyst_agent,
        "type": "analyst",
        "order": 23,
    },
    "fundamentals_analyst": {
        "display_name": "Fundamentals Analyst",
        "description": "Financial Statement Specialist",
        "investing_style": "Delves into financial statements and economic indicators to assess the intrinsic value of companies through fundamental analysis.",
        "agent_func": fundamentals_analyst_agent,
        "type": "analyst",
        "order": 24,
    },
    "growth_analyst": {
        "display_name": "Growth Analyst",
        "description": "Growth Specialist",
        "investing_style": "Analyzes growth trends and valuation to identify growth opportunities through growth analysis.",
        "agent_func": growth_analyst_agent,
        "type": "analyst",
        "order": 25,
    },
    "news_sentiment_analyst": {
        "display_name": "News Sentiment Analyst",
        "description": "News Sentiment Specialist",
        "investing_style": "Analyzes news sentiment to predict market movements and identify opportunities through news analysis.",
        "agent_func": news_sentiment_agent,
        "type": "analyst",
        "order": 26,
    },
    "insider_activity_desk": {
        "display_name": "Insider Activity Desk",
        "description": "Form 4 Watch Specialist",
        "investing_style": (
            "Monitors legal public SEC Form 4 filings and licensed feeds for cluster buying, "
            "officer vs director patterns, and filing velocity — not MNPI or tips."
        ),
        "agent_func": insider_activity_desk_agent,
        "type": "analyst",
        "order": 26.5,
    },
    "sentiment_analyst": {
        "display_name": "Sentiment Analyst",
        "description": "Market Sentiment Specialist",
        "investing_style": "Gauges market sentiment and investor behavior to predict market movements and identify opportunities through behavioral analysis.",
        "agent_func": sentiment_analyst_agent,
        "type": "analyst",
        "order": 27,
    },
    "valuation_analyst": {
        "display_name": "Valuation Analyst",
        "description": "Company Valuation Specialist",
        "investing_style": "Specializes in determining the fair value of companies, using various valuation models and financial metrics for investment decisions.",
        "agent_func": valuation_analyst_agent,
        "type": "analyst",
        "order": 28,
    },
}

# Derive ANALYST_ORDER from ANALYST_CONFIG for backwards compatibility
ANALYST_ORDER = [(config["display_name"], key) for key, config in sorted(ANALYST_CONFIG.items(), key=lambda x: x[1]["order"])]


def get_analyst_nodes():
    """Get the mapping of analyst keys to their (node_name, agent_func) tuples."""
    return {key: (f"{key}_agent", config["agent_func"]) for key, config in ANALYST_CONFIG.items()}


def get_agents_list():
    """Get the list of agents for API responses."""
    return [
        {
            "key": key,
            "display_name": config["display_name"],
            "description": config["description"],
            "investing_style": config["investing_style"],
            "order": config["order"]
        }
        for key, config in sorted(ANALYST_CONFIG.items(), key=lambda x: x[1]["order"])
    ]
