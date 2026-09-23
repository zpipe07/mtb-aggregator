#!/usr/bin/env python3
"""Decide whether the CI `test` aggregator should pass.

Path-filtered jobs report `skipped`; those are OK. Always-on jobs (`changes`,
`secrets`) must succeed. Failure/cancelled on any needed job fails the gate.
"""

from __future__ import annotations

import json
import os
import sys

REQUIRED = ("changes", "secrets")
OPTIONAL_OK = ("success", "skipped")


def evaluate(needs: dict) -> list[str]:
    bad: list[str] = []
    for name, job in needs.items():
        result = job.get("result")
        if name in REQUIRED:
            if result != "success":
                bad.append(name)
        elif result not in OPTIONAL_OK:
            bad.append(name)
    return bad


def main(argv: list[str]) -> int:
    if argv == ["--self-test"]:
        return _self_test()

    needs = json.loads(os.environ["NEEDS"])
    bad = evaluate(needs)
    print("job results:", {name: job.get("result") for name, job in needs.items()})
    if bad:
        print("required jobs that did not succeed:", ", ".join(bad))
        return 1
    print("all required jobs succeeded")
    return 0


def _self_test() -> int:
    cases = [
        (
            "docs-only PR",
            {
                "changes": {"result": "success"},
                "secrets": {"result": "success"},
                "web": {"result": "skipped"},
                "web-check": {"result": "skipped"},
                "api": {"result": "skipped"},
                "scraper": {"result": "skipped"},
                "docker": {"result": "skipped"},
                "audit": {"result": "skipped"},
            },
            [],
        ),
        (
            "api-only PR",
            {
                "changes": {"result": "success"},
                "secrets": {"result": "success"},
                "web": {"result": "skipped"},
                "web-check": {"result": "skipped"},
                "api": {"result": "success"},
                "scraper": {"result": "skipped"},
                "docker": {"result": "skipped"},
                "audit": {"result": "skipped"},
            },
            [],
        ),
        (
            "failed web-check",
            {
                "changes": {"result": "success"},
                "secrets": {"result": "success"},
                "web": {"result": "success"},
                "web-check": {"result": "failure"},
                "api": {"result": "skipped"},
                "scraper": {"result": "skipped"},
                "docker": {"result": "skipped"},
                "audit": {"result": "skipped"},
            },
            ["web-check"],
        ),
        (
            "cancelled docker",
            {
                "changes": {"result": "success"},
                "secrets": {"result": "success"},
                "web": {"result": "skipped"},
                "web-check": {"result": "skipped"},
                "api": {"result": "success"},
                "scraper": {"result": "skipped"},
                "docker": {"result": "cancelled"},
                "audit": {"result": "skipped"},
            },
            ["docker"],
        ),
        (
            "secrets failed",
            {
                "changes": {"result": "success"},
                "secrets": {"result": "failure"},
                "web": {"result": "skipped"},
                "web-check": {"result": "skipped"},
                "api": {"result": "skipped"},
                "scraper": {"result": "skipped"},
                "docker": {"result": "skipped"},
                "audit": {"result": "skipped"},
            },
            ["secrets"],
        ),
        (
            "changes failed",
            {
                "changes": {"result": "failure"},
                "secrets": {"result": "success"},
                "web": {"result": "skipped"},
                "web-check": {"result": "skipped"},
                "api": {"result": "skipped"},
                "scraper": {"result": "skipped"},
                "docker": {"result": "skipped"},
                "audit": {"result": "skipped"},
            },
            ["changes"],
        ),
    ]
    failed = 0
    for name, needs, expected in cases:
        got = evaluate(needs)
        if got != expected:
            print(f"FAIL {name}: expected {expected}, got {got}")
            failed += 1
        else:
            print(f"ok   {name}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
