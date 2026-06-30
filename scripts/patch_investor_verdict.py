from pathlib import Path

FILES = [
    ("src/agents/warren_buffett.py", "buffett_output"),
    ("src/agents/ben_graham.py", "graham_output"),
    ("src/agents/bill_ackman.py", "ackman_output"),
    ("src/agents/cathie_wood.py", "cw_output"),
    ("src/agents/charlie_munger.py", "munger_output"),
    ("src/agents/michael_burry.py", "burry_output"),
    ("src/agents/peter_lynch.py", "lynch_output"),
    ("src/agents/phil_fisher.py", "fisher_output"),
    ("src/agents/nassim_taleb.py", "taleb_output"),
    ("src/agents/rakesh_jhunjhunwala.py", "jhunjhunwala_output"),
    ("src/agents/stanley_druckenmiller.py", "druck_output"),
    ("src/agents/george_soros.py", "soros_output"),
    ("src/agents/aswath_damodaran.py", "damodaran_output"),
    ("src/agents/mohnish_pabrai.py", "pabrai_output"),
]

for rel, var in FILES:
    p = Path(rel)
    text = p.read_text(encoding="utf-8")
    if "finish_investor_ticker" in text:
        print("skip", rel)
        continue
    if "from src.utils.progress import progress" in text:
        text = text.replace(
            "from src.utils.progress import progress",
            "from src.utils.progress import progress\nfrom src.utils.thesis_verdict import finish_investor_ticker",
        )
    old = f'progress.update_status(agent_id, ticker, "Done", analysis={var}.reasoning)'
    new = f"finish_investor_ticker(agent_id, ticker, {var}.signal, {var}.confidence, {var}.reasoning, state)"
    if old not in text:
        print("MISSING", rel)
        continue
    p.write_text(text.replace(old, new), encoding="utf-8")
    print("ok", rel)
