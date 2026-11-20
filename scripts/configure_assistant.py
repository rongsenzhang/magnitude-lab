"""Configure the Pages artifact from an existing Worker or deploy the repository's Worker."""

import json
import os
from pathlib import Path
import re
import subprocess
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "web" / "assistant-config.json"
ORIGIN = "https://rongsenzhang.github.io"
WORKER_URL = re.compile(r"https://magnitude-lab-assistant\.[a-z0-9-]+\.workers\.dev")
WRANGLER = [str(ROOT / "node_modules" / ".bin" / "wrangler")]
WRANGLER_CONFIG = ["--config", "worker/wrangler.toml"]


def deploy():
    env = os.environ.copy()
    key = env.pop("OPENAI_API_KEY")
    command = WRANGLER + ["deploy"] + WRANGLER_CONFIG
    result = subprocess.run(command, cwd=ROOT, env=env, text=True, stdout=subprocess.PIPE,
                            check=True, timeout=150)
    urls = WORKER_URL.findall(result.stdout)
    if not urls:
        raise SystemExit("Deployment completed without a recognised public Worker URL.")
    subprocess.run(WRANGLER + ["secret", "put", "OPENAI_API_KEY"] + WRANGLER_CONFIG,
                   input=key, cwd=ROOT, env=env, text=True, check=True, timeout=90)
    return urls[-1]


def ready(endpoint):
    request = Request(endpoint + "/health", headers={"Origin": ORIGIN, "User-Agent": "MagnitudeLab-activation"})
    for attempt in range(8):
        try:
            with urlopen(request, timeout=8) as response:
                if json.load(response).get("ready") is True:
                    return True
        except (HTTPError, URLError, ValueError, TimeoutError):
            pass
        if attempt < 7:
            time.sleep(2)
    return False


def main():
    endpoint = os.environ.get("AI_WORKER_URL", "").strip().rstrip("/")
    credentials = ("CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN", "OPENAI_API_KEY")
    if all(os.getenv(key) for key in credentials):
        endpoint = deploy()
    if endpoint:
        if not WORKER_URL.fullmatch(endpoint):
            raise SystemExit("Set AI_WORKER_URL to the HTTPS address of this project's workers.dev deployment.")
        if not ready(endpoint):
            raise SystemExit("The Worker is unavailable or its secret and quota store are not ready.")
    CONFIG.write_text(json.dumps({"endpoint": endpoint}) + "\n", encoding="utf-8")
    print("Configured the live research assistant." if endpoint else
          "Publishing the research workbench and evidence preview. No live endpoint is configured.")


if __name__ == "__main__":
    main()
