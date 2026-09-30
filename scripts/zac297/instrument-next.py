"""Temporary ZAC-297 instrumentation of Next's client action queue.

Usage: python3 instrument-next.py <next package dir> [--revert]
Unlinks each file before writing so the pnpm store (hardlinked) is untouched.
"""
import os
import shutil
import sys

ROOT = sys.argv[1]
REVERT = "--revert" in sys.argv
FILES = [
    "dist/esm/client/components/app-router-instance.js",
    "dist/client/components/app-router-instance.js",
]

LOG_FN = (
    "function __zlog(ev, extra){try{var w=typeof window!=='undefined'?window:null;"
    "if(!w)return;var e=Object.assign({t:Math.round(performance.now()),ev:ev},extra||{});"
    "(w.__navLog=w.__navLog||[]).push(e);console.log('[navq] '+JSON.stringify(e));}catch(_){}}\n"
    "function __zdesc(p){return {type:p&&p.type,url:p&&p.url?String(p.url.pathname+p.url.search):undefined};}\n"
)

REPLACEMENTS = [
    (
        "    function handleResult(nextState) {\n"
        "        // if we discarded this action, the state should also be discarded\n"
        "        if (action.discarded) {\n",
        "    function handleResult(nextState) {\n"
        "        __zlog('settle', Object.assign({discarded: !!action.discarded}, __zdesc(action.payload)));\n"
        "        // if we discarded this action, the state should also be discarded\n"
        "        if (action.discarded) {\n",
    ),
    (
        "        actionResult.then(handleResult, (err)=>{\n",
        "        actionResult.then(handleResult, (err)=>{\n"
        "            __zlog('reject', Object.assign({err: String(err)}, __zdesc(action.payload)));\n",
    ),
    (
        "            // we immediately notify React of the pending promise -- the resolver is attached to the action node\n",
        "            // we immediately notify React of the pending promise -- the resolver is attached to the action node\n"
        "            deferredPromise.then(()=>__zlog('deferred_resolved', __zdesc(payload)), ()=>__zlog('deferred_rejected', __zdesc(payload)));\n",
    ),
    (
        "    // Check if the queue is empty\n"
        "    if (actionQueue.pending === null) {\n",
        "    __zlog('dispatch', Object.assign({queueBusy: actionQueue.pending !== null, pendingType: actionQueue.pending && actionQueue.pending.payload.type}, __zdesc(payload)));\n"
        "    // Check if the queue is empty\n"
        "    if (actionQueue.pending === null) {\n",
    ),
]


def main():
    for rel in FILES:
        path = os.path.join(ROOT, rel)
        backup = path + ".zac297.orig"
        if REVERT:
            if os.path.exists(backup):
                os.unlink(path)
                shutil.move(backup, path)
                print("reverted", rel)
            continue
        if os.path.exists(backup):
            print("already instrumented", rel)
            continue
        with open(path) as f:
            src = f.read()
        out = src
        for old, new in REPLACEMENTS:
            if old not in out:
                raise SystemExit(f"pattern not found in {rel}: {old[:60]!r}")
            out = out.replace(old, new, 1)
        # Insert the logger after the import/require header.
        marker = "function runRemainingActions("
        out = out.replace(marker, LOG_FN + marker, 1)
        shutil.copy2(path, backup)
        os.unlink(path)
        with open(path, "w") as f:
            f.write(out)
        print("instrumented", rel)


main()
