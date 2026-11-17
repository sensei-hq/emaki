"""HTTP for the poster: stdlib only, and every HTTP error raised as Failed so one post's failure is reported, not fatal."""
import json
import urllib.request


class Failed(Exception):
    pass


def http(method, url, body=None, headers=None, timeout=600):
    req = urllib.request.Request(url, data=body, method=method, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, dict(r.headers), r.read()
    except urllib.error.HTTPError as err:
        raise Failed(f'{method} {url.split("?")[0]} → {err.code}: {err.read()[:400].decode(errors="replace")}')


def jhttp(method, url, data=None, headers=None):
    body = json.dumps(data).encode() if data is not None else None
    _, _, b = http(method, url, body, {**({'content-type': 'application/json'} if body else {}), **(headers or {})})
    return json.loads(b or b'{}')
