#!/bin/bash
# Benchmark Playwright suite at different PW_WORKERS values.
# Records wall, setup time, pass/fail per value into /tmp/pw-bench-results.tsv

set -e
cd "$(dirname "$0")"

RESULTS=/tmp/pw-bench-results.tsv
echo -e "workers\twall_s\tsetup_s\tresult" > "$RESULTS"

for n in 4 6 8 10 12 14 16; do
    echo "=== PW_WORKERS=$n ===" >&2
    log=/tmp/pw-bench-w${n}.log
    start=$(date +%s)
    PW_WORKERS=$n npx playwright test > "$log" 2>&1 || true
    end=$(date +%s)
    wall=$((end - start))

    setup=$(grep -oE "setup complete in [0-9.]+s" "$log" | head -1 | grep -oE "[0-9.]+" || echo "n/a")
    result=$(grep -E "^\s*[0-9]+ (passed|failed)" "$log" | tail -1 | tr -s ' ' || echo "unknown")

    echo -e "$n\t$wall\t$setup\t$result" | tee -a "$RESULTS" >&2
done

echo "=== RESULTS ===" >&2
cat "$RESULTS" >&2
