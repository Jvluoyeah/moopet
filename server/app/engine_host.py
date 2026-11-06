"""权威模拟宿主（Python 侧）
============================================================
服务端跑**唯一一份**对局模拟：客户端只发输入、收快照。
引擎是已经验证过确定性的 JS（web/src/game/{fx,rules,match,simAB}.js），
用 Node 子进程承载，走 JSON 行协议（见 web/tools/engine_host.mjs）。

**为什么不把引擎移植成 Python**：那等于把同一套规则写第二遍，
两份实现迟早会漂 —— 而"漂"在对战里就是两端打架。
保持一份实现、换个进程跑它，是这里唯一说得通的做法。

用法：
    with EngineHost(seed=123, breeds=[...]) as h:
        h.step([[in0, in1], ...])     # 推进若干帧，返回帧列表
        h.snapshot()                  # 取快照
        h.restore(snap)               # 回滚
        h.hash()                      # 指纹（对账用）
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import threading
from pathlib import Path
from typing import Any

# 引擎所在目录（web/）—— 这个文件在 server/app/ 下
WEB_DIR = Path(__file__).resolve().parents[2] / "web"
HOST_SCRIPT = WEB_DIR / "tools" / "engine_host.mjs"

TICK_HZ = 128


class EngineHostError(RuntimeError):
    pass


def find_node() -> str | None:
    """找 Node 可执行文件。

    顺序：MOOPET_NODE 环境变量 → PATH 里的 node。
    显式给环境变量是为了应付"node 装在 nvm/conda/自解压目录里、但服务进程
    （systemd / docker / cron）的 PATH 里没有它"的情况 —— Linux 上很常见。
    """
    env_node = os.environ.get("MOOPET_NODE")
    if env_node:
        p = Path(env_node)
        if p.is_file():
            return str(p)
        found = shutil.which(env_node)
        return found
    return shutil.which("node")


def _require_node() -> str:
    node = find_node()
    if node is None:
        raise EngineHostError(
            "找不到 node 可执行文件（服务端权威对战的引擎是 Node 子进程）。"
            "装 Node 18+ 后重试，或用环境变量 MOOPET_NODE=/path/to/node 指定。"
            "Ubuntu 22.04：curl -fsSL https://deb.nodesource.com/setup_22.x | "
            "sudo -E bash - && sudo apt-get install -y nodejs")
    return node


class EngineHost:
    """一个对局一个进程。用完必须 close()（或者用 with）。"""

    def __init__(self, *, seed: int, breeds: list[dict],
                 ai: bool = False, training: bool = False,
                 node: str | None = None, timeout: float = 10.0) -> None:
        self.timeout = timeout
        if not HOST_SCRIPT.exists():
            raise EngineHostError(f"找不到引擎宿主：{HOST_SCRIPT}")
        node_bin = node or _require_node()
        # 子进程也强制 UTF-8：协议行里可能带中文（品种名/错误信息），
        # 在 GBK 控制台或 C locale 下会解码失败，表现为"协议行不是 JSON"
        child_env = {**os.environ, "PYTHONUTF8": "1", "PYTHONIOENCODING": "utf-8",
                     "LANG": os.environ.get("LANG") or "C.UTF-8"}
        self.proc = subprocess.Popen(  # noqa: S603
            [node_bin, str(HOST_SCRIPT)],
            cwd=str(WEB_DIR),
            stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            stderr=subprocess.PIPE, text=True, encoding="utf-8",
            bufsize=1, env=child_env,
        )
        # stderr 单独收着：引擎里 console.warn 之类不该把协议行弄脏
        self._err_lines: list[str] = []
        self._err_thread = threading.Thread(target=self._drain_err, daemon=True)
        self._err_thread.start()

        ready = self._read()
        if not ready.get("ready"):
            raise EngineHostError(f"宿主没就绪：{ready}")
        self.tick_hz = ready.get("tickHz", TICK_HZ)
        r = self._call({"cmd": "new", "seed": seed, "breeds": breeds,
                        "ai": ai, "training": training})
        if not r.get("ok"):
            raise EngineHostError(f"开局失败：{r.get('err')}")

    # ---------- 管道 ----------
    def _drain_err(self) -> None:
        try:
            for line in self.proc.stderr:  # type: ignore[union-attr]
                self._err_lines.append(line.rstrip())
                if len(self._err_lines) > 50:
                    self._err_lines.pop(0)
        except Exception:  # noqa: BLE001
            pass

    def _read(self) -> dict[str, Any]:
        line = self.proc.stdout.readline()  # type: ignore[union-attr]
        if not line:
            raise EngineHostError(
                f"引擎宿主没回话就退了（stderr：{self._err_lines[-3:]}）")
        try:
            r = json.loads(line)
        except json.JSONDecodeError as e:
            raise EngineHostError(f"协议行不是 JSON：{line[:120]!r}") from e
        # 就绪探测失败时，别让它卡在 "宿主没就绪" 这种看不出原因的提示上
        if r.get("error") or (r.get("ready") is False):
            raise EngineHostError(
                f"引擎宿主启动失败：{r.get('error') or r.get('err') or r}"
                + (f"（stderr：{self._err_lines[-3:]}）" if self._err_lines else ""))
        return r

    def _call(self, msg: dict) -> dict[str, Any]:
        if self.proc.poll() is not None:
            raise EngineHostError(f"引擎宿主已经退出（{self.proc.returncode}）")
        self.proc.stdin.write(json.dumps(msg, ensure_ascii=False) + "\n")  # type: ignore[union-attr]
        self.proc.stdin.flush()  # type: ignore[union-attr]
        r = self._read()
        if not r.get("ok"):
            raise EngineHostError(f"{msg.get('cmd')} 失败：{r.get('err')}")
        return r

    # ---------- 对外 ----------
    def step(self, inputs: list[list[dict]]) -> list[dict]:
        """推进若干帧。inputs 是"每帧一对输入"，返回每帧的公开状态。"""
        if not inputs:
            return []
        return self._call({"cmd": "step", "inputs": inputs}).get("frames", [])

    def snapshot(self) -> dict:
        return self._call({"cmd": "snapshot"})["snap"]

    def restore(self, snap: dict) -> str:
        return self._call({"cmd": "restore", "snap": snap})["hash"]

    def hash(self) -> str:
        return self._call({"cmd": "hash"})["hash"]

    def close(self) -> None:
        try:
            if self.proc.poll() is None:
                self.proc.stdin.write('{"cmd":"quit"}\n')  # type: ignore[union-attr]
                self.proc.stdin.flush()  # type: ignore[union-attr]
                self.proc.wait(timeout=2)
        except Exception:  # noqa: BLE001
            pass
        finally:
            if self.proc.poll() is None:
                self.proc.kill()

    def __enter__(self) -> "EngineHost":
        return self

    def __exit__(self, *exc) -> None:
        self.close()

    @property
    def stderr_tail(self) -> str:
        return "\n".join(self._err_lines[-10:])


def engine_available() -> bool:
    """引擎能不能跑（Node 在不在、脚本在不在）。"""
    if not HOST_SCRIPT.exists():
        return False
    node = find_node()
    if node is None:
        return False
    try:
        subprocess.run([node, "--version"], capture_output=True, timeout=5,
                       check=True)
        return True
    except Exception:  # noqa: BLE001
        return False


__all__ = ["EngineHost", "EngineHostError", "engine_available", "find_node",
           "TICK_HZ", "HOST_SCRIPT", "WEB_DIR"]
