import json
import socket
import sys
import uvicorn
from .app import create_app

# A fresh token arrives through stdin, never command arguments or a disk file.
config = json.loads(sys.stdin.readline(4096))
app = create_app(config["token"])
sock = socket.socket()
sock.bind(("127.0.0.1", 0))
sock.listen(16)
print(json.dumps({"port": sock.getsockname()[1]}), flush=True)
uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", log_level="critical", access_log=False,
                             ws="wsproto", ws_max_size=20_000, limit_concurrency=8, timeout_graceful_shutdown=2)).run(sockets=[sock])
