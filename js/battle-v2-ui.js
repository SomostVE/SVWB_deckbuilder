const status = document.getElementById("battle-status");

if (status) {
  let applying = false;
  const sync = () => {
    if (applying) return;
    const text = status.textContent || "";
    if (!text.includes("win-rate benchmarking stays locked")) return;
    applying = true;
    status.textContent = text.replace(
      "win-rate benchmarking stays locked until rule coverage is stronger.",
      "replay and benchmark remain experimental for this matchup."
    );
    applying = false;
  };

  new MutationObserver(sync).observe(status, { childList: true, characterData: true, subtree: true });
  sync();
}
